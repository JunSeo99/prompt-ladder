import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Engine, Ladder, Lang, View } from '../types'
import { buildContext, memoryIndexPath } from './context'
import type { SessionFacts } from './context'
import { padCells, pickLang, strings, tokens } from './i18n'
import { DEFAULT_CHORD, ensureBinding, findChord } from './keybinding'
import { BUILT_IN_AGENTS, boxEntry, directSystem, draftBlock, forkPrompt, isHeavy, nextEntry, parseLadder, toCount, unknownNames } from './ladder'
import type { Count, Heavy } from './ladder'

const PLUGIN = 'prompt-ladder'
const METER = { quick: '▰▱▱', balanced: '▰▰▱', deep: '▰▰▰' } as const
const DIRECT_MAX_TOKENS = 8_000
const DIRECT_TIMEOUT_MS = 120_000
const MAX_DRAFT_CHARS = 20_000
// A paste or image the box shows as a placeholder: rewriting it would drop the content.
const PLACEHOLDER = /\[(?:Pasted text|Image) #\d+[^\]]*\]/

// Change the tag when View's fields change: an older stored value is then declined.
const view = atom({ plugin: 'prompt-ladder', key: 'view' } as const, { kind: 'idle' } as View, { shape: 'view-2' })

type Settings = { count: Count; autofill: boolean; handoffAtK: number }

// Module state. A reload starts it over, and session.start then settles any
// run the reload cut off.
let runId = 0
let controller: AbortController | undefined
let ticker: { id: number; timer: { cancel(): void } } | undefined
let chord: string | undefined

async function safe<T>(call: Promise<T>, fallback: T): Promise<T> {
  try {
    return await call
  } catch {
    return fallback
  }
}

async function configDir($: EngineInterface): Promise<string> {
  const custom = await $.env.get('CLAUDE_CONFIG_DIR')
  if (custom) return custom
  return `${(await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''}/.claude`
}

async function readText($: EngineInterface, path: string): Promise<string | undefined> {
  try {
    return (await $.fs.exists(path)) ? await $.fs.read(path) : undefined
  } catch {
    return undefined
  }
}

async function langFor($: EngineInterface, draft: string): Promise<Lang> {
  return pickLang(await safe($.settings.read({ key: 'language' }), undefined), draft)
}

/** Stops the elapsed-time ticker, only the given run's when an id is given. */
function stopTicker(id?: number): void {
  if (!ticker || (id !== undefined && ticker.id !== id)) return
  ticker.timer.cancel()
  ticker = undefined
}

/** Ends whatever run is in flight: its later writes are dropped, a direct call aborted. */
function stopRun(): void {
  runId += 1
  controller?.abort()
  controller = undefined
  stopTicker()
}

/** Writes the view only while the run is still the current one. */
async function settle($: EngineInterface, id: number, next: View): Promise<boolean> {
  let wrote = false
  await update($, view, (current): View => {
    if (id !== runId) return current
    wrote = true
    return next
  })
  return wrote
}

async function close($: EngineInterface): Promise<void> {
  stopRun()
  await update($, view, (): View => ({ kind: 'idle' }))
}

/** The session as a direct call needs it: instructions, capabilities, recent turns. */
async function gather($: EngineInterface): Promise<SessionFacts> {
  const dir = await configDir($)
  const cwd = await $.session.cwd()
  const root = await safe($.session.root(), cwd)
  const model = await $.session.model()
  const branch = await safe($.process.run(['git', '-C', root, 'branch', '--show-current'], { timeoutMs: 3000 }), undefined)

  const paths = [`${dir}/CLAUDE.md`, `${root}/CLAUDE.md`, `${root}/.claude/CLAUDE.md`, `${root}/CLAUDE.local.md`]
  if (cwd !== root) paths.push(`${cwd}/CLAUDE.md`)
  paths.push(memoryIndexPath(dir, root))
  const instructions: SessionFacts['instructions'] = []
  for (const path of paths) {
    const text = await readText($, path)
    if (text) instructions.push({ path, text })
  }

  const commands = (await safe($.command.list(), [])).filter(command => command.source !== 'builtin')
  return {
    cwd,
    branch: branch?.exitCode === 0 ? branch.stdout.trim() || undefined : undefined,
    model,
    instructions,
    commands,
    tools: await safe($.tool.list(), []),
    agents: await agentTypes($, dir, root),
    messages: await safe($.session.messages(), []),
  }
}

/** Built-in subagent types plus the ones defined as files, user and project. */
async function agentTypes($: EngineInterface, dir: string, root: string): Promise<string[]> {
  const names = new Set(BUILT_IN_AGENTS)
  for (const folder of [`${dir}/agents`, `${root}/.claude/agents`]) {
    const entries = (await safe($.fs.exists(folder), false)) ? await safe($.fs.list(folder), []) : []
    for (const entry of entries) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) names.add(entry.name.slice(0, -3))
    }
  }
  return [...names]
}

/** Marks backticked names in each candidate that this session cannot confirm. */
async function confirmNames($: EngineInterface, ladder: Ladder, draft: string): Promise<Ladder> {
  const dir = await configDir($)
  const root = await safe($.session.root(), '')
  const known = new Set<string>(await agentTypes($, dir, root))
  for (const command of await safe($.command.list(), [])) known.add(command.name)
  for (const tool of await safe($.tool.list(), [])) known.add(tool.name)
  const messages = await safe($.session.messages(), [])
  const seen = [draft, ...messages.slice(-20).map(message => message.text)].join('\n')
  return {
    ...ladder,
    candidates: ladder.candidates.map(candidate => ({ ...candidate, unknown: unknownNames(candidate.prompt, known, seen) })),
  }
}

async function start($: EngineInterface, draft: string, boxAtStart: string, settings: Settings): Promise<void> {
  stopRun()
  const id = runId
  const lang = await langFor($, draft)
  const startedAt = await $.clock.now()
  if (!(await settle($, id, { kind: 'running', id, draft, boxAtStart, startedAt, lang }))) return
  stopTicker()
  ticker = { id, timer: $.clock.every(1000, () => $.ui.invalidate('ui.render')) }
  // A timer outlives the command's dispatch, so the command returns at once.
  $.clock.after(0, () => run($, id, settings))
}

/** Runs one rewrite; whatever goes wrong ends in the error band, never a stuck spinner. */
async function run($: EngineInterface, id: number, settings: Settings): Promise<void> {
  try {
    await attempt($, id, settings)
  } catch (error) {
    const current = await read($, view)
    if (current.kind === 'running') {
      const message = strings(current.lang).errors.threw(String(error).slice(0, 120))
      await settle($, id, { kind: 'error', draft: current.draft, lang: current.lang, message })
    }
  } finally {
    stopTicker(id)
  }
}

async function attempt($: EngineInterface, id: number, settings: Settings): Promise<void> {
  const current = await read($, view)
  if (id !== runId || current.kind !== 'running' || current.id !== id) return
  const { draft, boxAtStart, startedAt, lang } = current
  const t = strings(lang)

  const context = (await safe($.session.usage(), undefined))?.context.tokens
  // Past the user's handoff line, the ladder plans a handoff before the work.
  const heavy: Heavy | undefined =
    context !== undefined && isHeavy(context, settings.handoffAtK) ? { tokens: context, threshold: settings.handoffAtK * 1000 } : undefined

  let engine: Engine = 'fork'
  // Same model, same prefix: the main thread's prompt cache serves the session.
  let reply = await $.model.fork({ prompt: forkPrompt(draft, settings.count, heavy) })
  if (id !== runId) return

  if (!reply.isAnswered && reply.reason === 'nothing-to-fork') {
    // No finished turn to fork yet: one direct call on the session's model.
    engine = 'direct'
    const facts = await gather($)
    if (id !== runId) return
    controller = new AbortController()
    reply = await $.model.complete(
      {
        model: facts.model,
        system: [{ text: directSystem(settings.count, heavy), cache: true }],
        prompt: [{ text: buildContext(facts), cache: true }, { text: draftBlock(draft) }],
        maxTokens: DIRECT_MAX_TOKENS,
        timeoutMs: DIRECT_TIMEOUT_MS,
      },
      { signal: controller.signal },
    )
    if (id !== runId) return
  }

  const ms = (await $.clock.now()) - startedAt

  if (!reply.isAnswered) {
    const message =
      reply.reason === 'api-error' ? t.errors.api(reply.status ?? undefined) : reply.reason === 'aborted' ? t.errors.timeout : t.errors.empty
    await settle($, id, { kind: 'error', draft, lang, message })
    return
  }

  const parsed = parseLadder(reply.text)
  if (!parsed.ok) {
    await settle($, id, { kind: 'error', draft, lang, message: t.errors.unreadable })
    return
  }
  const ladder = await confirmNames($, parsed.ladder, draft)
  if (id !== runId) return

  let selected = -1
  let isStale = false
  if (settings.autofill) {
    // Fill only a box the user has not touched since the run started.
    const box = await $.prompt.read()
    if (box.text === boxAtStart) {
      const recommended = ladder.candidates[ladder.recommended]
      const filled = recommended ? await $.prompt.fill({ text: recommended.prompt }) : undefined
      if (filled?.isFilled) selected = ladder.recommended
      // A surface with a composer of its own (VS Code, maybe Desktop) takes no fill: show the text instead.
      else if (filled?.refusal === 'no_composer') for (const candidate of ladder.candidates) $.ui.log(`${t.tier[candidate.tier]}: ${candidate.prompt}`)
    } else {
      isStale = true
    }
  }
  if (id !== runId) return

  const usage = {
    fresh: reply.usage.input_tokens + (reply.usage.cache_creation_input_tokens ?? 0),
    cached: reply.usage.cache_read_input_tokens ?? 0,
    output: reply.usage.output_tokens,
  }
  await settle($, id, { kind: 'ready', draft, lang, ladder, selected, isStale, engine, ms, usage, context, isHeavy: heavy !== undefined })
}

/** Puts a candidate (or the draft, -1) in the prompt box. */
async function pick($: EngineInterface, index: number): Promise<void> {
  const current = await read($, view)
  if (current.kind !== 'ready') return
  // Text you edited in the box becomes the draft, so 0 brings it back.
  const box = await $.prompt.read()
  const draft = boxEntry(current, box.text) === undefined && box.text.trim() ? box.text : current.draft
  const text = index === -1 ? draft : current.ladder.candidates[index]?.prompt
  if (text === undefined) return
  const filled = await $.prompt.fill({ text })
  if (!filled.isFilled) return
  await update($, view, (v): View => (v.kind === 'ready' ? { ...v, draft, selected: index, isStale: false } : v))
}

/** Rewrites again: the box's own text when you edited it, else the draft. */
async function retry($: EngineInterface, settings: Settings): Promise<void> {
  // A close (or another run) that lands while this reads wins over the retry.
  const generation = runId
  const current = await read($, view)
  if (current.kind !== 'ready' && current.kind !== 'error') return
  const box = await $.prompt.read()
  if (generation !== runId) return
  const isEdited = current.kind === 'ready' ? boxEntry(current, box.text) === undefined : box.text.trim() !== current.draft.trim()
  await start($, isEdited && box.text.trim() ? box.text : current.draft, box.text, settings)
}

async function setup($: EngineInterface): Promise<void> {
  const path = `${await configDir($)}/keybindings.json`
  const t = strings(await langFor($, ''))
  let raw: string | undefined
  if (await $.fs.exists(path)) {
    raw = await safe($.fs.read(path), undefined)
    if (raw === undefined) {
      $.ui.log(t.setup.invalid(path))
      return
    }
  }
  const result = ensureBinding(raw)
  if (result.status === 'added') {
    try {
      await $.fs.write(path, result.text)
    } catch {
      $.ui.log(t.setup.invalid(path))
      return
    }
    chord = result.chord
    $.ui.log(t.setup.added(result.chord))
  } else if (result.status === 'present') {
    chord = result.chord
    $.ui.log(t.setup.present(result.chord))
  } else if (result.status === 'conflict') {
    $.ui.log(t.setup.conflict(result.chord, result.existing))
  } else {
    $.ui.log(t.setup.invalid(path))
  }
}

export const register: Register = (on, options) => {
  const settings: Settings = {
    count: toCount(options.candidates ?? '3'),
    autofill: options.autofill !== false,
    handoffAtK: typeof options.handoffAt === 'number' ? options.handoffAt : Number(options.handoffAt ?? 400) || 0,
  }

  on('session.start', async ($, e, next) => {
    const result = await next(e)
    // A reload loses the run in flight; leave no spinner behind.
    stopRun()
    await update($, view, (v): View => (v.kind === 'running' ? { kind: 'idle' } : v))
    try {
      await $.command.register({
        name: PLUGIN,
        description: 'Rewrite your draft into prompts from quick to deep ("setup" binds ctrl+x ctrl+p)',
        argumentHint: '[text | setup]',
        immediate: true,
      })
    } catch {
      // Registered already in this process; the command still runs.
    }
    chord = findChord(await readText($, `${await configDir($)}/keybindings.json`))
    if (!chord && !(await safe($.store.get('setupHintShown'), false))) {
      $.ui.toast(strings(await langFor($, '')).setupHint)
      await safe($.store.set('setupHintShown', true), undefined)
    }
    return result
  })

  on('command.run', { command: PLUGIN }, async ($, e) => {
    const args = (e.args ?? '').trim()
    if (args === 'setup') {
      await setup($)
      return {}
    }

    const box = await $.prompt.read()
    const current = await read($, view)

    // Pressed again on a ladder: show the next rung instead of starting over.
    if (!args && current.kind === 'ready') {
      const at = boxEntry(current, box.text)
      if (at !== undefined) {
        await pick($, nextEntry(at, current.ladder.candidates.length))
        return {}
      }
    }

    const draft = args || box.text
    if (!draft.trim()) {
      $.ui.toast(strings(await langFor($, '')).emptyDraft(chord ?? DEFAULT_CHORD))
      return {}
    }
    if (draft.length > MAX_DRAFT_CHARS || PLACEHOLDER.test(draft)) {
      const t = strings(await langFor($, draft))
      $.ui.toast(draft.length > MAX_DRAFT_CHARS ? t.tooLong : t.placeholder)
      return {}
    }
    if (current.kind === 'running' && current.draft === draft) {
      $.ui.toast(strings(current.lang).busy)
      return {}
    }
    await start($, draft, box.text, settings)
    return {}
  })

  // Sending a prompt ends the ladder; the band is for the draft at hand.
  on('prompt.submit', async ($, e, next) => {
    // Background notices, loops and other sessions also submit; only a person's prompt ends the ladder.
    const isPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge'
    if (isPerson && e.command?.name !== PLUGIN) {
      const current = await read($, view)
      if (current.kind !== 'idle') await close($)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const current = await read($, view)
    if (current.kind === 'idle' || e.props.hasSurvey) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const t = strings(current.lang)
    const below = await next(e)
    const name = (
      <Box flexShrink={0}>
        <Text color="claude">{PLUGIN}</Text>
      </Box>
    )

    if (current.kind === 'running') {
      const seconds = Math.max(0, Math.floor(((await $.clock.now()) - current.startedAt) / 1000))
      return (
        <Box flexDirection="column">
          <Box gap={1}>
            {name}
            <Text dimColor>
              {t.working} · {seconds}s
            </Text>
            <Button key="cancel" hotkey="x" plain label={t.cancel} onPress={() => close($)} />
          </Box>
          {below}
        </Box>
      )
    }

    if (current.kind === 'error') {
      return (
        <Box flexDirection="column">
          <Box gap={1}>
            {name}
            <Text color="warning" wrap="truncate-end">
              {t.failed}: {current.message}
            </Text>
          </Box>
          <Box gap={2}>
            <Button key="retry" hotkey="r" plain label={t.retry} onPress={() => retry($, settings)} />
            <Button key="close" hotkey="x" plain label={t.close} onPress={() => close($)} />
          </Box>
          {below}
        </Box>
      )
    }

    const { ladder, selected } = current
    const { assessment } = ladder
    const focus = selected === -1 ? ladder.recommended : selected
    const shown = ladder.candidates[focus] ?? ladder.candidates[0]
    if (!shown) return next(e)
    const verdict = [
      current.isHeavy && current.context !== undefined ? t.heavy(tokens(current.context)) : '',
      assessment.scope && t.scope[assessment.scope],
      assessment.difficulty && t.difficulty[assessment.difficulty],
    ]
      .filter(Boolean)
      .join(' · ')
    const usage = t.usage(tokens(current.usage.fresh), tokens(current.usage.cached), tokens(current.usage.output), Math.round(current.ms / 1000))
    const cost = `${current.engine === 'fork' ? t.forkNote : t.directNote} · ${usage}`

    return (
      <Box flexDirection="column">
        <Box gap={1}>
          {name}
          <Text dimColor wrap="truncate-end">
            {verdict}
            {assessment.reason ? ` — ${assessment.reason}` : ''}
          </Text>
        </Box>
        {ladder.candidates.map((candidate, index) => (
          <Button
            key={`pick-${index + 1}`}
            hotkey={String(index + 1)}
            plain
            label={`${index + 1} ${t.tier[candidate.tier]} — ${candidate.summary}`}
            onPress={() => pick($, index)}
          >
            <Text weight={index === selected ? 'semibold' : undefined}>{padCells(t.tier[candidate.tier], 8)}</Text>
            <Text color="claude"> {METER[candidate.tier]} </Text>
            <Text dimColor={index !== selected}>{candidate.summary}</Text>
            {index === ladder.recommended ? <Text color="suggestion"> {t.recommended}</Text> : ''}
            {index === selected ? <Text color="success"> ◂ {t.inBox}</Text> : ''}
          </Button>
        ))}
        {shown.unknown.length ? (
          <Text color="warning" wrap="truncate-end">
            {t.unconfirmed}: {shown.unknown.join(', ')}
          </Text>
        ) : (
          ''
        )}
        {current.isStale ? (
          <Text color="warning" wrap="truncate-end">
            {t.stale}
          </Text>
        ) : (
          ''
        )}
        <Box gap={2}>
          <Button key="draft" hotkey="0" plain label={t.draft} onPress={() => pick($, -1)} />
          <Button key="retry" hotkey="r" plain label={t.retry} onPress={() => retry($, settings)} />
          <Button key="close" hotkey="x" plain label={t.close} onPress={() => close($)} />
          <Text dimColor wrap="truncate-end">
            {t.next(chord ?? DEFAULT_CHORD)} · {t.focus}
          </Text>
        </Box>
        {shown.assumptions.length ? (
          <Text dimColor wrap="truncate-end">
            {t.assumes}: {shown.assumptions.join(' / ')}
          </Text>
        ) : (
          ''
        )}
        <Text dimColor wrap="truncate-end">
          {cost}
        </Text>
        {below}
      </Box>
    )
  })
}

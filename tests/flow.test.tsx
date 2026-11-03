import { expect, mock, test } from 'claude-code/testing'

const USAGE = { input_tokens: 900, output_tokens: 700, cache_read_input_tokens: 48_000, cache_creation_input_tokens: 300 }

const LADDER = {
  assessment: { scope: 'medium', difficulty: 'high', reason: 'no design bar yet' },
  recommended: 'balanced',
  candidates: [
    { tier: 'quick', summary: 'tidy spacing with existing tokens', prompt: 'QUICK: tidy the spacing.', assumptions: [] },
    { tier: 'balanced', summary: 'read patterns, fix, verify', prompt: 'BALANCED: read the home screen first.', assumptions: ['the home screen'] },
    { tier: 'deep', summary: 'references, skills, review loop', prompt: 'DEEP: load `design-taste-frontend` and `made-up-skill`.', assumptions: [] },
  ],
}

const RUN = { origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as const

const BAND = {
  plugin: 'prompt-ladder',
  component: 'AbovePrompt',
  props: { hasSurvey: false, isWorking: false, maxRows: 20, bodyColumns: 110, scroll: { offset: 0, bodyRows: 20 }, view: {} },
} as const

type Seen = {
  box: { text: string; cursor: number }
  fills: string[]
  forks: string[]
  completes: any[]
  toasts: string[]
  logs: string[]
  writes: { path: string; text: string }[]
}

/** Stubs Claude Code around the mod; `reply` answers the fork. */
function engine(on: any, reply: (clock: any) => any, files: Record<string, string> = {}, contextTokens = 60_000): { seen: Seen; clock: any } {
  const seen: Seen = { box: { text: '', cursor: 0 }, fills: [], forks: [], completes: [], toasts: [], logs: [], writes: [] }
  const clock = mock.clock(on, { now: 1_000 })
  mock.env(on, { HOME: '/home/me' })
  mock.store(on, {})
  on('session.start', () => ({ cwd: '/work/app' }))
  on('command.register', () => ({ value: undefined }))
  on('settings.read', () => ({ value: {} }))
  on('prompt.read', () => ({ value: { ...seen.box } }))
  on('prompt.fill', (_: any, e: any) => {
    seen.fills.push(e.text)
    seen.box = { text: e.text, cursor: e.text.length }
    return { isFilled: true }
  })
  on('model.fork', async (_: any, e: any) => {
    seen.forks.push(e.prompt)
    const answer = await reply(clock)
    return answer?.deny ? { deny: answer.deny } : { value: answer }
  })
  on('model.complete', (_: any, e: any) => {
    seen.completes.push(e)
    return { value: { isAnswered: true, text: JSON.stringify(LADDER), usage: USAGE } }
  })
  on('fs.exists', (_: any, e: any) => ({ value: e.path in files }))
  on('fs.read', (_: any, e: any) => ({ value: files[e.path] ?? '' }))
  on('fs.list', () => ({ value: [] }))
  on('fs.write', (_: any, e: any) => {
    seen.writes.push({ path: e.path, text: e.text })
    return { value: undefined }
  })
  on('command.list', () => ({ value: [{ name: 'design-taste-frontend', description: 'Anti-slop frontend.', source: 'user' }] }))
  on('tool.list', () => ({ value: [{ name: 'Read', description: 'Read a file.' }] }))
  on('session.messages', () => ({ value: [] }))
  on('session.cwd', () => ({ value: '/work/app' }))
  on('session.root', () => ({ value: '/work/app' }))
  on('session.model', () => ({ value: 'claude-opus-5-5' }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: contextTokens, window: 1_000_000 }, rateLimits: [] } }))
  on('ui.toast', (_: any, e: any) => {
    seen.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', (_: any, e: any) => {
    seen.logs.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['(other mods)'] }))
  return { seen, clock }
}

const answered = () => ({ isAnswered: true, text: JSON.stringify(LADDER), usage: USAGE })

async function press($: any, clock: any) {
  await $.command.run({ ...RUN, command: 'prompt-ladder', args: '' })
  await clock.settle()
}

test('the chord rewrites the draft, fills the recommended rung and draws the ladder', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }

  await press($, clock)

  expect(seen.forks.length).toBe(1)
  expect(seen.forks[0]).toContain('<draft>\nmake the design pretty\n</draft>')
  expect(seen.fills).toEqual(['BALANCED: read the home screen first.'])

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect(await ui.find({ key: 'pick-1' })).toBeDefined()
    expect(await ui.find({ key: 'pick-3' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /medium task · hard — no design bar yet/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Assumes: the home screen/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /session fork · 1.2k new · 48k cached · 700 out · 0s/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /other mods/ })).toBeDefined()
    await ui.unmount()
  }
})

test('digits pick a rung, 0 restores the draft, the chord walks the ladder', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'pick-3' })
  expect(seen.box.text).toBe('DEEP: load `design-taste-frontend` and `made-up-skill`.')
  // The deep rung names a skill this session does not have.
  expect(await ui.find({ type: 'Text', text: /Not found in this session: made-up-skill/ })).toBeDefined()

  await ui.press({ key: 'draft' })
  expect(seen.box.text).toBe('make the design pretty')
  await ui.unmount()

  // The box holds the draft, so the chord moves to the first rung, not a new rewrite.
  await press($, clock)
  expect(seen.box.text).toBe('QUICK: tidy the spacing.')
  await press($, clock)
  expect(seen.box.text).toBe('BALANCED: read the home screen first.')
  expect(seen.forks.length).toBe(1)

  // An edited box is a new draft: the chord rewrites it.
  seen.box = { text: 'BALANCED: read the home screen first. Also dark mode.', cursor: 0 }
  await press($, clock)
  expect(seen.forks.length).toBe(2)
})

test('before the first turn it calls the session model directly with the session context', async ($, on) => {
  const files = { '/work/app/CLAUDE.md': 'Use pnpm. Never use Playwright.' }
  const { seen, clock } = engine(on, () => ({ isAnswered: false, reason: 'nothing-to-fork' }), files)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'add a login test', cursor: 16 }

  await press($, clock)

  expect(seen.completes.length).toBe(1)
  const call = seen.completes[0]
  expect(call.model).toBe('claude-opus-5-5')
  expect(call.system).toContain('You rewrite a draft prompt')
  expect(call.prompt).toContain('Never use Playwright.')
  expect(call.prompt).toContain('- design-taste-frontend: Anti-slop frontend.')
  expect(call.prompt).toContain('<draft>\nadd a login test\n</draft>')
  expect(call.promptBlocks?.[0]?.cache).toBe(true)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /direct call/ })).toBeDefined()
  await ui.unmount()
})

test('a draft edited during the rewrite is never overwritten', async ($, on) => {
  const { seen, clock } = engine(on, () => {
    seen.box = { text: 'make the design pretty, and fast', cursor: 0 }
    return answered()
  })
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }

  await press($, clock)

  expect(seen.fills).toEqual([])
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /You edited the draft meanwhile/ })).toBeDefined()
  await ui.unmount()
})

test('autofill off keeps the draft in the box until a pick', { options: { autofill: false } }, async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)
  expect(seen.fills).toEqual([])
})

test('two candidates ask for the pair that brackets the task', { options: { candidates: '2' } }, async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'rename a variable', cursor: 0 }
  await press($, clock)
  expect(seen.forks[0]).toContain('Write exactly two candidates')
})

test('an empty draft asks for one and calls no model', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  await press($, clock)
  expect(seen.forks.length).toBe(0)
  expect(seen.toasts.some(text => text.includes('Type a draft first'))).toBe(true)
})

test('typed text after the command is rewritten and lands in the empty box', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...RUN, command: 'prompt-ladder', args: 'fix the flaky test' })
  await clock.settle()
  expect(seen.forks[0]).toContain('<draft>\nfix the flaky test\n</draft>')
  expect(seen.fills).toEqual(['BALANCED: read the home screen first.'])
})

test('an API error shows in the band, and retry runs again', async ($, on) => {
  let calls = 0
  const { seen, clock } = engine(on, () => {
    calls += 1
    return calls === 1 ? { isAnswered: false, reason: 'api-error', status: 529, error: 'overloaded_error', usage: USAGE } : answered()
  })
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Could not rewrite: The API returned an error \(529\)/ })).toBeDefined()
  await ui.press({ key: 'retry' })
  await clock.settle()
  expect(seen.fills).toEqual(['BALANCED: read the home screen first.'])
  await ui.unmount()
})

test('the band counts seconds while it works, and cancel drops the result', async ($, on) => {
  const { seen, clock } = engine(on, async (clock: any) => {
    await clock.sleep(5_000)
    return answered()
  })
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await $.command.run({ ...RUN, command: 'prompt-ladder', args: '' })
  await clock.advance(3_000)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Rewriting · 3s/ })).toBeDefined()
  await ui.press({ key: 'cancel' })
  await clock.advance(5_000)
  expect(seen.fills).toEqual([])
  await ui.unmount()
})

test('sending a prompt clears the ladder', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)
  await $.prompt.submit({ text: 'BALANCED: read the home screen first.', wait: false, origin: { kind: 'composer' } })

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'pick-1' })).toBeUndefined()
  await ui.unmount()
})

test('setup binds the chord in keybindings.json and says so', async ($, on) => {
  const path = '/home/me/.claude/keybindings.json'
  const files = { [path]: JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+g': 'chat:externalEditor' } }] }) }
  const { seen } = engine(on, answered, files)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  await $.command.run({ ...RUN, command: 'prompt-ladder', args: 'setup' })

  expect(seen.writes.length).toBe(1)
  expect(JSON.parse(seen.writes[0]?.text ?? '{}').bindings[0].bindings).toEqual({
    'ctrl+g': 'chat:externalEditor',
    'ctrl+q': 'command:prompt-ladder',
  })
  expect(seen.logs.some(text => text.includes('Bound ctrl+q'))).toBe(true)
})

test('setup with a key moves the binding; setup with words is a draft', async ($, on) => {
  const path = '/home/me/.claude/keybindings.json'
  const files = { [path]: JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+x ctrl+p': 'command:prompt-ladder' } }] }) }
  const { seen, clock } = engine(on, answered, files)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })

  await $.command.run({ ...RUN, command: 'prompt-ladder', args: 'setup' })
  expect(seen.writes.length).toBe(0)
  expect(seen.logs.some(text => text.includes('run /prompt-ladder setup ctrl+q'))).toBe(true)

  await $.command.run({ ...RUN, command: 'prompt-ladder', args: 'setup ctrl+q' })
  expect(JSON.parse(seen.writes[0]?.text ?? '{}').bindings[0].bindings).toEqual({ 'ctrl+q': 'command:prompt-ladder' })
  expect(seen.logs.some(text => text.includes('in place of ctrl+x ctrl+p'))).toBe(true)

  await $.command.run({ ...RUN, command: 'prompt-ladder', args: 'setup a CI pipeline' })
  await clock.settle()
  expect(seen.writes.length).toBe(1)
  expect(seen.forks[0]).toContain('setup a CI pipeline')
})

test('a heavy session plans a handoff and says so in the band', async ($, on) => {
  const { seen, clock } = engine(on, answered, {}, 512_000)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'refactor the auth module', cursor: 0 }
  await press($, clock)

  expect(seen.forks[0]).toContain('about 512k tokens, past the 400k')
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /512k context · hand off · medium task/ })).toBeDefined()
  await ui.unmount()
})

test('the handoff line follows the setting, and 0 turns it off', { options: { handoffAt: 0 } }, async ($, on) => {
  const { seen, clock } = engine(on, answered, {}, 900_000)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'refactor the auth module', cursor: 0 }
  await press($, clock)
  expect(seen.forks[0]).not.toContain('handoff')
})

test('a failure that throws ends in the error band, not a stuck spinner', async ($, on) => {
  const { seen, clock } = engine(on, () => ({ deny: 'the model call was refused' }))
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Could not rewrite: Something failed/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Rewriting/ })).toBeUndefined()
  await ui.unmount()
})

test('retry then close in a hurry leaves the band closed', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)

  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  const retried = ui.press({ key: 'retry' })
  await ui.press({ key: 'close' })
  await retried
  await clock.advance(2_000)
  expect(await ui.find({ type: 'Text', text: /Rewriting/ })).toBeUndefined()
  expect(await ui.find({ key: 'pick-1' })).toBeUndefined()
  await ui.unmount()
})

test('text you edited in the box is kept: retry rewrites it and 0 brings it back', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)

  // Edit the filled candidate, then pick another rung: the edit becomes the draft.
  seen.box = { text: 'BALANCED: read the home screen first. Keep the logo.', cursor: 0 }
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  await ui.press({ key: 'pick-1' })
  await ui.press({ key: 'draft' })
  expect(seen.box.text).toBe('BALANCED: read the home screen first. Keep the logo.')

  // Edit again and retry: the edit is what gets rewritten.
  seen.box = { text: 'make only the header pretty', cursor: 0 }
  await ui.press({ key: 'retry' })
  await clock.settle()
  expect(seen.forks[1]).toContain('<draft>\nmake only the header pretty\n</draft>')
  await ui.unmount()
})

test('a background notice does not close the ladder; your own prompt does', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  on('prompt.submit', (_: any, e: any) => ({ text: e.text }))
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'make the design pretty', cursor: 22 }
  await press($, clock)

  await $.prompt.submit({ text: 'Background task finished', wait: false, origin: { kind: 'task-notification' } } as any)
  let ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'pick-1' })).toBeDefined()
  await ui.unmount()

  await $.prompt.submit({ text: 'go', wait: false, origin: { kind: 'composer' } })
  ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await ui.find({ key: 'pick-1' })).toBeUndefined()
  await ui.unmount()
})

test('a draft with a pasted block or image is left alone', async ($, on) => {
  const { seen, clock } = engine(on, answered)
  await $.session.start({ cwd: '/work/app', surface: 'terminal', isInteractive: true })
  seen.box = { text: 'match this [Image #1] layout', cursor: 0 }
  await press($, clock)
  expect(seen.forks.length).toBe(0)
  expect(seen.toasts.some(text => text.includes('pasted block or an image'))).toBe(true)
})

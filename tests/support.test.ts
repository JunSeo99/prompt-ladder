import { expect, test } from 'claude-code/testing'

import { buildContext, formatCommands, formatTools, memoryIndexPath } from '../hooks/context'
import { padCells, pickLang, tokens } from '../hooks/i18n'
import { asChord, ensureBinding, findChord } from '../hooks/keybinding'

test('setup creates a keybindings file when there is none', () => {
  const result = ensureBinding(undefined)
  if (result.status !== 'added') throw new Error(result.status)
  const file = JSON.parse(result.text)
  expect(file.bindings).toEqual([{ context: 'Chat', bindings: { 'ctrl+q': 'command:prompt-ladder' } }])
  expect(file.$schema).toContain('claude-code-keybindings')
})

test('setup adds to the Chat block and keeps every other binding', () => {
  const raw = JSON.stringify({
    $schema: 'x',
    bindings: [
      { context: 'Global', bindings: { 'ctrl+t': 'app:toggleTodos' } },
      { context: 'Chat', bindings: { 'ctrl+g': 'chat:externalEditor', 'ctrl+s': null } },
    ],
  })
  const result = ensureBinding(raw)
  if (result.status !== 'added') throw new Error(result.status)
  const file = JSON.parse(result.text)
  expect(file.bindings[0]).toEqual({ context: 'Global', bindings: { 'ctrl+t': 'app:toggleTodos' } })
  expect(file.bindings[1].bindings).toEqual({ 'ctrl+g': 'chat:externalEditor', 'ctrl+s': null, 'ctrl+q': 'command:prompt-ladder' })
  expect(findChord(result.text)).toBe('ctrl+q')
})

test('setup never overwrites a chord that does something else', () => {
  const raw = JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+q': 'chat:stash' } }] })
  expect(ensureBinding(raw)).toEqual({ status: 'conflict', chord: 'ctrl+q', existing: 'chat:stash' })
})

test('setup leaves an existing binding of the command alone, whatever its chord', () => {
  const raw = JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'meta+l': 'command:prompt-ladder' } }] })
  expect(ensureBinding(raw)).toEqual({ status: 'present', chord: 'meta+l' })
  expect(ensureBinding('{ not json')).toEqual({ status: 'invalid' })
  expect(ensureBinding('{"bindings": 3}')).toEqual({ status: 'invalid' })
})

test('tools are listed by name, MCP tools grouped by server', () => {
  const text = formatTools([
    { name: 'Bash' },
    { name: 'Read' },
    { name: 'mcp__figma__get_screenshot' },
    { name: 'mcp__figma__get_design_context' },
    { name: 'mcp__slack__send' },
  ])
  expect(text).toContain('Built-in: Bash, Read')
  expect(text).toContain('MCP server figma (2 tools, e.g. get_screenshot, get_design_context): call as mcp__figma__<tool>')
  expect(text).toContain('MCP server slack (1 tools, e.g. send)')
})

test('a long command list is cut with a count, not silently', () => {
  const commands = Array.from({ length: 2000 }, (_, i) => ({ name: `skill-${i}`, description: 'x'.repeat(200) }))
  const text = formatCommands(commands)
  expect(text.length).toBeLessThan(42_000)
  expect(text).toMatch(/\(\d+ more not listed\)$/)
})

test('the context block keeps its sections and marks an empty conversation', () => {
  const context = buildContext({
    cwd: '/work/app',
    model: 'claude-opus-5-5',
    instructions: [{ path: '/work/app/CLAUDE.md', text: 'Use pnpm.' }],
    commands: [{ name: 'design-taste-frontend', description: 'Anti-slop frontend skill.' }],
    tools: [{ name: 'Read' }],
    agents: ['Explore'],
    messages: [],
  })
  for (const part of ['<environment>', 'Model: claude-opus-5-5', '## /work/app/CLAUDE.md\nUse pnpm.', '- design-taste-frontend: Anti-slop frontend skill.', '<subagent_types>\nExplore', '(no messages yet)']) {
    expect(context).toContain(part)
  }
})

test('memory lives under the project path with every non-alphanumeric as a dash', () => {
  expect(memoryIndexPath('/Users/me/.claude', '/Users/me/my_app.v2')).toBe('/Users/me/.claude/projects/-Users-me-my-app-v2/memory/MEMORY.md')
})

test('the band speaks Korean when the setting or the draft does', () => {
  expect(pickLang('한국어', 'fix it')).toBe('ko')
  expect(pickLang('korean', 'fix it')).toBe('ko')
  expect(pickLang('English', '고쳐줘')).toBe('en')
  expect(pickLang(undefined, '디자인 예쁘게')).toBe('ko')
  expect(pickLang(undefined, 'make it pretty')).toBe('en')
})

test('numbers and widths render for a terminal', () => {
  expect(tokens(950)).toBe('950')
  expect(tokens(1200)).toBe('1.2k')
  expect(tokens(48000)).toBe('48k')
  expect(tokens(152_300)).toBe('152k')
  expect(padCells('균형', 8)).toBe('균형    ')
  expect(padCells('Quick', 8)).toBe('Quick   ')
})

test('setup sees a taken chord in any context and any spelling', () => {
  const raw = JSON.stringify({ bindings: [{ context: 'Global', bindings: { 'Ctrl+X  Ctrl+P': 'app:toggleTodos' } }] })
  expect(ensureBinding(raw, 'ctrl+x ctrl+p')).toEqual({ status: 'conflict', chord: 'Ctrl+X  Ctrl+P', existing: 'app:toggleTodos' })
})

test('setup will not turn a reclaimed ctrl+x back into a prefix', () => {
  const raw = JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+x ctrl+k': null, 'ctrl+x': 'chat:newline' } }] })
  expect(ensureBinding(raw, 'ctrl+x ctrl+p')).toEqual({ status: 'conflict', chord: 'ctrl+x', existing: 'chat:newline' })
})

test('a damaged block is skipped, kept, and never crashes the lookup', () => {
  const raw = JSON.stringify({ bindings: [null, { context: 'Chat' }, { context: 'Chat', bindings: { 'ctrl+g': 'chat:externalEditor' } }] })
  expect(findChord(raw)).toBeUndefined()
  const result = ensureBinding(raw)
  if (result.status !== 'added') throw new Error(result.status)
  const file = JSON.parse(result.text)
  expect(file.bindings[0]).toBe(null)
  expect(file.bindings[2].bindings).toEqual({ 'ctrl+g': 'chat:externalEditor', 'ctrl+q': 'command:prompt-ladder' })
})

test('a named key moves the binding from its old chord and says which', () => {
  const raw = JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+g': 'chat:externalEditor', 'ctrl+x ctrl+p': 'command:prompt-ladder' } }] })
  expect(ensureBinding(raw)).toEqual({ status: 'present', chord: 'ctrl+x ctrl+p' })
  const result = ensureBinding(raw, 'Ctrl+Q')
  if (result.status !== 'added') throw new Error(result.status)
  expect(result.chord).toBe('ctrl+q')
  expect(result.previous).toBe('ctrl+x ctrl+p')
  expect(JSON.parse(result.text).bindings[0].bindings).toEqual({ 'ctrl+g': 'chat:externalEditor', 'ctrl+q': 'command:prompt-ladder' })
  expect(ensureBinding(result.text, 'ctrl+q')).toEqual({ status: 'present', chord: 'ctrl+q' })
})

test('a single key that starts another chord is taken', () => {
  const raw = JSON.stringify({ bindings: [{ context: 'Chat', bindings: { 'ctrl+q ctrl+w': 'chat:stash' } }] })
  expect(ensureBinding(raw)).toEqual({ status: 'conflict', chord: 'ctrl+q ctrl+w', existing: 'chat:stash' })
})

test('setup names a key only when every word is one', () => {
  expect(asChord('Ctrl+Q')).toBe('ctrl+q')
  expect(asChord('ctrl+x  ctrl+p')).toBe('ctrl+x ctrl+p')
  expect(asChord('meta+l')).toBe('meta+l')
  expect(asChord('f5')).toBe('f5')
  expect(asChord('a CI pipeline')).toBeUndefined()
  expect(asChord('ctrl+q please')).toBeUndefined()
})

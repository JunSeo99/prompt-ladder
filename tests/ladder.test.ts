import { expect, test } from 'claude-code/testing'

import type { View } from '../types'
import { BUILT_IN_AGENTS, boxEntry, directSystem, forkPrompt, isHeavy, nextEntry, parseLadder, toCount, unknownNames } from '../hooks/ladder'

const REPLY = {
  assessment: { scope: 'medium', difficulty: 'high', reason: '기준이 없음' },
  recommended: 'balanced',
  candidates: [
    { tier: 'deep', summary: 'research first', prompt: 'deep prompt', assumptions: ['home screen'] },
    { tier: 'quick', summary: 'just do it', prompt: 'quick prompt', assumptions: [] },
    { tier: 'balanced', summary: 'read then do', prompt: 'balanced prompt' },
  ],
}

test('a clean reply becomes a ladder sorted cheapest first', () => {
  const parsed = parseLadder(JSON.stringify(REPLY))
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.ladder.candidates.map(c => c.tier)).toEqual(['quick', 'balanced', 'deep'])
  expect(parsed.ladder.recommended).toBe(1)
  expect(parsed.ladder.assessment).toEqual({ scope: 'medium', difficulty: 'high', reason: '기준이 없음' })
  expect(parsed.ladder.candidates[2]?.assumptions).toEqual(['home screen'])
  expect(parsed.ladder.candidates[1]?.assumptions).toEqual([])
})

test('a reply wrapped in a fence or prose still parses', () => {
  for (const text of ['```json\n' + JSON.stringify(REPLY) + '\n```', 'Here you go:\n' + JSON.stringify(REPLY) + '\nDone.']) {
    const parsed = parseLadder(text)
    expect(parsed.ok).toBe(true)
  }
})

test('unknown tiers, empty prompts and repeats are dropped', () => {
  const parsed = parseLadder(
    JSON.stringify({
      recommended: 'turbo',
      candidates: [
        { tier: 'quick', prompt: 'first' },
        { tier: 'quick', prompt: 'second' },
        { tier: 'turbo', prompt: 'x' },
        { tier: 'deep', prompt: '  ' },
        { tier: 'balanced', prompt: 'line one\nline two' },
      ],
    }),
  )
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.ladder.candidates.map(c => c.prompt)).toEqual(['first', 'line one\nline two'])
  // No summary given: the prompt's first line stands in.
  expect(parsed.ladder.candidates[1]?.summary).toBe('line one')
  // An unknown recommendation falls back to the middle of what is there.
  expect(parsed.ladder.recommended).toBe(0)
  expect(parsed.ladder.assessment).toEqual({ scope: undefined, difficulty: undefined, reason: undefined })
})

test('a reply with no candidates is an error, not an empty ladder', () => {
  expect(parseLadder('not json').ok).toBe(false)
  expect(parseLadder('{"candidates": []}').ok).toBe(false)
  expect(parseLadder('{"candidates": [{"tier": "quick"}]}').ok).toBe(false)
})

test('the fork prompt carries the draft and the count rule', () => {
  const three = forkPrompt('make it pretty', 3)
  expect(three).toContain('<draft>\nmake it pretty\n</draft>')
  expect(three).toContain('exactly three candidates, in this order: quick, balanced, deep')
  expect(three).toContain('not from the user')
  const two = forkPrompt('make it pretty', 2)
  expect(two).toContain('exactly two candidates')
  expect(two).toContain('quick and balanced when the task is small and clear')
  expect(directSystem(3)).toContain('<context>')
  expect(directSystem(3)).not.toContain('<draft>')
})

test('candidate count reads 2 or defaults to 3', () => {
  expect(toCount('2')).toBe(2)
  expect(toCount(2)).toBe(2)
  expect(toCount('3')).toBe(3)
  expect(toCount('banana')).toBe(3)
  expect(toCount(undefined)).toBe(3)
})

test('backticked names nothing confirms are flagged; code is left alone', () => {
  const known = new Set(['design-taste-frontend', 'vercel:deploy', 'mcp__figma__get_screenshot', ...BUILT_IN_AGENTS])
  const prompt = [
    'Load `design-taste-frontend` and `ui-wizardry`.',
    'Delegate to `Explore`, then `vercel:deployment-expert`.',
    'Use `mcp__figma__get_design_context` and `mcp__notion__search`.',
    'Edit `src/app/page.tsx`, call `getRelayAuth`, read `HOME_BFF_KEY`, run `/prompt-ladder`.',
    'Keep `my-branch` as the user said.',
  ].join('\n')
  expect(unknownNames(prompt, known, 'push to my-branch')).toEqual(['ui-wizardry', 'mcp__notion__search', 'prompt-ladder'])
})

const READY: View = {
  kind: 'ready',
  draft: 'draft text',
  lang: 'en',
  ladder: {
    assessment: {},
    recommended: 1,
    candidates: ['a', 'b', 'c'].map(prompt => ({ tier: 'quick', summary: prompt, prompt, assumptions: [], unknown: [] })),
  },
  selected: 1,
  isStale: false,
  engine: 'fork',
  ms: 1000,
  usage: { fresh: 1, cached: 2, output: 3 },
  isHeavy: false,
}

test('the box is matched to the draft or a candidate, ignoring edge whitespace', () => {
  expect(boxEntry(READY, '  draft text\n')).toBe(-1)
  expect(boxEntry(READY, 'c')).toBe(2)
  expect(boxEntry(READY, 'something else')).toBeUndefined()
  expect(boxEntry({ kind: 'idle' }, 'draft text')).toBeUndefined()
})

test('pressing again walks draft, each rung, then back to the draft', () => {
  const walk = [-1]
  for (let i = 0; i < 4; i += 1) walk.push(nextEntry(walk[walk.length - 1] ?? -1, 3))
  expect(walk).toEqual([-1, 0, 1, 2, -1])
})

test('past the handoff line the ladder is told to hand off; below it, nothing changes', () => {
  expect(isHeavy(undefined, 400)).toBe(false)
  expect(isHeavy(399_999, 400)).toBe(false)
  expect(isHeavy(400_000, 400)).toBe(true)
  expect(isHeavy(900_000, 0)).toBe(false)

  const heavy = forkPrompt('refactor auth', 3, { tokens: 512_340, threshold: 400_000 })
  expect(heavy).toContain('about 512k tokens, past the 400k')
  expect(heavy).toContain('balanced and deep begin by leaving a handoff')
  expect(forkPrompt('refactor auth', 3)).not.toContain('handoff')
  expect(directSystem(2, { tokens: 450_000, threshold: 400_000 })).toContain('about 450k tokens')
})

test('a candidate never starts with "!", which would run it as a shell command', () => {
  const parsed = parseLadder(JSON.stringify({ candidates: [{ tier: 'quick', prompt: '! rm -rf build && npm test' }] }))
  if (!parsed.ok) throw new Error(parsed.error)
  expect(parsed.ladder.candidates[0]?.prompt).toBe('rm -rf build && npm test')
})

test('braces in the prose before the object do not break parsing', () => {
  const text = 'I looked at src/{a,b}.ts first.\n' + JSON.stringify(REPLY)
  expect(parseLadder(text).ok).toBe(true)
})

test('a candidate equal to the draft still lets the chord move on', () => {
  const same: View = { ...READY, draft: 'a', selected: 0 }
  expect(boxEntry(same, 'a')).toBe(0)
  expect(nextEntry(0, 3)).toBe(1)
  expect(boxEntry({ ...same, selected: -1 }, 'a')).toBe(-1)
})

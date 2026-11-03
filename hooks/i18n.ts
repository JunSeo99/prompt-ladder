import type { Difficulty, Lang, Scope, Tier } from '../types'

export type Strings = {
  tier: Record<Tier, string>
  scope: Record<Scope, string>
  difficulty: Record<Difficulty, string>
  working: string
  recommended: string
  inBox: string
  draft: string
  retry: string
  close: string
  cancel: string
  assumes: string
  unconfirmed: string
  stale: string
  next: (chord: string) => string
  focus: string
  usage: (fresh: string, cached: string, output: string, seconds: number) => string
  forkNote: string
  heavy: (context: string) => string
  directNote: string
  failed: string
  emptyDraft: (chord: string) => string
  tooLong: string
  placeholder: string
  busy: string
  setupHint: string
  setup: {
    added: (chord: string) => string
    present: (chord: string) => string
    conflict: (chord: string, existing: string) => string
    invalid: (path: string) => string
  }
  errors: {
    api: (status?: number) => string
    empty: string
    timeout: string
    threw: (detail: string) => string
    unreadable: string
  }
}

const en: Strings = {
  tier: { quick: 'Quick', balanced: 'Balanced', deep: 'Deep' },
  scope: { small: 'small task', medium: 'medium task', large: 'large task' },
  difficulty: { low: 'easy', medium: 'moderate', high: 'hard' },
  working: 'Rewriting',
  recommended: 'recommended',
  inBox: 'in the box',
  draft: 'Draft',
  retry: 'Retry',
  close: 'Close',
  cancel: 'Cancel',
  assumes: 'Assumes',
  unconfirmed: 'Not found in this session',
  stale: 'You edited the draft meanwhile, so nothing was filled in.',
  next: chord => `${chord} next`,
  focus: 'ctrl+x tab, then a digit',
  usage: (fresh, cached, output, seconds) => `${fresh} new · ${cached} cached · ${output} out · ${seconds}s`,
  forkNote: 'session fork',
  heavy: context => `${context} context · hand off`,
  directNote: 'direct call',
  failed: 'Could not rewrite',
  emptyDraft: chord => `Type a draft first, then press ${chord}. Or run /prompt-ladder <text>.`,
  tooLong: 'The draft is over 20,000 characters. Shorten it, or attach long text as a file.',
  placeholder: 'The draft holds a pasted block or an image, which a rewrite would drop. Rewrite the text before pasting.',
  busy: 'Still rewriting this draft.',
  setupHint: 'No shortcut yet. Run /prompt-ladder setup to bind ctrl+x ctrl+p.',
  setup: {
    added: chord => `Bound ${chord} to /prompt-ladder in the Chat context. Restart Claude Code if it does not respond yet.`,
    present: chord => `Already bound: ${chord} runs /prompt-ladder.`,
    conflict: (chord, existing) =>
      `${chord} already runs ${existing}, so nothing changed. Bind another chord to "command:prompt-ladder" in /keybindings.`,
    invalid: path => `Could not read ${path} as JSON, so nothing changed.`,
  },
  errors: {
    api: status => `The API returned an error${status ? ` (${status})` : ''}.`,
    empty: 'The model returned no text.',
    timeout: 'Timed out.',
    threw: detail => `Something failed: ${detail}`,
    unreadable: 'The reply could not be read as candidates.',
  },
}

const ko: Strings = {
  tier: { quick: '빠르게', balanced: '균형', deep: '깊게' },
  scope: { small: '작은 작업', medium: '중간 규모', large: '큰 작업' },
  difficulty: { low: '쉬움', medium: '보통 난이도', high: '어려움' },
  working: '다듬는 중',
  recommended: '추천',
  inBox: '입력창',
  draft: '원문',
  retry: '다시',
  close: '닫기',
  cancel: '취소',
  assumes: '가정',
  unconfirmed: '세션에서 확인 못 한 이름',
  stale: '그사이 초안을 고치셔서 입력창은 그대로 두었습니다.',
  next: chord => `${chord} 다음 후보`,
  focus: 'ctrl+x tab 후 숫자',
  usage: (fresh, cached, output, seconds) => `신규 ${fresh} · 캐시 ${cached} · 출력 ${output} · ${seconds}초`,
  forkNote: '세션 fork',
  heavy: context => `컨텍스트 ${context} · 핸드오프 권장`,
  directNote: '직접 호출',
  failed: '다듬지 못했습니다',
  emptyDraft: chord => `초안을 먼저 쓰고 ${chord}를 누르세요. /prompt-ladder <내용>도 됩니다.`,
  tooLong: '초안이 2만 자를 넘습니다. 줄이거나 긴 내용은 파일로 붙여 주세요.',
  placeholder: '초안에 붙여넣은 블록이나 이미지가 있어, 다듬으면 그 내용이 빠집니다. 붙여넣기 전에 다듬어 주세요.',
  busy: '이 초안은 아직 다듬는 중입니다.',
  setupHint: '단축키가 아직 없습니다. /prompt-ladder setup 으로 ctrl+x ctrl+p 를 켜세요.',
  setup: {
    added: chord => `Chat 컨텍스트에 ${chord} → /prompt-ladder 를 추가했습니다. 바로 안 되면 Claude Code 를 다시 시작하세요.`,
    present: chord => `이미 설정돼 있습니다: ${chord} 가 /prompt-ladder 를 실행합니다.`,
    conflict: (chord, existing) =>
      `${chord} 는 이미 ${existing} 에 쓰이고 있어 바꾸지 않았습니다. /keybindings 에서 다른 조합을 "command:prompt-ladder" 에 연결하세요.`,
    invalid: path => `${path} 를 JSON 으로 읽지 못해 바꾸지 않았습니다.`,
  },
  errors: {
    api: status => `API 오류${status ? ` (${status})` : ''}가 났습니다.`,
    empty: '모델이 빈 답을 보냈습니다.',
    timeout: '시간이 초과됐습니다.',
    threw: detail => `실패했습니다: ${detail}`,
    unreadable: '답을 후보로 읽지 못했습니다.',
  },
}

export function strings(lang: Lang): Strings {
  return lang === 'ko' ? ko : en
}

/**
 * Korean when Claude Code's `language` setting says so, or when the draft is
 * Korean; English otherwise.
 */
export function pickLang(setting: unknown, draft: string): Lang {
  if (typeof setting === 'string' && setting.trim() !== '') {
    return /^(ko|kor|korean)\b|한국/i.test(setting.trim()) ? 'ko' : 'en'
  }
  return /[ㄱ-ㆎ가-힣]/.test(draft) ? 'ko' : 'en'
}

/** 1234 → "1.2k". */
export function tokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 100_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return `${Math.round(n / 1000)}k`
}

/** Pads to a width in terminal cells, counting Hangul and other wide glyphs as two. */
export function padCells(text: string, width: number): string {
  let cells = 0
  for (const char of text) cells += /[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(char) ? 2 : 1
  return text + ' '.repeat(Math.max(0, width - cells))
}

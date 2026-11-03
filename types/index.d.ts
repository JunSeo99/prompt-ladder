/** A rung of the ladder, cheapest first. */
export type Tier = 'quick' | 'balanced' | 'deep'

/** The language the band speaks. Candidates follow the draft's language. */
export type Lang = 'en' | 'ko'

export type Scope = 'small' | 'medium' | 'large'
export type Difficulty = 'low' | 'medium' | 'high'

export type Assessment = {
  scope?: Scope
  difficulty?: Difficulty
  /** One short clause, in the draft's language. */
  reason?: string
}

export type Candidate = {
  tier: Tier
  /** What this version does, one line. */
  summary: string
  /** The prompt to send. */
  prompt: string
  /** What the prompt assumes that the draft left open. */
  assumptions: string[]
  /** Backticked names the session could not confirm (a skill, agent or tool). */
  unknown: string[]
}

/** Where the rewrite came from: a fork of the session, or one direct call. */
export type Engine = 'fork' | 'direct'

export type Usage = {
  /** Input tokens not served by the prompt cache. */
  fresh: number
  /** Input tokens the prompt cache served. */
  cached: number
  output: number
}

export type Ladder = {
  assessment: Assessment
  /** Index into `candidates`. */
  recommended: number
  candidates: Candidate[]
}

export type View =
  | { kind: 'idle' }
  | {
      kind: 'running'
      id: number
      draft: string
      /** What the prompt box held when the run started. */
      boxAtStart: string
      startedAt: number
      lang: Lang
    }
  | {
      kind: 'ready'
      draft: string
      lang: Lang
      ladder: Ladder
      /** Index of the candidate in the prompt box, -1 for the draft. */
      selected: number
      /** Set when the box changed during the run, so nothing was filled. */
      isStale: boolean
      engine: Engine
      ms: number
      usage: Usage
      /** The session's context in tokens when the run started, if known. */
      context?: number
      /** Context at or past the handoff line, so the ladder plans a handoff. */
      isHeavy: boolean
    }
  | { kind: 'error'; draft: string; lang: Lang; message: string }

declare module 'claude-code' {
  interface PluginState {
    'prompt-ladder': { view: Shaped<View> }
  }
}

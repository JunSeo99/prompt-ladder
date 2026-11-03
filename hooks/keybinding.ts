/**
 * The key `/prompt-ladder setup` binds: one press, free in the Chat and Global
 * defaults and not one of the prompt's own editing keys (ctrl+a/e/k/u/w/y/p/n).
 */
export const DEFAULT_CHORD = 'ctrl+q'
export const ACTION = 'command:prompt-ladder'

const SCHEMA = 'https://www.schemastore.org/claude-code-keybindings.json'
const DOCS = 'https://code.claude.com/docs/en/keybindings'

type Block = { context: string; bindings: Record<string, unknown> }
type File = { bindings: unknown[] } & Record<string, unknown>

function isBlock(value: unknown): value is Block {
  if (typeof value !== 'object' || value === null) return false
  const block = value as Record<string, unknown>
  return typeof block.context === 'string' && typeof block.bindings === 'object' && block.bindings !== null && !Array.isArray(block.bindings)
}

/** Key names are case-insensitive and a chord is keys separated by spaces. */
export function normalize(chord: string): string {
  return chord.trim().toLowerCase().split(/\s+/).join(' ')
}

const KEY = /^(?:(?:ctrl|shift|alt|opt|option|meta|cmd|command|super)\+)+[^\s+]+$|^f\d{1,2}$/

/**
 * The chord `/prompt-ladder setup <text>` names, when every word of the text is
 * a modified key or a function key; otherwise the text is a draft to rewrite.
 */
export function asChord(text: string): string | undefined {
  const keys = normalize(text).split(' ')
  return keys.every(key => KEY.test(key)) ? keys.join(' ') : undefined
}

function parse(raw: string | undefined): File | undefined {
  if (raw === undefined || raw.trim() === '') return { $schema: SCHEMA, $docs: DOCS, bindings: [] }
  try {
    const data = JSON.parse(raw) as unknown
    if (typeof data !== 'object' || data === null || !Array.isArray((data as File).bindings)) return undefined
    return data as File
  } catch {
    return undefined
  }
}

/** Every [chord, action] in the file, across contexts, skipping damaged blocks. */
function entries(file: File): [string, unknown][] {
  return file.bindings.filter(isBlock).flatMap(block => Object.entries(block.bindings))
}

/** The chord bound to the action in any context, if one is. */
export function findChord(raw: string | undefined, action = ACTION): string | undefined {
  const file = parse(raw)
  return file ? entries(file).find(([, bound]) => bound === action)?.[0] : undefined
}

export type Ensured =
  | { status: 'added'; chord: string; previous?: string; text: string }
  | { status: 'present'; chord: string }
  | { status: 'conflict'; chord: string; existing: string }
  | { status: 'invalid' }

/**
 * Binds the chord to the action in the Chat context. With no chord named, an
 * existing binding of the action stays as it is; a named chord replaces the
 * action's own bindings. Never overwrites a binding of anything else: the
 * chord itself, its first key bound alone (which a chord would turn back into
 * a prefix), or for a single key a chord that starts with it (which keeps the
 * key a prefix).
 */
export function ensureBinding(raw: string | undefined, chord?: string, action = ACTION): Ensured {
  const file = parse(raw)
  if (!file) return { status: 'invalid' }

  const all = entries(file)
  const wanted = normalize(chord ?? DEFAULT_CHORD)
  const present = all.find(([key, bound]) => bound === action && (chord === undefined || normalize(key) === wanted))
  if (present) return { status: 'present', chord: present[0] }

  const prefix = wanted.split(' ')[0] ?? wanted
  for (const [key, bound] of all) {
    if (typeof bound !== 'string' || bound === action) continue
    const own = normalize(key)
    if (own === wanted || (wanted.includes(' ') && own === prefix) || own.startsWith(`${wanted} `)) {
      return { status: 'conflict', chord: key, existing: bound }
    }
  }

  const previous = all.find(([, bound]) => bound === action)?.[0]
  const blocks = file.bindings.filter(isBlock)
  for (const block of blocks) block.bindings = Object.fromEntries(Object.entries(block.bindings).filter(([, bound]) => bound !== action))
  let chat = blocks.find(block => block.context === 'Chat')
  if (!chat) {
    chat = { context: 'Chat', bindings: {} }
    file.bindings.push(chat)
  }
  chat.bindings = { ...chat.bindings, [wanted]: action }
  return { status: 'added', chord: wanted, ...(previous ? { previous } : {}), text: `${JSON.stringify(file, null, 2)}\n` }
}

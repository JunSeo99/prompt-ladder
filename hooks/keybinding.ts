/** The chord `/prompt-ladder setup` binds: free in every default context. */
export const DEFAULT_CHORD = 'ctrl+x ctrl+p'
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
function normalize(chord: string): string {
  return chord.trim().toLowerCase().split(/\s+/).join(' ')
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
  | { status: 'added'; chord: string; text: string }
  | { status: 'present'; chord: string }
  | { status: 'conflict'; chord: string; existing: string }
  | { status: 'invalid' }

/**
 * Binds the chord to the action in the Chat context, unless the action is
 * bound already, or the chord (or its first key, reclaimed as a key of its
 * own) does something else in any context. Never overwrites a binding.
 */
export function ensureBinding(raw: string | undefined, chord = DEFAULT_CHORD, action = ACTION): Ensured {
  const file = parse(raw)
  if (!file) return { status: 'invalid' }

  const all = entries(file)
  const present = all.find(([, bound]) => bound === action)
  if (present) return { status: 'present', chord: present[0] }

  const wanted = normalize(chord)
  const prefix = wanted.split(' ')[0] ?? wanted
  for (const [key, bound] of all) {
    if (typeof bound !== 'string') continue
    const own = normalize(key)
    // A chord already taken, or its first key bound alone (which a new chord would turn back into a prefix).
    if (own === wanted || (wanted.includes(' ') && own === prefix)) return { status: 'conflict', chord: key, existing: bound }
  }

  let chat = file.bindings.find((block): block is Block => isBlock(block) && block.context === 'Chat')
  if (!chat) {
    chat = { context: 'Chat', bindings: {} }
    file.bindings.push(chat)
  }
  chat.bindings = { ...chat.bindings, [chord]: action }
  return { status: 'added', chord, text: `${JSON.stringify(file, null, 2)}\n` }
}

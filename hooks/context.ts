import { clip } from './ladder'

/**
 * The session as a direct call sees it, before there is a turn to fork.
 * Every part is capped so a large setup still fits in one cheap request.
 */
export type SessionFacts = {
  cwd: string
  branch?: string
  model: string
  /** CLAUDE.md files and the memory index, path first. */
  instructions: { path: string; text: string }[]
  commands: { name: string; description?: string }[]
  tools: { name: string; description?: string }[]
  agents: string[]
  messages: { role: 'user' | 'assistant'; text: string; toolUses?: { tool?: string }[] }[]
}

const LIMITS = {
  instructionFile: 12_000,
  description: 140,
  commands: 40_000,
  messages: 10,
  messageText: 1_500,
}

function section(tag: string, body: string): string {
  return body.trim() ? `<${tag}>\n${body.trim()}\n</${tag}>` : ''
}

export function formatInstructions(files: SessionFacts['instructions']): string {
  return files
    .filter(file => file.text.trim() !== '')
    .map(file => {
      const text = file.text.length > LIMITS.instructionFile ? `${file.text.slice(0, LIMITS.instructionFile)}\n[cut]` : file.text
      return `## ${file.path}\n${text.trim()}`
    })
    .join('\n\n')
}

export function formatCommands(commands: SessionFacts['commands']): string {
  const lines: string[] = []
  let size = 0
  for (const command of commands) {
    const line = command.description ? `- ${command.name}: ${clip(command.description, LIMITS.description)}` : `- ${command.name}`
    if (size + line.length > LIMITS.commands) {
      lines.push(`- (${commands.length - lines.length} more not listed)`)
      break
    }
    lines.push(line)
    size += line.length + 1
  }
  return lines.join('\n')
}

/** Built-in tools by name; MCP tools grouped by server, a few names each. */
export function formatTools(tools: SessionFacts['tools']): string {
  const builtIn: string[] = []
  const servers = new Map<string, string[]>()
  for (const tool of tools) {
    const [prefix, server, ...rest] = tool.name.split('__')
    if (prefix === 'mcp' && server && rest.length > 0) {
      const list = servers.get(server) ?? []
      list.push(rest.join('__'))
      servers.set(server, list)
    } else {
      builtIn.push(tool.name)
    }
  }
  const lines = [`Built-in: ${builtIn.join(', ')}`]
  for (const [server, names] of servers) {
    const shown = names.slice(0, 8).join(', ')
    lines.push(`MCP server ${server} (${names.length} tools, e.g. ${shown}${names.length > 8 ? ', ...' : ''}): call as mcp__${server}__<tool>`)
  }
  return lines.join('\n')
}

export function formatMessages(messages: SessionFacts['messages']): string {
  return messages
    .slice(-LIMITS.messages)
    .map(message => {
      const tools = (message.toolUses ?? []).map(use => use.tool).filter(Boolean)
      const toolNote = tools.length ? ` [tools: ${tools.join(', ')}]` : ''
      const text = message.text.length > LIMITS.messageText ? `${message.text.slice(0, LIMITS.messageText)} [cut]` : message.text
      return `${message.role}: ${text.trim() || '(no text)'}${toolNote}`
    })
    .join('\n\n')
}

/** The <context> block of a direct call. Stable parts first, so they cache. */
export function buildContext(facts: SessionFacts): string {
  const environment = [`Working directory: ${facts.cwd}`, facts.branch ? `Git branch: ${facts.branch}` : '', `Model: ${facts.model}`]
    .filter(Boolean)
    .join('\n')
  return [
    '<context>',
    section('environment', environment),
    section('instructions', formatInstructions(facts.instructions)),
    section('skills_and_commands', formatCommands(facts.commands)),
    section('subagent_types', facts.agents.join(', ')),
    section('tools', formatTools(facts.tools)),
    section('conversation', formatMessages(facts.messages) || '(no messages yet)'),
    '</context>',
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Where Claude Code keeps a project's memory: the cwd with every non-alphanumeric as "-". */
export function memoryIndexPath(configDir: string, cwd: string): string {
  return `${configDir}/projects/${cwd.replace(/[^a-zA-Z0-9]/g, '-')}/memory/MEMORY.md`
}

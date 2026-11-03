# Security

prompt-ladder runs inside your Claude Code session with that session's credentials. Here is exactly what it reads, sends and writes.

## What it reads

| What | Where | When |
|---|---|---|
| The draft in the prompt box | `$.prompt.read()` | When you press the chord |
| Context size | `$.session.usage()` (local, no request) | When you press the chord |
| The session's skills, commands and tools, recent messages | `$.command.list()`, `$.tool.list()`, `$.session.messages()` | On each rewrite, to check the names a candidate uses |
| CLAUDE.md files, the memory index, subagent definitions | `~/.claude/CLAUDE.md`, `<project>/CLAUDE.md`, `<project>/.claude/CLAUDE.md`, `<project>/CLAUDE.local.md`, `~/.claude/projects/<project>/memory/MEMORY.md`, `~/.claude/agents/`, `<project>/.claude/agents/` | Only for a direct call, the first rewrite before any turn has finished |
| Keybindings | `~/.claude/keybindings.json` (or under `CLAUDE_CONFIG_DIR`) | At session start, and on `/prompt-ladder setup` |

## Where it goes

Every rewrite is one model request on the session's own model and account: a fork of the session, or one direct call carrying the context above. prompt-ladder makes no other network request and talks to no other service.

Text inside the session (tool output, files, web pages) reaches the rewriter as part of the fork. The rewriter is told to treat it as data and never to carry an instruction found there into a candidate. Still, read a candidate before you send it: once sent, it is your message.

## What it writes

- `~/.claude/keybindings.json`, only when you run `/prompt-ladder setup`, only to add one binding, and never over an existing one.
- Its own session state (`$.state`) and one flag (`$.store`: whether the setup hint was shown).

Nothing else touches disk. Candidates are never stored.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/JunSeo99/prompt-ladder/security/advisories/new) rather than a public issue.

# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-11-03

### Added

- `ctrl+x ctrl+p` (via `command:prompt-ladder`) rewrites the draft in the prompt box into two or three prompts ordered by cost: Quick, Balanced, Deep. Each rung is scaled to the task, and the rewriter recommends one.
- The band above the prompt shows the assessment (scope and difficulty), one line per rung with a cost meter, the assumptions of the rung in the box, names the session cannot confirm, and the tokens and seconds the rewrite took.
- The rewrite forks the session on its own model, so the prompt cache serves the session's prefix. Before the first finished turn it calls the session's model directly, with CLAUDE.md files, the memory index, skills and commands, subagent types, tools, MCP servers, git branch and recent messages.
- The recommended rung is filled into the box only if the draft is unchanged since the press. Digits pick a rung, `0` restores the draft (or the text you edited), `r` retries, `x` closes or cancels. The chord, pressed again, walks the draft and each rung.
- Past `handoffAt` thousand tokens of context (default 400), Balanced and Deep start by leaving a handoff and continue in a fresh session or a subagent.
- `/prompt-ladder setup` binds the chord in `~/.claude/keybindings.json` without overwriting anything, `/prompt-ladder <text>` rewrites typed text.
- Options: `candidates` (3 or 2), `autofill`, `handoffAt`. English and Korean UI.

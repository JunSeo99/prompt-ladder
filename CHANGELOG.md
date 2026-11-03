# Changelog

All notable changes to this project are documented here. The project follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-11-03

### Added

- An icon: a felt owl with a pencil on a three-rung ladder, also at the top of the README.
- `plugin.json` links to the documentation, the issue tracker and the data-handling notes.

### Changed

- The direct call (the first rewrite of a session) no longer runs `git` to read the branch name. prompt-ladder now starts no programs.

## [0.1.1] - 2026-11-03

No change to the mod's behavior.

### Changed

- README (English and Korean) opens with a GIF and two screenshots of a real session in Ghostty: a login-expiry bug in a demo Next.js app, the draft, the ladder, and the Balanced and Deep prompts. They replace the text capture.
- README pitch, the `plugin.json` and marketplace descriptions now lead with prompting: Claude does what you ask, so ask well. A **Why** section explains it. The marketplace has a description of its own.
- The key table says that `0`, `r` and `x` work after `ctrl+x tab` focuses the band.
- The measured table covers five fork runs of the demo (1.2k–2.2k new, 63k–66k cached, 26–51 s).
- CI runs on Node 24 actions (checkout v6.1.0, setup-node v6.5.0, pinned by SHA), runs daily against the latest Claude Code, and fails when the `plugin.json` version has no CHANGELOG section or a `v*` tag disagrees with it.

### Added

- A line under License: prompt-ladder is independent and not affiliated with or endorsed by Anthropic.

## [0.1.0] - 2026-11-03

### Added

- `ctrl+x ctrl+p` (via `command:prompt-ladder`) rewrites the draft in the prompt box into two or three prompts ordered by cost: Quick, Balanced, Deep. Each rung is scaled to the task, and the rewriter recommends one.
- The band above the prompt shows the assessment (scope and difficulty), one line per rung with a cost meter, the assumptions of the rung in the box, names the session cannot confirm, and the tokens and seconds the rewrite took.
- The rewrite forks the session on its own model, so the prompt cache serves the session's prefix. Before the first finished turn it calls the session's model directly, with CLAUDE.md files, the memory index, skills and commands, subagent types, tools, MCP servers, git branch and recent messages.
- The recommended rung is filled into the box only if the draft is unchanged since the press. Digits pick a rung, `0` restores the draft (or the text you edited), `r` retries, `x` closes or cancels. The chord, pressed again, walks the draft and each rung.
- Past `handoffAt` thousand tokens of context (default 400), Balanced and Deep start by leaving a handoff and continue in a fresh session or a subagent.
- `/prompt-ladder setup` binds the chord in `~/.claude/keybindings.json` without overwriting anything, `/prompt-ladder <text>` rewrites typed text.
- Options: `candidates` (3 or 2), `autofill`, `handoffAt`. English and Korean UI.

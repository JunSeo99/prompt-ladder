<div align="center">

# Prompt Ladder

### Claude does what you ask. So ask well.

Type a rough draft and press `ctrl+x ctrl+p`. prompt-ladder writes the prompt you would have written with ten more minutes, from your session's own context: what to read first, how to proceed, which of your skills and agents to use, and how to know it is done. You choose how much it spends, from quick to deep.

[![CI](https://github.com/JunSeo99/prompt-ladder/actions/workflows/ci.yml/badge.svg)](https://github.com/JunSeo99/prompt-ladder/actions/workflows/ci.yml) [![MIT](https://img.shields.io/badge/license-MIT-2f6650)](LICENSE) ![Claude Code mod](https://img.shields.io/badge/Claude%20Code-mod-D97757) ![Tested on 2.1.317](https://img.shields.io/badge/tested%20on-2.1.317-lightgrey)

**English** · [한국어](README.ko.md)

</div>

![A real Claude Code session: the draft "users say they get logged out after a few minutes. fix it", then ctrl+x ctrl+p, then three prompts from Quick to Deep with the recommended one in the prompt box](assets/demo.gif)

<sub>A real session in Ghostty, on a demo Next.js app whose users get logged out after five minutes. Claude had already read the auth code in one turn, so the rewrite cites what it found. The 39-second rewrite is fast-forwarded.</sub>

| Balanced, recommended and filled in | Deep, picked with `ctrl+x tab` then `3` |
|---|---|
| [![Balanced: read five files, confirm the cause, compare three fixes, write Vitest tests first, done when pnpm test and pnpm lint pass](assets/balanced.png)](assets/balanced.png) | [![Deep: root-cause first, load the vercel:nextjs skill, compare three approaches, test first, confirm in the running app, then a security review of the diff](assets/deep.png)](assets/deep.png) |

## Why

Models follow instructions now. Write "users get logged out after a few minutes, fix it" and you may get exactly that: the access token now lasts a day, the logouts stop, the refresh route is still never called, and no test was written. How well you prompt decides the result.

Writing a good prompt every time is work, though. You need to know the context the agent needs, the tools and skills you have, how to break the job down, and what "done" looks like. prompt-ladder does that work in the moment before you press Enter, with your session's own context, and you choose how much it spends.

## Install

At the prompt of a Claude Code session:

```text
/plugin install prompt-ladder --marketplace JunSeo99/prompt-ladder
/prompt-ladder setup
```

The second line adds `ctrl+x ctrl+p` → `command:prompt-ladder` to the Chat context of `~/.claude/keybindings.json`. It never overwrites a binding. If that chord is already taken, it tells you and changes nothing. Restart Claude Code if the chord does not respond yet.

From a shell: `claude plugin install prompt-ladder --marketplace JunSeo99/prompt-ladder`.

## What you get

| | |
|---|---|
| **What a good prompt has** | Each candidate says what to read first, how to proceed, and how to verify the work. It also says when to stop and ask, so the agent asks before it guesses. |
| **Built from your session** | The rewriter sees what Claude sees: your CLAUDE.md, memory, the skills, subagents and MCP servers you actually have, and the conversation so far. The prompt puts them to work by name. |
| **A ladder, priced** | Two or three prompts ordered by what they spend: Quick, Balanced, Deep. The meter `▰▱▱`–`▰▰▰` shows how many tokens and how much time each one asks the agent to spend. The rewriter sizes up the task and recommends one. |
| **The cache you already paid for** | After the first turn, the rewrite is a fork of the session on the same model, so the prompt cache serves almost all of the input (in the capture above: 1.2k new against 65.6k cached). |
| **Nothing lost** | The recommended prompt goes into the box only if you have not touched the draft meanwhile. `0` brings the draft back. Sending a prompt clears the band. |
| **A handoff when the session is heavy** | Past 400k tokens of context (configurable), Balanced and Deep start by leaving a handoff and continue fresh instead of piling on. |

## Use it

1. Type a draft in the prompt box, as rough as you like.
2. Press `ctrl+x ctrl+p`. The band above the prompt counts seconds while the rewrite runs.
3. The recommended prompt lands in the box. Read it, edit it, or press Enter.

| Key | What it does |
|---|---|
| `ctrl+x ctrl+p` | Rewrite the draft. Pressed again while the box holds the draft or a candidate, it moves to the next one: draft → 1 → 2 → 3 → draft. After you edit the box, it rewrites your edited text. |
| `ctrl+x tab`, then a key | Focus the band, then: `1` `2` `3` put that candidate in the box, `0` puts your draft back, `r` retries, `x` closes the band or cancels a running rewrite. Focus returns to the prompt after the press. |
| `/prompt-ladder <text>` | Rewrite text you type after the command, for when no chord is bound |

## The ladder

Every rung is scaled to the task in front of it. A typo fix's Deep rung stays small, and its Quick rung still has to get it right.

| Rung | Spends | Buys |
|---|---|---|
| **1 Quick** `▰▱▱` | Fewest tokens, fastest. Acts on what the draft and context already pin down, reads only the files involved, no subagents, research or new skills, one cheap check. | The answer, when the task is small and clear. |
| **2 Balanced** `▰▰▱` | Reads the relevant code and existing patterns first, plans briefly, implements, verifies with tests or a run. At most one clearly relevant skill. | Work that fits the codebase, checked. |
| **3 Deep** `▰▰▰` | The most tokens and time. Gathers references or current sources, delegates exploration to subagents in parallel, loads the skills that fit, plans, implements, gets an independent review, iterates. | The best result on large, ambiguous or quality-critical work. |

Before writing, the rewriter assesses the draft's scope and difficulty (shown at the top of the band) and recommends one rung. With **2 candidates**, it picks the pair that brackets the task: Quick and Balanced for small, clear work, Balanced and Deep for large or ambiguous work.

The rules every candidate follows:

- Keep the user's intent, constraints, names, paths and numbers.
- Add no goal the user didn't ask for.
- When something must be assumed, say it inside the prompt so the agent checks it. The band lists these assumptions.
- Never break the user's standing instructions.

## How it works

```text
ctrl+x ctrl+p ─► /prompt-ladder ─► read the draft ─┬─ session has a finished turn ─► $.model.fork (same model, cached prefix)
                                                   └─ first prompt / after /clear ─► $.model.complete on the session's model
                                                                                     with CLAUDE.md, memory, skills, tools, agents
                      ◄─ JSON ladder ◄─ parse, check names against the session ◄─┘
band above the prompt + recommended rung in the box (only if the draft is unchanged)
```

- **Fork first.** A fork resends the session's last request (system prompt, tools, messages) with the rewrite request at the end. Prefix caching only works on the same model, so prompt-ladder deliberately uses your session's model rather than a cheaper one. Its own instructions (about 1k tokens) go last and are the only uncached input.
- **Direct call before the first turn.** There is nothing to fork yet, so prompt-ladder builds the context itself: your CLAUDE.md files and memory index, the skills and commands, subagent types, built-in tools and MCP servers, git branch, and recent messages. Each part is capped, and the context block is cached, so a second rewrite within a few minutes reads most of it from the cache.
- **The band** is drawn by a `ui.render` hook on the `AbovePrompt` site, with digit hotkeys and an elapsed-time ticker.

Measured on Claude Code 2.1.317, Opus 5.5, in a setup with about 400 skills and commands. The fork row covers five runs of the demo above, in English and Korean:

| Path | New input | Cached | Output | Time |
|---|---|---|---|---|
| Direct call (first prompt of a session) | 18k–19k | 0–1k | 1.5k–2.1k | 12–25 s |
| Session fork (after one turn, ~65k context) | 1.2k–2.2k | 63k–66k | 2.6k–5.6k | 26–51 s |

A fork reads the whole context from the cache, so it costs more as the session grows. That is one more reason the handoff below exists.

### Heavy sessions

When you press the chord, prompt-ladder reads the session's context size (`$.session.usage()`, which costs nothing). At `handoffAt` (400k tokens by default) or more, the band says so and the rewriter is told to plan for it:

- Quick may stay in the session if the task is small.
- Balanced and Deep start by leaving a handoff, using a handoff skill if you have one or a short note of goal, decisions, state, next steps and key files if you don't.
- Then they either stop and tell you what to resume from in a fresh session, or hand the whole task to a subagent with a clean context and take back only its result.

## Options

`/config` lists these under prompt-ladder, and `/plugin` shows them at install time:

| Option | Default | |
|---|---|---|
| `candidates` | `3` | `3`: Quick, Balanced, Deep. `2`: the pair that brackets the task. |
| `autofill` | on | Put the recommended prompt in the box when the rewrite lands. Off: the box keeps your draft until you pick. |
| `handoffAt` | `400` | Context size, in thousands of tokens, at which Balanced and Deep plan a handoff. `0` turns it off. |

The band speaks Korean when Claude Code's `language` setting is Korean (or, with no setting, when the draft is). Otherwise it speaks English. Candidates are always written in the draft's language.

## Privacy and cost

- **What it sends.** Your draft goes to the same model and account as the session. The direct call adds the context listed above. Nothing goes anywhere else.
- **What it writes.** prompt-ladder writes nothing to disk except `~/.claude/keybindings.json`, and only when you run `/prompt-ladder setup`. See [SECURITY.md](SECURITY.md).
- **What it costs.** Each press is one request, billed like any other request in the session. The band shows its new, cached and output tokens.
- **Cancelling.** `x` cancels a direct call. A fork cannot be stopped once sent, so `x` discards its result when it arrives.

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| The chord does nothing | No binding. Run `/prompt-ladder setup`, then restart Claude Code. Check `/keybindings` for `command:prompt-ladder`. |
| Setup says the chord is taken | Something else uses `ctrl+x ctrl+p`. Bind any free chord to `command:prompt-ladder` in `/keybindings`. |
| No band | The band is drawn in the terminal and the Desktop app, not in the VS Code extension. There, when the box takes no fill, the candidates are printed as transcript lines instead. The band also hides while it is collapsed (`ctrl+x ctrl+a` toggles it) and while a survey holds it. |
| "The draft holds a pasted block or an image" | The box shows a paste or an image as a placeholder, and a rewrite would drop what it stands for. Rewrite the text first, then paste. |
| Typing a digit into an empty box picked a rung | Claude Code presses a band button when its digit is typed alone into an empty prompt. Send or close (`x`) the ladder first, or start the line with another character. |
| "Not found in this session: …" | The prompt names a skill, agent or tool the session does not list. Remove it or install it before sending. |
| "You edited the draft meanwhile" | You typed while the rewrite ran, so your box was left alone. Pick a rung with `ctrl+x tab` and a digit, or press the chord on your new text. |

## Requirements

- Claude Code 2.1.299 or later (rich buttons and text weight in the band). Tested on 2.1.317.
- Mods are an early-access API, and events and methods can change between releases. If something breaks after an update, open an issue with `claude --version`.

## Development

```bash
git clone https://github.com/JunSeo99/prompt-ladder && cd prompt-ladder
claude --plugin-dir .            # run a session with the mod loaded (writes .claude-plugin/types for your editor)
claude plugin test .             # parser, rules, keybinding merge, the whole flow with a stubbed model
claude plugin validate .         # what the engine reads from the manifest and the hooks module
npx -p typescript tsc -p .       # strict type check against your build's declarations
```

```text
hooks/register.tsx   events, the command, the band (everything that touches $)
hooks/ladder.ts      the rewriter's instructions, reply parser, name check, chord cycling
hooks/context.ts     the context block of a direct call
hooks/keybinding.ts  /prompt-ladder setup: add the chord, never clobber
hooks/i18n.ts        English and Korean strings
types/index.d.ts     the state contract
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## License

[MIT](LICENSE). prompt-ladder is an independent project, not affiliated with or endorsed by Anthropic. Claude and Claude Code are trademarks of Anthropic.

# Contributing

Thanks for helping. A few things keep this mod small and predictable.

## Before you start

- Open an issue for anything beyond a small fix, so we can agree on the shape first.
- Mods are an early-access Claude Code API. Note your `claude --version` in issues and pull requests.

## Develop

```bash
claude --plugin-dir .        # a session with the mod loaded; also writes .claude-plugin/types for your editor
claude plugin test .         # must pass
claude plugin validate .     # must pass
npx -p typescript tsc -p .   # strict, after one --plugin-dir run has written the types
```

Everything that touches `$` lives in `hooks/register.tsx`, because the engine's static analysis only follows `$` into functions declared in the same file. Keep logic you can test without the engine (parsing, rules, formatting) in the other modules.

## Pull requests

- One change per pull request, with a test that fails without it.
- A change to the rewriter's instructions (`hooks/ladder.ts`) should show a before/after candidate from a real session in the description. These instructions are the product.
- Update `CHANGELOG.md` under `[Unreleased]`, and both READMEs when behavior changes.

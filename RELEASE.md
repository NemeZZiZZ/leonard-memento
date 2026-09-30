# Release checklist (manual)

Publishing is deliberately manual. No changesets, no provenance automation.

## One-time setup

1. Create the npm org `leonard-memento` (https://npmjs.com/org/create, free) —
   required for the scoped core package `@leonard-memento/core`.

## Per release

1. Bump versions as needed (`packages/*/package.json`).
2. `npm test` — must be green on Node 20 and 22 (CI covers this).
3. `npm pack --dry-run -w packages/core -w packages/opencode -w packages/claude-code -w packages/codex`
   — check each tarball contains only its whitelisted files.
4. Publish, core first (the adapters depend on it):
   ```
   npm publish -w packages/core
   npm publish -w packages/opencode
   npm publish -w packages/claude-code
   npm publish -w packages/codex
   ```
5. Tag: `git tag vX.Y.Z && git push --tags` (family version = the core
   version being released).

## Post-release (one-time, after the first family release)

1. Archive `github.com/NemeZZiZZ/opencode-memento` with a banner README
   pointing at this repo. Do not yank `opencode-memento@1.0.0` from npm —
   it stays installable forever.
2. Optional smoke test: `/plugin install NemeZZiZZ/leonard-memento` in a real
   Claude Code session, run `/compact`, confirm the index block reappears.

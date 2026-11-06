# Compatibility and guarantees

What `leonard-memento` promises, how much of that is machine-checked, and what remains manual. Read this as a contract: if CI or a future release ever breaks something listed here, that is a bug.

## The guarantees

1. **The injected block is frozen.** The block `readProjectIndex` emits is byte-identical to `opencode-memento` v1.0.0. It has not changed since and must not: agents and summaries depend on the shape, and users diff it. (See `packages/core/src/read.mjs`.)
2. **Read paths never crash the host.** A missing, unreadable, or empty index degrades to `null` (plugins) or silent exit 0 (CLI `inject`). No adapter throws into the host agent's lifecycle. `'~'`-relative project paths are the one loud case, and adapters catch even those.
3. **`init` is idempotent and scoped.** Snippet targets write only inside `<!-- memento:begin -->` … `<!-- memento:end -->` markers; a second run changes nothing, and content outside the markers is never touched.
4. **`sync claude` never deletes.** Facts match by name; missing on one side means copy, never remove on the other. Index files only gain missing `[[name]]` lines. Different content resolves by newer timestamp; identical timestamps with different content leave both sides untouched with a warning.
5. **Zero runtime dependencies.** Every package installs nothing beyond itself; tests run on stock Node ≥ 20 (`node --test`).

## What CI checks

`npm test` runs on every push and PR — Node 20 and 22 on `ubuntu-latest` and `windows-latest` (`.github/workflows/ci.yml`). ~125 tests:

| Suite | Covers |
|---|---|
| `packages/core/test/paths.test.mjs` | canonical path resolution (symlinks, separators), `hash16` keying, root override chain (`MEMENTO_MEMORY_ROOT` → `~/.config/memento/projects` → legacy `~/.config/opencode/memento/projects`) |
| `packages/core/test/read.test.mjs` | frozen injection block bytes, absent/unreadable/empty index → `null` |
| `packages/core/test/cli.test.mjs` | `memento path/inject/init --list` exit codes and output |
| `packages/core/test/init*.test.mjs` | idempotency of every snippet target, marker scoping, hook JSON shape for claude-code/codex, unknown-agent errors |
| `packages/core/test/sync-claude.test.mjs` | slug computation, env/config-dir overrides, import/export/newer-wins/conflict/dry-run semantics, index append-only behavior |
| `packages/opencode/test/adapter.test.mjs` | compaction-hook registration (V1 + V2), injection on compact, failure degradation |
| `packages/{claude-code,codex}/test/hook.test.mjs` | `SessionStart`/`compact` payload matching, `additionalContext` output, malformed-input safety |

Two tests skip on Windows, by design, not neglect: directory-symlink creation needs Developer Mode (`EPERM` on stock runners), and Windows `chmod` cannot produce an unreadable file (`0o000` stays readable). Both code paths are covered on Linux.

## What CI does not check

No automated test drives a live OpenCode, Claude Code, or Codex process, or any of the 12 snippet targets inside their agents. The hooks are tested at the payload contract level (the JSON each harness documents it passes in and expects back), which catches regressions in our code but not harness-side changes — e.g. an agent renaming a hook event or changing its payload shape. That risk is inherent to hooking into tools we do not ship.

## Upstream hook surface (OpenCode, checked 2026-11-06)

- **V1 (1.x)**: `experimental.session.compacting` is still experimental but
  present through 1.19.x; since 1.3.4 the loader calls `default.server(input,
  options)` on object exports (see the opencode package README).
- **V2 (2.x)**: the `compaction` session hook is stable. The `session.compacted`
  event was removed in 2.1.0 — compaction now emits
  `session.compaction.started` / `.delta` / `.ended` / `.failed`; nothing in
  this repo listens to the removed event. 2.2.0 (2026-10-27) added the
  experimental `ctx.session.instructions.entry.put({ sessionID, key, value })`
  / `list` / `remove` API — keyed, compaction-surviving instructions. It is a
  candidate future injection channel, not used yet.

## Manual E2E checklist

Run this before every release (roughly 15 minutes):

- [ ] **OpenCode**: trigger a compaction in a long session; the injected block appears in the summarizer input; `memento path` output matches.
- [ ] **Claude Code**: `memento init claude-code`, start a session (block loads), force `/compact`; block re-injected.
- [ ] **Codex CLI**: `memento init codex`, run a compacting session; block re-injected.
- [ ] **`memento sync claude`**: run twice against a real `~/.claude/projects/<slug>/memory/`; second run reports all `in sync`; no file deleted on either side.
- [ ] **Snippet spot-check** (one per release, rotate): confirm the target file loads in the agent (e.g. Cursor `.cursor/rules/memento.mdc`, Gemini `GEMINI.md` import) and that re-running `init` changes nothing.
- [ ] **Fresh machine**: `npm i -g @leonard-memento/core && memento init <agent>` on a clean profile; no preconditions beyond Node ≥ 20.

## Support policy

- Node < 20: unsupported, no guarantee either way.
- New agent targets: added via `packages/core/src/init/targets.mjs`; a target is only listed after its manual E2E item passes.
- The frozen injection block changes only via a major version — and past experience says it should not change at all.

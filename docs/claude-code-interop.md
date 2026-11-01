# Claude Code interop

Claude Code ships with [native auto memory](https://code.claude.com/docs/en/memory): a `MEMORY.md` index plus topic files, one tree per project, curated by Claude as it works. `leonard-memento` uses the same convention on purpose — which means the two coexist, and `memento sync claude` keeps them in step. This page explains where each side lives, what sync does and never does, and what memento adds on top of native memory.

## Where each side lives

| | Claude Code native auto memory | leonard-memento |
|---|---|---|
| Root | `~/.claude/projects/<slug>/memory/` | `~/.config/memento/projects/<hash16>/` |
| Index | `MEMORY.md` — first 200 lines / 25KB loaded at conversation start | `MEMORY.md` — whole injection block at session start **and at every compaction** |
| Facts | topic `.md` files with front-matter (`type`, `modified`) | topic `.md` files with front-matter (`name`, `description`, `type`, dates) |
| Keying | `slug` = project's absolute path with `/` → `-` | `hash16` = first 16 hex chars of sha256 of the canonical path |
| Scope | Claude Code, one machine | any of the 16 supported agents, same tree |

Both key the tree to the project's absolute path, so every session in the same directory resolves to the same memory — the conventions are close enough that fact files copy across verbatim.

## `memento sync claude`

Bidirectional, file-verbatim, and conservative. It matches facts by name (front-matter `name`, or the file stem) across the union of both trees:

| Situation | Action |
|---|---|
| Fact exists only on the Claude side | **imported** — copied verbatim into memento |
| Fact exists only on the memento side | **exported** — copied verbatim into Claude's memory dir |
| Identical content | **in sync** — nothing written |
| Different content | the side with the **newer timestamp wins** (`max(updated, modified)`), the other is overwritten verbatim |
| Different content, identical timestamps | **conflict** — warning printed, neither side touched |

Guarantees:

- **Nothing is ever deleted.** A fact missing from one side is a copy candidate, never a removal from the other.
- **Index files only grow.** `MEMORY.md` on each side gets missing `- [[name]] — description` lines appended (sorted, existing lines and hand-written prose untouched). A fresh memento index is seeded with the `# Memory Index` header; the Claude side gets lines only, no memento header.
- **Fact files are copied byte-for-byte.** No reformatting, no field mangling.
- **It never throws.** Missing Claude memory dir → a helpful error naming `--claude-dir`, exit 1. Claude index above 200 lines → a warning (native Claude Code loads only the first 200 lines / 25KB).

### Usage

```
memento sync claude                          # sync the current directory's project
memento sync claude --project DIR            # another project
memento sync claude --dry-run                # report, write nothing
memento sync claude --claude-dir DIR         # a non-default Claude config dir
```

Environment: `MEMENTO_MEMORY_ROOT` overrides the memento root; `CLAUDE_CONFIG_DIR` (or `--claude-dir`) overrides `~/.claude`. Exit codes: `0` synced (or dry-run reported), `1` error, `2` usage.

### Typical flow

Run it whenever you switch between Claude Code and other agents on the same project — after a Claude Code session (its auto memory will have new or updated facts), or after curating your memento index by hand:

```
$ memento sync claude --dry-run
exported  build-command → claude
imported  user_role → memento
dry run: 1 fact(s) would change — ~/.config/memento/projects/… ⇄ ~/.claude/projects/…/memory

$ memento sync claude
exported  build-command → claude
imported  user_role → memento
changed 2 fact(s) — ~/.config/memento/projects/… ⇄ ~/.claude/projects/…/memory
```

Both indexes gain their missing lines; both topic files land in the other tree unchanged. A second run reports everything `in sync`.

## What memento adds on top of native memory

Native auto memory is free, on by default, and adopted the same convention — for one tool on one machine it may be all you need. The honest reasons to run memento beside it:

1. **The compaction boundary.** Native memory is loaded "at the start of every conversation"; no re-injection at compaction is documented. When a long Claude Code session compacts, the summarizer keeps only what it is shown. memento's `SessionStart` × `compact` hook re-injects the index at exactly that moment — on every compaction, in OpenCode and Codex too.
2. **Every other agent.** The same tree serves OpenCode, Codex, Gemini CLI, Cursor, and 13 more targets via `memento init`. Facts you curate once are present in whichever agent you open.
3. **Portability.** The memento tree is plain Markdown outside any vendor's config, survives the tool that wrote it, and follows the directory (path-hash keyed), not the agent.

## Notes

- memento does not disable or modify native auto memory — the two systems write different directories and sync is the bridge.
- On Windows, the Claude slug escapes `\:`, the memento hash is the same sha256-16 of the canonical path; both sides of sync are path-separator safe.
- See [comparison.md](./comparison.md) for how this approach sits against mem0, claude-mem, and the rest of the field.

# @leonard-memento/core

Amnesia insurance for coding agents: a curated, Markdown project memory index
injected into context compaction, so auto-summarization never forgets that
memory exists. Zero dependencies.

Part of the [leonard-memento](https://github.com/NemeZZiZZ/leonard-memento)
family — this package carries the shared logic and the `memento` CLI; the
per-agent plugins build on it.

## CLI

```
memento path [--project DIR]    # absolute memory index path (exit 1 if absent)
memento inject [--project DIR]  # the injection block (silent, exit 0 when absent)
memento init <agent>            # idempotent per-agent setup
memento init --list             # supported agents
```

## API

- `projectHash(directory)` — first 16 hex chars of sha256 of the canonical
  project path (`~`-relative input throws: expand it yourself).
- `memoryIndexPath(directory, options?)` — absolute index path.
- `readProjectIndex(directory, options?)` — the frozen injection block, or
  `null` when the project has no memory yet.
- `resolveMemoryRoot(overrides?)` — effective memory root; never throws.
- `initAgent(projectDir, agent)` / `TARGETS` — the init machinery.

Options and their env fallbacks: `memoryRoot` / `MEMENTO_MEMORY_ROOT`,
`indexFile` / `MEMENTO_INDEX_FILE`.

## Memory convention

One flat Markdown tree, outside the repo:

```
~/.config/memento/projects/<hash16>/MEMORY.md   # the index
                                  ├── topic-a.md
                                  └── topic-b.md
```

`MEMORY.md` is one line per fact: `- [[name]] — short description`. Fact
files carry front-matter (`name`, `description`, `type`, dates). The legacy
root `~/.config/opencode/memento/projects` keeps resolving, so existing
opencode-memento v1.0.0 trees work unchanged.

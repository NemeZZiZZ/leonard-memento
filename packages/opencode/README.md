# opencode-memento

Amnesia insurance for OpenCode: injects your project's Markdown memory index
into session compaction, so auto-summarization never forgets that memory
exists. Zero dependencies.

Part of the [leonard-memento](https://github.com/NemeZZiZZ/leonard-memento)
family — the same curated memory index can be carried across every supported
coding agent.

## Install

```jsonc
// opencode.json — OpenCode 1.x
{
  "plugin": ["npm:opencode-memento"]
}
```

```sh
# OpenCode 2.x / OpenChamber — install into the global config from npm:
opencode plugin add opencode-memento
```

Notes for OpenCode 2.x (verified on OpenChamber 2.0.20): plugins are loaded
from the **global** config only — `plugins` entries in project-level
`opencode.json` / `.opencode/opencode.json` are ignored, and local-directory
entries work via `~/.config/openchamber/opencode.managed.json`. Configure
via `MEMENTO_*` env vars (the global plugin list carries no options).

Restart OpenCode. The plugin injects the project's memory index into every
provider request (and at compaction), so it survives summarization.

## Configuration

Plugin options in `opencode.json`, or environment variables everywhere.
On OpenCode 1.x, options ride the tuple form of the plugin entry:

```jsonc
// opencode.json — OpenCode 1.x, with options
{
  "plugin": [["npm:opencode-memento", { "memoryRoot": "/path/to/root" }]]
}
```

| Option / env | Meaning | Default |
|---|---|---|
| `memoryRoot` / `MEMENTO_MEMORY_ROOT` | Directory holding one subdirectory per project, addressed by hash | see fallback chain below |
| `indexFile` / `MEMENTO_INDEX_FILE` | Index file name inside the project's memory directory | `MEMORY.md` |

### Memory root fallback chain

1. `MEMENTO_MEMORY_ROOT` (or the `memoryRoot` option),
2. `~/.config/memento/projects` if it exists (family default),
3. `~/.config/opencode/memento/projects` if it exists (**legacy v1.0.0 root —
   existing users keep working without moving anything**),
4. `~/.config/memento/projects` (created on demand for new users).

## Memory convention

One line per fact in `MEMORY.md`: `- [[name]] — short description`, with
sibling fact files carrying front-matter (`name`, `description`, `type`,
dates). Curate it yourself — the plugin only guarantees it survives
compaction.

## Compatibility

- **OpenCode 1.18.x** — verified live on 1.18.33. V1's loader registers only
  *function* exports `(input, options?) => hooks`, which is what the named
  `MementoPlugin` export provides. (Plain object exports are silently
  ignored — this is why 1.0.0 never fired on V1 — and local auto-discovery
  matches only `.opencode/plugin(s)/*.ts|*.js`, not `.mjs`.)
- **OpenCode 2.x / OpenChamber** — verified live on 2.0.20. The default
  `{ id, setup }` object is required; `setup` registers the same callback
  for the `context` and `compaction` session hooks and pushes into
  `event.system` (the pattern used by working plugins on that platform).
  Local directory entries resolve only when `exports` points at a
  root-level `.js` file — hence the `index.js` wrapper.

## Migrating from 1.0.0

Upgrade the package and nothing else: your memory tree at
`~/.config/opencode/memento/projects` keeps resolving via the fallback
chain. Silent no-op when no index exists, exactly as before.

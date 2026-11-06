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

Notes for OpenCode 2.x: `plugins` arrays from the global config and from
project-level `opencode.json` / `.opencode/opencode.json` are **merged**
(per the V2 docs); on OpenChamber 2.0.20 the `opencode plugin add` command
writes the global list, and local-directory entries also work via
`~/.config/openchamber/opencode.managed.json`. V2 plugin entries carry no
options, so configure via `MEMENTO_*` env vars. In a git worktree the V2
`canonical` input is the **main** worktree path, so all worktrees of one
repository share the main checkout's memory tree.

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

## Design: no tools, no writes

The plugin registers no tools and never calls the `memory` tool of other
plugins. That is the design, not a gap:

- A tool the model may skip is exactly the hole memento exists to plug.
  Injection rides the `context` and `compaction` hooks, so it fires
  whether or not the model remembers that memory exists — there is no
  race to lose.
- Zero dependencies is the point: no embedding model, no vector store,
  nothing to initialize. Plain `node:fs`.
- After injection the agent opens fact files by their absolute paths with
  its normal `read` tool — enough for recall without a custom tool.
- Semantic search over memory is a separate job. Pair memento with a
  reference system such as
  [@npv12/opencode-memory-md](https://github.com/npv12/opencode-memory-md)
  if you need one: storage trees are disjoint (`~/.config/memento` vs
  their `~/.config/opencode/memory`), so both run fine in one session.

## Compatibility

- **OpenCode 1.3.4 – 1.19.x** — the V1 loader checks the default export: when
  it carries `id` and `server`, the loader calls `default.server(input,
  options)` and stops there (named exports are not reached). Our `server`
  forwards both arguments to `MementoPlugin`, so tuple options
  (`memoryRoot`, `indexFile`) work on every V1 release. Verified live on
  1.18.33. Local auto-discovery matches only `.opencode/plugin(s)/*.ts|*.js`,
  not `.mjs`.
- **OpenCode 1.0 – 1.3.3** — the loader registered only *function* exports
  `(input, options?) => hooks`; the named `MementoPlugin` export is kept
  for those releases.
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

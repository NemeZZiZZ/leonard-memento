# claude-code-memento

**Amnesia insurance for Claude Code.**

Part of the [leonard-memento](https://github.com/NemeZZiZZ/leonard-memento)
family.

## How it works

A `SessionStart` hook with matcher `compact` fires after both manual
`/compact` and auto-compact. The hook prints the project's memory index as
`hookSpecificOutput.additionalContext`, so the index is back in context
immediately after compaction.

## Install

**Plugin (recommended):**

```
/plugin install NemeZZiZZ/leonard-memento
```

**Manual (repo-local):**

```
npm i -g @leonard-memento/core claude-code-memento
memento init claude-code
```

`memento init claude-code` writes a `SessionStart` hook entry into
`.claude/settings.json` that runs `claude-code-memento hook`. It is
idempotent and preserves every foreign hook entry.

## Verify

1. Create an index: `memento path` shows where `MEMORY.md` lives for the
   project; write a few `- [[name]] — description` lines.
2. Run `/compact`.
3. The session should regain a `# Project memory index (…)` block.

## Configuration

Same as the family core: `MEMENTO_MEMORY_ROOT` overrides the memory root
(fallback chain: `~/.config/memento/projects` → legacy
`~/.config/opencode/memento/projects`), `MEMENTO_INDEX_FILE` overrides the
index file name (`MEMORY.md`).

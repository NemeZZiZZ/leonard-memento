# codex-memento

**Amnesia insurance for Codex CLI.**

Part of the [leonard-memento](https://github.com/NemeZZiZZ/leonard-memento)
family.

## How it works

A `SessionStart` hook with matcher `^compact$` fires after manual `/compact`
and after auto-compaction — including mid-turn compaction, where Codex
delivers the hook's context to the immediate continuation. The hook prints
the project's memory index as `hookSpecificOutput.additionalContext`, so the
index is back in context immediately after compaction.

## Install

```
npm i -g @leonard-memento/core codex-memento
memento init codex
```

`memento init codex` writes a `SessionStart` hook entry into
`.codex/hooks.json` that runs `codex-memento hook`. It is idempotent and
preserves every foreign key and hook entry.

Codex gates hooks behind a trust review: open `/hooks` in the session and
approve the new entry (a changed command needs re-approval). Project-local
`.codex/` hooks additionally require trusting the project layer when Codex
asks.

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

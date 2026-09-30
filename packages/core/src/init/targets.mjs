// memento init targets — the spec §7 map.
//
// Every text target writes a snippet wrapped in marker comments so re-runs
// are idempotent and nothing outside the markers is ever touched.

import { homedir } from "node:os";
import { join } from "node:path";

import { memoryIndexPath } from "../paths.mjs";

export const MARKER_BEGIN = "<!-- memento:begin -->";
export const MARKER_END = "<!-- memento:end -->";

function block(pathLine) {
  return [
    MARKER_BEGIN,
    "## Project memory",
    "",
    "Long-term memory index for this project (kept outside the repo):",
    pathLine,
    "",
    "Read it before starting work here; keep it current.",
    MARKER_END,
  ].join("\n");
}

/** Generic text snippet: the absolute index path on its own indented line. */
const genericSnippet = (projectDir) => block(`  ${memoryIndexPath(projectDir)}`);
/** Gemini's `@<path>` import actually pulls the index into the prompt. */
const geminiSnippet = (projectDir) => block(`@${memoryIndexPath(projectDir)}`);

/**
 * @typedef {Object} InitTarget
 * @property {"text" | "json" | "print"} kind
 * @property {(projectDir: string) => string} [file]    - where to write (text/json)
 * @property {(projectDir: string) => string} [snippet] - what to write (text)
 * @property {{ matcher: string, command: string, filter: string }} [jsonHook]
 *   SessionStart hook to upsert (json kind): matcher, command to run, and the
 *   substring identifying our own entries for idempotent replacement.
 * @property {string} hint - what the user should verify afterwards
 */

/** @type {Record<string, InitTarget>} */
export const TARGETS = {
  gemini: {
    kind: "text",
    file: (p) => join(p, "GEMINI.md"),
    snippet: geminiSnippet,
    hint: "Gemini CLI re-reads GEMINI.md with every prompt — restart the session.",
  },
  antigravity: {
    kind: "text",
    file: (p) => join(p, "AGENTS.md"),
    snippet: genericSnippet,
    hint: "Antigravity CLI parses workspace AGENTS.md (and GEMINI.md) — start a new turn.",
  },
  crush: {
    kind: "text",
    file: () => join(homedir(), ".config", "crush", "CRUSH.md"),
    snippet: genericSnippet,
    hint: "Crush includes ~/.config/crush/CRUSH.md in its system prompt — restart it.",
  },
  cursor: {
    kind: "text",
    file: (p) => join(p, ".cursor", "rules", "memento.mdc"),
    snippet: genericSnippet,
    hint: "Cursor applies .cursor/rules on new chats — start a fresh chat.",
  },
  cline: {
    kind: "text",
    file: (p) => join(p, ".clinerules", "memento.md"),
    snippet: genericSnippet,
    hint: "Cline reads .clinerules at task start — start a new task.",
  },
  zed: {
    kind: "text",
    file: (p) => join(p, ".rules"),
    snippet: genericSnippet,
    hint: "Zed reads .rules with each prompt — restart the assistant thread.",
  },
  windsurf: {
    kind: "text",
    file: (p) => join(p, ".windsurf", "rules", "memento.md"),
    snippet: genericSnippet,
    hint: "Windsurf reads .windsurf/rules on new conversations.",
  },
  copilot: {
    kind: "text",
    file: (p) => join(p, ".github", "copilot-instructions.md"),
    snippet: genericSnippet,
    hint: "Copilot attaches .github/copilot-instructions.md to every request.",
  },
  goose: {
    kind: "text",
    file: (p) => join(p, "goosehints"),
    snippet: genericSnippet,
    hint: "Goose reads goosehints at session start — start a new session.",
  },
  droid: {
    kind: "text",
    file: (p) => join(p, "AGENTS.md"),
    snippet: genericSnippet,
    hint: "Factory Droid reads AGENTS.md with every prompt.",
  },
  "claude-code": {
    kind: "json",
    file: (p) => join(p, ".claude", "settings.json"),
    jsonHook: { matcher: "compact", command: "claude-code-memento hook", filter: "claude-code-memento" },
    hint: "Restart Claude Code, then run /compact once — the index block should reappear. (Plugin alternative: /plugin install NemeZZiZZ/leonard-memento)",
  },
  codex: {
    kind: "json",
    file: (p) => join(p, ".codex", "hooks.json"),
    jsonHook: { matcher: "^compact$", command: "codex-memento hook", filter: "codex-memento" },
    hint: "Restart Codex, approve the hook via /hooks (trust the project .codex layer if asked), then run /compact once — the index block should reappear.",
  },
  opencode: {
    kind: "print",
    snippet: () =>
      'Add to opencode.json (OpenCode 1.x):\n\n  "plugin": ["npm:opencode-memento"]\n\nOpenCode 2.x ignores project-level plugin config — install globally instead:\n\n  opencode plugin add opencode-memento',
    hint: "Restart OpenCode — the plugin injects the index at every compaction.",
  },
  aider: {
    kind: "print",
    snippet: (p) =>
      `Run aider with the index as a read-only (prompt-cached) file:\n\n  aider --read ${memoryIndexPath(p)}`,
    hint: "Re-run aider with --read after updating the index.",
  },
  generic: {
    kind: "print",
    snippet: genericSnippet,
    hint: "Paste the block above into your agent's rules/instructions file.",
  },
};

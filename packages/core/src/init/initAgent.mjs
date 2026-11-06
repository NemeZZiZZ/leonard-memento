// memento init — idempotent setup of rules-file snippets per agent.
//
// Writes are crash-safe: content goes to a sibling temp file and is renamed
// over the target, so an interrupted run leaves either the old or the new
// file — never a truncated one. Markers make init idempotent: re-runs
// replace the marked block. Nothing outside the markers is ever modified.

import { accessSync, constants, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

import { writeAtomicSync } from "../atomic.mjs";
import { MARKER_BEGIN, MARKER_END, TARGETS } from "./targets.mjs";

export class MementoError extends Error {
  constructor(message, code) {
    super(message);
    this.name = "MementoError";
    this.code = code;
  }
}

/** Insert or replace the marked block inside existing file content. */
function upsertBlock(existing, blockText) {
  const begin = existing.indexOf(MARKER_BEGIN);
  const end = existing.indexOf(MARKER_END);
  if (begin !== -1 && (end === -1 || end < begin)) {
    // An orphan marker means a human (or an old crash) left the file
    // half-marked: appending would pair the stray begin with our new end
    // and silently replace everything in between. Refuse loudly.
    throw new MementoError(
      `file has an unpaired '${MARKER_BEGIN}' marker — fix or remove it and re-run`,
      "UNPAIRED_MARKER",
    );
  }
  if (begin !== -1 && end !== -1 && end > begin) {
    return existing.slice(0, begin) + blockText + existing.slice(end + MARKER_END.length);
  }
  if (!existing) return blockText + "\n";
  // Append after exactly one blank line, preserving existing content verbatim.
  return existing + (existing.endsWith("\n") ? "\n" : "\n\n") + blockText + "\n";
}

/**
 * Set up the memory-index integration for one agent.
 * @returns {{ status: "written" | "printed", file?: string, text?: string, hint: string }}
 */
export function initAgent(projectDir, agent) {
  const target = TARGETS[agent];
  if (!target) {
    throw new MementoError(`unknown agent '${agent}' — see 'memento init --list'`, "UNKNOWN_AGENT");
  }
  if (target.kind === "text") {
    const file = target.file(projectDir);
    let existing = "";
    if (existsSync(file)) {
      try {
        accessSync(file, constants.W_OK);
      } catch {
        throw new MementoError(`target file exists but is not writable: ${file}`, "NOT_WRITABLE");
      }
      existing = readFileSync(file, "utf8");
    }
    mkdirSync(dirname(file), { recursive: true });
    writeAtomicSync(file, upsertBlock(existing, target.snippet(projectDir)));
    return { status: "written", file, hint: target.hint };
  }
  if (target.kind === "json") {
    // Hook-file targets (.claude/settings.json, .codex/hooks.json):
    // idempotency by replacing our own hook entry; every foreign key and
    // hook entry is preserved verbatim, the file's indentation is kept,
    // and an already-correct file is not rewritten at all.
    const file = target.file(projectDir);
    let raw = "";
    let obj = {};
    if (existsSync(file)) {
      try {
        accessSync(file, constants.W_OK);
      } catch {
        throw new MementoError(`target file exists but is not writable: ${file}`, "NOT_WRITABLE");
      }
      let parsed;
      try {
        raw = readFileSync(file, "utf8");
        parsed = JSON.parse(raw);
      } catch {
        throw new MementoError(`invalid JSON in ${file} — fix or remove it and re-run`, "INVALID_JSON");
      }
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
    }
    const spec = target.jsonHook;
    const hooks = (obj.hooks ??= {});
    const sessionStart = Array.isArray(hooks.SessionStart) ? hooks.SessionStart : [];
    hooks.SessionStart = [
      ...sessionStart.filter(
        (entry) =>
          !Array.isArray(entry?.hooks) ||
          !entry.hooks.some((h) => typeof h?.command === "string" && h.command.includes(spec.filter)),
      ),
      { matcher: spec.matcher, hooks: [{ type: "command", command: spec.command }] },
    ];
    const indent = raw.match(/^[ \t]+(?=")/m)?.[0] ?? "  ";
    const text =
      JSON.stringify(obj, null, indent) + (raw === "" || raw.endsWith("\n") ? "\n" : "");
    mkdirSync(dirname(file), { recursive: true });
    if (text !== raw) writeAtomicSync(file, text);
    return { status: "written", file, hint: target.hint };
  }
  if (target.kind === "print") {
    return { status: "printed", text: target.snippet(projectDir), hint: target.hint };
  }
  throw new MementoError(`agent '${agent}' is not supported yet`, "UNKNOWN_AGENT");
}

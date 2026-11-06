// @leonard-memento/core — crash-safe file replacement.
//
// Plain writeFileSync truncates the target first: a process dying mid-write
// destroys the whole file (the user's AGENTS.md, settings.json, MEMORY.md).
// Writing a sibling temp file and renaming it over the target is atomic on
// the same volume — an interrupted run leaves either the old or the new
// content, never a truncated file.

import { renameSync, writeFileSync } from "node:fs";

/** Atomically replace `file` with `text` via a sibling temp file + rename. */
export function writeAtomicSync(file, text, { fs = { writeFileSync, renameSync } } = {}) {
  const tmp = `${file}.memento-tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

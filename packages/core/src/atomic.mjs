// @leonard-memento/core — crash-safe file replacement.
//
// Plain writeFileSync truncates the target first: a process dying mid-write
// destroys the whole file (the user's AGENTS.md, settings.json, MEMORY.md).
// Writing a sibling temp file and renaming it over the target is atomic on
// the same volume — an interrupted run leaves either the old or the new
// content, never a truncated file.
//
// Rename replaces the directory entry, so three details matter for files
// that users hand-manage: a symlinked target (dotfiles repos) must be
// followed to its real file or the link gets swapped for a plain copy; the
// existing mode (e.g. 0600) must be carried over or the new file comes
// back as umask-default; and a failed rename must not leave the temp file
// behind next to the target.

import { chmodSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";

const defaultFs = { chmodSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync };

/** Atomically replace `file` with `text` via a sibling temp file + rename. */
export function writeAtomicSync(file, text, { fs = defaultFs } = {}) {
  let target = file;
  let mode = null;
  try {
    target = fs.realpathSync?.(file) ?? file;
    mode = fs.statSync?.(target).mode ?? null;
  } catch {
    // Target does not exist yet: write it fresh at the given path.
  }
  const tmp = `${target}.memento-tmp`;
  fs.writeFileSync(tmp, text);
  try {
    if (mode !== null && fs.chmodSync) fs.chmodSync(tmp, mode & 0o7777);
    fs.renameSync(tmp, target);
  } catch (err) {
    try {
      fs.unlinkSync?.(tmp);
    } catch {
      // Best effort — the original error is the one worth reporting.
    }
    throw err;
  }
}

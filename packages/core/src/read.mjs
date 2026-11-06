// @leonard-memento/core — reading the project memory index for injection.
//
// The block format is FROZEN: byte-identical to opencode-memento v1.0.0
// (`src/index.ts` lines 70–91). Do not reformat.

import { readFile } from "node:fs/promises";

import { memoryIndexPath } from "./paths.mjs";

/**
 * Read the memory index to inject at compaction time.
 * Returns null when the project has no memory yet — silence is correct.
 * Any read/parse failure degrades to null: never crash the host.
 * (Exceptions that stay loud for the caller: '~'-relative or invalid
 * memory roots and non-plain indexFile names — see memoryIndexPath.
 * Adapters catch everything, so hosts stay safe either way.)
 */
export async function readProjectIndex(directory, { memoryRoot, indexFile } = {}) {
  const indexPath = memoryIndexPath(directory, { memoryRoot, indexFile });
  let index;
  try {
    index = await readFile(indexPath, "utf8");
  } catch {
    // This project has no memory yet — nothing to preserve.
    return null;
  }
  if (!index.trim()) return null;
  return [
    `# Project memory index (${indexPath})`,
    "",
    index.trimEnd(),
    "",
    "(Long-term memory: preserve these entries in the summary; individual fact files stay readable at their paths.)",
  ].join("\n");
}

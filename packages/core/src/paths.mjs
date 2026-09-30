// @leonard-memento/core — path canonicalization and project hashing.
//
// Ported verbatim from opencode-memento v1.0.0 (`src/index.ts` lines 37–50):
// the project hash must stay identical so existing memory trees keep resolving.

import { createHash } from "node:crypto";
import { realpathSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/** Resolve symlinks (like `pwd -P`) and drop trailing slashes (POSIX and Windows). */
export function canonicalDir(dir) {
  try {
    dir = realpathSync(dir);
  } catch {
    // Path doesn't exist (yet) — hash it as written.
  }
  return dir.replace(/[\\/]+$/, "") || "/";
}

/** First 16 hex chars of sha256 of the canonical project path. */
export function projectHash(dir) {
  if (typeof dir === "string" && dir.startsWith("~")) {
    // Nothing in the chain expands the homedir, so hashing the literal
    // would silently resolve the WRONG project. Fail loudly instead —
    // every adapter hook wraps reads in try/catch, so hosts stay safe.
    throw new Error(`memento: '~'-relative path is not supported, pass an absolute path: '${dir}'`);
  }
  return createHash("sha256").update(canonicalDir(dir)).digest("hex").slice(0, 16);
}

/**
 * Memory root resolution order (family spec §4):
 * explicit `MEMENTO_MEMORY_ROOT` env → neutral root if it exists →
 * legacy root if it exists → neutral root (created on demand later).
 * NEUTRAL: `<home>/.config/memento/projects`
 * LEGACY:  `<home>/.config/opencode/memento/projects` (opencode-memento v1.0.0)
 * Never throws: a missing HOME still yields a (relative) path string.
 */
export function resolveMemoryRoot({ env = process.env, home = homedir(), exists = existsSync } = {}) {
  if (env.MEMENTO_MEMORY_ROOT) return env.MEMENTO_MEMORY_ROOT;
  const neutral = join(home, ".config", "memento", "projects");
  const legacy = join(home, ".config", "opencode", "memento", "projects");
  return exists(neutral) ? neutral : exists(legacy) ? legacy : neutral;
}

/** Absolute path of the memory index for a project directory. */
export function memoryIndexPath(directory, { memoryRoot, indexFile } = {}) {
  const root = memoryRoot ?? process.env.MEMENTO_MEMORY_ROOT ?? resolveMemoryRoot();
  const file = indexFile ?? process.env.MEMENTO_INDEX_FILE ?? "MEMORY.md";
  return join(root, projectHash(directory), file);
}

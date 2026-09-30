// Public API types for @leonard-memento/core (hand-written; the package is
// plain ESM .mjs with JSDoc — this file is for TypeScript consumers).

/** Resolve symlinks (like `pwd -P`) and drop trailing slashes (POSIX and Windows). */
export function canonicalDir(dir: string): string;

/** First 16 hex chars of sha256 of the canonical project path. */
export function projectHash(dir: string): string;

export interface ResolveMemoryRootOverrides {
  /** Defaults to process.env. */
  env?: Record<string, string | undefined>;
  /** Defaults to os.homedir(). */
  home?: string;
  /** Defaults to fs.existsSync. */
  exists?: (path: string) => boolean;
}

/**
 * Effective memory root: MEMENTO_MEMORY_ROOT → existing neutral root →
 * existing legacy root → neutral default. Never throws.
 */
export function resolveMemoryRoot(overrides?: ResolveMemoryRootOverrides): string;

export interface MemoryOptions {
  memoryRoot?: string;
  indexFile?: string;
}

/** Absolute path of the memory index for a project directory. */
export function memoryIndexPath(directory: string, options?: MemoryOptions): string;

/**
 * The frozen injection block for a project, or null when the project has no
 * memory yet. Byte-identical to opencode-memento v1.0.0.
 */
export function readProjectIndex(directory: string, options?: MemoryOptions): Promise<string | null>;

export interface InitTarget {
  kind: "text" | "json" | "print";
  file?: (projectDir: string) => string;
  snippet?: (projectDir: string) => string;
  /** Present on `kind: "json"` targets: the hook entry merged into the JSON file. */
  jsonHook?: { matcher: string; command: string; filter: string };
  hint: string;
}

/** `memento init` targets, keyed by agent name. */
export const TARGETS: Record<string, InitTarget>;

export interface InitResult {
  status: "written" | "printed";
  file?: string;
  text?: string;
  hint: string;
}

export class MementoError extends Error {
  code: string;
}

/**
 * Idempotent setup of the memory-index integration for one agent.
 * Throws MementoError (code UNKNOWN_AGENT / NOT_WRITABLE / INVALID_JSON).
 */
export function initAgent(projectDir: string, agent: string): InitResult;

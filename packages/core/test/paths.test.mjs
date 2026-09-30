import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, symlinkSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { canonicalDir, projectHash, resolveMemoryRoot, memoryIndexPath } from "../src/paths.mjs";

test("canonicalDir drops trailing slashes", () => {
  assert.equal(canonicalDir("/a/b/"), "/a/b");
  assert.equal(canonicalDir("/a/b///"), "/a/b");
});

test("canonicalDir resolves symlinks", () => {
  const base = mkdtempSync(join(tmpdir(), "memento-paths-"));
  const real = join(base, "real");
  mkdirSync(real);
  const link = join(base, "link");
  symlinkSync(real, link);
  // realpathSync is the independent oracle (mkdtemp itself may live under a symlinked tmpdir).
  assert.equal(canonicalDir(link), realpathSync(real));
});

test("canonicalDir keeps non-existent path as written", () => {
  const missing = "/definitely/not/a/real/path-memento-test";
  assert.equal(canonicalDir(missing), missing);
});

test("projectHash is 16 lowercase hex chars", () => {
  assert.match(projectHash("/a/b"), /^[0-9a-f]{16}$/);
});

test("projectHash is stable", () => {
  assert.equal(projectHash("/a/b"), projectHash("/a/b"));
});

test("projectHash matches known sha256", () => {
  const expected = createHash("sha256").update("/a/b").digest("hex").slice(0, 16);
  assert.equal(projectHash("/a/b"), expected);
});

test("projectHash rejects '~'-relative paths instead of hashing the literal", () => {
  assert.throws(() => projectHash("~/repo"), /~/);
  assert.throws(() => projectHash("~user/repo"), /'/);
});

// --- Task 2: memory root fallback chain + memoryIndexPath ---

function fakeHome() {
  return mkdtempSync(join(tmpdir(), "memento-home-"));
}
function makeNeutral(home) {
  const p = join(home, ".config", "memento", "projects");
  mkdirSync(p, { recursive: true });
  return p;
}
function makeLegacy(home) {
  const p = join(home, ".config", "opencode", "memento", "projects");
  mkdirSync(p, { recursive: true });
  return p;
}

test("resolveMemoryRoot honors MEMENTO_MEMORY_ROOT override", () => {
  assert.equal(resolveMemoryRoot({ env: { MEMENTO_MEMORY_ROOT: "/x" } }), "/x");
});

test("resolveMemoryRoot prefers neutral when both roots exist", () => {
  const home = fakeHome();
  const neutral = makeNeutral(home);
  makeLegacy(home);
  assert.equal(resolveMemoryRoot({ env: {}, home }), neutral);
});

test("resolveMemoryRoot falls back to legacy when only legacy exists", () => {
  const home = fakeHome();
  const legacy = makeLegacy(home);
  assert.equal(resolveMemoryRoot({ env: {}, home }), legacy);
});

test("resolveMemoryRoot defaults to neutral when neither exists", () => {
  const home = fakeHome();
  assert.equal(resolveMemoryRoot({ env: {}, home }), join(home, ".config", "memento", "projects"));
});

test("resolveMemoryRoot survives missing HOME", () => {
  assert.equal(typeof resolveMemoryRoot({ env: {}, home: "/nonexistent-should-not-matter" }), "string");
  assert.equal(typeof resolveMemoryRoot({ env: {}, home: "" }), "string");
});

test("memoryIndexPath composes root/hash/index file", () => {
  assert.equal(
    memoryIndexPath("/a/b", { memoryRoot: "/root" }),
    join("/root", projectHash("/a/b"), "MEMORY.md"),
  );
});

test("memoryIndexPath honors explicit memoryRoot then env then fallback", () => {
  const saved = process.env.MEMENTO_MEMORY_ROOT;
  try {
    process.env.MEMENTO_MEMORY_ROOT = "/envroot";
    // explicit beats env
    assert.equal(memoryIndexPath("/a/b", { memoryRoot: "/explicit" }), join("/explicit", projectHash("/a/b"), "MEMORY.md"));
    // env beats fallback
    assert.equal(memoryIndexPath("/a/b"), join("/envroot", projectHash("/a/b"), "MEMORY.md"));
    delete process.env.MEMENTO_MEMORY_ROOT;
    // fallback: resolveMemoryRoot() for the real environment
    assert.equal(memoryIndexPath("/a/b"), join(resolveMemoryRoot(), projectHash("/a/b"), "MEMORY.md"));
  } finally {
    if (saved === undefined) delete process.env.MEMENTO_MEMORY_ROOT;
    else process.env.MEMENTO_MEMORY_ROOT = saved;
  }
});

test("MEMENTO_INDEX_FILE changes the file name only", () => {
  const saved = process.env.MEMENTO_INDEX_FILE;
  try {
    process.env.MEMENTO_INDEX_FILE = "INDEX.md";
    assert.equal(memoryIndexPath("/a/b", { memoryRoot: "/root" }), join("/root", projectHash("/a/b"), "INDEX.md"));
  } finally {
    if (saved === undefined) delete process.env.MEMENTO_INDEX_FILE;
    else process.env.MEMENTO_INDEX_FILE = saved;
  }
});

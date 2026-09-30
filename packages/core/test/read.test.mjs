import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { memoryIndexPath, projectHash } from "../src/paths.mjs";
import { readProjectIndex } from "../src/read.mjs";

function setup() {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-root-"));
  const dir = "/some/project";
  const memDir = join(memoryRoot, projectHash(dir));
  mkdirSync(memDir, { recursive: true });
  const indexPath = memoryIndexPath(dir, { memoryRoot });
  return { memoryRoot, dir, memDir, indexPath };
}

test("readProjectIndex returns the wrapped block", async () => {
  const { memoryRoot, dir, memDir, indexPath } = setup();
  const contents = "- [[alpha]] — first fact\n- [[beta]] — second fact\n";
  writeFileSync(join(memDir, "MEMORY.md"), contents);
  const expected = [
    `# Project memory index (${indexPath})`,
    "",
    contents.trimEnd(),
    "",
    "(Long-term memory: preserve these entries in the summary; individual fact files stay readable at their paths.)",
  ].join("\n");
  assert.equal(await readProjectIndex(dir, { memoryRoot }), expected);
});

test("readProjectIndex returns null for missing file", async () => {
  const { memoryRoot } = setup();
  assert.equal(await readProjectIndex("/no/such/project", { memoryRoot }), null);
});

test("readProjectIndex rejects '~'-relative directories loudly", async () => {
  await assert.rejects(() => readProjectIndex("~/repo", { memoryRoot: "/root" }), /~/);
});

test("readProjectIndex returns null for whitespace-only file", async () => {
  const { memoryRoot, dir, memDir } = setup();
  writeFileSync(join(memDir, "MEMORY.md"), "  \n\n \n");
  assert.equal(await readProjectIndex(dir, { memoryRoot }), null);
});

test("read.mjs rejects unreadable index", async () => {
  const { memoryRoot, dir, memDir } = setup();
  const file = join(memDir, "MEMORY.md");
  writeFileSync(file, "- [[alpha]] — first fact\n");
  chmodSync(file, 0o000);
  try {
    assert.equal(await readProjectIndex(dir, { memoryRoot }), null);
  } finally {
    chmodSync(file, 0o644);
  }
});

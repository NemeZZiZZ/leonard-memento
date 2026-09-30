import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

import { memoryIndexPath, readProjectIndex } from "../src/index.mjs";

const BIN = fileURLToPath(new URL("../bin/memento.mjs", import.meta.url));

function run(args, { cwd, env } = {}) {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      { cwd, env: { ...process.env, ...env } },
      (error, stdout, stderr) => {
        resolveRun({ code: error ? error.code : 0, stdout, stderr });
      },
    );
  });
}

/** Temp memory root + temp project dir with an index file in place. */
function fixture() {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-cli-root-"));
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cli-proj-"));
  const indexPath = memoryIndexPath(projectDir, { memoryRoot });
  mkdirSync(dirname(indexPath), { recursive: true });
  writeFileSync(indexPath, "- [[alpha]] — first fact\n");
  return { memoryRoot, projectDir, indexPath };
}

test("path prints the index path", async () => {
  const { memoryRoot, projectDir, indexPath } = fixture();
  const r = await run(["path", "--project", projectDir], { env: { MEMENTO_MEMORY_ROOT: memoryRoot } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, indexPath + "\n");
});

test("path exits 1 when index missing", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-cli-root-"));
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cli-proj-"));
  const r = await run(["path", "--project", projectDir], { env: { MEMENTO_MEMORY_ROOT: memoryRoot } });
  assert.equal(r.code, 1);
  // A missing index is an expected condition, not a crash.
  assert.ok(!/Cannot find module|MODULE_NOT_FOUND/.test(r.stderr), `stderr looks like a crash: ${r.stderr}`);
});

test("inject prints the block", async () => {
  const { memoryRoot, projectDir } = fixture();
  const expected = await readProjectIndex(projectDir, { memoryRoot });
  const r = await run(["inject", "--project", projectDir], { env: { MEMENTO_MEMORY_ROOT: memoryRoot } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, expected + "\n");
});

test("inject is silent and exits 0 when index absent", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-cli-root-"));
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cli-proj-"));
  const r = await run(["inject", "--project", projectDir], { env: { MEMENTO_MEMORY_ROOT: memoryRoot } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("relative --project equals absolute", async () => {
  const { memoryRoot, projectDir } = fixture();
  const abs = await run(["path", "--project", projectDir], { env: { MEMENTO_MEMORY_ROOT: memoryRoot } });
  const rel = await run(["path", "--project", basename(projectDir)], {
    cwd: dirname(projectDir),
    env: { MEMENTO_MEMORY_ROOT: memoryRoot },
  });
  assert.equal(rel.code, 0);
  assert.equal(rel.stdout, abs.stdout);
});

test("unknown subcommand exits 2", async () => {
  const r = await run(["bogus"]);
  assert.equal(r.code, 2);
});

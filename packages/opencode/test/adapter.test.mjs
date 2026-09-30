import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { projectHash, readProjectIndex } from "@leonard-memento/core";
import plugin from "../src/index.mjs";
import * as adapter from "../src/index.mjs";

function rootWithIndex(dir, { indexFile = "MEMORY.md", body = "- [[alpha]] — first fact\n" } = {}) {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-opc-root-"));
  const projectMemory = join(memoryRoot, projectHash(dir));
  mkdirSync(projectMemory, { recursive: true });
  writeFileSync(join(projectMemory, indexFile), body);
  return memoryRoot;
}

function fakeV2Context({ directory = "/fake", canonical = "/real", options } = {}) {
  const captured = {};
  const hooks = [];
  const location = { directory };
  if (canonical != null) location.project = { canonical };
  const ctx = {
    location,
    options,
    session: {
      hook: async (name, cb) => {
        captured.name = name;
        captured.cb = cb;
        hooks.push({ name, cb });
      },
    },
  };
  return { captured, ctx, hooks };
}

test("registers compaction hook", async () => {
  const { ctx, hooks } = fakeV2Context({ options: {} });
  await plugin.setup(ctx);
  assert.equal(hooks.length, 2);
  assert.deepEqual(hooks.map((h) => h.name).sort(), ["compaction", "context"]);
  for (const h of hooks) assert.equal(typeof h.cb, "function");
});

test("prefers project.canonical over directory", async () => {
  const memoryRoot = rootWithIndex("/real");
  const { captured, ctx } = fakeV2Context({ options: { memoryRoot } });
  await plugin.setup(ctx);
  const event = { system: [] };
  await captured.cb(event);
  assert.equal(event.system.length, 1);
});

test("hook pushes text payload", async () => {
  const memoryRoot = rootWithIndex("/real");
  const { captured, ctx } = fakeV2Context({ options: { memoryRoot } });
  await plugin.setup(ctx);
  const event = { system: [] };
  await captured.cb(event);
  const expected = await readProjectIndex("/real", { memoryRoot });
  assert.deepEqual(event.system[0], { type: "text", text: expected });
});

test("hook is silent without index", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-opc-empty-"));
  const { captured, ctx } = fakeV2Context({ options: { memoryRoot } });
  await plugin.setup(ctx);
  const event = { system: [] };
  await captured.cb(event);
  assert.deepEqual(event.system, []);
});

test("hook never throws on read failure", async () => {
  const notADir = join(mkdtempSync(join(tmpdir(), "memento-opc-file-")), "a-file");
  writeFileSync(notADir, "x");
  const { captured, ctx } = fakeV2Context({ options: { memoryRoot: notADir } });
  await plugin.setup(ctx);
  const event = { system: [] };
  await captured.cb(event);
  assert.deepEqual(event.system, []);
});

test("falls back to directory when project.canonical is missing", async () => {
  const memoryRoot = rootWithIndex("/fake");
  const { captured, ctx } = fakeV2Context({ canonical: null, options: { memoryRoot } });
  await plugin.setup(ctx);
  const event = { system: [] };
  await captured.cb(event);
  assert.equal(event.system.length, 1);
});

test("plugin options object passes memoryRoot/indexFile through", async () => {
  const memoryRoot = rootWithIndex("/real", { indexFile: "INDEX.md" });
  const { captured, ctx } = fakeV2Context({ options: { memoryRoot, indexFile: "INDEX.md" } });
  await plugin.setup(ctx);
  const event = { system: [] };
  await captured.cb(event);
  assert.equal(event.system.length, 1);
});

test("v1 server pushes the index into output.context", async () => {
  const memoryRoot = rootWithIndex("/v1proj");
  process.env.MEMENTO_MEMORY_ROOT = memoryRoot;
  try {
    const hooks = await plugin.server({ directory: "/v1proj" });
    const output = { context: [] };
    await hooks["experimental.session.compacting"](null, output);
    const expected = await readProjectIndex("/v1proj", { memoryRoot });
    assert.deepEqual(output.context, [expected]);
  } finally {
    delete process.env.MEMENTO_MEMORY_ROOT;
  }
});

test("v1 server is silent without index", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-opc-v1empty-"));
  process.env.MEMENTO_MEMORY_ROOT = memoryRoot;
  try {
    const hooks = await plugin.server({ directory: "/v1proj" });
    const output = { context: [] };
    await hooks["experimental.session.compacting"](null, output);
    assert.deepEqual(output.context, []);
  } finally {
    delete process.env.MEMENTO_MEMORY_ROOT;
  }
});

// V1 1.18.33 registers only FUNCTION exports of shape
// `(input, options?) => Promise<Hooks>` — plain object exports are silently
// ignored (verified against the binary and live sessions). MementoPlugin is
// that function entrypoint; the default export object serves OpenCode 2.x.

test("v1 named export is a function returning compaction hooks", async () => {
  assert.equal(typeof adapter.MementoPlugin, "function");
  const hooks = await adapter.MementoPlugin({ directory: "/v1proj" });
  assert.equal(typeof hooks["experimental.session.compacting"], "function");
});

test("v1 named export pushes the index into output.context", async () => {
  const memoryRoot = rootWithIndex("/v1proj");
  process.env.MEMENTO_MEMORY_ROOT = memoryRoot;
  try {
    const hooks = await adapter.MementoPlugin({ directory: "/v1proj" });
    const output = { context: [] };
    await hooks["experimental.session.compacting"](null, output);
    const expected = await readProjectIndex("/v1proj", { memoryRoot });
    assert.deepEqual(output.context, [expected]);
  } finally {
    delete process.env.MEMENTO_MEMORY_ROOT;
  }
});

test("v1 named export accepts tuple options as second argument", async () => {
  const memoryRoot = rootWithIndex("/v1proj");
  const hooks = await adapter.MementoPlugin({ directory: "/v1proj" }, { memoryRoot });
  const output = { context: [] };
  await hooks["experimental.session.compacting"](null, output);
  assert.equal(output.context.length, 1);
});

test("v1 named export is silent without index", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-opc-v1fn-empty-"));
  const hooks = await adapter.MementoPlugin({ directory: "/v1proj" }, { memoryRoot });
  const output = { context: [] };
  await hooks["experimental.session.compacting"](null, output);
  assert.deepEqual(output.context, []);
});

test("v1 named export never throws on read failure", async () => {
  const notADir = join(mkdtempSync(join(tmpdir(), "memento-opc-v1fn-file-")), "a-file");
  writeFileSync(notADir, "x");
  const hooks = await adapter.MementoPlugin({ directory: "/v1proj" }, { memoryRoot: notADir });
  const output = { context: [] };
  await hooks["experimental.session.compacting"](null, output);
  assert.deepEqual(output.context, []);
});

test("v1 named export tolerates a missing plugin input", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-opc-v1fn-noctx-"));
  const hooks = await adapter.MementoPlugin(undefined, { memoryRoot });
  const output = { context: [] };
  await hooks["experimental.session.compacting"](null, output);
  assert.deepEqual(output.context, []);
});

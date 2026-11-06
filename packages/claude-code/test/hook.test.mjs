import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { projectHash, readProjectIndex } from "@leonard-memento/core";
import { buildHookOutput, runHook } from "../src/hook.mjs";

const CLI = fileURLToPath(new URL("../bin/cli.mjs", import.meta.url));
const HOOKS_JSON = fileURLToPath(new URL("../hooks/hooks.json", import.meta.url));
const PLUGIN_JSON = fileURLToPath(new URL("../.claude-plugin/plugin.json", import.meta.url));
const MARKETPLACE_JSON = fileURLToPath(new URL("../../../.claude-plugin/marketplace.json", import.meta.url));

function rootWithIndex(dir, body = "- [[alpha]] — first fact\n") {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-cc-root-"));
  const projectMemory = join(memoryRoot, projectHash(dir));
  mkdirSync(projectMemory, { recursive: true });
  writeFileSync(join(projectMemory, "MEMORY.md"), body);
  return memoryRoot;
}

function withEnv(memoryRoot, fn) {
  process.env.MEMENTO_MEMORY_ROOT = memoryRoot;
  try {
    return fn();
  } finally {
    delete process.env.MEMENTO_MEMORY_ROOT;
  }
}

function runHookCli(input, { memoryRoot } = {}) {
  return new Promise((resolveRun) => {
    const env = { ...process.env };
    if (memoryRoot) env.MEMENTO_MEMORY_ROOT = memoryRoot;
    const child = execFile(
      process.execPath,
      [CLI, "hook"],
      { env },
      (error, stdout, stderr) => resolveRun({ code: error ? error.code : 0, stdout, stderr }),
    );
    if (input !== undefined) child.stdin.write(input);
    child.stdin.end();
  });
}

test("buildHookOutput returns additionalContext for compact source", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const memoryRoot = rootWithIndex(projectDir);
  await withEnv(memoryRoot, async () => {
    const out = await buildHookOutput({ source: "compact", cwd: projectDir });
    assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
    assert.equal(out.hookSpecificOutput.additionalContext, await readProjectIndex(projectDir, { memoryRoot }));
  });
});

test("buildHookOutput returns null for startup source", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const memoryRoot = rootWithIndex(projectDir);
  await withEnv(memoryRoot, async () => {
    assert.equal(await buildHookOutput({ source: "startup", cwd: projectDir }), null);
  });
});

test("buildHookOutput returns null when cwd is missing", async () => {
  assert.equal(await buildHookOutput({ source: "compact" }), null);
});

test("buildHookOutput returns null when index is absent", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-cc-empty-"));
  await withEnv(memoryRoot, async () => {
    assert.equal(await buildHookOutput({ source: "compact", cwd: projectDir }), null);
  });
});

test("compact payload emits JSON with additionalContext", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const memoryRoot = rootWithIndex(projectDir);
  const r = await runHookCli(JSON.stringify({ source: "compact", cwd: projectDir }), { memoryRoot });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(out.hookSpecificOutput.additionalContext, await readProjectIndex(projectDir, { memoryRoot }));
});

test("non-JSON stdin exits 0 silently", async () => {
  const r = await runHookCli("this is not json{");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("empty stdin exits 0 silently", async () => {
  const r = await runHookCli("");
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("startup payload prints nothing", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const memoryRoot = rootWithIndex(projectDir);
  const r = await runHookCli(JSON.stringify({ source: "startup", cwd: projectDir }), { memoryRoot });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, "");
});

test("hooks.json and plugin manifests parse as JSON", () => {
  for (const file of [HOOKS_JSON, PLUGIN_JSON, MARKETPLACE_JSON]) {
    JSON.parse(readFileSync(file, "utf8"));
  }
});

test("hooks.json registers SessionStart compact with the plugin hook command", () => {
  const hooks = JSON.parse(readFileSync(HOOKS_JSON, "utf8"));
  const entries = hooks.hooks.SessionStart;
  const entry = entries.find((e) => e.matcher === "compact");
  assert.ok(entry, "no compact SessionStart entry");
  const commands = entry.hooks.map((h) => h.command);
  assert.deepEqual(commands, ['node "${CLAUDE_PLUGIN_ROOT}/bin/cli.mjs" hook']);
});

// --- N3/N4: stdin decoding + silent degradation ---

const stdinOf = (raw) => (async function* () { yield Buffer.from(raw); })();

test("runHook decodes stdin as one buffer (multi-byte cwd split across chunks)", async () => {
  const base = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const projectDir = join(base, "projet-émé");
  mkdirSync(projectDir);
  const memoryRoot = rootWithIndex(projectDir);
  const raw = JSON.stringify({ source: "compact", cwd: projectDir });
  const buf = Buffer.from(raw);
  const cut = buf.indexOf(Buffer.from("é")) + 1; // split mid-codepoint
  const chunks = [buf.subarray(0, cut), buf.subarray(cut)];
  let out = "";
  const saved = process.env.MEMENTO_MEMORY_ROOT;
  process.env.MEMENTO_MEMORY_ROOT = memoryRoot;
  try {
    await runHook({
      input: (async function* () { for (const c of chunks) yield c; })(),
      output: { write: (s) => { out += s; } },
    });
  } finally {
    if (saved === undefined) delete process.env.MEMENTO_MEMORY_ROOT;
    else process.env.MEMENTO_MEMORY_ROOT = saved;
  }
  const parsed = JSON.parse(out);
  assert.equal(parsed.hookSpecificOutput.hookEventName, "SessionStart");
  assert.equal(parsed.hookSpecificOutput.additionalContext, await readProjectIndex(projectDir, { memoryRoot }));
});

test("runHook stays silent when the read path throws loudly (bad env root)", async () => {
  const projectDir = mkdtempSync(join(tmpdir(), "memento-cc-proj-"));
  const saved = process.env.MEMENTO_MEMORY_ROOT;
  let out = "";
  process.env.MEMENTO_MEMORY_ROOT = "~/bad-root";
  try {
    await runHook({
      input: stdinOf(JSON.stringify({ source: "compact", cwd: projectDir })),
      output: { write: (s) => { out += s; } },
    });
  } finally {
    if (saved === undefined) delete process.env.MEMENTO_MEMORY_ROOT;
    else process.env.MEMENTO_MEMORY_ROOT = saved;
  }
  assert.equal(out, "");
});

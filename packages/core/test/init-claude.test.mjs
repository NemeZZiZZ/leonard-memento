import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, mkdirSync, existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { memoryIndexPath } from "../src/index.mjs";
import { initAgent } from "../src/init/initAgent.mjs";

const BIN = fileURLToPath(new URL("../bin/memento.mjs", import.meta.url));

function run(args, { cwd, env } = {}) {
  return new Promise((resolveRun) => {
    execFile(
      process.execPath,
      [BIN, ...args],
      { cwd, env: { ...process.env, ...env } },
      (error, stdout, stderr) => resolveRun({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}

function tempProject() {
  return mkdtempSync(join(tmpdir(), "memento-init6-proj-"));
}

function readSettings(projectDir) {
  return JSON.parse(readFileSync(join(projectDir, ".claude", "settings.json"), "utf8"));
}

test("creates settings.json when absent", () => {
  const projectDir = tempProject();
  initAgent(projectDir, "claude-code");
  const settings = readSettings(projectDir);
  assert.equal(settings.hooks.SessionStart[0].matcher, "compact");
  const commands = settings.hooks.SessionStart.flatMap((e) => e.hooks.map((h) => h.command));
  assert.deepEqual(commands, ["claude-code-memento hook"]);
});

test("preserves foreign SessionStart hooks", () => {
  const projectDir = tempProject();
  initAgent(projectDir, "claude-code");
  // seed a foreign entry + foreign top-level key, then re-run
  const settings = readSettings(projectDir);
  settings.model = "opus";
  settings.hooks.SessionStart.unshift({ matcher: "startup", hooks: [{ type: "command", command: "echo hi" }] });
  const file = join(projectDir, ".claude", "settings.json");
  writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
  initAgent(projectDir, "claude-code");
  const after = readSettings(projectDir);
  assert.equal(after.model, "opus");
  const foreign = after.hooks.SessionStart.find((e) => e.hooks.some((h) => h.command === "echo hi"));
  assert.deepEqual(foreign, { matcher: "startup", hooks: [{ type: "command", command: "echo hi" }] });
});

test("replaces only memento entries on re-run", () => {
  const projectDir = tempProject();
  initAgent(projectDir, "claude-code");
  initAgent(projectDir, "claude-code");
  initAgent(projectDir, "claude-code");
  const settings = readSettings(projectDir);
  const mementoEntries = settings.hooks.SessionStart.filter((e) =>
    e.hooks.some((h) => typeof h.command === "string" && h.command.includes("memento")),
  );
  assert.equal(mementoEntries.length, 1);
});

test("keeps a foreign-formatted settings.json byte-identical when already set up", () => {
  const projectDir = tempProject();
  initAgent(projectDir, "claude-code");
  const file = join(projectDir, ".claude", "settings.json");
  // Reformat to 4-space — a foreign formatting choice init must not clobber.
  const reformatted = JSON.stringify(readSettings(projectDir), null, 4) + "\n";
  writeFileSync(file, reformatted);
  initAgent(projectDir, "claude-code");
  assert.equal(readFileSync(file, "utf8"), reformatted);
});

test("inserts our hook using the file's indentation", () => {
  const projectDir = tempProject();
  const dir = join(projectDir, ".claude");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "settings.json");
  writeFileSync(file, JSON.stringify({ model: "opus" }, null, 4) + "\n");
  initAgent(projectDir, "claude-code");
  const text = readFileSync(file, "utf8");
  assert.match(text, /\n {4}"hooks"/);
});

test("preserves foreign hooks that merely mention memento", () => {
  const projectDir = tempProject();
  const dir = join(projectDir, ".claude");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "settings.json");
  writeFileSync(
    file,
    JSON.stringify(
      { hooks: { SessionStart: [{ matcher: "startup", hooks: [{ type: "command", command: "echo memento is great" }] }] } },
      null,
      2,
    ) + "\n",
  );
  initAgent(projectDir, "claude-code");
  const after = readSettings(projectDir);
  const foreign = after.hooks.SessionStart.find((e) => e.hooks.some((h) => h.command === "echo memento is great"));
  assert.ok(foreign, "foreign hook mentioning 'memento' was deleted");
  const ours = after.hooks.SessionStart.filter((e) =>
    e.hooks.some((h) => typeof h.command === "string" && h.command.includes("claude-code-memento")),
  );
  assert.equal(ours.length, 1);
});

test("aborts on invalid JSON without writing", async () => {
  const projectDir = tempProject();
  const dir = join(projectDir, ".claude");
  const { mkdirSync } = await import("node:fs");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "settings.json");
  writeFileSync(file, "{");
  const before = readFileSync(file, "utf8");
  const r = await run(["init", "claude-code", "--project", projectDir]);
  assert.equal(r.code, 1);
  assert.equal(readFileSync(file, "utf8"), before);
});

test("print targets exit 0 and write nothing", async () => {
  for (const agent of ["opencode", "aider", "generic"]) {
    const projectDir = tempProject();
    const r = await run(["init", agent, "--project", projectDir]);
    assert.equal(r.code, 0, agent);
    assert.ok(r.stdout.length > 0, agent);
    assert.deepEqual(readdirSync(projectDir), [], `${agent} wrote files`);
  }
});

test("aider printout contains the abs index path", async () => {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-init6-root-"));
  const projectDir = tempProject();
  const r = await run(["init", "aider", "--project", projectDir], {
    env: { MEMENTO_MEMORY_ROOT: memoryRoot },
  });
  assert.equal(r.code, 0);
  assert.ok(r.stdout.includes(memoryIndexPath(projectDir, { memoryRoot })));
});

test("opencode printout uses valid plugin config forms", async () => {
  const projectDir = tempProject();
  const r = await run(["init", "opencode", "--project", projectDir]);
  assert.equal(r.code, 0);
  // V1 (1.18.x) validates `plugin` as an array. V2 (2.x) ignores
  // project-level plugin entries entirely — plugins install globally.
  assert.ok(r.stdout.includes('"plugin": ["npm:opencode-memento"]'), "V1 array form missing");
  assert.ok(r.stdout.includes("opencode plugin add opencode-memento"), "V2 global install command missing");
  assert.ok(!r.stdout.includes('"plugins"'), "V2 project-config form still printed");
  assert.ok(!r.stdout.includes('"plugin": {'), "obsolete named-map form still printed");
});

test("claude-code creates settings.json via CLI", async () => {
  const projectDir = tempProject();
  const r = await run(["init", "claude-code", "--project", projectDir]);
  assert.equal(r.code, 0);
  assert.ok(existsSync(join(projectDir, ".claude", "settings.json")));
});

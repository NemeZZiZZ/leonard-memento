import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { initAgent } from "../src/init/initAgent.mjs";

function tempProject() {
  return mkdtempSync(join(tmpdir(), "memento-init-codex-"));
}

function readHooks(projectDir) {
  return JSON.parse(readFileSync(join(projectDir, ".codex", "hooks.json"), "utf8"));
}

test("codex init creates .codex/hooks.json with compact SessionStart", () => {
  const projectDir = tempProject();
  initAgent(projectDir, "codex");
  const hooks = readHooks(projectDir);
  assert.equal(hooks.hooks.SessionStart[0].matcher, "^compact$");
  const commands = hooks.hooks.SessionStart.flatMap((e) => e.hooks.map((h) => h.command));
  assert.deepEqual(commands, ["codex-memento hook"]);
});

test("codex init is idempotent and preserves foreign entries", () => {
  const projectDir = tempProject();
  initAgent(projectDir, "codex");
  const hooks = readHooks(projectDir);
  hooks.hooks.SessionStart.unshift({ matcher: "^startup$", hooks: [{ type: "command", command: "echo hi" }] });
  writeFileSync(join(projectDir, ".codex", "hooks.json"), JSON.stringify(hooks, null, 2) + "\n");
  initAgent(projectDir, "codex");
  initAgent(projectDir, "codex");
  const after = readHooks(projectDir);
  const foreign = after.hooks.SessionStart.find((e) => e.hooks.some((h) => h.command === "echo hi"));
  assert.ok(foreign, "foreign hook lost");
  const ours = after.hooks.SessionStart.filter((e) =>
    e.hooks.some((h) => typeof h.command === "string" && h.command.includes("codex-memento")),
  );
  assert.equal(ours.length, 1);
});

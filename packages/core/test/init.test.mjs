import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { memoryIndexPath } from "../src/index.mjs";
import { TARGETS } from "../src/init/targets.mjs";
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
  return mkdtempSync(join(tmpdir(), "memento-init-proj-"));
}

/** Run fn with MEMENTO_MEMORY_ROOT pointed at a fresh temp root. */
function withTempRoot(fn) {
  const memoryRoot = mkdtempSync(join(tmpdir(), "memento-init-root-"));
  const saved = process.env.MEMENTO_MEMORY_ROOT;
  process.env.MEMENTO_MEMORY_ROOT = memoryRoot;
  try {
    return fn(memoryRoot);
  } finally {
    if (saved === undefined) delete process.env.MEMENTO_MEMORY_ROOT;
    else process.env.MEMENTO_MEMORY_ROOT = saved;
  }
}

test("init writes marker block into gemini GEMINI.md", () =>
  withTempRoot(() => {
    const projectDir = tempProject();
    initAgent(projectDir, "gemini");
    const file = join(projectDir, "GEMINI.md");
    assert.ok(existsSync(file));
    const content = readFileSync(file, "utf8");
    assert.ok(content.includes("<!-- memento:begin -->"));
    assert.ok(content.includes("<!-- memento:end -->"));
    assert.ok(content.includes(`@${memoryIndexPath(projectDir)}`));
  }));

test("init is idempotent", () =>
  withTempRoot(() => {
    const projectDir = tempProject();
    initAgent(projectDir, "gemini");
    const first = readFileSync(join(projectDir, "GEMINI.md"), "utf8");
    initAgent(projectDir, "gemini");
    const second = readFileSync(join(projectDir, "GEMINI.md"), "utf8");
    assert.equal(second, first);
    assert.equal(second.split("<!-- memento:begin -->").length - 1, 1);
  }));

test("init appends without touching foreign content", () =>
  withTempRoot(() => {
    const projectDir = tempProject();
    const file = join(projectDir, "GEMINI.md");
    writeFileSync(file, "# My project notes\n");
    initAgent(projectDir, "gemini");
    const content = readFileSync(file, "utf8");
    assert.ok(content.startsWith("# My project notes\n"));
    assert.ok(content.indexOf("# My project notes") < content.indexOf("<!-- memento:begin -->"));
  }));

test("init creates nested dirs", () =>
  withTempRoot(() => {
    const projectDir = tempProject();
    initAgent(projectDir, "cursor");
    const file = join(projectDir, ".cursor", "rules", "memento.mdc");
    assert.ok(existsSync(file));
    assert.ok(readFileSync(file, "utf8").includes("<!-- memento:begin -->"));
  }));

test("init covers every text target", () =>
  withTempRoot(() => {
    const files = {
      gemini: "GEMINI.md",
      cursor: join(".cursor", "rules", "memento.mdc"),
      cline: join(".clinerules", "memento.md"),
      zed: ".rules",
      windsurf: join(".windsurf", "rules", "memento.md"),
      copilot: join(".github", "copilot-instructions.md"),
      goose: "goosehints",
      droid: "AGENTS.md",
      antigravity: "AGENTS.md",
    };
    for (const [agent, rel] of Object.entries(files)) {
      const projectDir = tempProject();
      const result = initAgent(projectDir, agent);
      assert.equal(result.status, "written", agent);
      const file = join(projectDir, rel);
      assert.ok(existsSync(file), `${agent}: expected ${rel}`);
      assert.ok(readFileSync(file, "utf8").includes("<!-- memento:begin -->"), agent);
    }
    // crush resolves under HOME, not the project dir
    const home = mkdtempSync(join(tmpdir(), "memento-init-home-"));
    const savedHome = process.env.HOME;
    process.env.HOME = home;
    try {
      const projectDir = tempProject();
      initAgent(projectDir, "crush");
      const file = join(home, ".config", "crush", "CRUSH.md");
      assert.ok(existsSync(file), "crush: expected CRUSH.md under HOME");
      assert.ok(readFileSync(file, "utf8").includes("<!-- memento:begin -->"), "crush");
    } finally {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
    }
  }));

test("--list prints target names sorted", async () => {
  const r = await run(["init", "--list"]);
  assert.equal(r.code, 0);
  const names = r.stdout.trim().split("\n");
  assert.deepEqual(names, Object.keys(TARGETS).sort());
});

test("unknown agent exits 2", async () => {
  const r = await run(["init", "bogus"], { cwd: tempProject() });
  assert.equal(r.code, 2);
  assert.ok(r.stderr.length > 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
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
    // crush resolves under HOME, not the project dir. os.homedir() reads
    // HOME on POSIX but USERPROFILE on Windows — set both so the override
    // holds on every platform.
    const home = mkdtempSync(join(tmpdir(), "memento-init-home-"));
    const savedHome = process.env.HOME;
    const savedProfile = process.env.USERPROFILE;
    process.env.HOME = home;
    process.env.USERPROFILE = home;
    try {
      const projectDir = tempProject();
      initAgent(projectDir, "crush");
      const file = join(home, ".config", "crush", "CRUSH.md");
      assert.ok(existsSync(file), "crush: expected CRUSH.md under HOME");
      assert.ok(readFileSync(file, "utf8").includes("<!-- memento:begin -->"), "crush");
    } finally {
      if (savedHome === undefined) delete process.env.HOME;
      else process.env.HOME = savedHome;
      if (savedProfile === undefined) delete process.env.USERPROFILE;
      else process.env.USERPROFILE = savedProfile;
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

// --- N7/N9: atomic writes + unpaired markers + crush hint ---

import { readdirSync } from "node:fs";
import * as fsModule from "node:fs";
import { writeAtomicSync } from "../src/atomic.mjs";
import { MementoError } from "../src/init/initAgent.mjs";

test("writeAtomicSync writes content and leaves no temp files", () => {
  const dir = mkdtempSync(join(tmpdir(), "memento-atomic-"));
  const target = join(dir, "AGENTS.md");
  writeFileSync(target, "old\n");
  writeAtomicSync(target, "new\n");
  assert.equal(readFileSync(target, "utf8"), "new\n");
  assert.deepEqual(readdirSync(dir), ["AGENTS.md"]);
});

test("writeAtomicSync keeps the original when the write dies midway", () => {
  const dir = mkdtempSync(join(tmpdir(), "memento-atomic-"));
  const target = join(dir, "AGENTS.md");
  writeFileSync(target, "original\n");
  const brokenFs = {
    writeFileSync: () => {
      throw new Error("disk full");
    },
    renameSync: () => assert.fail("rename must not run after a failed write"),
  };
  assert.throws(() => writeAtomicSync(target, "new\n", { fs: brokenFs }), /disk full/);
  assert.equal(readFileSync(target, "utf8"), "original\n");
});

test("init run leaves no temp residue next to the target", () => {
  const proj = mkdtempSync(join(tmpdir(), "memento-init-residue-"));
  const result = initAgent(proj, "gemini");
  assert.equal(result.status, "written");
  const siblings = readdirSync(dirname(result.file));
  assert.ok(siblings.includes("GEMINI.md"), `GEMINI.md missing in ${siblings}`);
  assert.deepEqual(siblings.filter((f) => f.includes("memento-tmp")), []);
});

test("unpaired begin marker is a loud error, not an append", () => {
  const proj = mkdtempSync(join(tmpdir(), "memento-init-orphan-"));
  writeFileSync(join(proj, "GEMINI.md"), "prose\n<!-- memento:begin -->\nstray content\n");
  assert.throws(
    () => initAgent(proj, "gemini"),
    (err) => err instanceof MementoError && err.code === "UNPAIRED_MARKER",
  );
  // The stray file is untouched — no silent append happened.
  assert.equal(readFileSync(join(proj, "GEMINI.md"), "utf8"), "prose\n<!-- memento:begin -->\nstray content\n");
});

test("end-before-begin markers are also a loud error", () => {
  const proj = mkdtempSync(join(tmpdir(), "memento-init-orphan-"));
  writeFileSync(join(proj, "GEMINI.md"), "<!-- memento:end -->\n<!-- memento:begin -->\n");
  assert.throws(() => initAgent(proj, "gemini"), (err) => err.code === "UNPAIRED_MARKER");
});

test("crush hint warns that its config file is global", () => {
  assert.match(TARGETS.crush.hint, /global/);
});

// --- M3: atomic writes must follow symlinks, keep mode, clean up tmp ---

import { chmodSync, lstatSync, mkdirSync, readlinkSync, statSync, symlinkSync } from "node:fs";

test("writeAtomicSync writes through a symlinked target instead of replacing the link", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "memento-atomic-link-"));
  const real = join(dir, "dotfiles", "AGENTS.md");
  mkdirSync(dirname(real));
  writeFileSync(real, "old\n");
  const link = join(dir, "AGENTS.md");
  symlinkSync(real, link);
  writeAtomicSync(link, "new\n");
  assert.ok(lstatSync(link).isSymbolicLink(), "symlink must survive");
  assert.equal(readlinkSync(link), real);
  assert.equal(readFileSync(real, "utf8"), "new\n");
  assert.deepEqual(readdirSync(dir).sort(), ["AGENTS.md", "dotfiles"]);
});

test("writeAtomicSync preserves the existing file mode", { skip: process.platform === "win32" }, () => {
  const dir = mkdtempSync(join(tmpdir(), "memento-atomic-mode-"));
  const target = join(dir, "settings.json");
  writeFileSync(target, "{}\n");
  chmodSync(target, 0o600);
  writeAtomicSync(target, "{\"a\":1}\n");
  assert.equal(statSync(target).mode & 0o777, 0o600);
});

test("writeAtomicSync removes its temp file when the rename fails", () => {
  const dir = mkdtempSync(join(tmpdir(), "memento-atomic-rename-"));
  const target = join(dir, "AGENTS.md");
  writeFileSync(target, "original\n");
  const { writeFileSync: realWrite, unlinkSync } = fsModule;
  const fakeFs = {
    writeFileSync: realWrite,
    unlinkSync,
    renameSync: () => {
      throw new Error("EXDEV");
    },
  };
  assert.throws(() => writeAtomicSync(target, "new\n", { fs: fakeFs }), /EXDEV/);
  assert.equal(readFileSync(target, "utf8"), "original\n");
  assert.deepEqual(readdirSync(dir), ["AGENTS.md"]);
});

// --- M6/M7: end-only marker, malformed JSON shapes ---

test("end marker without begin is an unpaired-marker error, not an append", () => {
  const proj = mkdtempSync(join(tmpdir(), "memento-init-orphan-"));
  const before = "prose\n<!-- memento:end -->\n";
  writeFileSync(join(proj, "GEMINI.md"), before);
  assert.throws(() => initAgent(proj, "gemini"), (err) => err instanceof MementoError && err.code === "UNPAIRED_MARKER");
  assert.equal(readFileSync(join(proj, "GEMINI.md"), "utf8"), before);
});

test("json init refuses a non-object root instead of replacing it", () => {
  const proj = mkdtempSync(join(tmpdir(), "memento-init-json-"));
  mkdirSync(join(proj, ".claude"), { recursive: true });
  const before = '["not", "an", "object"]\n';
  writeFileSync(join(proj, ".claude", "settings.json"), before);
  assert.throws(() => initAgent(proj, "claude-code"), (err) => err instanceof MementoError && err.code === "INVALID_JSON_SHAPE");
  assert.equal(readFileSync(join(proj, ".claude", "settings.json"), "utf8"), before);
});

test("json init refuses a non-object hooks field with a MementoError", () => {
  const proj = mkdtempSync(join(tmpdir(), "memento-init-json-"));
  mkdirSync(join(proj, ".codex"), { recursive: true });
  const before = '{"hooks": "x"}\n';
  writeFileSync(join(proj, ".codex", "hooks.json"), before);
  assert.throws(() => initAgent(proj, "codex"), (err) => err instanceof MementoError && err.code === "INVALID_JSON_SHAPE");
  assert.equal(readFileSync(join(proj, ".codex", "hooks.json"), "utf8"), before);
});

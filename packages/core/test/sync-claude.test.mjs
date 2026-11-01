// sync-claude — bidirectional fact sync with Claude Code auto memory.

import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { realpathSync } from "node:fs";
import test from "node:test";

import { claudeMemoryDir, claudeProjectSlug, parseFactFile, syncClaude } from "../src/index.mjs";

let tmpRoot;
function freshDir(label) {
  const dir = mkdtempSync(join(tmpdir(), `memento-sync-${label}-`));
  mkdirSync(dir, { recursive: true });
  return dir;
}

const CLAUDE_FACT = [
  "---",
  "type: user",
  "modified: 2026-10-30T10:00:00.000Z",
  "---",
  "Prefers tabs over spaces.",
  "",
].join("\n");

const MEMENTO_FACT = [
  "---",
  "name: deploy-notes",
  "description: How to deploy the demo",
  "type: project",
  "created: 2026-10-01",
  "updated: 2026-10-31T12:00:00.000Z",
  "---",
  "",
  "Run `npm run deploy` from packages/core.",
  "",
].join("\n");

test.beforeEach(() => {
  tmpRoot = freshDir("root");
});
test.afterEach(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

test("claudeProjectSlug replaces separators with dashes on the canonical path", () => {
  const proj = join(tmpRoot, "Repository", "demo");
  mkdirSync(proj, { recursive: true });
  const slug = claudeProjectSlug(proj);
  const canonical = realpathSync(proj);
  assert.equal(slug, canonical.replace(/[\\/:]/g, "-"));
  assert.ok(!/[\\/:]/.test(slug));
});

test("claudeMemoryDir honors explicit config dir and CLAUDE_CONFIG_DIR", () => {
  const proj = join(tmpRoot, "demo");
  const explicit = claudeMemoryDir(proj, { claudeConfigDir: join(tmpRoot, "cfg") });
  assert.equal(explicit, join(tmpRoot, "cfg", "projects", claudeProjectSlug(proj), "memory"));
  const fromEnv = claudeMemoryDir(proj, { home: tmpRoot, env: { CLAUDE_CONFIG_DIR: join(tmpRoot, "cc") } });
  assert.equal(fromEnv, join(tmpRoot, "cc", "projects", claudeProjectSlug(proj), "memory"));
});

test("imports claude-only facts into a fresh memento tree with a seeded index", () => {
  const proj = mkdirSync(join(tmpRoot, "proj"), { recursive: true });
  const claudeDir = join(tmpRoot, "claude-memory");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "user_role.md"), CLAUDE_FACT);

  const report = syncClaude(proj, { claudeDir, memoryRoot: join(tmpRoot, "memento") });

  assert.equal(report.error, null);
  assert.deepEqual(report.actions.map((a) => [a.name, a.direction]), [["user_role", "imported"]]);
  // The fact file lands verbatim next to a fresh index.
  const projectDirOnDisk = readdirSync(join(tmpRoot, "memento"))[0];
  const imported = readFileSync(join(tmpRoot, "memento", projectDirOnDisk, "user_role.md"), "utf8");
  assert.equal(imported, CLAUDE_FACT);
  const index = readFileSync(join(tmpRoot, "memento", projectDirOnDisk, "MEMORY.md"), "utf8");
  assert.ok(index.startsWith("# Memory Index"));
  assert.ok(index.includes("- [[user_role]] — Prefers tabs over spaces."));
});

test("exports memento-only facts into claude memory and appends an index line", () => {
  const proj = mkdirSync(join(tmpRoot, "proj"), { recursive: true });
  const claudeDir = join(tmpRoot, "claude-memory");
  mkdirSync(claudeDir, { recursive: true });
  const memoryRoot = join(tmpRoot, "memento");

  // Seed memento tree by hand: resolve the hash via a first syncClaude report.
  const probe = syncClaude(proj, { claudeDir, memoryRoot });
  const mementoDir = probe.mementoDir;
  mkdirSync(mementoDir, { recursive: true });
  writeFileSync(join(mementoDir, "deploy-notes.md"), MEMENTO_FACT);
  writeFileSync(join(mementoDir, "MEMORY.md"), "# Memory Index\n\n- [[deploy-notes]] — How to deploy the demo\n");

  const report = syncClaude(proj, { claudeDir, memoryRoot });

  assert.deepEqual(report.actions.map((a) => [a.name, a.direction]), [["deploy-notes", "exported"]]);
  assert.equal(readFileSync(join(claudeDir, "deploy-notes.md"), "utf8"), MEMENTO_FACT);
  const claudeIndex = readFileSync(join(claudeDir, "MEMORY.md"), "utf8");
  assert.ok(claudeIndex.includes("- [[deploy-notes]] — How to deploy the demo"));
  assert.ok(!claudeIndex.startsWith("#")); // claude-side index gets no memento header
});

test("newer side overwrites the older copy in both directions", () => {
  const proj = mkdirSync(join(tmpRoot, "proj"), { recursive: true });
  const claudeDir = join(tmpRoot, "claude-memory");
  mkdirSync(claudeDir, { recursive: true });
  const memoryRoot = join(tmpRoot, "memento");
  const mementoDir = syncClaude(proj, { claudeDir, memoryRoot }).mementoDir;
  mkdirSync(mementoDir, { recursive: true });

  // Claude newer → memento overwritten.
  writeFileSync(join(claudeDir, "user_role.md"), CLAUDE_FACT);
  writeFileSync(
    join(mementoDir, "user_role.md"),
    CLAUDE_FACT.replace("modified: 2026-10-30", "modified: 2026-10-01").replace("tabs", "spaces"),
  );
  let report = syncClaude(proj, { claudeDir, memoryRoot });
  assert.deepEqual(report.actions.map((a) => a.direction), ["updated"]);
  assert.equal(report.actions[0].target, "memento");
  assert.equal(readFileSync(join(mementoDir, "user_role.md"), "utf8"), CLAUDE_FACT);

  // Memento newer → claude overwritten.
  writeFileSync(
    join(mementoDir, "user_role.md"),
    CLAUDE_FACT.replace("modified: 2026-10-30", "modified: 2026-11-01").replace("tabs", "whatever"),
  );
  report = syncClaude(proj, { claudeDir, memoryRoot });
  assert.equal(report.actions[0].direction, "updated");
  assert.equal(report.actions[0].target, "claude");
  assert.ok(readFileSync(join(claudeDir, "user_role.md"), "utf8").includes("whatever"));
});

test("identical facts are in-sync, conflicting same-timestamp facts are reported and left alone", () => {
  const proj = mkdirSync(join(tmpRoot, "proj"), { recursive: true });
  const claudeDir = join(tmpRoot, "claude-memory");
  mkdirSync(claudeDir, { recursive: true });
  const memoryRoot = join(tmpRoot, "memento");
  const mementoDir = syncClaude(proj, { claudeDir, memoryRoot }).mementoDir;
  mkdirSync(mementoDir, { recursive: true });

  writeFileSync(join(claudeDir, "same.md"), CLAUDE_FACT.replace("user_role", "same").replace("type: user", "type: project"));
  writeFileSync(join(mementoDir, "same.md"), CLAUDE_FACT.replace("user_role", "same").replace("type: user", "type: project"));
  writeFileSync(join(claudeDir, "clash.md"), CLAUDE_FACT.replace("user_role", "clash").replace("tabs", "tabs A"));
  writeFileSync(join(mementoDir, "clash.md"), CLAUDE_FACT.replace("user_role", "clash").replace("tabs", "spaces B"));

  const report = syncClaude(proj, { claudeDir, memoryRoot });

  const same = report.actions.find((a) => a.name === "same");
  assert.equal(same.direction, "in-sync");
  assert.ok(report.warnings.some((w) => w.includes("'clash'")));
  assert.ok(readFileSync(join(claudeDir, "clash.md"), "utf8").includes("tabs A"));
  assert.ok(readFileSync(join(mementoDir, "clash.md"), "utf8").includes("spaces B"));
});

test("dry-run plans without writing; manual index prose survives appends", () => {
  const proj = mkdirSync(join(tmpRoot, "proj"), { recursive: true });
  const claudeDir = join(tmpRoot, "claude-memory");
  mkdirSync(claudeDir, { recursive: true });
  writeFileSync(join(claudeDir, "user_role.md"), CLAUDE_FACT);
  writeFileSync(join(claudeDir, "MEMORY.md"), "# Claude notes\n\n- manual line kept\n");

  const memoryRoot = join(tmpRoot, "memento");
  const dry = syncClaude(proj, { claudeDir, memoryRoot, dryRun: true });
  assert.deepEqual(dry.actions.map((a) => a.direction), ["imported"]);
  assert.equal(existsSync(memoryRoot), false); // nothing written

  syncClaude(proj, { claudeDir, memoryRoot });
  const claudeIndex = readFileSync(join(claudeDir, "MEMORY.md"), "utf8");
  assert.ok(claudeIndex.includes("- manual line kept"));
  assert.ok(claudeIndex.includes("[[user_role]]"));
  assert.ok(claudeIndex.startsWith("# Claude notes"));
});

test("missing claude memory dir yields a helpful error, not a throw", () => {
  const proj = mkdirSync(join(tmpRoot, "proj"), { recursive: true });
  const report = syncClaude(proj, { claudeDir: join(tmpRoot, "nowhere"), memoryRoot: join(tmpRoot, "memento") });
  assert.ok(report.error.includes("no Claude Code memory"));
  assert.equal(report.error.includes("--claude-dir"), true);
});

test("parseFactFile handles front-matter, plain markdown and quoted values", () => {
  const { fm, body } = parseFactFile('---\ntype: "user"\nupdated: 2026-10-30T10:00:00.000Z\n---\nBody here\n');
  assert.equal(fm.type, "user");
  assert.equal(fm.updated, "2026-10-30T10:00:00.000Z");
  assert.equal(body, "Body here\n");
  const plain = parseFactFile("# just markdown\n");
  assert.deepEqual(plain.fm, {});
  assert.equal(plain.body, "# just markdown\n");
});

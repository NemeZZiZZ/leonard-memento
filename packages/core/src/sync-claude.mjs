// @leonard-memento/core — bidirectional sync with Claude Code auto memory.
//
// Claude Code maintains `~/.claude/projects/<project>/memory/` (MEMORY.md
// index + one Markdown topic file per fact) but loads it only at session
// start, so it is absent from context after compaction. `memento sync claude`
// shares facts between that tree and memento's tree, so both worlds see the
// same curated knowledge and memento's hooks keep re-injecting it.
//
// Merge policy (v1, no state files — idempotent by construction):
//   - facts are matched by name (front-matter `name`, else filename stem);
//   - never deletes anything on either side;
//   - a fact newer by timestamp (`updated`/`modified`, whichever is larger)
//     overwrites the older copy verbatim;
//   - identical content is skipped; same timestamp with different content is
//     reported as a conflict and left untouched;
//   - index files are only APPENDED to (missing `[[name]]` lines) — manual
//     ordering, sections and prose stay byte-for-byte.

import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { canonicalDir, projectHash, resolveMemoryRoot } from "./paths.mjs";
import { writeAtomicSync } from "./atomic.mjs";

/** Claude Code's project folder slug: absolute path with separators as dashes. */
export function claudeProjectSlug(projectDir) {
  return canonicalDir(projectDir).replace(/[\\/:]/g, "-");
}

/**
 * Claude Code auto-memory directory for a project.
 * Order: explicit dir → CLAUDE_CONFIG_DIR/projects/<slug>/memory → ~/.claude/projects/<slug>/memory.
 */
export function claudeMemoryDir(projectDir, { home = homedir(), env = process.env, claudeConfigDir } = {}) {
  const config = claudeConfigDir ?? env.CLAUDE_CONFIG_DIR ?? join(home, ".claude");
  return join(config, "projects", claudeProjectSlug(projectDir), "memory");
}

/** Split a fact file into front-matter fields and body. Tolerant by design. */
export function parseFactFile(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { fm: {}, body: raw };
  return { fm: parseFrontmatter(match[1]), body: match[2] };
}

/** Minimal `key: value` YAML subset — nested structures are ignored, not fatal. */
function parseFrontmatter(text) {
  const fm = {};
  for (const line of text.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (!kv) continue;
    let value = kv[2].trim();
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    fm[kv[1]] = value;
  }
  return fm;
}

/** Instant-aware string compare for ISO stamps; lexicographic fallback for junk. */
function tsCompare(a, b) {
  const pa = Date.parse(a);
  const pb = Date.parse(b);
  if (!Number.isNaN(pa) && !Number.isNaN(pb)) return pa < pb ? -1 : pa > pb ? 1 : 0;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Effective fact age: the newest of `updated` / `modified` (ISO string, "" when unknown). */
function factTimestamp(fm) {
  const stamps = [fm.updated, fm.modified].filter(Boolean).sort(tsCompare);
  return stamps[stamps.length - 1] ?? "";
}

/** Short human description for an index line: front-matter, else first body line. */
function descriptionOf(fact) {
  if (fact.fm.description) return fact.fm.description;
  const first = (fact.body ?? "").split(/\r?\n/).find((line) => line.trim());
  if (!first) return "";
  return first
    .replace(/^#+\s*/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/`/g, "")
    .trim()
    .slice(0, 100);
}

/**
 * Load every fact file from a memory tree (anything *.md except MEMORY.md).
 * Returns null when the directory does not exist, never throws.
 */
function loadFacts(dir, warnings = []) {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  const facts = new Map();
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md") || entry.name === "MEMORY.md") continue;
    let raw;
    try {
      raw = readFileSync(join(dir, entry.name), "utf8");
    } catch {
      continue;
    }
    const { fm, body } = parseFactFile(raw);
    const name = fm.name || entry.name.replace(/\.md$/, "");
    const prev = facts.get(name);
    if (prev) {
      warnings.push(
        `duplicate fact name '${name}' from files '${prev.file}' and '${entry.name}' — the later file wins and the other is never synced; rename one of them`,
      );
    }
    facts.set(name, { file: entry.name, raw, fm, body, ts: factTimestamp(fm) });
  }
  return facts;
}

function indexLine(name, fact) {
  const description = descriptionOf(fact);
  return description ? `- [[${name}]] — ${description}` : `- [[${name}]]`;
}

/** Append index lines for facts whose `[[name]]` is not referenced yet. Existing bytes are untouched. */
function appendMissingIndexLines(indexPath, facts, { header } = {}) {
  let content = "";
  try {
    content = readFileSync(indexPath, "utf8");
  } catch {
    // No index yet — a fresh one starts with the conventional header.
  }
  const existing = new Set();
  for (const line of content.split(/\r?\n/)) {
    const link = line.match(/\[\[([^\]]+)\]\]/);
    if (link) existing.add(link[1]);
  }
  const missing = [...facts.keys()].filter((name) => !existing.has(name)).sort();
  if (missing.length === 0) return { appended: [], lines: content.split(/\r?\n/).length };

  const freshLines = missing.map((name) => indexLine(name, facts.get(name))).join("\n") + "\n";
  const updated = content.trim()
    ? content.replace(/\r?\n?$/, "\n") + freshLines
    : (header ? header + "\n\n" : "") + freshLines;
  writeAtomicSync(indexPath, updated);
  return { appended: missing, lines: updated.split(/\r?\n/).length };
}

/**
 * Bidirectional fact sync between memento's project tree and Claude Code's
 * auto memory. Never throws: problems land in `report.warnings` /
 * `report.error`. `dryRun: true` computes the plan without writing anything.
 */
export function syncClaude(projectDir, {
  memoryRoot,
  env = process.env,
  home,
  claudeConfigDir,
  claudeDir,
  dryRun = false,
} = {}) {
  const claudeMemory = claudeDir ?? claudeMemoryDir(projectDir, { home, env, claudeConfigDir });
  const root = memoryRoot ?? resolveMemoryRoot({ env, home });
  const mementoDir = join(root, projectHash(projectDir));

  const report = { dryRun, claudeDir: claudeMemory, mementoDir, actions: [], warnings: [], error: null };

  const claudeFacts = loadFacts(claudeMemory, report.warnings);
  if (claudeFacts === null) {
    report.error =
      `no Claude Code memory at ${claudeMemory} — open Claude Code in this project once ` +
      `(so it creates auto memory), or pass --claude-dir`;
    return report;
  }
  const mementoFacts = loadFacts(mementoDir, report.warnings) ?? new Map();

  const write = (path, raw) => {
    if (dryRun) return true;
    try {
      writeAtomicSync(path, raw);
      return true;
    } catch (err) {
      report.warnings.push(`could not write ${path}: ${err.message}`);
      return false;
    }
  };
  const ensureDir = (dir) => {
    if (dryRun || existsSync(dir)) return true;
    try {
      mkdirSync(dir, { recursive: true });
      return true;
    } catch (err) {
      report.warnings.push(`could not create ${dir}: ${err.message}`);
      return false;
    }
  };

  for (const name of new Set([...claudeFacts.keys(), ...mementoFacts.keys()])) {
    const claudeFact = claudeFacts.get(name);
    const mementoFact = mementoFacts.get(name);

    if (claudeFact && !mementoFact) {
      if (ensureDir(mementoDir) && write(join(mementoDir, claudeFact.file), claudeFact.raw)) {
        mementoFacts.set(name, claudeFact);
        report.actions.push({ name, direction: "imported", target: "memento" });
      }
    } else if (mementoFact && !claudeFact) {
      if (write(join(claudeMemory, mementoFact.file), mementoFact.raw)) {
        claudeFacts.set(name, mementoFact);
        report.actions.push({ name, direction: "exported", target: "claude" });
      }
    } else if (claudeFact && mementoFact) {
      if (claudeFact.raw === mementoFact.raw) {
        report.actions.push({ name, direction: "in-sync" });
      } else if (claudeFact.ts === mementoFact.ts) {
        report.warnings.push(`conflict on '${name}': both sides changed (same timestamp) — edit one side and re-run`);
      } else {
        const newerIsClaude = tsCompare(claudeFact.ts, mementoFact.ts) > 0;
        const newer = newerIsClaude ? claudeFact : mementoFact;
        const olderPath = newerIsClaude ? join(mementoDir, mementoFact.file) : join(claudeMemory, claudeFact.file);
        if (write(olderPath, newer.raw)) {
          if (newerIsClaude) mementoFacts.set(name, claudeFact);
          else claudeFacts.set(name, mementoFact);
          report.actions.push({ name, direction: "updated", target: newerIsClaude ? "memento" : "claude" });
        }
      }
    }
  }

  const changed = report.actions.some((a) => a.direction !== "in-sync");
  if (changed && !dryRun) {
    appendMissingIndexLines(join(mementoDir, "MEMORY.md"), mementoFacts, { header: "# Memory Index" });
    const claudeResult = appendMissingIndexLines(join(claudeMemory, "MEMORY.md"), claudeFacts);
    if (claudeResult.lines > 200) {
      report.warnings.push(
        "Claude Code loads only the first 200 lines of MEMORY.md at session start — prune the Claude-side index",
      );
    }
  }

  return report;
}

#!/usr/bin/env node
// memento — cross-agent amnesia insurance.
// Prints/points at the curated project memory index. Zero dependencies.
// Expected failures (no index, unknown command) exit with a message,
// never a stack trace.

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { memoryIndexPath, readProjectIndex } from "../src/index.mjs";
import { TARGETS } from "../src/init/targets.mjs";
import { initAgent, MementoError } from "../src/init/initAgent.mjs";

const USAGE = `memento — cross-agent amnesia insurance (curated project memory index)

Usage:
  memento path [--project DIR]    Print the absolute memory index path (exit 1 if it does not exist)
  memento inject [--project DIR]  Print the injection block (silent, exit 0 when absent)
  memento init <agent> [--project DIR]  Write the agent's memory-index snippet (idempotent)
  memento init --list             List supported agents
  memento --help                  Show this help
  memento --version               Show the version
`;

function ownVersion() {
  const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  return pkg.version;
}

async function main(argv) {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        project: { type: "string" },
        list: { type: "boolean" },
        help: { type: "boolean", short: "h" },
        version: { type: "boolean", short: "v" },
      },
    });
  } catch (err) {
    console.error(`memento: ${err.message} — try 'memento --help'`);
    process.exit(2);
  }
  const { values, positionals } = parsed;
  if (values.version) {
    console.log(ownVersion());
    return;
  }
  const command = positionals[0];
  if (values.help || !command) {
    process.stdout.write(USAGE);
    return;
  }

  const projectDir = resolve(values.project ?? process.cwd());

  switch (command) {
    case "path": {
      const indexPath = memoryIndexPath(projectDir);
      if (!existsSync(indexPath)) {
        console.error(`no memory index at ${indexPath} — create it, one fact per line: '- [[name]] — description'`);
        process.exit(1);
      }
      console.log(indexPath);
      return;
    }
    case "inject": {
      const text = await readProjectIndex(projectDir);
      if (text) process.stdout.write(text + "\n");
      return;
    }
    case "init": {
      if (values.list) {
        for (const name of Object.keys(TARGETS).sort()) console.log(name);
        return;
      }
      const agent = positionals[1];
      if (!agent) {
        console.error("memento init: missing agent name — try 'memento init --list'");
        process.exit(2);
      }
      try {
        const result = initAgent(projectDir, agent);
        if (result.status === "written") console.log(`wrote ${result.file}`);
        if (result.status === "printed") process.stdout.write(result.text + "\n");
        console.log(result.hint);
      } catch (err) {
        if (err instanceof MementoError) {
          console.error(`memento: ${err.message}`);
          process.exit(err.code === "UNKNOWN_AGENT" ? 2 : 1);
        }
        throw err;
      }
      return;
    }
    default:
      console.error(`memento: unknown subcommand '${command}' — try 'memento --help'`);
      process.exit(2);
  }
}

main(process.argv.slice(2)).catch((err) => {
  console.error(`memento: ${err?.message ?? err}`);
  process.exit(1);
});

#!/usr/bin/env node
// codex-memento — SessionStart hook runner for Codex.
// The hook must never break a session: unexpected errors exit 0 silently.

import { runHook } from "../src/hook.mjs";

if (process.argv[2] === "hook") {
  try {
    await runHook();
  } catch {
    // Truly impossible to continue — still never break the session.
  }
  // Deliberately not process.exit(0): stdout pipe writes are asynchronous
  // on Windows and an immediate exit can drop the JSON reply. Nothing keeps
  // the loop alive once stdin reaches EOF, so the process still exits 0.
  process.exitCode = 0;
} else {
  console.error("usage: codex-memento hook   (runs the SessionStart hook on stdin)");
  process.exitCode = 2;
}

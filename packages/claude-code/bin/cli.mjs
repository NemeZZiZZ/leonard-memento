#!/usr/bin/env node
// claude-code-memento — SessionStart hook runner for Claude Code.
// The hook must never break a session: unexpected errors exit 0 silently.

import { runHook } from "../src/hook.mjs";

if (process.argv[2] === "hook") {
  try {
    await runHook();
  } catch {
    // Truly impossible to continue — still never break the session.
  }
  process.exit(0);
}

console.error("usage: claude-code-memento hook   (runs the SessionStart hook on stdin)");
process.exit(2);

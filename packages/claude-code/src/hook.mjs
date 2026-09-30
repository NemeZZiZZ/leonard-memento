// claude-code-memento hook — SessionStart (matcher: compact) handler.
//
// Claude Code runs this after manual /compact and auto-compact: the curated
// project memory index goes back into context as additionalContext.
// Failure policy: never write anything but the JSON reply, never exit
// non-zero — a hook must not break the session it runs in.

import { readProjectIndex } from "@leonard-memento/core";

/**
 * Pure decision: SessionStart payload in, hook output (or null) out.
 * @param {{ source?: string, cwd?: string }} payload
 */
export async function buildHookOutput(payload) {
  if (!payload || payload.source !== "compact" || !payload.cwd) return null;
  const text = await readProjectIndex(payload.cwd);
  if (!text) return null;
  return {
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: text,
    },
  };
}

/** stdin → buildHookOutput → stdout. Every path exits silently on junk input. */
export async function runHook({ input = process.stdin, output = process.stdout } = {}) {
  let raw = "";
  for await (const chunk of input) raw += chunk;
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return;
  }
  const result = await buildHookOutput(payload);
  if (result) output.write(JSON.stringify(result) + "\n");
}

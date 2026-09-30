// opencode-memento — amnesia insurance for OpenCode.
//
// When a session is auto-compacted, the summarizer only sees what it is
// given. This plugin hands it your project's Markdown memory index, so
// long-term memory survives the summary instead of evaporating with the
// transcript.
//
// Zero dependencies by design. One file serves both plugin APIs:
//   - OpenCode 2.x: the default export, a plain { id, setup } object
//     (no Plugin.define import needed);
//   - OpenCode 1.18.x: the named MementoPlugin function export — verified
//     against 1.18.33, whose loader registers only function exports of
//     shape `(input, options?) => Promise<Hooks>` and silently ignores
//     plain object exports; local auto-discovery matches only
//     `.opencode/plugin(s)/*.ts|*.js` (no .mjs).
//
// Every hook body is wrapped in try/catch: a failing memory lookup must
// never break a compaction or a session.

import { readProjectIndex } from "@leonard-memento/core";

/**
 * @typedef {Object} MementoOptions
 * @property {string} [memoryRoot] - Directory holding one subdirectory per
 *   project, addressed by hash. Falls back to `MEMENTO_MEMORY_ROOT`, then
 *   the root chain: ~/.config/memento/projects → the legacy
 *   ~/.config/opencode/memento/projects (still honored).
 * @property {string} [indexFile] - Index file name inside a project's
 *   memory directory. Default: MEMORY.md (env fallback: MEMENTO_INDEX_FILE).
 */

/**
 * @param {unknown} value - raw ctx.options from the host
 * @returns {MementoOptions}
 */
function optionsFrom(value) {
  return value && typeof value === "object" ? value : {};
}

/**
 * Legacy V1 entrypoint, kept for older 1.x loaders said to call server()
 * directly. This path has no options argument, so MEMENTO_* env vars are
 * the configuration channel.
 */
async function server({ directory }) {
  return {
    "experimental.session.compacting": async (_input, output) => {
      try {
        const text = await readProjectIndex(directory);
        if (text) output.context.push(text);
      } catch {
        // A failing hook must never break a session.
      }
    },
  };
}

/**
 * V1 plugin entrypoint (verified live against OpenCode 1.18.33): a named
 * function export of shape `(input, options?) => Promise<Hooks>`. `input`
 * is V1's PluginInput `{ client, project, directory, $ }`; `options`
 * arrives from the tuple config form `["npm:opencode-memento", { ... }]`
 * and falls back to the MEMENTO_* env vars when absent.
 *
 * @param {{ directory?: string } | undefined} input - V1 PluginInput
 * @param {MementoOptions} [options] - tuple-form options from the config
 */
export const MementoPlugin = async (input, options) => {
  const resolved = optionsFrom(options);
  return {
    "experimental.session.compacting": async (_input, output) => {
      try {
        const text = await readProjectIndex(input?.directory, resolved);
        if (text) output.context.push(text);
      } catch {
        // A failing hook must never break a session.
      }
    },
  };
};

/** Dual OpenCode V1/V2 plugin definition. */
export default {
  id: "memento",
  async setup(ctx) {
    const options = optionsFrom(ctx.options);
    const projectDir = ctx.location.project?.canonical ?? ctx.location.directory;
    // V2 idiom (verified live on OpenChamber 2.0.20 against working plugins):
    // register the SAME callback for "context" and "compaction", pushing
    // into event.system. The "context" hook fires on every provider request,
    // so the index is re-injected after each compaction by construction.
    const hook = async (event) => {
      try {
        const text = await readProjectIndex(projectDir, options);
        if (text) event.system.push({ type: "text", text });
      } catch {
        // A failing hook must never break a session.
      }
    };
    await ctx.session.hook("context", hook);
    await ctx.session.hook("compaction", hook);
  },
  server,
};

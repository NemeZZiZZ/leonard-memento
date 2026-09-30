// Root-level plugin entrypoint.
//
// OpenCode V2 (verified on OpenChamber 2.0.20) resolves LOCAL directory
// plugin entries only when package.json "exports" points at a root-level
// .js file — nested/non-.js entrypoints are dropped before the loader
// even logs an attempt. The npm channel accepts any entry (v1.0.0 shipped
// src/index.ts), so this wrapper only broadens compatibility.
export { default, MementoPlugin } from "./src/index.mjs";

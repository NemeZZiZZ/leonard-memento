# AGENTS.md — leonard-memento repo conventions

- Plain ESM JavaScript (`.mjs`) + JSDoc types. No build step, no TypeScript. Zero runtime dependencies in every package (no devDependencies either — tests run on stock Node).
- Node.js ≥ 20. Tests: `npm test` → `node --test` (node:test, `*.test.mjs` files under `packages/*/test/`).
- Public docs in English.
- Commit message prefixes: `feat:` / `fix:` / `test:` / `docs:` / `chore:`.
- The injected index block format is frozen — byte-identical to opencode-memento v1.0.0 (`readProjectIndex`). Do not reformat it.
- A failing memory lookup must never crash the host agent or CLI consumer: every read path degrades to null / empty output / exit 0.

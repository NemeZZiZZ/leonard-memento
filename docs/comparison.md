# Agent memory, compared: where leonard-memento fits

The agent-memory market loudly rewards auto-magic: [claude-mem](https://github.com/thedotmack/claude-mem) sits at 109,043 GitHub stars with [78,676 npm downloads a month](https://api.npmjs.org/downloads/point/last-month/claude-mem), and [mem0](https://github.com/mem0ai/mem0) at 68,236 (counts verified 2026-11-01). The issue trackers of those same projects quietly document what automatic capture costs: contradictory facts that accumulate by design, memories that vanish with a warning instead of an error, deleted memories that come back. `leonard-memento` is deterministic insurance beside those tools, not a replacement for them: a hand-curated Markdown index injected into context at session start and again at the compaction boundary — no capture, no retrieval, no LLM calls, zero dependencies. This page compares the approaches honestly: what ~30 facts cost each one, which failure modes are documented where, and where each tool plainly wins. Every criticism below is sourced to the tool's own issue tracker or documentation.

*Method note: token figures are estimates — characters ÷ 4, the usual back-of-envelope for English text under BPE tokenizers; real counts vary by tokenizer. The memento figure is exact arithmetic on the sample index below, using the same wrapper its injection code emits. All external facts were verified against primary sources on 2026-11-01; star counts and release activity move.*

## What 30 facts cost

memento's cost model is boring enough to compute exactly. A realistic 30-fact index in this repository's convention (`- [[name]] — short description`) looks like this:

```markdown
# Memory Index

- [[build-command]] — `npm run build` (no bundler, plain ESM)
- [[test-runner]] — node:test via `npm test`, no vitest/jest
- [[db-migrations]] — always via `scripts/migrate.sh`, never raw psql
- [[release-process]] — RELEASE.md checklist, tag then npm publish
- [[commit-style]] — conventional commits: feat/fix/test/docs/chore
- [[no-dates-in-code]] — dates belong in docs, not source headers
- [[error-handling]] — degrade to null, never crash the host agent
- [[index-format-frozen]] — injection block byte-identical to v1.0.0
- [[ci-matrix]] — node 20+22 on macOS, Linux, Windows
- [[windows-paths]] — node:path only, no /tmp literals
- [[port-3001]] — dev server fixed at 3001, 3000 is the other app
- [[env-file]] — .env.local, never commit it
- [[lint-config]] — no repo linter; match surrounding style
- [[docs-language]] — public docs in English only
- [[api-base-url]] — staging api.staging.example.com, no trailing slash
- [[auth-flow]] — magic link, no passwords in this codebase
- [[flaky-auth-test]] — auth.test.mjs occasionally needs a rerun
- [[coverage-target]] — statements 90%, enforced in CI
- [[issue-templates]] — .github/ISSUE_TEMPLATE, keep in sync
- [[deprecation-watch]] — node:test runner API changes per release
- [[temp-dir]] — pre-approved temp dir, never /tmp
- [[db-backup]] — nightly dump to s3://example-backups/db
- [[staging-deploy]] — never before 16:00 UTC
- [[secrets-location]] — 1Password vault "example", never in files
- [[user-name]] — user goes by NemeZZiZZ
- [[user-monitor]] — vertical FullHD 1080x1920, check portrait layouts
- [[user-language]] — chat in Russian, code and docs in English
- [[review-preference]] — small PRs, one concern each
- [[meeting-notes]] — docs/research/, dated filenames
- [[readme-tone]] — no emoji, no badges outside the top block
```

On disk that is 1,824 bytes: a header line, a blank line, and 30 fact lines averaging 60 characters (range 40–71) — a realistic mix of project mechanics (build, test, deploy, ports) and durable user preferences (language, review style, hardware). The injected block wraps the file in a header and a footer:

```markdown
# Project memory index (<absolute path>)

<contents of MEMORY.md>

(Long-term memory: preserve these entries in the summary; individual fact files stay readable at their paths.)
```

Header (85 chars) + index (1,823 chars after trimming the trailing newline) + footer (110 chars) + line breaks = 2,022 characters, ÷ 4 ≈ **505 tokens** — the entire cost of having all 30 facts in context, paid again at each compaction, with zero tool calls. A long session with three compactions pays it four times (start + 3): ≈ 2,020 tokens total for a memory that never leaves the room. The wrapper is emitted verbatim by [`readProjectIndex`](https://github.com/NemeZZiZZ/leonard-memento/blob/main/packages/core/src/read.mjs), so the arithmetic matches the code that ships.

The four tools below charge on different meters:

- **fixed per injection** — memento: one flat block, every session start, every compaction;
- **fixed per conversation** — Claude Code native: the first 200 lines / 25KB, loaded once at conversation start;
- **per query** — mem0: nothing until code searches, then `top_k` memories per call, every call;
- **per injection + per search** — claude-mem: a count-capped block at SessionStart plus MCP round-trips on demand.

| Tool | How 30 facts reach the model | The math (estimate) | Budget for ~30 facts |
|---|---|---|---|
| **leonard-memento** | whole index block injected at session start and again at each compaction | 2,022 chars ÷ 4, computed above from the exact injection format | ~505 tokens, fixed; no calls, no retrieval |
| [Claude Code native](https://code.claude.com/docs/en/memory) | "[The first 200 lines of MEMORY.md, or the first 25KB](https://code.claude.com/docs/en/memory)… are loaded at the start of every conversation" | same 30 lines = 1,807 chars, far under both caps, ÷ 4 | ~450 tokens at conversation start; a full 200-line / 25KB index would be ~3,000–6,400 tokens |
| [mem0](https://github.com/mem0ai/mem0) | nothing is injected; each `memory.search(query, top_k)` returns up to `top_k` memories, and [the application decides what enters the prompt](https://github.com/mem0ai/mem0/blob/main/README.md) | a stored memory is roughly one sentence (~80–120 chars ≈ 20–30 tokens, estimate); × `top_k`, × per query; capture adds [one LLM extraction call per `add`](https://github.com/mem0ai/mem0/blob/main/README.md) | ~0 until the first search, then unbounded: 30 facts need `top_k ≥ 30` in one query or several searches — every session |
| [claude-mem](https://github.com/thedotmack/claude-mem) | SessionStart injection of a [count-capped slice of observations](https://github.com/thedotmack/claude-mem/blob/main/README.md), plus MCP `search` / `timeline` / `get_observations` calls on demand | no token budget is documented; cost scales with the observation cap and the number of MCP searches; the [README claims ~10x savings](https://github.com/thedotmack/claude-mem/blob/main/README.md) for its 3-layer workflow | not fixed; and the default SessionStart injection [excludes other harnesses' observations](https://github.com/thedotmack/claude-mem/blob/main/README.md) — a gap for multi-agent directories |

The honest summary: retrieval-based systems can be cheaper per turn when you need 3 facts, and they scale to thousands of facts memento will never hold. The fixed cost buys the guarantee — every fact, present, at the moment the summarizer runs.

One more data point from the math: memento's 30-fact index (1,807 chars of facts) fits comfortably under Claude Code native's own 200-line / 25KB loading cap (~3,000–6,400 tokens at full cap, at this sample's 60 chars per line). The two converged on the same convention independently — the index format is not the differentiator; when it enters context is.

## Failure modes, sourced

Ground rules for this section: criticism is only admissible from each project's own tracker or docs, and cells marked "—" mean no documented case was found in the sources examined — not that none can ever exist. Where a failure is inherent to an architecture rather than a bug, the cell says so and links the architecture's own description.

| Failure mode | mem0 | claude-mem | Claude Code native auto memory | leonard-memento |
|---|---|---|---|---|
| **Memory pollution / stale contradictory facts** | Documented: ADD-only extraction accumulates "I work at A" alongside "I work at B" ([#4956](https://github.com/mem0ai/mem0/issues/4956)); 54-comment community "temporal hygiene" cron workaround for "memory pollution" ([#5352](https://github.com/mem0ai/mem0/issues/5352); related asks closed as *not planned*) | — | Auto-curated index; the [docs](https://code.claude.com/docs/en/memory) describe loading caps but no review or expiry step | Not structurally impossible — a human can let a line go stale. But nothing enters the index except an edit, and the entire state is 30 visible lines |
| **Silent memory loss** | Documented: partial batch-embedding failure drops facts with only a WARNING, no exception ([#5245](https://github.com/mem0ai/mem0/issues/5245), P1-high, accepted) | — | — | Structurally impossible per-fact: injection is one file read, byte-identical to `MEMORY.md`. A missing file is silent by design — whole-block absence you can check with `ls`, not one fact vanishing among thousands |
| **Deleted-memory resurrection** | Documented: `delete_all()` leaves session messages that are re-sent to the LLM and can resurrect deleted, e.g. sensitive, memories ([#7452](https://github.com/mem0ai/mem0/issues/7452)) | — | — | Structurally impossible: no deletion API, no generation step; the injection copies the file. Remove a line, it is gone everywhere |
| **Memory absent after compaction** | By architecture: nothing is auto-injected; facts arrive only when application code calls search — after compaction, only if your code searches again ([README](https://github.com/mem0ai/mem0/blob/main/README.md)) | Documented gap: the [hook list](https://github.com/thedotmack/claude-mem/blob/main/README.md) (SessionStart … SessionEnd) includes no compaction hook | Loaded "at the start of every conversation"; no re-injection at compaction is documented ([docs](https://code.claude.com/docs/en/memory)). Anthropic's API docs concede the stakes: "compaction… summarizes older conversation context… memory preserves the information that must survive summarization" ([memory tool docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool)) | That is the product: re-injection at the compaction boundary is the hook's only job |
| **Setup / runtime weight** | "[Mem0 requires an LLM to function](https://github.com/mem0ai/mem0/blob/main/README.md)" (default `gpt-5-mini`), plus embeddings; hybrid search needs spaCy | Node ≥ 20, Bun, uv/Python, Chroma, SQLite, and a resident worker; `npm install -g` "[installs the SDK/library only](https://github.com/thedotmack/claude-mem/blob/main/README.md)"; the installer pushes a browser sign-in and hosted trial | None — it ships with the tool (and that is its real advantage, below) | 0 npm deps; no server, port, DB, or LLM calls; ~150 LOC per adapter |
| **Vendor churn** | The local-first OpenMemory docs page [returns 404](https://docs.mem0.ai/openmemory) and the current [README](https://github.com/mem0ai/mem0/blob/main/README.md) no longer mentions it | — (pushed on the day of this analysis) | One vendor, one tool, one machine: auto memory is Claude-Code-only and [not shared across machines](https://code.claude.com/docs/en/memory) | The memory is plain Markdown outside the repo; if this project dies, the tree still opens in any editor and any agent snippet can point at it |

Evidence from the wider market, same rules:

- The OpenCode-native [@npv12/opencode-memory-md](https://github.com/npv12/opencode-memory-md) documents session-start injection only — the same compaction window — and pulls `@huggingface/transformers` + `vectra` (an ONNX embedding runtime with a model download) to search Markdown files ([npm metadata](https://www.npmjs.com/package/@npv12/opencode-memory-md)).
- Vendor churn, realized: [Zep](https://github.com/getzep/zep) deprecated its open-source Community Edition — "no longer supported", moved to `legacy/` ([announcement](https://blog.getzep.com/announcing-a-new-direction-for-zeps-open-source-strategy/)) — and [Letta](https://github.com/letta-ai/letta) (ex-MemGPT) pivoted from memory OS to a coding-agent harness, retiring the old API server to an archive branch ([letta-code](https://github.com/letta-ai/letta-code)). A Markdown tree has no pivot.
- Memory infrastructure is attack surface: [Graphiti](https://github.com/getzep/graphiti)'s reference MCP server ships with a warning that it has "no authentication, no authorization, and no prompt-injection protection" ([README](https://github.com/getzep/graphiti/blob/main/README.md)). A text file is not.

Honesty about the compaction row: two tools do touch that boundary. [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) checkpoints "before compaction" via Codex-specific Python hooks, and [Basic Memory](https://github.com/basicmachines-co/basic-memory) ships pre-compaction checkpoints in its Claude Code plugin ([READMEs](https://github.com/doobidoo/mcp-memory-service/blob/main/README.md)). Both are partial — one harness each — where memento makes the boundary its entire product across three first-class CLIs plus 12 snippet targets.

## Where each tool wins

If a tool does a job better than memento, this page loses credibility by hiding it.

- **[mem0](https://github.com/mem0ai/mem0)** — scale, benchmarks, product personalization: 68,236 stars, daily activity, Python/TS SDKs, self-hosted or managed, published benchmarks (LoCoMo 92.5, LongMemEval 94.4 — with the README's own caveat that scores reflect the managed platform). If you are building a product that personalizes for thousands of users, mem0 is infrastructure; memento does not try to be.
- **[claude-mem](https://github.com/thedotmack/claude-mem)** — automatic recall, breadth: captures tool-usage observations across lifecycle hooks, hybrid-searches them, runs in a dozen harnesses, with 109,043 stars and 78,676 monthly downloads of social proof. If "remember everything, I'll search later" is the requirement, it delivers.
- **[Claude Code native auto memory](https://code.claude.com/docs/en/memory)** — zero install: it ships with Claude Code, is on by default, and adopted the exact `MEMORY.md`-index-of-Markdown-facts convention. For one tool on one machine it may be all you need; the honest reasons to add memento on top are the compaction boundary and cross-agent portability, not the format.
- **[Basic Memory](https://github.com/basicmachines-co/basic-memory)** — structured knowledge plus its own pre-compaction checkpoints: Markdown entities/observations/relations (Obsidian-compatible) indexed by SQLite + FastEmbed, `bm_*` MCP tools, session-start briefings and pre-compaction checkpoints via its Claude Code plugin. The closest philosophical cousin — at the cost of a Python/uv + MCP stack and an optional $15/mo cloud.
- **[server-memory](https://github.com/modelcontextprotocol/servers/blob/main/src/memory/README.md) (MCP reference)** — the universal scratchpad: a JSONL knowledge graph any MCP client can use, no install beyond `npx`. Its README's example prompt has to script the model to say "Remembering…" — the purest illustration that tool-call memory depends on the model remembering to remember.
- **[mcp-memory-service](https://github.com/doobidoo/mcp-memory-service)** — a full local memory backend: SQLite + sqlite-vec with local ONNX embeddings ("memory never leaves your infrastructure"), hybrid search ranked by recency/frequency, its own benchmark page. What a determined solo maintainer can build — and a single-maintainer bus factor is the trade.
- **leonard-memento** — determinism, zero deps, the compaction boundary, cross-agent, auditability: a byte-identical injected block, 0 npm dependencies, re-injection at compaction on OpenCode, Claude Code, and Codex first-class (plus 12 snippet targets), one path-hash-keyed tree shared by every agent working in the directory, and a memory you audit with `grep` instead of a SQLite/Chroma pair behind a viewer.

### Hardening (v0.2.1)

Determinism is only worth something if the plumbing is safe, so v0.2.1 closed the gaps a second audit found: configuration is validated loudly (`~`-relative roots and non-basename `indexFile` values are rejected instead of silently pointing the injector at the wrong tree or an arbitrary file), every file memento writes goes through an atomic temp-file + rename (through symlinks, preserving mode), hook stdin is decoded once so non-ASCII project paths hash correctly, and `sync claude` compares timestamps as instants and warns on duplicate fact names. The injected block itself did not change — it is still byte-identical to opencode-memento v1.0.0.

## Positioning map (2026-11-01)

Ported from a competitive analysis verified 2026-11-01 against the GitHub API, the npm registry, and each project's README/docs; ★ = GitHub stars on that date — treat as a snapshot.

| Project | ★ | Capture | Storage | Retrieval | Enters context | Deps / runtime | Local/cloud | Agents |
|---|---|---|---|---|---|---|---|---|
| [mem0](https://github.com/mem0ai/mem0) | 68,236 | auto (LLM extraction, ADD-only) | vector DB + entities + SQLite | similarity (app calls search) | on retrieval | LLM + embeddings required; Python/TS | local, self-host, cloud | via SDK/skills; official OpenCode plugin |
| [claude-mem](https://github.com/thedotmack/claude-mem) | 109,043 | auto (hook observations → AI summaries) | SQLite+FTS5 + Chroma | progressive disclosure + 3-layer MCP search | SessionStart (no compact hook listed) | Node≥20 + Bun + uv/Python + worker daemon | local + cloud sync + hosted trial | Claude Code, OpenCode, Codex, Gemini, Copilot, +7 more |
| [Letta](https://github.com/letta-ai/letta-code) ([legacy](https://github.com/letta-ai/letta)) | 3,756 (25,316 legacy) | built into their agent | server-side agent state (cloud optional) | agent-managed memory blocks | while running their harness | npm harness (their runtime) | local server + Letta Cloud | Letta's own agent/SDK only |
| [Zep](https://github.com/getzep/zep) / [Graphiti](https://github.com/getzep/graphiti) | 4,984 / 32,413 | auto (episode ingestion) | temporal knowledge graph (Neo4j/FalkorDB/Neptune) | hybrid semantic+BM25+graph, temporal | on retrieval | graph DB + LLM + embedder; Python | Graphiti self-host; Zep cloud/BYOC; OSS CE deprecated | via SDK/MCP |
| [cognee](https://github.com/topoteretes/cognee) | 32,983 | auto + session distillation | graph + vectors (+Postgres mode, licensed in prod) | `recall()` routing graph/vector/code | plugin hooks / MCP / API | Python; optional LLM key (GLiNER local mode) | local-first + Cognee Cloud | Claude Code, Codex, OpenClaw, MCP clients |
| [server-memory](https://github.com/modelcontextprotocol/servers) (MCP) | (repo 91,735) | manual tool calls | JSONL knowledge graph | model-invoked `search_nodes` | only when model asks | Node 24 / npx | local | any MCP client |
| [mcp-memory-service](https://github.com/doobidoo/mcp-memory-service) | 2,059 | auto hooks + harvest | SQLite + sqlite-vec, ONNX embeddings | hybrid + ranked recency; consolidation | tool calls; Codex pre-compaction hooks | Python service (REST/MCP) | local + optional cloud sync | Claude Code/Desktop, OpenCode, Codex, frameworks |
| [@npv12/opencode-memory-md](https://github.com/npv12/opencode-memory-md) | 0 (upstream 15) | manual via tool | Markdown files + vectra vectors | always-inject 3 files; embeddings search for logs | session start only | transformers.js + ONNX model + vectra | local | OpenCode only |
| [Basic Memory](https://github.com/basicmachines-co/basic-memory) | 4,439 | manual + opt-in capture | Markdown + SQLite/FastEmbed | MCP `bm_*` tools; hybrid search | session briefings + pre-compaction checkpoints | Python/uv + MCP server | local-first + $15/mo cloud | Claude Code/Desktop, Codex, Cursor, VS Code, ChatGPT, Obsidian |
| [Claude Code native](https://code.claude.com/docs/en/memory) | n/a | auto (auto memory) + manual CLAUDE.md | `~/.claude/projects/<p>/memory/` `MEMORY.md` + topic files | first 200 lines/25KB always | session start | none (built in) | machine-local | Claude Code only |
| [Anthropic memory tool](https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool) | n/a | model writes `/memories` | your storage (client-side handler) | model tool calls ("view first" prompt) | on tool call | your app implements handler | yours | Claude API/apps |
| [AGENTS.md convention](https://agents.md/) | 60k+ repos | human-edited | Markdown in repo | always loaded | session start | none | in-repo | Codex, OpenCode, Cursor, Gemini, Zed, VS Code, Warp, ~20 tools |
| [leonard-memento](../README.md) | (new) | **curated by human** | flat Markdown outside repo | **always-injected block** | **session start + compaction boundary** | **0 deps, no runtime** | local | OpenCode, Claude Code, Codex + 12 snippet targets |

## Choose by the failure mode you cannot tolerate

- **The agent forgetting everything at compaction** → memento: the index is re-injected at the exact moment the summary is written.
- **Facts silently disappearing, or deleted facts resurrecting** → one file read cannot do either; there is no pipeline and no deletion API.
- **Contradictions accumulating** → nothing enters a curated index without a human edit; staleness is possible, but it is visible in 30 lines, not hidden in a vector store.
- **Runtimes, daemons, ports, accounts, or vendor pivots** → zero dependencies and plain files outside the repo; the tree survives the tool.
- **Manual curation itself** → claude-mem or Claude Code's native auto memory is the honest answer; memento will never capture anything for you.
- **Product-scale personalization** → mem0. **A structured, queryable knowledge base** → Basic Memory.

memento sits beside these tools rather than replacing them. It captures nothing and retrieves nothing; it guarantees that the ~30 lines you curate are present when the summarizer runs — in whichever of the 15 agents you use. Because it is one file read at two moments and nothing else, it does not conflict with a memory system running alongside it: the auto-magic tool can handle recall breadth, memento holds the floor. Insurance, not a memory system.

```
npm i -g @leonard-memento/core
memento init <agent>
```

The full agent list, the memory convention, and migration notes are in the [README](../README.md).

Leonard's tattoos worked because they were deterministic. So is this.

---

*Caveats: this page is a snapshot written 2026-11-01; star counts, downloads, and issue statuses move. Issue links point at each project's own tracker — where a bug is fixed after this date, the link will say so. Token figures are chars ÷ 4 estimates as stated above; the memento figure is exact arithmetic on the sample index and the frozen injection format, but your tokenizer will differ. Corrections welcome via the [issue tracker](https://github.com/NemeZZiZZ/leonard-memento/issues).*

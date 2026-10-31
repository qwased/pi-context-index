# pi-context-index

An LLM-free compaction and history reader for [Pi](https://github.com/badlogic/pi-mono). It replaces a compacted transcript with a **continuation capsule** built from saved source excerpts, and keeps the complete session readable through one tool called `context_index`.

> **Status: pre-alpha workspace.** The 0.1.0 design and implementation plan are frozen, but the runtime pipeline is not implemented yet. This package is not published and not installable. `index.ts` is intentionally inert until P0 lands.

## What 0.1.0 will do

- **One compaction path.** Manual `/compact`, threshold compaction and overflow recovery all return a deterministic capsule. If the capsule cannot be built or the operation is cancelled, the extension returns `cancel:true`; it never falls back to a model-written summary.
- **A continuation capsule, not a summary.** It quotes user instructions, recent assistant work and recorded tool results, with exact field/range addresses and explicit omission markers. Live-tail messages are not duplicated.
- **One always-on tool.** `context_index` has three actions: `list`, `search` and `read`. It works before and after compaction.
- **Native identity.** References use Pi's saved entry IDs (`e:<entryId>`), not a plugin-side numbering scheme. Order is presentation; identity survives compaction and display changes.
- **Bounded reads.** `list`/`search` return at most 4,000 chars, a normal `read` 12,000, `full:true` 48,000, and one agent run may re-inject 48,000 chars across at most 8 calls. A normal partial result is not an error; it carries the next range or cursor.
- **No model calls, embeddings or external retrieval.** Compression, indexing, ranking, search and reads are local and deterministic. The agent's normal answers still use the model the user selected.
- **No sidecar database.** Pi's session records are the source of truth; the in-process index is rebuilt from them.

The authoritative scope is [docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md](docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md). Execution order is [docs/plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md](docs/plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md).

## What the capsule looks like

Synthetic example from the design (§4.1); IDs, counts and text are illustrative:

```text
[Context index v1 | snapshot=7d24b89a6e31]
Saved messages: 470; effective: 467; live: 30; quoted: 12; index-only: 425.
First saved: e:10ac93de; last saved: e:93eaa14c. Browse: context_index {"action":"list"}.
Below are dated source excerpts and recorded tool results. Continue with the latest user instructions; read a source when its omitted details matter.

[用户指令原文]
U e:10ac93de | partial | field=/message/content | 2180/17184 chars shown
"..."
[省略 420-7210；以下为另一段原文]
"..."
U e:5b22c046 | full
"..."

[近期工作原文]
A e:7b0c8101 | partial
"..."
R e:913a85df | bun test tests/reader.test.ts | reported: 42 pass / 0 fail

[操作与历史入口]
edit src/reader/read.ts x3 | latest call=e:892df9a4 result=e:913a85df
长文 e:10ac93de：实现要求 @0；验收方式 @7010；交付内容 @13540。
浏览全部用户消息：context_index {"action":"list","role":"user"}
```

Quoted text is an exact source substring. The renderer does not add quotation marks or fake ellipses; every omission has a range marker and an address.

## Three reading routes

1. **Continue working.** Read the quoted user instructions and recent assistant work, then continue with the live tail.
2. **Check a historical detail.** `search` returns the hit snippet and read arguments; `read` opens the hit or its neighborhood.
3. **Check a complete requirement.** `list` with a `ref` shows fields and section headings, then `read` with `full:true` returns the whole field.

The always-on prompt guideline is one short rule (under 400 UTF-16 chars); it does not add a rule per hidden span.

## Settings (planned)

The file is `pi-context-index.json` in Pi's agent directory. It never modifies Pi's global settings file.

| Setting | Default | Range | Meaning |
|---|---:|---:|---|
| `viewMaxChars` | 12,000 | 2,400–24,000 | Hard character cap for the rendered capsule |
| `keepUserTurns` | 1 | 0–10 | User turns kept as the live tail; `0` compacts everything |
| `runReadMaxChars` | 48,000 | 12,000–96,000 | Cumulative reader characters per agent run |

All values are integers. Invalid values fail at load time and must be corrected; the allocator never receives an out-of-range value.

## Install

Not available yet. When 0.1.0 is released:

```bash
pi install npm:pi-context-index
```

Install **either** this package **or** `pi-vcc-codemode`, never both: both register `session_before_compact` and take over compaction. `pi-context-index` does not migrate, read or extend the old summary format.

Requires Pi `>=1.4.0 <2.0.0`. There is no Pi 1.0 compatibility layer.

## Development

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun test
npm pack --dry-run
```

The package ships `index.ts`, `src/**/*.ts`, `README.md`, `LICENSE` and `CHANGELOG.md` only. Design notes, prototype research and the legacy reference mirror are excluded.

Start with [AGENTS.md](AGENTS.md) for the architecture and hard rules, then P0 in the implementation plan.

## Limits and non-goals

- **No semantic state.** The capsule does not generate goals, todos, current state, "done/verified/success" assertions or supersedes relations. It quotes what was recorded and points to the original.
- **No guarantee that the model reads.** The tool is reachable and the capsule is addressable; triggering is a measured behavior, not a product promise.
- **No cross-file fork mapping in v1.** A reference resolves only within the current session file. Forked messages keep their IDs when Pi copies them; an uncopied record returns `not_found` rather than opening the parent session.
- **Deep reads can cost more than the hidden text.** A `full:true` read can exceed the original excerpt; compression pays off when history is not immediately re-read or the capsule is reused across turns.
- **No privacy scanner.** The plugin reads the same plaintext session records Pi already saves. It does not add a separate redaction or permission system.
- **Real-session and cross-model evidence is still pending.** The prototype evidence is synthetic and single-model; 0.1.0 acceptance requires the real-host and real-task checks in the implementation plan.

## Documentation

- [docs/README.md](docs/README.md) — design, plan, prototype, external review and reference index.
- [docs/references/LEGACY_CODE_MAP.md](docs/references/LEGACY_CODE_MAP.md) — what to reuse from pi-vcc-codemode 0.1.5 and what must be rewritten.
- [research/README.md](research/README.md) — prototype research and its data boundary.

## License

MIT. The design inherits ideas and some pure utilities from [pi-vcc-codemode](https://github.com/qwased/pi-vcc-codemode), which is derived from [pi-vcc](https://github.com/sting8k/pi-vcc) by [@sting8k](https://github.com/sting8k); the original copyright notice is preserved in [LICENSE](LICENSE).

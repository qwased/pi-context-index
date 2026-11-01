# pi-context-index

An LLM-free compaction and history reader for [Pi](https://github.com/badlogic/pi-mono). It replaces a compacted transcript with a **continuation capsule** built from saved source excerpts and keeps the complete session readable through one tool called `context_index`.

> **Status: 0.1.0 source-complete, not published.** The manual, threshold and overflow compaction paths, the three-action reader, the run budget and the real-host lifecycle tests are implemented. The real TUI pass and the three real-task trials still need a user environment; see the [progress record](docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md). The npm package is not on the registry yet.

## What it does

- **One compaction path.** Manual `/compact`, threshold compaction and overflow recovery all return a deterministic capsule. If the capsule cannot be built or the operation is cancelled, the extension returns `cancel:true`; it never falls back to a model-written summary.
- **A continuation capsule, not a summary.** It quotes user instructions, recent assistant work and recorded tool results, with exact field/range addresses and explicit omission markers. Live-tail messages are not duplicated. The capsule is always selected from the full effective branch, never from the previous summary.
- **One always-on tool.** `context_index` has three actions: `list`, `search` and `read`. It works before and after compaction, directly or from a codemode script.
- **Native identity.** References use Pi's saved entry IDs (`e:<entryId>`), not a plugin-side numbering scheme. Order is presentation; identity survives compaction and display changes.
- **Bounded reads.** `list`/`search` return at most 4,000 chars, a normal `read` 12,000, `full:true` 48,000, and one agent run may re-inject 48,000 chars across at most 8 calls. A normal partial result is not an error; it carries the next range or cursor.
- **No model calls, embeddings or external retrieval.** Compaction, indexing, ranking, search and reads are local and deterministic. The agent's normal answers still use the model the user selected.
- **No sidecar database.** Pi's session records are the source of truth; the in-process index is rebuilt from them.

The authoritative scope is [docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md](docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md). Execution order is [docs/plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md](docs/plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md).

## What the capsule looks like

Synthetic example; IDs, counts and text are illustrative:

```text
[Context index v1 | snapshot=7d24b89a6e31]
Saved messages: 470; effective: 467; live: 30; quoted: 12; index-only: 425.
First saved: e:10ac93de; last saved: e:93eaa14c; live tail starts at e:5b22c046. Browse: context_index {"action":"list"} (direct or tools.context_index(...) in a script).
Below are dated source excerpts and recorded tool results. Continue with the latest user instructions; read a source when its omitted details matter.

[用户指令原文]
U e:10ac93de | partial 2180/17184 | field=/message/content
"..."
[省略 420-7210（6790 字符）；原文 ref=e:10ac93de field=/message/content]
"..."
U e:5b22c046 | full | field=/message/content
"..."

[近期工作原文]
A e:7b0c8101 | partial 4000/12000 | field=/message/content/0/text
"..."
R e:913a85df | full | bun test tests/reader.test.ts | reported: 42 pass / 0 fail

[操作与历史入口]
edit src/reader/read.ts x3 | call=e:892df9a4 result=e:913a85df
长文 e:10ac93de：实现要求 @0；验收方式 @7010；交付内容 @13540。
```

Quoted text is an exact source substring. The renderer does not add quotation marks or fake ellipses; every omission has a range marker and an address. The capsule cap is `min(viewMaxChars, max(2400, floor(0.06 × contextWindow)))`, and its final UTF-16 length is the billing truth.

## Three reading routes

1. **Continue working.** Read the quoted user instructions and recent assistant work, then continue with the live tail.
2. **Check a historical detail.** `search` returns the hit snippet and read arguments; `read` opens the hit or its neighborhood.
3. **Check a complete requirement.** `list` with a `ref` shows fields and section headings, then `read` with `full:true` returns the whole field.

```text
context_index {"action":"list"}
context_index {"action":"list","ref":"e:<entryId>"}
context_index {"action":"search","query":"acceptance number","match":"literal"}
context_index {"action":"read","ref":"e:<entryId>","field":"/message/content/0/text","offset":6000,"length":6000}
context_index {"action":"read","ref":"e:<entryId>","field":"/message/content/0/text","full":true}
```

A `cursor` resumes a partial page or read. Cursors are versioned, self-contained state: appends keep the old watermark valid, while a tree switch or a projection-changing edit asks for a fresh action. Explicit `read ref` is not affected by an old cursor.

## Settings

The file is `pi-context-index.json` in Pi's agent directory (the same directory as Pi's own `settings.json`). It never modifies Pi's global settings file.

```json
{
  "viewMaxChars": 12000,
  "keepUserTurns": 1,
  "runReadMaxChars": 48000
}
```

| Setting | Default | Range | Meaning |
|---|---:|---:|---|
| `viewMaxChars` | 12,000 | 2,400–24,000 | Hard character cap for the rendered capsule |
| `keepUserTurns` | 1 | 0–10 | User turns kept as the live tail; `0` compacts everything |
| `runReadMaxChars` | 48,000 | 12,000–96,000 | Cumulative reader characters per agent run |

All values are integers. Invalid values fail at load time; compaction is cancelled and the tool reports the settings error. The allocator never receives an out-of-range value. There are no other user settings; everything else is a versioned constant.

## Install

Requires Pi `>=1.4.0 <2.0.0`. There is no Pi 1.0 compatibility layer.

When 0.1.0 is published:

```bash
pi install npm:pi-context-index
```

From a packed tarball, extract it first (Pi treats a bare `.tgz` as an extension file, not a package directory):

```bash
npm pack
mkdir -p pi-context-index-install
tar -xzf pi-context-index-0.1.0.tgz -C pi-context-index-install --strip-components=1
pi install ./pi-context-index-install
```

From the checkout itself, `pi install .` works too.

Install **either** this package **or** `pi-vcc-codemode`, never both: both register `session_before_compact` and take over compaction. `pi-context-index` does not migrate, read or extend the old summary format.

## Codemode

No `pi-codemode` dependency is needed. When a codemode session is active, `context_index` is callable directly or from a script:

```js
const first = await tools.context_index({ action: "list", role: "user" });
const hit = await tools.context_index({
  action: "search",
  query: "acceptance number",
  match: "literal",
});
return hit;
```

The result body is marked with fixed `<<<pi-context-index:read>>>` / `<<</pi-context-index:read>>>` markers so a codemode parent body's echo is trimmed from indexing; returning the result still works, and explicit reads see every saved byte.

Nested codemode call results are not saved by Pi. Only the script's aggregate output reaches the session: if a command output matters later, `return` it (or call `text()`) from the script. Arguments above 8 KB are stored only as `argumentsBytes`; the capsule then shows "参数已省略（N 字节）" instead of inventing a path. Oversized aggregate output is truncated by Pi to a saved head and tail; the plugin indexes only that saved body and never opens the temporary full-output file.

## Development

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun run typecheck:tests
bun test
npm pack --dry-run
```

The package ships `index.ts`, `src/**/*.ts`, `README.md`, `LICENSE` and `CHANGELOG.md` only. Design notes, tests, prototype research and the legacy reference mirror are excluded.

The real-host harness uses a temporary cwd and temporary `PI_CODING_AGENT_DIR`; it never reads or writes the user's real agent directory.

## Limits and non-goals

- **No semantic state.** The capsule does not generate goals, todos, current state, "done/verified/success" assertions or supersedes relations. It quotes what was recorded and points to the original.
- **No guarantee that the model reads.** The tool is reachable and the capsule is addressable; triggering is a measured behavior, not a product promise.
- **No cross-file lookup.** A reference resolves only within the current session file. Forked messages keep their IDs when Pi copies them; an uncopied record returns `not_found` rather than opening the parent session.
- **Deep reads can cost more than the hidden text.** A `full:true` read can exceed the original excerpt; compression pays off when history is not immediately re-read or the capsule is reused across turns.
- **No privacy scanner.** The plugin reads the same plaintext session records Pi already saves. It does not add a separate redaction or permission system.
- **Codemode nested output is a known product limit.** Per-call outputs are not persisted by Pi, so the plugin can only navigate the parent result and nested errors/status. Scripts that need evidence should return it.
- **Real TUI and real-task evidence is still pending.** Synthetic performance and exposure checks are green; the real TUI and three task trials require a user environment.

## Documentation

- [docs/README.md](docs/README.md) — design, plan, prototype, external review and reference index.
- [docs/references/LEGACY_CODE_MAP.md](docs/references/LEGACY_CODE_MAP.md) — what was reused from pi-vcc-codemode 0.1.5 and what was rewritten.
- [research/README.md](research/README.md) — prototype and benchmark data boundary.
- [docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md](docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md) — living status, evidence and handoff.

## License

MIT. The design inherits ideas and some pure utilities from [pi-vcc-codemode](https://github.com/qwased/pi-vcc-codemode), which is derived from [pi-vcc](https://github.com/sting8k/pi-vcc) by [@sting8k](https://github.com/sting8k); the original copyright notice is preserved in [LICENSE](LICENSE).

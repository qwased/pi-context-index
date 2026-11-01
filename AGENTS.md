# AGENTS.md

pi-context-index is an independent Pi extension: LLM-free conversation compaction plus a reader over the saved session. It is a rewrite, not a fork of `pi-vcc-codemode`; do not import the old package or preserve its output format.

- Authoritative scope: [docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md](docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md). If code and design disagree, the design wins until the design is deliberately amended.
- Execution order: [docs/plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md](docs/plans/PI_CONTEXT_INDEX_V0_1_IMPLEMENTATION_PLAN.md), P0 → P5. Start at P0 and do not skip its real-host exit condition.
- Current state: 0.1.0 source-complete and packaged locally; P0–P4 automated checks and P5 pack/install checks are green, while the real TUI pass and three real-task trials still need a user environment. The living status and handoff record is [docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md](docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md). `index.ts` registers the `context_index` reader and the single compaction hook; `src/` holds the runtime pipeline. Design §6.4 was deliberately amended for nested-call identity and dropped arguments.

## Checks

```sh
bun install --frozen-lockfile --ignore-scripts
bun run typecheck
bun run typecheck:tests
bun test
npm pack --dry-run
```

The locked host is Pi 1.4.0. CI runs install, package typecheck, test typecheck, tests and the pack check on a clean Ubuntu runner. Tests that read session files or settings must use a temporary cwd/agentDir; never read or modify the user's real agent directory.

## Layout

- `index.ts`: extension entry; registers the `context_index` tool and the `session_before_compact` hook through `src/host.ts`.
- `src/model.ts`: the data contract from design §6.4 (`Span`, `TextField`, `Observation`, `CapsuleDetails`, versions).
- `src/settings.ts`: the three user settings, defaults and boundary check. File loading belongs to the host adapter.
- `src/fences.ts`: pure fence parser/state used by chunking, cuts and rendering.
- `src/host.ts`, `src/cut.ts`, `src/source.ts`, `src/fields.ts`, `src/chunks.ts`, `src/observations.ts`, `src/search.ts`, `src/candidates.ts`, `src/budget.ts`, `src/render.ts`, `src/reader.ts`: P0–P4 runtime modules, created in that order.
- `tests/`: unit, real-host lifecycle, codemode and synthetic-exposure tests; `tests/helpers/` has the temporary-agentDir harness and `tests/fixtures/` holds synthetic records only.
- `docs/`: design, plan, prototype, review and reference archive. Chinese prose; not part of the npm package.
- `docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md`: the living 0.1.0 progress and handoff record. Update it as work proceeds; keep the design and implementation plan frozen except for deliberate amendments.
- `reference/legacy-0.1.5/`: read-only mirror of the old implementation used for porting. Never import from it.
- `research/`: prototype and benchmark scripts; outputs are local-only. Never commit real sessions, replays, model answers or absolute paths.

## Hard rules

- **Pi baseline is 1.4.0.** Peer range is `>=1.4.0 <2.0.0`; do not add fallbacks for Pi 1.0. Do not depend on `pi-codemode`; read its saved `nestedCalls` records when present.
- **LLM-free.** Compaction, indexing, ranking, heading extraction, search and reads are local and deterministic. No model call, embedding or external retrieval. The agent's normal answer still uses the user's model.
- **One compaction path.** `session_before_compact` handles `manual`, `threshold` and `overflow` through the same pipeline. On build failure or cancellation return `{cancel:true}`; never return nothing and let Pi fall back to a model summary. Do not hand-assemble a `<view>` and call `prompt()` as a substitute for the real hook.
- **Pi records are the truth.** Capture `getEntries()`/`getBranch()` once per run into an immutable snapshot. The in-process index is rebuildable; there is no sidecar database and no authority in cached state.
- **Native identity.** References are `e:<entryId>`. `order` is presentation only. Never introduce a `#N` numbering system. A record missing from the current file returns `not_found`; do not open a parent session automatically.
- **Owner vs storage.** `Span.ownerId` gives role, time and counts; `Span.storageId + field + start/end` gives the stored text. An edited message keeps its owner ID and points at the edit entry's `/replacement/content/...` field. Renderers and search return the storage address; `read ref` always reads the stated stored entry.
- **Field view is one system.** `enumerateFields` returns an iterator of `TextField`s; field paths are JSON Pointers. The same resolver serves excerpts, search hits and reads. Do not parse the old formatted strings.
- **UTF-16 and Unicode.** Ranges are half-open `[start,end)` JavaScript UTF-16 offsets. Preserve original CRLF; never normalize text. Align windows to grapheme boundaries with `Intl.Segmenter` and echo the actual range. Do not split a grapheme to satisfy a cap.
- **Effective history is a real projection.** Determine the cut on the raw branch first; replace compaction nodes with no-text custom nodes while keeping `id/parentId`; apply Pi 1.4 `buildSessionProjection` so context edits take effect. `replacement:null` exits display candidates; edited text is addressed through the latest effective edit entry. If an edit changes a checkpoint, rebuild candidates below that checkpoint. Never use an ID-watermark approximation for live/quoted/index-only membership.
- **Cut.** Keep the last user turn by default; parse `/compact keep:N`; tail token limit is `min(16000, floor(0.25×W))`, overflow `min(8000, floor(0.15×W))`; move to a message/tool-transaction boundary and never start the tail with an orphan `toolResult`. `compact-all` uses the host-accepted empty `firstKeptEntryId`. The cut only chooses the live tail; the capsule is always re-selected from the full effective history.
- **Capsule budget.** `Bcap = min(viewMaxChars, max(2400, floor(0.06×W)))`, `B = min(Bcap, neededChars)`. `neededChars` is the full candidate cost, not the session length. Every cover line, label, address, separator, fence repair and omission marker is charged; the final UTF-16 `summary.length` is the only truth. The config loader rejects `viewMaxChars < 2400`.
- **Snapshot identity.** `snapshotId` is the first 12 hex chars of a canonical serialization of `sourceSessionId`, branch head, watermark, recipe and shown spans. It is a trace identifier, not a cross-file message identity.
- **Capsule selection.** Fixed candidate set: U (first non-empty user, three most recent non-live users, up to four lexically related older users), W (two most recent non-live assistant texts; the latest error and command result per recent user turn), N (operation navigation, at most 12 merged `(operation,path)` rows plus up to 4 counted snippets). Body shares start at U 55 / W 30 / N 15. Minimums: first user 160, each of the three recent users 160, newest assistant 256, newest error 128. Unused quota is lent U → W → N; deepen in the documented order; rollback only removes accepted upgrades, newest first, never a minimum.
- **Long messages.** Short text stays whole. Long text shows the first and last chunks, then scores middle chunks by normalized BM25 + 0.25 heading + 0.15 list-item, round-robin across sections; when no query hits or headings exist, sample middle chunks by paragraph order. Sort back to source order and print a range-bearing omission marker between non-adjacent spans. Reuse the fence state when a cut splits a code block.
- **Observations.** Direct tools and nestedCalls produce the same `Observation`. `write`/`edit` are requests, not disk proof. Test counts keep the source sentence plus command/call/result IDs. Unmatched output remains visible through recent results and search; do not build a general log parser.
- **Reader.** Three actions only: `list`, `search`, `read`. `scope` is `branch` (default) or `session`. `list` without `ref` pages records (20/page); with `ref` returns fields and section headings. `search` defaults to BM25 terms with 10 hits/page; `match:"literal"` scans the raw string and returns real offsets. `read` defaults to 6,000 requested chars, caps `length` at 12,000; `full:true` requests the whole field and cannot be combined with `offset`/`length`. `list`/`search` results cap at 4,000 chars, normal `read` at 12,000, `full` at 48,000. The result frame reserve is 512 chars.
- **Run budget.** Open one budget per agent run in `before_agent_start`; do not reset on `turn_start` and do not reset on compaction. Default 48,000 chars and 8 calls per run. Reserve synchronously before the first await, settle actual chars, release on cancel; concurrent calls share the same ledger and subtract in-flight grants from headroom. A grant of 512 chars or less returns a short `budget_exhausted` diagnostic without creating a reservation.
- **Context headroom.** `usedTokens` comes from `ctx.getContextUsage()`; when unknown, estimate message content chars / 3 and count images at 4,800 chars. `reserveTokens = min(8192, model.maxTokens) + ceil(0.05×W)`; `freeTokens = max(0, W - usedTokens - reserveTokens)`; `headroomChars = max(0, floor(3×freeTokens) - inFlightChars)`; `grantChars = min(outputCap, runRemainingChars, headroomChars)`. The factor 3 is a capacity estimate, not exact token billing.
- **Normal partials are not errors.** Pagination, capacity cuts and reaching the full-read cap are `isError:false` with `details.incomplete=true` and a next cursor. Only argument conflicts, missing refs/fields and cancellation use the error path. A full result returns `remainingChars`, `runRemainingChars` and `resume:"now"|"next-run"`.
- **Cursors are versioned.** A cursor stores version, session ID, branch head, watermark, original action and resume point. List/BM25 use `{page:{nextOrdinal}}`, literal scan uses `{scan:{fieldOrdinal,offset}}`, read uses `{read:{storageId,field,nextOffset,full}}`. Appends keep the old watermark valid; tree switches or projection-changing edits invalidate the cursor and ask for a fresh action. Explicit `read ref` is not affected by an old cursor.
- **Details carry no body.** `compaction.details` and tool `details` store source IDs, spans, recipe, counts, ranges, cost and cursors only. Never copy source text into details, logs or TUI state.
- **No page grid, no cover.** V0.1 removed the 1,200-char page table, `page`/`line` parameters and the prototype `cover` action. Use ordinary bounded windows and `full:true`. The reader is the only path back to the original.
- **Fences are structural.** `src/fences.ts` owns the line parser and state machine. A cut closes the head fence before the omission marker and reopens the tail after it; a full keep closes an unclosed source; a line cap drops an orphan closer. Structural markers must never land inside a code block.
- **Prompt guideline budget.** The always-on `context_index` guideline is one rule under 400 UTF-16 chars. Do not append a reminder per hidden span. Do not ask the model to write a `// goal:` or `// blocked:` marker; those belong to the old package.
- **Only three settings.** `viewMaxChars`, `keepUserTurns`, `runReadMaxChars`, all integers, file `pi-context-index.json` in the agent directory. All other values are versioned constants in `budget.ts`/`candidates.ts`. Invalid values fail at load.
- **No semantic sections.** Do not generate `[Session Goal]`, `[Outstanding Context]`, `[User Preferences]`, current state, todos or supersedes. Quote user text instead. A quoted source may contain any word; the rule applies to generated template lines, not to exact quotations.
- **No host interception beyond the hook.** Do not force a prefetch, block the model's final answer, register hidden tools and re-activate them by name, or use annotations as permissions. `exposure` is `"direct"` from startup.
- **Tests are the spec.** Each behavior change needs a state-transition test from the plan's §6 table. Fixtures are synthetic and must cover Chinese, rare characters, emoji, combining marks, CRLF, long single lines and cut points inside fences. Do not use `Math.min(...array)`/`Math.max(...array)` on candidate lists; keep the spread guard.
- **Performance.** Cold index ≤ 2 s and hot read/query ≤ 200 ms on a 10K-message / 50 MB mixed session are the first benchmarks. Remove duplicate serialization, duplicate tokenization and whole-file re-reads before considering a disk cache. Caches must not change ordering or capsule bytes.
- **Data boundary.** `research/` outputs are local. Never commit or quote real session text, file names, absolute paths or model answers. `research/prototype/out/`, `research/benchmark/out/`, backups and replays are git-ignored. Docs use synthetic examples only.
- **Backups.** Keep backups outside the published tree, in git-ignored `research/.backup/`; `*.bak` is excluded from `files`.
- **Release.** Add user-facing changes under `CHANGELOG.md` `[Unreleased]`. Do not commit, push, tag or publish without explicit user authorization. The package version starts at 0.1.0.

## Porting

`reference/legacy-0.1.5/` is a read-only mirror of the old implementation (0.1.5, commit `68145e7`). The mapping and rewrite notes are in [docs/references/LEGACY_CODE_MAP.md](docs/references/LEGACY_CODE_MAP.md). Port pure functions and boundary handling, not the old output format. `src/fences.ts` is the first completed port; do not drift from its tests without a reason.

## Docs language

Design, plan, review and research notes are Chinese working documents. Code, comments, README and CHANGELOG are English. Keep historical documents frozen; add a new note instead of rewriting an old conclusion. When the design is deliberately amended, update the V0.1 design and record the reason in the same change.

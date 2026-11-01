# Changelog

## [Unreleased]

### Added

- LLM-free compaction through one `session_before_compact` path for manual `/compact`, threshold and overflow recovery. The hook returns `cancel:true` on any build failure or cancellation and never falls back to a model summary.
- Immutable source snapshot and effective-history projection: native `e:<entryId>` references, Pi's context-edit replacement/omission semantics, shadowed compaction checkpoints and real branch membership for live/history/off-branch records.
- Plugin-owned cut: default last user turn, `keep:N`, compact-all with the empty `firstKeptEntryId`, `min(16000, 0.25×W)` tail cap, tighter overflow cap and tool-transaction boundaries.
- Continuation capsule: U/W/N candidates, lexical working query, 160/256/128 minima, `Bcap=min(viewMaxChars,max(2400,0.06W))`, 55/30/15 shares, U→W→N lending, newest-first rollback, fence repair, grapheme-aligned long-text excerpts and omission markers. All rendered bytes are charged.
- Field-level observation extraction for direct tools, bash execution and codemode `nestedCalls`, including `argumentsBytes`, nested error fields and `(resultId,nestedIndex)` pairing.
- `context_index` reader with `list`, `search` and `read`; field and heading navigation; BM25 terms and case-insensitive literal search with real offsets; bounded grapheme-aware windows and `full:true`.
- Versioned cursors, one per-run budget (48,000 chars / 8 calls), context headroom and the short `budget_exhausted` diagnostic. Appends keep old cursors valid; tree switches and projection-changing edits invalidate them.
- Self-echo handling for codemode: reader results carry fixed markers, indexed text excludes those ranges, and `context_index` call arguments are not default-searchable.
- `pi-context-index.json` with the three documented integer settings, load-time validation and a temporary-agent-dir test path.
- Real Pi 1.4.0 host coverage: persistence, reopen, `keep:N`, compact-all, threshold, overflow, tree switch, fork, replacement/omission/tail/checkpoint edits, ten consecutive compactions and codemode execution. Cold capsule/search and hot query/read meet the 10K-message / 50 MB targets on the local synthetic benchmark.
- User-facing README, settings example, codemode guidance, npm package manifest and the living [progress record](docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md).

### Changed

- Tokenizer and long-line chunking use single-pass scanning and an ASCII fast path; cold search on the 50 MB benchmark dropped from multi-second behavior to about 1.1 s while keeping cold/hot output byte-identical.
- The capsule cover and the always-on guideline use mode-neutral wording so the same text works for a direct tool call and for `tools.context_index(...)` inside a codemode script.

### Known limitations

- Pi does not persist per-nested-call codemode outputs; the plugin indexes the saved parent result and nested error/status records, not the call output. Scripts must `return` or `text()` what should remain.
- `appendContextEdit` in Pi 1.4 cannot target a compaction checkpoint. The projection boundary is kept for forward compatibility and tested with a saved record; no host API path is claimed.
- Real TUI readability and three real-task trials are still pending a user environment. 0.1.0 is not published.

## Earlier workspace setup

- Independent workspace for the `pi-context-index` 0.1.0 rewrite: package metadata, TypeScript/Bun test harness, GitHub Actions CI and a local git repository with the `qwased` identity.
- Design and execution archive under `docs/`: the authoritative 0.1.0 design and implementation plan, the frozen prototype design and handoff, the independent external review, the review brief/prompt and the design rationale, host primer and reviewer guide.
- `docs/references/LEGACY_CODE_MAP.md`: the porting map from `pi-vcc-codemode` 0.1.5 to the new modules, including what must be rewritten.
- Read-only source mirror `reference/legacy-0.1.5/`: the old cut, source projection, field/reader, token-estimate and nested-file-op modules plus their tests, with the original MIT notice.
- Synthetic prototype research under `research/prototype/`: fixtures, pre-registrations, renderer/reader scripts, host probe and aggregate outputs. Raw outputs and the review-bundle archive are local-only.

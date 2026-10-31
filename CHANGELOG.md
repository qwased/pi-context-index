# Changelog

## [Unreleased]

### Added

- Independent workspace for the `pi-context-index` 0.1.0 rewrite: package metadata, TypeScript/Bun test harness, GitHub Actions CI and a local git repository with the `qwased` identity.
- Design and execution archive under `docs/`: the authoritative 0.1.0 design and implementation plan, the frozen prototype design and handoff, the independent external review, the review brief/prompt and the design rationale, host primer and reviewer guide.
- `docs/references/LEGACY_CODE_MAP.md`: the porting map from `pi-vcc-codemode` 0.1.5 to the new modules, including what must be rewritten.
- Read-only source mirror `reference/legacy-0.1.5/`: the old cut, source projection, field/reader, token-estimate and nested-file-op modules plus their tests, with the original MIT notice.
- Synthetic prototype research under `research/prototype/`: fixtures, pre-registrations, renderer/reader scripts, host probe and aggregate outputs. Raw outputs and the review-bundle archive are local-only.
- Frozen data contract in `src/model.ts`, the three-setting boundary check in `src/settings.ts`, and the ported fence state machine in `src/fences.ts`, with unit tests.
- User-facing README, contributor AGENTS.md and this changelog.
- Living 0.1.0 [progress and handoff record](docs/plans/PI_CONTEXT_INDEX_V0_1_PROGRESS.md); runtime status is maintained there while the design and implementation plan stay frozen.

### Not yet implemented

- The `context_index` tool, `session_before_compact` integration, source/effective-history pipeline, continuation-capsule selector, search, reader and run budget. These start at P0 in the implementation plan.

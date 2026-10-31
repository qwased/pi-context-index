# Pre-registration: render-3 hidden-span pages, cost-accounted window, and a paging rule

- Date written: 2026-10-30, before any render-3 run.
- Scope: synthetic fixtures only; DeepSeek only (`deepseek-v4.1-flash-1017`, temperature 0,
  `reasoning_effort=minimal`); no real sessions. Raw output stays in the git-ignored `out/`.
- Frozen inputs: the T6 fixture text, question, truth and scorer in
  `activation-experiments.mjs`; the 6,287-char cap; the 3-call budget; the tail-A bytes;
  the condition system prompts A/B/C/D (unchanged from section 12.7).
- This file is written before the implementation and before any run. It is not edited after
  seeing render-3 results; deviations are reported as deviations.

## 1. Mechanism under test (render-3)

`hiddenAddress` (render-2) prints one address at the start of the first hidden run and the
reader's `read` default is 1,200 chars. Render-3 adds, only for hidden runs longer than
`PAGE=1200` chars:

1. **Span descriptor on the timeline address**:
   `span=S pages=P windows=W; max: {"read":N,"field":F,"offset":start,"length":min(12000,S)} ~T tok`
   where `P=ceil(S/1200)`, `W=ceil(S/12000)`, and `T=ceil(min(12000,S)/3.14)` is an
   allocation estimate (`c=3.14` from the recipe), not billing. For S<=1200 the render-2
   address is kept byte-identical.
2. **Page table in `view`**: for each of the first two hidden runs, the field range, the
   page count and up to 12 page start offsets (plus `+N more`), and the same max call.
   Pages are fixed 1,200-char windows anchored at the run start; the last page is shorter.
3. **Reader locators**: `read` accepts exactly one of `offset` (default 0), `page` (1-based,
   relative to the largest hidden run of that entry), or `line` (1-based line of the field,
   as printed in the U marker). Both `page` and `line` resolve server-side to an exact
   field offset. Conflicting locators are an error. `length` keeps the 12,000 cap.
4. **Cost line in every `read` result** (render-3 only):
   `[cost N chars ~T tok; hidden span start-end, unread U; next ...]`.
   The cost is the returned saved-text length, not the view budget. No cumulative counter;
   the experiment records totals from the tool arguments and the endpoint usage.

The page table is a jump index, not a semantic index: it names exact offsets but does not
say which page contains the answer. Coverage, not jumping, is the only structural guarantee;
the cost of full coverage is the hidden span's size.

## 2. Paging rule (new conditions C2/D2)

Exact additional system-prompt line, appended to C (C2) or D (D2) and nothing else:

> If a `U` line has a `hidden` span longer than 1,200 chars, or a tool result ends with a `next`
> offset, the span is not fully read. Continue from that `next` offset, or use the printed
> `max` read, until the span is covered or the text the question depends on is found. Do not
> answer from the first page alone.

C2 and D2 are new conditions, compared with A/B/C/D on the same question and fixture. A and B
are unchanged; they are the no-guidance and negative-rule anchors.

## 3. Fixtures and truth

- **t6 (primary)**: the same T6 fixture as section 12.7. Visible head states a
  complete-looking changelog rule; hidden middle states the correction; target offset 9,720
  in a hidden span 889-16077 (15,188 chars); truth `record_changelog=false`;
  `grounded` = why names the independent rerun / never sufficient. Question unchanged.
- **t6n (secondary regression)**: same visible rule, target at 1,032 inside the first 1,200
  page; one read from the address reaches it.
- **t6l (secondary multi-window)**: same visible rule and target sentence, but 150 filler
  lines precede the target and 150 follow it; target is expected near 22K, the hidden span
  is expected near 38K, so `windows>1` and a first 12,000-char read cannot reach the target.
  The exact target/hidden offsets are printed by the bootstrap line before the run; truth and
  scoring are unchanged from T6. This fixture is added to test `windows>1` and continuation;
  it is not used for the primary claim.

## 4. Arms (fixed before running)

| Arm | Render | Fixture | Conditions | Reps | Purpose |
|---|---|---|---|---:|---|
| P0 | render-2 | t6 | A,B,C,D | 3 | same-frame baseline; replicates section 12.7 |
| P1 | render-3 | t6 | A,B,C,D | 3 | primary: pages + max + cost vs P0 |
| P2 | render-2 | t6 | C2,D2 | 3 | paging rule alone, no pages/max |
| P3 | render-3 | t6 | C2,D2 | 3 | paging rule + pages/max |
| S1 | render-3 | t6n | A,B,C,D | 3 | near regression |
| S2 | render-3 | t6l | A,B,C,D,C2,D2 | 3 | multi-window; continuation |

Total 36 + 12 + 18 = 66 runs. Arms run in the order P0, P1, P2, P3, S1, S2. A run that
produces an invalid response or a format-invalid answer is excluded from the correctness
denominator and reported separately; it is not counted as wrong. The tool budget stays 3;
the reader is the same for all conditions within an arm.

## 5. Metrics (per row, recorded from stored turns)

- `firstAction` (tool/answer), `calls`, `zeroCallWrong` (first action answer and not correct).
- `hiddenExposed` (the hidden correction sentence appears in a tool result).
- `usedAddress` (a read at the timeline hidden start, index 1, offset=hiddenStart).
- `usedMax` (a read at hiddenStart with length >= min(12000, span)).
- `usedPage` (a read with `page` or `line`, or a read offset that equals a page start).
- `readCalls`, `scanCalls`, `viewCalls`.
- `targetCoveredByRead` (some read interval [offset, offset+length) contains the target offset;
  this is independent of what the model says).
- `pagesCovered` (1,200-char page grid anchored at the hidden start, union of read intervals).
- `maxOffsetReached` (max end of read intervals clamped to the hidden run).
- `toolChars` (sum of characters in tool results), `promptTokens` (sum of endpoint usage).
- `correct`, `grounded`, `abstained`, `wrongVisible`, `formatError`, `invalid`.
- `readLengths` (distinct requested lengths), for imitation checks.

Reports use counts over valid rows, plus Wilson 95% intervals for proportions where n>=3.
With 3 reps per cell no significance claim is made; the report says "point estimate" and
"interval", never "proves".

## 6. Predictions (directional, registered before the run)

- P1 vs P0: more `usedMax`, `targetCoveredByRead` and `correct` in t6; the cost is visible
  as `toolChars` near 12,000 on the covering calls.
- P2 vs P0: the rule alone can increase `calls` and continuation but cannot reach 9,720 with
  1,200-char reads inside 3 calls; expected at most partial improvement.
- P3 vs P1: the rule should reduce `zeroCallWrong` only if the model follows it; if not, no
  change. Both outcomes are reportable.
- S1: render-3 should not reduce the near-control correctness; the extra span/pages text must
  fit the same 6,287 budget (the view may lose one depth level; record chars/id).
- S2: with `windows=3`, a single max read cannot cover the target; correctness requires a
  second read (or `scan`). If the models stop after one window, that is the deep-span gap
  stated, not a bug in the address.

## 7. Analysis and decision rules

- Primary contrast: P1 vs P0 per condition (A/B/C/D), on `targetCoveredByRead` and
  `correct`. Report both, plus `hiddenExposed` and `zeroCallWrong`.
- Rule contrast: P2 vs P0 and P3 vs P1 for C/C2 and D/D2.
- Cost: report sum of tool result chars and prompt tokens per arm; compare with the view
  budget (6,287) and the hidden span. A full read of a 15K span is ~2x the view in chars; a
  38K span is ~6x. If the cost is paid without reach, the design says so.
- No claim of production behavior: single model, synthetic fixture, 3 reps.
- If P1 does not improve, the section reports a negative result and keeps "deep-span
  paging/index unresolved"; no post-hoc re-scoring or new arms are added to rescue it.

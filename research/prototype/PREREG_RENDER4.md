# Pre-registered exploratory arm: render-4 full-span read (cost-accounted)

- Date written: 2026-10-30, after the render-3 primary and replication were read,
  before any render-4 run.
- Status: exploratory, separate from the render-3 primary. It does not revise
  P0-P3, S1-S2 or the A/C replication.

## Why

Render-3 showed a clean split: a 15K hidden span was covered by one 12,000-char
read (render-3 C 9/9 across the primary and replication), but a 37K span was
not: in 24 long-span runs (S2 + S2b), 0 read the second window, 0 exposed the
target, and only 1 answered the boolean correctly without grounds. The printed
`next` offset and the paging rule both failed to produce a second window.

Render-4 tests the other structural option: one cost-accounted read of the whole
hidden span. The reader cap is raised from 12,000 to 48,000 chars **for this
arm only**; the timeline prints `max: length=<span> ~<cost>tok` where the cost
is the full returned character count (~span/3.14 tokens). The read result
prints the same cost line. Nothing else changes: same fixture, question, truth,
scorer, prompts A/B/C/D/C2/D2, 6,287 view cap, 3-call budget.

## Arms (fixed before running)

| Arm | Render | Fixture | Conditions | Reps |
|---|---|---|---|---:|
| F1 | render-4 (maxRead 48,000) | t6l (span ~37K) | C,C2,D2 | 3 |
| F2 | render-4 | t6l | A | 3 |

F1 tests whether the cost-accounted full read closes the multi-window gap under
positive guidance (C), the paging rule (C2), and both (D2). F2 is the
no-guidance trigger control. No B/D arms: B/D were not required for the
mechanism question and are already at n=3 in render-3.

## Metrics

Same as render-3: targetCoveredByRead (does any read interval contain the
target), hiddenExposed, correct, groundedCorrect, usedMax, calls, toolChars,
promptTokens. `usedFullSpan` = a read at the hidden start with length >= the
full hidden span. Report the cost ratio: toolChars / 6,287 view chars and
promptTokens per run.

## Predictions

- If the model takes the printed full-span read, F1 coverage should be 3/3 per
  condition and the target will be exposed in one call; the cost is ~37K chars
  (~11.9K tok), about 6x the view.
- If the model still reads only 12K, the gap is not a window-size problem but a
  trigger/continuation problem; the design must not claim a larger window fixes
  deep spans.
- A is expected to keep the zero-call failure; the full-read hint alone is not
  a trigger.

## Analysis

Report F1/F2 counts with Wilson intervals; compare with the render-3 long-span
runs descriptively. A positive F1 result establishes only "the model will pay
the full-span cost when it decides to", not that full-span reads are affordable
in production (6x view per read, and multiple reads per turn). A negative result
keeps the deep-span gap open. No post-hoc arm changes.

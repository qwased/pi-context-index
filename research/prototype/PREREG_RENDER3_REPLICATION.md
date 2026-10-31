# Pre-registered replication: render-2 vs render-3, T6, A/C, 6 reps

- Date written: 2026-10-30, after the primary 3-rep arms (P0-P3, S1-S2) were
  read, before any replication run.
- Why: the primary C contrast was 0/3 (render-2) vs 3/3 (render-3) with Wilson
  95% intervals that overlap at n=3. The trigger contrast (A) was 0/3 with
  three zero-call wrong answers in both renders. A second, larger batch is
  needed to separate a real direction from run-to-run variance; the primary
  arms are not revised or re-scored.
- Status: secondary replication, reported separately from the primary table. It
  is not a substitute for the pre-registered 3-rep arms and does not change
  their counts.

## Arms (fixed before running)

| Arm | Render | Fixture | Conditions | Reps |
|---|---|---|---|---:|
| R0 | render-2 | t6 | A,C | 6 |
| R1 | render-3 | t6 | A,C | 6 |

Everything else is unchanged: same fixture bytes, question, truth, scorer,
system prompts (A and C exactly as in the primary), 6,287 cap, 3-call budget,
DeepSeek `deepseek-v4.1-flash-1017`, temperature 0, minimal reasoning.
A and C are chosen because they isolate (a) the no-guidance trigger and (b) the
positive-guidance + max-window path; B and D were not replicated to keep the
batch small and are reported at n=3 only.

## Metrics and analysis

Same metrics as PREREG_RENDER3.md: `correct`, `groundedCorrect`,
`targetCoveredByRead`, `hiddenExposed`, `usedAddress`, `usedMax`,
`zeroCallWrong`, calls, tool chars and prompt tokens. The replication is
reported with its own counts and with the combined counts (primary +
replication) labelled as such; no p-value is computed. A direction is called
"replicated" only if the sign of the contrast is the same in both batches.
If the sign flips or the render-3 C runs stop covering the target, the primary
claim is downgraded to "not established".

## Predictions

- R1/C: 6/6 grounded correct, 6/6 targetCoveredByRead, 6/6 usedMax; the first
  read covers the 9,720 target (window 1 of 2).
- R0/C: at most a minority correct; no max reads (render-2 has no max text).
- A in both: zero-call wrong remains the dominant failure; render-3 does not
  add a trigger by itself.

Deviations (invalid/empty responses, non-JSON answers, format-invalid
`<invoke>` text) are excluded from the correctness denominator and reported.

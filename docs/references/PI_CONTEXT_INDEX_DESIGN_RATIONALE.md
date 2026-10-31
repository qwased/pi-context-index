# pi-context-index: design rationale and vision

**中文摘要：** 本设计的产物不是“更好的摘要”，而是**保存记录的可校验目录 + 有限展示视图 + 可寻址 reader**。它不生成目标、待办、当前状态或撤销关系，不调用模型做压缩，也不承诺全部原文可见；它承诺目录完整、原文可寻址、覆盖可查。评审对象是设计与一次性验证，不是实现或发布。

This document is the orientation for reviewers who do not want to read the full Chinese design first. It states the thesis, the refusals, the evidence philosophy and the open questions. The authoritative details, tables and evidence boundaries are in **docs/plans/PI_CONTEXT_INDEX_PROTOTYPE_DESIGN.md**.

## 1. The problem: a summary is a narrative, not an index

Compaction exists to keep a long session usable. Most implementations produce a shorter narrative: what happened, what was decided, what remains. That is useful, but it makes three promises it cannot keep:

1. **It cannot be checked.** A sentence such as “the allocator was fixed” does not say which saved record, which field, which offset, or which result. A reader cannot tell whether the underlying text exists, was hidden, or was never recorded.
2. **It manufactures state.** Goals, todos, current state and supersedes are inferences, not records. They are unstable across languages, free-form instructions and long sessions, and they go stale. A summary that says “done” is not evidence that anything was done.
3. **It hides its own coverage.** A summary reports what it selected, not what was saved, what was omitted, or why. Readers routinely treat an excerpt as the complete requirement.

The failure is structural, not a matter of a better prompt. A narrative compresses by interpretation; the reader then has no way to audit the interpretation.

## 2. The proposal: directory + limited view + reader

The design separates three things that compaction normally mixes:

- **A directory** of saved records. It enumerates every allocated #N message in the snapshot, computes the effective history E from the current branch, edits and privacy policy, records the outside set X with reasons, and partitions E into Live / Quoted / IndexOnly / Unavailable. The identity catalog is complete by construction; the view is not.
- **A limited view** rendered under a real character budget. It shows a cover line, a note, and a timeline of user excerpts, errors, counters, operation requests and optional assistant anchors. Every shown span is an exact source substring with a field and UTF-16 offset. Every hidden span has an address. The budget stops at the cost of the complete candidate set, not at a quota to fill.
- **A reader** that resolves #N, field, offset/page/line, range, scan and touched against the same snapshot and privacy policy. It returns exact substrings, field paths, offsets, costs and next addresses. It never silently switches snapshots or substitutes a similar record.

The resulting artifact is not “the session in fewer tokens”. It is “a verifiable map of what was recorded, plus a small set of exact excerpts, plus a way to read the rest”.

## 3. What the design deliberately refuses

| Refused | Why |
|---|---|
| Session Goal, Outstanding Context, User Preferences | Intent, state and preference inference; unstable and stale; duplicates task files. |
| Current state, done/verified/success assertions | The compressor observes records, not effects; a write request is not a disk change. |
| Supersedes / “who overrode whom” | Temporal order proves sequence, not reversal; state belongs to a state plugin or the user’s files. |
| Semantic ranking or keyword hunting for “important” constraints | It reintroduces the interpretation the design is trying to remove; it is not reproducible. |
| A per-line short fingerprint as identity | A short hash detects some mismatches but does not preserve identity; the view shares a source domain and snapshot. |
| A sidecar as authority | A cache must be droppable; deleting it must not change the view or the reference semantics. |
| “All history / all fields are directly visible” | A finite budget cannot losslessly encode unbounded history; the promise is directory completeness, addressability and visible coverage. |
| “The model will always read” | Tool reachability is not behavior. Triggering is a measured gap, not a guarantee. |

The design does keep exact, literal content in the view when it is selected. A quoted source span may contain words such as “done” or “verified”; the rule is that generated template lines may not assert state, while an exact quotation is labelled as a quotation, not as proof. This is a deliberate, documented deviation from a stricter lexical ban.

## 4. Why this is not “a better summary”

A better summary would still be an interpretation with hidden coverage. This design changes the contract:

- The directory can be complete even when the view is small.
- Every displayed excerpt is exact and addressable.
- Every omission is either an addressable hidden span or an explicit state/reason.
- The reader, not the compressor, resolves the original.
- The same snapshot and privacy policy govern view, scan, read, range and touched.
- The output is deterministic for the same inputs and renderer version.
- The compressor makes no model calls, so it cannot invent a fact or drift with the model.

The cost is equally explicit: the view cannot contain everything; the reader may be called zero or many times; deep reads can cost more than the hidden original; and the model may ignore the address. These are measured and reported, not hidden behind a narrative.

## 5. Evidence philosophy

The design separates three kinds of evidence:

1. **Structural invariants.** Partition completeness, exact spans, field partitions, budget accounting, deterministic bytes, reference validation, fence correctness, privacy consistency. These are tested on synthetic fixtures and must fail loudly. 18/18 invariants pass; render-1/2/3 bytes are pinned.
2. **Behavioral experiments.** Whether a model uses the reader, reaches a hidden target, and answers correctly. These are single-model, single-synthetic-fixture, 3-or-9-run cells, fixed order. The report gives counts, Wilson descriptive intervals and separate metrics: correct, grounded, targetCoveredByRead, hiddenExposed. It does not report significance or population probabilities.
3. **Host evidence.** The tool contract is exercised on a real in-process Pi SDK host with a local DeepSeek stand-in endpoint. 24/24 checks cover registration, schema rejection, coded errors, partial results, tool-layer concurrency, extension-side budget and hidden semantics. The endpoint is not a hosted provider; running cancellation, scheduler parallelism, permission-extension end-to-end, TUI/HTML, fork and 100 compactions remain unverified.

The evidence is deliberately asymmetric: structural claims are strong and reproducible; behavioral claims are directional and small; host claims are a pipeline/contract check, not a product validation. The brief tells reviewers which questions must be answered and which gaps only need confirmation.

## 6. Evolution: what each renderer taught

- **render-1**: the base view. It showed that a cover line must include the saved range, not just a count; a count-only cover led the model to answer the earliest record as #1.
- **render-2**: field/offset addresses for hidden spans. Near targets became reachable (t5n/t6n 11/11), but a distant target in a 15K span was still missed; an address is a start, not a locator.
- **render-3**: span/pages/windows, a costed max window and a page table. Within one 12K window, max plus a positive rule reached 9/9 on the 15K fixture; the 37K span remained 0/24, page/line were never used, and the paging rule had no measurable gain.
- **render-4**: an exploratory 48K full-span policy. Only 2/9 read the full span and 3/9 covered the target; the cost was about six times the view. Larger windows are a choice, not a capability.
- **render-5**: a server-side merged cover read. When used, it is effective: C5 7/9 on 37K, all seven cover runs correct, grounded, covered and unread 0. But 2/9 never call cover, A 0/3 coverage, and at 15K cover is redundant (max already covers the target; C 9/9) while C5 adds 12% tool characters.

The evolution is the argument: each structural improvement moved a specific failure, and each left a different one. The current open questions are the residue of that sequence.

## 7. Open questions

1. **Trigger.** A 7/9 mechanism with 2/9 non-trigger is not a guarantee. Should the product accept and document the gap, or enforce coverage at the host layer? The design refuses semantic scoring, so any trigger must bind to structure.
2. **Default policy.** When should cover be printed or enabled? coverMax=48,000 is exploratory. The 15K case shows that “span > readMax” is too broad; the cost of a cover can exceed the hidden original.
3. **Cost.** One cover can be cheaper than three next calls in prompt tokens, but the cover result plus the view can exceed the original in characters. Compression only pays when hidden text is not immediately read or the view is reused.
4. **Host boundary.** The in-process SDK checks are real host behavior, but the endpoint is a stand-in. Which unverified host items block design, and which block implementation?
5. **Reporting.** The post-hoc S2b batch, the fixed order and the change of coverage measurement between §12.8 and §12.9 are documented, but they limit cross-section claims. What minimum reporting standard should future work adopt?

## 8. What would change the design

- If the directory cannot be made complete and verifiable on real session shapes, the central promise fails.
- If users consistently need semantic state (goals, todos, current status) more than provenance, a state plugin, not a richer summary, is the right layer.
- If cover or deep reads dominate token cost in realistic use, the cost model must change the default policy, not just the prompt.
- If the host cannot persist stable reference identity across fork/context edit, cross-file references must be refused rather than approximated with hashes.
- If cross-model or real-session evidence shows that models never trigger or never read, the product claim must shrink to “a verified index that a human or a state plugin can use”.
- If the trigger gap cannot be closed without semantic scoring, the design must say so and keep the reader as an explicit, opt-in tool rather than pretending the view is self-sufficient.

## 9. Relationship to the host and deployment

The new plugin is separate from **pi-vcc-codemode**. It registers the same compaction hook, so the two packages cannot be installed together. It does not migrate or backfill the old summary format. It uses the host’s compaction hook to return a view and details, and registers one read-only tool to resolve saved records. It assumes the host can persist entry identity and branch position; where that is not true, it fails closed.

The prototype is not the product: no src/, no package.json change, no version line, no release. The review is about whether the design and its one-shot validation are sound enough to authorize implementation, not whether the plugin exists.

## 10. Reading note

The detailed design is in Chinese. This rationale and the brief’s English executive summary are the English orientation; **HOST_PRIMER.md** provides the minimum Pi contract with English code. If a reviewer does not read Chinese, the detailed tables and the per-question deep dive should be marked as language-limited rather than inferred from this summary.

**Reviewers are invited to challenge this thesis, not only its parameters.** A different design philosophy, an alternative architecture, a refactor or a replacement is a valid review outcome. The six questions in the brief are consequences of the thesis, not the boundary of the review; if the premise is wrong, say so and say what evidence would support a different direction.

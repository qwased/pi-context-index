/**
 * Continuation capsule rendering and the single character budget.
 *
 * The renderer is the billing truth: cover lines, labels, addresses, source
 * text, omission markers, fence repair and separators all count. Allocation
 * deepens candidate levels by priority, lends unused quota U -> W -> N, then
 * rolls back accepted upgrades newest-first until the final UTF-16 length fits.
 * Minima are never rolled back.
 */

import { createHash } from "node:crypto";
import { capsuleCap } from "./budget";
import {
  closeUnclosedFences,
  fenceStateBefore,
} from "./fences";
import {
  DETAILS_KIND,
  FIELD_VERSION,
  SCHEMA_VERSION,
  SELECTOR_VERSION,
  type CapsuleDetails,
  type CapsuleObservationRef,
  type CapsuleRecipe,
  type Span,
  type TextField,
} from "./model";
import type { Cut } from "./cut";
import type { EffectiveHistory } from "./source";
import {
  makeCandidates,
  type CandidateSet,
  type ExcerptPlan,
  type LinePlan,
  type ObservationRef,
} from "./candidates";

export const CAPSULE_GROUPS = ["U", "W", "N"] as const;
export type CapsuleGroup = (typeof CAPSULE_GROUPS)[number];

export const GROUP_SHARES: Record<CapsuleGroup, number> = {
  U: 0.55,
  W: 0.3,
  N: 0.15,
};

export const GROUP_HEADERS: Record<CapsuleGroup, string> = {
  U: "[用户指令原文]",
  W: "[近期工作原文]",
  N: "[操作与历史入口]",
};

/** Reserved for an extra section header and cover digit changes. */
const SECTION_SLACK_CHARS = 96;
const COVER_PLACEHOLDER = "000000000000";

export interface CapsuleConfig {
  viewMaxChars: number;
  keepUserTurns: number;
}

export interface CapsuleResult {
  text: string;
  details: CapsuleDetails;
  budgetChars: number;
  candidates: CandidateSet;
}

interface RenderedExcerpt {
  text: string;
  shown: Span[];
  required: boolean;
}

const spanChars = (spans: readonly Span[]): number => {
  let total = 0;
  for (const span of spans) total += Math.max(0, span.end - span.start);
  return total;
};

const ensureNewline = (text: string): string =>
  text.length === 0 || text.endsWith("\n") ? text : text + "\n";

const omissionMarker = (field: TextField, from: number, to: number): string =>
  `[省略 ${from}-${to}（${to - from} 字符）；原文 ref=e:${field.storageId} field=${field.path}]`;

const sameSpans = (a: readonly Span[], b: readonly Span[]): boolean =>
  a.length === b.length &&
  a.every(
    (span, index) =>
      span.start === b[index]?.start &&
      span.end === b[index]?.end &&
      span.storageId === b[index]?.storageId &&
      span.field === b[index]?.field,
  );

const isFullField = (field: TextField, spans: readonly Span[]): boolean =>
  spans.length === 1 &&
  spans[0]?.start === 0 &&
  spans[0]?.end === field.text.length;

const renderLabel = (plan: ExcerptPlan, spans: readonly Span[]): string => {
  const owner = plan.field.ownerId;
  const storage =
    plan.field.storageId !== owner ? ` source=e:${plan.field.storageId}` : "";
  const detail = plan.detail ? ` | ${plan.detail}` : "";
  if (plan.reported !== undefined) {
    return `${plan.marker} e:${owner}${storage}${detail} | reported: ${plan.reported}`;
  }
  const status = isFullField(plan.field, spans)
    ? "full"
    : `partial ${spanChars(spans)}/${plan.field.text.length}`;
  return `${plan.marker} e:${owner}${storage} | ${status}${detail} | field=${plan.field.path}`;
};

/**
 * Render the selected spans of one stored field. Non-adjacent spans are
 * separated by a range marker; a split fence is closed before the marker and
 * reopened after it, so a structural line never lands inside a code block.
 */
export const renderExcerptBody = (field: TextField, spans: readonly Span[]): string => {
  let out = "";
  for (let index = 0; index < spans.length; index++) {
    const span = spans[index];
    if (!span) continue;
    if (index === 0) {
      const opener = fenceStateBefore(field.text, span.start);
      if (opener) out += opener.raw + "\n";
    }
    out += field.text.slice(span.start, span.end);
    out = closeUnclosedFences(out).text;

    const next = spans[index + 1];
    if (!next) continue;
    out = ensureNewline(out);
    out += omissionMarker(field, span.end, next.start) + "\n";
    const opener = fenceStateBefore(field.text, next.start);
    if (opener) out += opener.raw + "\n";
  }
  out = closeUnclosedFences(out).text;
  return out;
};

const renderExcerpt = (
  plan: ExcerptPlan,
  level: number,
): RenderedExcerpt => {
  const spans = plan.levels[level] ?? [];
  const label = renderLabel(plan, spans);
  if (plan.reported !== undefined) {
    return { text: label, shown: [...spans], required: plan.minimum && level === 0 };
  }
  const body = renderExcerptBody(plan.field, spans);
  const text = body.length === 0 ? label : `${label}\n${body.replace(/\n+$/, "")}`;
  return {
    text,
    shown: [...spans],
    required: plan.minimum && level === 0,
  };
};

const renderLine = (plan: LinePlan): string => plan.text;

const estimateLabelChars = (
  plan: ExcerptPlan,
  spans: readonly Span[],
): number => {
  const owner = plan.field.ownerId;
  const storage =
    plan.field.storageId !== owner ? ` source=e:${plan.field.storageId}`.length : 0;
  const detail = plan.detail ? ` | ${plan.detail}`.length : 0;
  if (plan.reported !== undefined) {
    return plan.marker.length + 3 + owner.length + storage + detail + 12 + plan.reported.length;
  }
  const status = isFullField(plan.field, spans)
    ? "full"
    : `partial ${spanChars(spans)}/${plan.field.text.length}`;
  return (
    plan.marker.length +
    3 +
    owner.length +
    storage +
    3 +
    status.length +
    detail +
    9 +
    plan.field.path.length
  );
};

/** Allocation-time estimate; the final render length remains authoritative. */
const estimatePlanChars = (
  plan: ExcerptPlan | LinePlan,
  level: number,
): number => {
  if (plan.kind === "line") return plan.text.length + 2;
  const spans = plan.levels[level] ?? [];
  if (plan.reported !== undefined) return estimateLabelChars(plan, spans) + 2;
  const gaps = Math.max(0, spans.length - 1);
  return (
    estimateLabelChars(plan, spans) +
    spanChars(spans) +
    gaps * 80 +
    40 +
    2
  );
};

const emptyLevels = (plans: readonly (ExcerptPlan | LinePlan)[]): number[] =>
  plans.map(() => -1);

const observationKey = (ref: ObservationRef): string =>
  [ref.callId, ref.resultId ?? "", ref.nestedIndex ?? ""].join("\u0000");

interface RenderState {
  levels: number[];
}

const selectedPlans = (
  plans: readonly (ExcerptPlan | LinePlan)[],
  levels: readonly number[],
): Array<{ plan: ExcerptPlan | LinePlan; level: number }> => {
  const selected: Array<{ plan: ExcerptPlan | LinePlan; level: number }> = [];
  levels.forEach((level, index) => {
    const plan = plans[index];
    if (plan && level >= 0) selected.push({ plan, level });
  });
  return selected;
};

const renderSelection = (
  history: EffectiveHistory,
  plans: readonly (ExcerptPlan | LinePlan)[],
  levels: readonly number[],
  snapshotId: string,
  budgetChars: number,
  keep: number,
): { text: string; shown: Span[]; observations: CapsuleObservationRef[]; quoted: number } => {
  const groups: Record<CapsuleGroup, Array<{ text: string; order: number; seq: number }>> =
    { U: [], W: [], N: [] };
  const shown: Span[] = [];
  const observations: CapsuleObservationRef[] = [];
  const seenObservations = new Set<string>();
  let sequence = 0;

  const selected = selectedPlans(plans, levels);
  for (const { plan, level } of selected) {
    if (plan.kind === "line") {
      // Navigation keeps its priority order (recent first).
      groups.N.push({ text: renderLine(plan), order: sequence, seq: sequence++ });
      if (plan.observation && !seenObservations.has(observationKey(plan.observation))) {
        seenObservations.add(observationKey(plan.observation));
        observations.push({ ...plan.observation });
      }
      continue;
    }
    const rendered = renderExcerpt(plan, level);
    const order =
      history.snapshot.fileOrder.get(plan.record.info.id) ?? sequence;
    groups[plan.group].push({ text: rendered.text, order, seq: sequence++ });
    shown.push(...rendered.shown);
    if (plan.observation && !seenObservations.has(observationKey(plan.observation))) {
      seenObservations.add(observationKey(plan.observation));
      observations.push({ ...plan.observation });
    }
  }
  // Source order inside U and W; N keeps its priority order.
  for (const group of ["U", "W"] as const) {
    groups[group].sort((a, b) => a.order - b.order || a.seq - b.seq);
  }

  const quoted = new Set(shown.map((span) => span.ownerId)).size;
  const indexOnly = Math.max(
    0,
    history.counts.effective - history.counts.live - quoted,
  );
  const firstSaved =
    history.snapshot.branch.find(
      (entry) => entry.type === "message" || entry.type === "custom_message",
    )?.id ?? "?";
  const lastBranchRecord = [...history.snapshot.branch]
    .reverse()
    .find((entry) => entry.type === "message" || entry.type === "custom_message");
  const lastSaved = lastBranchRecord?.id ?? firstSaved;
  const liveStart = history.cut.firstKeptEntryId
    ? `e:${history.cut.firstKeptEntryId}`
    : "(none)";
  const cover = [
    `[Context index v1 | snapshot=${snapshotId}]`,
    `Saved messages: ${history.counts.saved}; effective: ${history.counts.effective}; live: ${history.counts.live}; quoted: ${quoted}; index-only: ${indexOnly}.`,
    `First saved: e:${firstSaved}; last saved: e:${lastSaved}; live tail starts at ${liveStart}. Browse: context_index {"action":"list"}.`,
    "Below are dated source excerpts and recorded tool results. Continue with the latest user instructions; read a source when its omitted details matter.",
  ].join("\n");

  const sections: string[] = [];
  for (const group of CAPSULE_GROUPS) {
    const blocks = groups[group];
    if (blocks.length === 0) continue;
    sections.push(
      GROUP_HEADERS[group] + "\n" + blocks.map((block) => block.text).join("\n\n"),
    );
  }
  const text =
    sections.length === 0 ? cover : cover + "\n\n" + sections.join("\n\n");

  return { text, shown, observations, quoted };
};

const canonicalSnapshotId = (input: {
  sessionId: string;
  headId: string | null;
  watermarkId: string | null;
  recipe: CapsuleRecipe;
  shown: readonly Span[];
}): string => {
  const spans = [...input.shown]
    .sort(
      (a, b) =>
        a.ownerId.localeCompare(b.ownerId) ||
        a.storageId.localeCompare(b.storageId) ||
        a.field.localeCompare(b.field) ||
        a.start - b.start ||
        a.end - b.end,
    )
    .map((span) => [span.ownerId, span.storageId, span.field, span.start, span.end]);
  const canonical = JSON.stringify({
    version: 1,
    sessionId: input.sessionId,
    headId: input.headId,
    watermarkId: input.watermarkId,
    recipe: input.recipe,
    shown: spans,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 12);
};

const sortShown = (history: EffectiveHistory, shown: Span[]): Span[] => {
  const orderOf = (span: Span): number =>
    history.snapshot.fileOrder.get(span.ownerId) ??
    history.snapshot.fileOrder.get(span.storageId) ??
    Number.MAX_SAFE_INTEGER;
  return [...shown].sort(
    (a, b) =>
      orderOf(a) - orderOf(b) ||
      a.field.localeCompare(b.field) ||
      a.start - b.start ||
      a.end - b.end,
  );
};

const levelCount = (plan: ExcerptPlan | LinePlan): number =>
  plan.kind === "line" ? 1 : plan.levels.length;

const nextLevel = (
  plans: readonly (ExcerptPlan | LinePlan)[],
  levels: readonly number[],
  group: CapsuleGroup,
): number => {
  let best = -1;
  let bestPriority = Number.POSITIVE_INFINITY;
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    if (!plan || plan.group !== group) continue;
    const level = levels[index] ?? -1;
    if (level + 1 >= levelCount(plan)) continue;
    if (plan.priority < bestPriority) {
      best = index;
      bestPriority = plan.priority;
    }
  }
  return best;
};

const groupUsed = (
  plans: readonly (ExcerptPlan | LinePlan)[],
  levels: readonly number[],
  group: CapsuleGroup,
): number => {
  let used = 0;
  for (let index = 0; index < plans.length; index++) {
    const plan = plans[index];
    const level = levels[index] ?? -1;
    if (!plan || plan.group !== group || level < 0) continue;
    used += estimatePlanChars(plan, level);
  }
  return used;
};

/**
 * Build the capsule for one cut. Candidates are fixed first; the allocator
 * deepens them under shares, lends leftover quota and rolls back the newest
 * upgrades until the rendered text fits the hard cap.
 */
export const buildCapsule = (input: {
  history: EffectiveHistory;
  config: CapsuleConfig;
  contextWindow: number;
  instructions?: string;
}): CapsuleResult => {
  const { history, config, contextWindow } = input;
  const budgetChars = capsuleCap(config.viewMaxChars, contextWindow);
  const candidates = makeCandidates(history, input.instructions ?? "");
  const plans = candidates.plans;
  const levels = emptyLevels(plans);

  // Seed every minimum at its first level. These are never pushed on the
  // rollback stack, so no later step can remove them.
  plans.forEach((plan, index) => {
    if (plan.kind === "excerpt" && plan.minimum) levels[index] = 0;
  });

  const renderedBaseline = renderSelection(
    history,
    plans,
    levels,
    COVER_PLACEHOLDER,
    budgetChars,
    history.cut.requestedKeep,
  );

  const accepted: Array<{ planIndex: number; previousLevel: number }> = [];

  if (renderedBaseline.text.length > budgetChars) {
    // The minimum set should always fit the narrow end; failing loudly here is
    // safer than emitting an over-budget capsule. The hook turns this into
    // cancel:true rather than a model fallback.
    throw new Error(
      `capsule minimums do not fit ${budgetChars} chars (need ${renderedBaseline.text.length})`,
    );
  }

  const bodyBudget = Math.max(
    0,
    budgetChars - renderedBaseline.text.length - SECTION_SLACK_CHARS,
  );
  const shares: Record<CapsuleGroup, number> = {
    U: bodyBudget * GROUP_SHARES.U,
    W: bodyBudget * GROUP_SHARES.W,
    N: bodyBudget * GROUP_SHARES.N,
  };
  const used: Record<CapsuleGroup, number> = {
    U: groupUsed(plans, levels, "U"),
    W: groupUsed(plans, levels, "W"),
    N: groupUsed(plans, levels, "N"),
  };

  let upgradeSpent = 0;
  const accept = (planIndex: number, delta: number): void => {
    const previousLevel = levels[planIndex] ?? -1;
    accepted.push({ planIndex, previousLevel });
    levels[planIndex] = previousLevel + 1;
    upgradeSpent += delta;
  };

  // Deepen each group inside its share, in fixed priority order.
  for (const group of CAPSULE_GROUPS) {
    let remaining = shares[group] - used[group];
    for (;;) {
      const index = nextLevel(plans, levels, group);
      if (index < 0) break;
      const plan = plans[index];
      if (!plan) break;
      const current = levels[index] ?? -1;
      const delta =
        estimatePlanChars(plan, current + 1) -
        (current >= 0 ? estimatePlanChars(plan, current) : 0);
      if (delta > remaining) break;
      accept(index, delta);
      remaining -= delta;
      used[group] += delta;
    }
  }

  // Lend unused quota U -> W -> N until no upgrade fits at all.
  let globalRemaining =
    budgetChars -
    renderedBaseline.text.length -
    SECTION_SLACK_CHARS -
    upgradeSpent;
  for (;;) {
    let progressed = false;
    for (const group of CAPSULE_GROUPS) {
      const index = nextLevel(plans, levels, group);
      if (index < 0) continue;
      const plan = plans[index];
      if (!plan) continue;
      const current = levels[index] ?? -1;
      const delta =
        estimatePlanChars(plan, current + 1) -
        (current >= 0 ? estimatePlanChars(plan, current) : 0);
      if (delta > globalRemaining) continue;
      accept(index, delta);
      globalRemaining -= delta;
      used[group] += delta;
      progressed = true;
    }
    if (!progressed) break;
  }

  // Measure and roll back newest-first. The final UTF-16 length is the only
  // authority; estimates above just chose where to spend first.
  let rendered = renderSelection(
    history,
    plans,
    levels,
    COVER_PLACEHOLDER,
    budgetChars,
    history.cut.requestedKeep,
  );
  while (rendered.text.length > budgetChars && accepted.length > 0) {
    const last = accepted.pop();
    if (!last) break;
    levels[last.planIndex] = last.previousLevel;
    rendered = renderSelection(
      history,
      plans,
      levels,
      COVER_PLACEHOLDER,
      budgetChars,
      history.cut.requestedKeep,
    );
  }

  if (rendered.text.length > budgetChars) {
    throw new Error(
      `capsule length ${rendered.text.length} exceeds ${budgetChars}`,
    );
  }

  const recipe: CapsuleRecipe = {
    selectorVersion: SELECTOR_VERSION,
    fieldVersion: FIELD_VERSION,
    budgetChars,
    contextWindow,
    keep: history.cut.requestedKeep,
  };
  const shown = sortShown(history, rendered.shown);
  const snapshotId = canonicalSnapshotId({
    sessionId: history.snapshot.sessionId,
    headId: history.snapshot.headId,
    watermarkId: history.snapshot.watermarkId,
    recipe,
    shown,
  });
  const finalRender = renderSelection(
    history,
    plans,
    levels,
    snapshotId,
    budgetChars,
    history.cut.requestedKeep,
  );
  if (finalRender.text.length !== rendered.text.length) {
    throw new Error("snapshot id length changed the capsule");
  }
  const finalShown = sortShown(history, finalRender.shown);
  const quoted = new Set(finalShown.map((span) => span.ownerId)).size;
  const details: CapsuleDetails = {
    kind: DETAILS_KIND,
    schemaVersion: SCHEMA_VERSION,
    sourceSessionId: history.snapshot.sessionId,
    sourceHeadId: history.snapshot.headId,
    sourceWatermarkId: history.snapshot.watermarkId,
    firstKeptEntryId: history.cut.firstKeptEntryId,
    snapshotId,
    recipe,
    shown: finalShown,
    observations: finalRender.observations,
    counts: {
      saved: history.counts.saved,
      effective: history.counts.effective,
      live: history.counts.live,
      quoted,
      indexOnly: Math.max(0, history.counts.effective - history.counts.live - quoted),
      outside: history.counts.outside,
    },
    usedChars: finalRender.text.length,
  };
  return {
    text: finalRender.text,
    details,
    budgetChars,
    candidates,
  };
};

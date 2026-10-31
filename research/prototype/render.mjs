// Deterministic view renderer for the pi-context-index prototype.
// Selection is candidate-first, budgeted by exact final UTF-16 cost, and
// always rendered in source order.

import { canonicalJson, fieldsOfMessage, primaryTextField, shortHash } from "./catalog.mjs";

export const CHARS_PER_TOKEN = 3.14;
export const NOTE =
  "Quoted source and recorded observations; not current state or proof. #N saved message; v view; use context_index.";
const MAX_LINE_CHARS = 400;
const MAX_REFS_PER_ROW = 6;
const ANCHOR_BUDGET = 800;

const floor = (n) => Math.floor(n);

export const budgetTokenCeiling = (ctxTokens) =>
  floor(Math.min(4000, 2000 + 0.005 * Math.max(0, ctxTokens - 200000)));

export const budgetFor = (blocks, ctxTokens, charsPerToken = CHARS_PER_TOKEN) => {
  const ceiling = budgetTokenCeiling(ctxTokens);
  const tokens = Math.max(1100, 15 * blocks);
  const tokenQuota = Math.min(ceiling, tokens);
  return {
    ceiling,
    tokens: tokenQuota,
    capChars: floor(tokenQuota * charsPerToken),
    charsPerToken,
    blocks,
    ctxTokens,
  };
};

const lineInfo = (text) => {
  const lines = text.split("\n");
  const out = [];
  let offset = 0;
  for (const line of lines) {
    out.push({ text: line, start: offset, end: offset + line.length });
    offset += line.length + 1;
  }
  return out;
};

const lineRanges = (indices) => {
  if (indices.length === 0) return "";
  const sorted = [...indices].sort((a, b) => a - b);
  const parts = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) { prev = current; continue; }
    parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
    start = current;
    prev = current;
  }
  parts.push(start === prev ? `${start + 1}` : `${start + 1}-${prev + 1}`);
  return parts.join(", ");
};

const hiddenLineRanges = (total, shown) => {
  const shownSet = new Set(shown);
  const hidden = [];
  for (let i = 0; i < total; i++) if (!shownSet.has(i)) hidden.push(i);
  return lineRanges(hidden);
};

const addSpan = (map, rec, field, start, end) => {
  if (end <= start) return;
  const key = rec.entryId;
  if (!map.has(key)) map.set(key, { rec, spans: [] });
  map.get(key).spans.push({
    entryId: rec.entryId,
    n: rec.n,
    field,
    start,
    end,
    ...(rec.revisionEntryId ? { revision: rec.revisionEntryId } : {}),
  });
};

const findFieldSpan = (rec, fieldPath, text) => {
  const field = rec.fields.find((f) => f.path === fieldPath);
  if (!field) return null;
  const at = field.text.indexOf(text);
  if (at < 0) return null;
  return { field, start: at, end: at + text.length };
};

const findLiteralSpan = (rec, text) => {
  for (const field of rec.fields) {
    const at = field.text.indexOf(text);
    if (at >= 0) return { field, start: at, end: at + text.length };
  }
  return null;
};

const makeUserLines = (rec) => {
  const fields = rec.fields?.length ? rec.fields : [];
  const field = fields.find((f) => f.path === "content") ??
    fields.find((f) => f.path.endsWith(".text")) ??
    null;
  if (!field) return null;
  const lines = lineInfo(field.text);
  const displayable = [];
  const oversize = [];
  lines.forEach((line, i) => {
    if (line.text.length > MAX_LINE_CHARS) oversize.push(i);
    else displayable.push(i);
  });
  return { field, lines, displayable, oversize };
};

const userLevelIndices = (info, level) => {
  const { displayable } = info;
  if (displayable.length === 0) return [];
  if (level === "full") return [...displayable];
  const head = Math.min(2 + Math.ceil(level / 2), displayable.length);
  const tail = Math.min(2 + Math.floor(level / 2), Math.max(0, displayable.length - head));
  const indices = new Set();
  for (let i = 0; i < head; i++) indices.add(displayable[i]);
  for (let i = displayable.length - tail; i < displayable.length; i++) indices.add(displayable[i]);
  return [...indices].sort((a, b) => a - b);
};

// Contiguous runs of source lines that the marker does not quote. Each run is
// a real field range, so it can be turned into an executable read call.
const hiddenLineRuns = (info, indices) => {
  const shown = new Set(indices);
  const runs = [];
  let run = null;
  info.lines.forEach((line, i) => {
    if (shown.has(i)) {
      if (run) { runs.push(run); run = null; }
      return;
    }
    if (!run) run = { startLine: i, start: line.start, end: line.end };
    else run.end = line.end;
  });
  if (run) runs.push(run);
  return runs.map((r) => ({ ...r, total: info.field.text.length }));
};

// Page and window sizes are protocol constants, not per-view tuning: a page
// is the smallest addressable read, a window is the largest one. Render-3 only
// adds the descriptor for runs longer than one page; shorter runs keep the
// render-2 address byte-for-byte. Render-5 (cover) leaves both untouched and
// adds a third call for runs longer than one window: the server-side merge of
// every window into one result, priced at the whole span.
export const PAGE_CHARS = 1200;
export const READ_MAX = 12000;
// Host policy for the merged cover read. It is not a read window: the result is
// assembled from consecutive windows and reports one total cost. 48,000 is the
// exploration ceiling used by render-4; a span longer than this is covered
// partially with an explicit next offset.
export const COVER_MAX = 48000;

const readCall = (rec, field, offset, length = 1200) =>
  `{"read":${rec.n},"field":${JSON.stringify(field)},"offset":${offset},"length":${length}}`;

const coverCall = (rec, field, offset) =>
  `{"read":${rec.n},"field":${JSON.stringify(field)},"offset":${offset},"cover":true}`;

const readCostTokens = (chars) => Math.ceil(chars / CHARS_PER_TOKEN);

// The address is structural text, not quoted source: field path, UTF-16 range
// and a call the reader can execute directly. Only the first hidden run is
// inlined; every run is listed with its own address by `view`.
const hiddenAddressText = (rec, field, runs, pageTable = false, maxRead = READ_MAX, cover = false, coverMax = COVER_MAX) => {
  if (runs.length === 0) return "";
  const first = runs[0];
  const more = runs.length > 1
    ? `; +${runs.length - 1} more hidden run${runs.length > 2 ? "s" : ""} (view)`
    : "";
  const head = `; field=${field} ${first.start}-${first.end} of ${first.total};`;
  const span = first.end - first.start;
  if (!pageTable || span <= PAGE_CHARS) {
    return `${head} read: ${readCall(rec, field, first.start)}${more}`;
  }
  const pages = Math.ceil(span / PAGE_CHARS);
  const windows = Math.ceil(span / maxRead);
  const length = Math.min(maxRead, span);
  const windowText = `; max: ${readCall(rec, field, first.start, length)} ~${readCostTokens(length)}tok`;
  if (!cover || span <= maxRead) return `${head} span=${span} pages=${pages} windows=${windows}${windowText}${more}`;
  // Render-5: the merged call. The printed cost is the whole covered range, not
  // one window, so the reader can compare it with the span before spending it.
  const covered = Math.min(coverMax, span);
  const whole = covered >= span ? "all windows" : `first ${Math.ceil(covered / maxRead)} of ${windows} windows`;
  return `${head} span=${span} pages=${pages} windows=${windows}${windowText}; cover: ${coverCall(rec, field, first.start)} ~${readCostTokens(covered)}tok (${whole})${more}`;
};

const renderQuotedLines = (label, rec, info, indices, viewId, extra = {}) => {
  const total = info.lines.length;
  const full = indices.length === info.displayable.length && info.oversize.length === 0;
  const ranges = lineRanges(indices);
  const hidden = hiddenLineRanges(total, indices);
  const address = extra.hiddenAddress
    ? hiddenAddressText(
        rec,
        info.field.path,
        hiddenLineRuns(info, indices),
        extra.pageTable === true,
        extra.maxRead ?? READ_MAX,
        extra.cover === true,
        extra.coverMax ?? COVER_MAX,
      )
    : "";
  const oversizeText = info.oversize.length > 0 ? `; ${info.oversize.length} oversize line${info.oversize.length === 1 ? "" : "s"} hidden` : "";
  const marker = full
    ? `${label} #${rec.n} (full ${info.field.text.length} chars)`
    : `${label} #${rec.n} [lines ${ranges} of ${total}; hidden ${hidden || "none"}${oversizeText}${address}; view ${viewId}]`;
  const quoteLines = indices.map((i) => info.lines[i].text);
  const text = `${marker}\n${quoteLines.join("\n")}`;
  return {
    text,
    quotes: indices.map((i) => ({
      rec,
      field: info.field.path,
      start: info.lines[i].start,
      end: info.lines[i].end,
    })),
    marker,
    full,
  };
};

const makeUserItem = (rec, level, viewId, hiddenAddress = false, pageTable = false, maxRead = READ_MAX, cover = false, coverMax = COVER_MAX) => {
  const info = makeUserLines(rec);
  if (!info || info.displayable.length === 0) {
    return {
      unitId: `U:${rec.n}:none`,
      kind: "U",
      order: rec.n,
      rec,
      text: "",
      cost: 0,
      quotes: [],
      reason: "oversize-line",
      level,
    };
  }
  const indices = userLevelIndices(info, level);
  const rendered = renderQuotedLines("U", rec, info, indices, viewId, { hiddenAddress, pageTable, maxRead, cover, coverMax });
  return {
    unitId: `U:${rec.n}`,
    kind: "U",
    order: rec.n,
    rec,
    text: rendered.text,
    quotes: rendered.quotes,
    cost: rendered.text.length + 1,
    level,
    info,
    indices,
  };
};

const makeCharUserItem = (rec, viewId, keepChars = 1020, hiddenAddress = false, pageTable = false, maxRead = READ_MAX) => {
  const info = makeUserLines(rec);
  if (!info) return null;
  const text = info.field.text;
  const headChars = Math.floor(keepChars / 2);
  const tailChars = keepChars - headChars;
  const headEnd = Math.min(text.length, headChars);
  const tailStart = Math.max(headEnd, text.length - tailChars);
  const omitted = tailStart - headEnd;
  const address = hiddenAddress && omitted > 0
    ? pageTable && omitted > PAGE_CHARS
      ? `; field=${info.field.path} ${headEnd}-${tailStart} of ${text.length}; span=${omitted} pages=${Math.ceil(omitted / PAGE_CHARS)} windows=${Math.ceil(omitted / maxRead)}; max: ${readCall(rec, info.field.path, headEnd, Math.min(maxRead, omitted))} ~${readCostTokens(Math.min(maxRead, omitted))}tok`
      : `; field=${info.field.path} ${headEnd}-${tailStart} of ${text.length}; read: ${readCall(rec, info.field.path, headEnd)}`
    : "";
  const marker = `U #${rec.n} [chars 0-${headEnd}, ${tailStart}-${text.length} of ${text.length}; ${omitted} hidden; char cut control${address}; view ${viewId}]`;
  const body = `${marker}\n${text.slice(0, headEnd)}\n[hidden chars ${headEnd}-${tailStart}; view ${viewId}]\n${text.slice(tailStart)}`;
  return {
    unitId: `U:${rec.n}`,
    kind: "U",
    order: rec.n,
    rec,
    text: body,
    cost: body.length + 1,
    level: "char",
    info,
    indices: [],
    quotes: [
      { rec, field: info.field.path, start: 0, end: headEnd },
      { rec, field: info.field.path, start: tailStart, end: text.length },
    ].filter((q) => q.end > q.start),
  };
};

const makeAnchorItem = (rec, viewId, hiddenAddress = false, pageTable = false, maxRead = READ_MAX, cover = false, coverMax = COVER_MAX) => {
  const info = makeUserLines(rec);
  if (!info || info.displayable.length === 0) return null;
  const indices = userLevelIndices(info, 0);
  const rendered = renderQuotedLines("A", rec, info, indices, viewId, { hiddenAddress, pageTable, maxRead, cover, coverMax });
  return {
    unitId: `A:${rec.n}`,
    kind: "A",
    order: rec.n,
    rec,
    text: rendered.text,
    quotes: rendered.quotes,
    cost: rendered.text.length + 1,
    info,
    indices,
  };
};

const refText = (refs) => {
  const call = refs?.callRef;
  const result = refs?.resultRef;
  if (call == null && result == null) return "no record ref";
  const parts = [];
  if (call != null) parts.push(`#${call}`);
  if (result != null && result !== call) parts.push(`result #${result}`);
  return parts.join("; ");
};

const makeErrorItem = (row, index) => {
  const refs = refText(row.refs);
  const nested = row.nestedIndex != null ? ` nested:${row.nestedIndex}` : "";
  const raw = String(row.raw ?? "").split("\n")[0].slice(0, 120);
  const text = `E error tool=${row.tool}${nested} {${refs}}${raw ? ` "${raw}"` : ""}`;
  const quote = raw ? findLiteralSpan(row.resultRec ?? row.rec, raw) : null;
  return {
    unitId: `E:${index}`,
    kind: "EC",
    order: row.refs?.resultRef ?? row.refs?.callRef ?? 0,
    text,
    cost: text.length + 1,
    quotes: quote ? [{ rec: row.resultRec ?? row.rec, ...quote }] : [],
    row,
  };
};

const makeCounterItem = (row, index, { counterValue = true } = {}) => {
  const refs = refText(row.refs);
  const command = row.command ? ` ${String(row.command).slice(0, 80)}:` : "";
  const text = counterValue
    ? `C${command} ${row.pass} pass / ${row.fail} fail {${refs}; ${row.field}@${row.offset}}`
    : `C${command} value omitted {${refs}; ${row.field}@${row.offset}}; read the result`;
  const quote = row.resultRec ? findFieldSpan(row.resultRec, row.field, row.raw) : null;
  return {
    unitId: `C:${index}`,
    kind: "EC",
    order: row.refs?.resultRef ?? row.refs?.callRef ?? 0,
    text,
    cost: text.length + 1,
    quotes: quote ? [{ rec: row.resultRec, ...quote }] : [],
    row,
  };
};

const makeOperationItem = (row, index) => {
  const refs = row.refs.slice(0, MAX_REFS_PER_ROW).map((r) => refText(r));
  const firstRef = row.refs[0];
  const more = row.refs.length > MAX_REFS_PER_ROW ? `; +${row.refs.length - MAX_REFS_PER_ROW} more refs` : "";
  const error = row.errorRefs.length > 0 ? " {error observed}" : "";
  const origin = row.origin === "host" ? " (host aggregate; no record ref)" : "";
  const text = row.origin === "host"
    ? `O host ${row.op} ${row.path}${origin}`
    : `O ${row.op} ${row.path}${row.count > 1 ? ` x${row.count}` : ""} (${refs.join("; ")}${more})${error}`;
  const quotes = [];
  if (row.origin !== "host") {
    // The literal path is shown from the call's argument field, or from the
    // nested-call argument field on the outer result record. A nested call's
    // arguments live on the result record; a direct call's on the call record.
    const rec = firstRef?.nestedIndex != null ? firstRef?.resultRec : firstRef?.callRec;
    if (rec) {
      const span = findLiteralSpan(rec, row.path);
      if (span) quotes.push({ rec, ...span });
    }
  }
  return {
    unitId: `O:${index}`,
    kind: "O",
    order: row.refs[0]?.callRef ?? Number.MAX_SAFE_INTEGER,
    text,
    cost: text.length + 1,
    quotes,
    row,
  };
};

const legacyCoverText = (catalog, counts) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const rec of catalog.E) {
    if (rec.live) continue;
    if (rec.n < min) min = rec.n;
    if (rec.n > max) max = rec.n;
  }
  if (!Number.isFinite(min)) { min = 0; max = 0; }
  const liveStart = counts.saved - counts.live;
  return `[History] saved #0-#${counts.saved - 1}; brief covers #${min}-#${max}; #${liveStart}-#${counts.saved - 1} live. recall range:[0,${counts.saved - 1}]`;
};

const coverText = (catalog, counts, viewId, mode = "exact") => {
  if (mode === "none") return "";
  if (mode === "legacy") return legacyCoverText(catalog, counts);
  const x = counts.xByReason ?? {};
  const xParts = [];
  for (const [key, label] of [
    ["system", "system"],
    ["off-branch", "branch"],
    ["context-edit-excluded", "edit"],
    ["policy-excluded", "policy"],
    ["not-effective", "other"],
  ]) {
    if ((x[key] ?? 0) > 0) xParts.push(`${label}=${x[key]}`);
  }
  const custom = counts.custom > 0 ? ` custom=${counts.custom}${counts.customExcluded > 0 ? `{excluded=${counts.customExcluded}}` : ""}` : "";
  const savedRange = counts.saved > 0 ? ` (#0-#${counts.saved - 1})` : "";
  return `[Index] r=${catalog.refSpace} s=${catalog.snapshot.prefixDigest.slice(0, 8)} saved=${counts.saved}${savedRange} E=${counts.effective} live=${counts.live} quoted=${counts.quoted} indexOnly=${counts.indexOnly} unavail=${counts.unavailable} X=${counts.x}${xParts.length ? `{${xParts.join(",")}}` : ""}${custom} view=${viewId}`;
};

const assignStatuses = (catalog, quoted, candidates) => {
  const E = catalog.E.map((rec) => {
    if (rec.status === "Unavailable") return { ...rec, status: "Unavailable", reason: "source-unavailable" };
    if (rec.live) return { ...rec, status: "Live", reason: undefined };
    const spans = quoted.get(rec.entryId)?.spans ?? [];
    if (spans.length > 0) return { ...rec, status: "Quoted", reason: undefined, spans };
    let reason = "unselected";
    if (!rec.fields.some((f) => f.text.trim().length > 0)) reason = "noise-filter";
    else if (candidates.has(rec.entryId)) {
      const info = makeUserLines(rec);
      if (info && info.displayable.length === 0) reason = "oversize-line";
      else reason = "budget";
    }
    return { ...rec, status: "IndexOnly", reason, spans: [] };
  });
  return E;
};

const buildManifestEntries = (catalog, E) => {
  return E.map((rec) => {
    const sourceFields = rec.fields.map((f) => {
      const spans = (rec.spans ?? []).filter((s) => s.field === f.path).sort((a, b) => a.start - b.start);
      const hidden = [];
      let cursor = 0;
      for (const span of spans) {
        if (span.start > cursor) hidden.push({ field: f.path, start: cursor, end: span.start });
        cursor = Math.max(cursor, span.end);
      }
      if (cursor < f.text.length) hidden.push({ field: f.path, start: cursor, end: f.text.length });
      return { field: f.path, length: f.text.length, shown: spans.map(({ field, start, end, revision }) => ({ field, start, end, ...(revision ? { revision } : {}) })), hidden };
    });
    const shownChars = (rec.spans ?? []).reduce((sum, s) => sum + (s.end - s.start), 0);
    return {
      n: rec.n,
      entryId: rec.entryId,
      role: rec.role,
      status: rec.status,
      ...(rec.reason ? { reason: rec.reason } : {}),
      ...(rec.revisionEntryId ? { revision: rec.revisionEntryId } : {}),
      sourceChars: rec.sourceChars,
      shownChars,
      ...(rec.status === "Quoted" ? { fields: sourceFields } : {}),
    };
  });
};

const renderFromSelection = ({ catalog, selected, viewId, capChars, neededChars, candidates, fixedNote, coverMode = "exact" }) => {
  const quoted = new Map();
  for (const item of selected) {
    for (const q of item.quotes ?? []) addSpan(quoted, q.rec, q.field, q.start, q.end);
  }
  const E = assignStatuses(catalog, quoted, candidates);
  const counts = {
    saved: catalog.I.filter((r) => r.n !== null).length,
    effective: E.length,
    live: E.filter((r) => r.status === "Live").length,
    quoted: E.filter((r) => r.status === "Quoted").length,
    indexOnly: E.filter((r) => r.status === "IndexOnly").length,
    unavailable: E.filter((r) => r.status === "Unavailable").length,
    x: catalog.X.length,
    xByReason: catalog.X.reduce((acc, r) => { acc[r.reason] = (acc[r.reason] ?? 0) + 1; return acc; }, {}),
    custom: catalog.custom.length,
    customExcluded: catalog.custom.filter((r) => r.excluded).length,
    blocks: catalog.blocks,
    unaccounted: E.filter((r) => !["Live", "Quoted", "IndexOnly", "Unavailable"].includes(r.status)).length,
  };
  const cover = coverText(catalog, counts, viewId, coverMode);
  const timelineItems = [...selected].sort((a, b) => a.order - b.order || String(a.unitId).localeCompare(String(b.unitId)));
  // Items are created with the fixed-width placeholder id; substitute the real
  // id after the selection hash is known. The substitution keeps byte length.
  const timeline = timelineItems
    .map((item) => String(item.text).replaceAll("v00000000", viewId))
    .filter(Boolean)
    .join("\n");
  const parts = [cover, fixedNote, timeline ? `[Timeline]\n${timeline}` : ""].filter(Boolean);
  const fixed = parts.join("\n");
  const manifest = {
    schemaVersion: 3,
    id: viewId,
    source: { refSpace: catalog.refSpace, snapshot: catalog.snapshot },
    counts,
    cost: {
      capChars,
      neededChars,
      usedChars: fixed.length,
      fixedChars: cover.length + fixedNote.length + (timeline ? "[Timeline]\n".length + 1 : 0),
    },
    entries: buildManifestEntries(catalog, E),
    custom: catalog.custom.map((c) => ({ entryId: c.entryId, customType: c.customType, excluded: c.excluded, status: c.status, reason: c.reason })),
  };
  return { text: fixed, manifest, counts, entries: E };
};

const viewIdFor = (catalog, selected) => {
  const selection = selected.map((item) => ({
    unit: item.unitId,
    order: item.order,
    text: item.text,
    quotes: (item.quotes ?? []).map((q) => [q.rec.entryId, q.field, q.start, q.end]),
  }));
  return `v${shortHash(canonicalJson({
    schema: 3,
    refSpace: catalog.refSpace,
    snapshot: catalog.snapshot,
    selection,
  }), 8)}`;
};

export const buildView = (catalog, options = {}) => {
  const ctxTokens = options.ctxTokens ?? 410462;
  const c = options.charsPerToken ?? CHARS_PER_TOKEN;
  const budget = budgetFor(catalog.blocks, ctxTokens, c);
  const capChars = options.capChars ?? budget.capChars;
  const coverMode = options.coverMode ?? "exact";
  const pageTable = options.pageTable ?? false;
  const maxRead = options.maxRead ?? READ_MAX;
  const cover = options.cover ?? false;
  const coverMax = options.coverMax ?? COVER_MAX;
  const hiddenAddress = (options.hiddenAddress ?? false) || pageTable;
  const userMode = options.userMode ?? "auto";
  const counterValue = options.counterValue ?? true;
  const includeCounters = options.includeCounters ?? true;
  const liveN = new Set(catalog.E.filter((r) => r.live).map((r) => r.n));
  const placeholderId = "v00000000";

  // Candidate observations: live rows stay in the retained tail, not in the view.
  const errors = catalog.observations.errors
    .filter((row) => !liveN.has(row.refs?.resultRef ?? -1) && !liveN.has(row.refs?.callRef ?? -1))
    .filter((row) => {
      const rec = catalog.E.find((r) => r.n === row.refs?.resultRef) ?? catalog.E.find((r) => r.n === row.refs?.callRef);
      if (rec) row.resultRec = rec;
      return true;
    });
  const counters = catalog.observations.counters
    .filter((row) => !liveN.has(row.refs?.resultRef ?? -1))
    .filter((row) => {
      const rec = catalog.E.find((r) => r.n === row.refs?.resultRef);
      if (rec) row.resultRec = rec;
      return true;
    });
  const operations = catalog.observations.operations
    .filter((row) => !row.refs.some((r) => liveN.has(r.callRef) || liveN.has(r.resultRef)))
    .map((row) => {
      for (const ref of row.refs) {
        const callRec = catalog.E.find((r) => r.n === ref.callRef);
        const resultRec = catalog.E.find((r) => r.n === ref.resultRef);
        ref.callRec = callRec;
        ref.resultRec = resultRec;
      }
      return row;
    });
  const hostOperations = catalog.observations.hostOperations;

  const userRecs = catalog.E.filter((r) => r.status !== "Unavailable" && !r.live && r.role === "user");
  const userItemRecs = userMode === "none-first" ? userRecs.slice(1) : userRecs;
  const assistantRecs = catalog.E.filter((r) => r.status !== "Unavailable" && !r.live && r.role === "assistant");
  const firstUser = userRecs[0];

  const userItems = new Map();
  const userFullItems = new Map();
  for (const rec of userItemRecs) {
    const useChar = userMode === "char" && rec === firstUser;
    const useLine = userMode === "line";
    const coreItem = useChar
      ? makeCharUserItem(rec, placeholderId, 1020, hiddenAddress, pageTable, maxRead)
      : makeUserItem(rec, useLine ? 4 : 0, placeholderId, hiddenAddress, pageTable, maxRead, cover, coverMax);
    const fullItem = useChar ? coreItem : useLine ? coreItem : makeUserItem(rec, "full", placeholderId);
    userFullItems.set(rec.entryId, fullItem);
    userItems.set(rec.entryId, coreItem);
  }

  const errorItems = errors.map(makeErrorItem);
  const counterItems = includeCounters ? counters.map((row, i) => makeCounterItem(row, i, { counterValue })) : [];
  const operationItems = [...operations.map(makeOperationItem), ...hostOperations.map(makeOperationItem)];

  // Optional assistant anchors: one per non-live user turn, alternating first/last
  // assistant text before the next user turn; total target <= 800 chars.
  const anchorItems = [];
  let anchorChars = 0;
  for (let turn = 0; turn < userRecs.length; turn++) {
    const user = userRecs[turn];
    const next = userRecs[turn + 1];
    const between = assistantRecs.filter((r) => r.n > user.n && (!next || r.n < next.n));
    const textual = between.filter((r) => r.fields.some((f) => f.path === "content" || f.path.endsWith(".text")));
    if (textual.length === 0) continue;
    const rec = turn % 2 === 0 ? textual[textual.length - 1] : textual[0];
    const item = makeAnchorItem(rec, placeholderId, hiddenAddress, pageTable, maxRead, cover, coverMax);
    if (!item) continue;
    if (anchorChars + item.cost > ANCHOR_BUDGET) continue;
    anchorItems.push(item);
    anchorChars += item.cost;
  }

  const candidates = new Set([
    ...userItemRecs.map((r) => r.entryId),
    ...anchorItems.map((i) => i.rec.entryId),
    ...errors.map((r) => r.resultRec?.entryId).filter(Boolean),
    ...counters.map((r) => r.resultRec?.entryId).filter(Boolean),
    ...operationItems.flatMap((i) => (i.quotes ?? []).map((q) => q.rec.entryId)),
  ]);

  const allItems = [
    ...[...userFullItems.values()],
    ...errorItems,
    ...counterItems,
    ...operationItems,
    ...anchorItems,
  ].sort((a, b) => a.order - b.order || String(a.unitId).localeCompare(String(b.unitId)));

  const buildWith = (selected, cap, needed) => {
    const id = viewIdFor(catalog, selected);
    return renderFromSelection({
      catalog,
      selected,
      viewId: id,
      capChars: cap,
      neededChars: needed,
      candidates,
      fixedNote: NOTE,
      coverMode,
    });
  };

  // needed = the complete candidate set (full user text, all observations and
  // anchors), not "whatever the budget can generate".
  const neededResult = buildWith(allItems, capChars, 0);
  const neededChars = neededResult.text.length;
  const B = Math.min(capChars, neededChars);

  if (neededChars <= capChars) {
    const final = buildWith(allItems, capChars, neededChars);
    return { ...final, budget, neededChars, capChars, usedChars: final.text.length };
  }

  const fixedBase = coverText(catalog, catalog.counts, placeholderId, coverMode).length + NOTE.length;
  const sum = (items) => items.reduce((acc, item) => acc + item.cost, 0);
  const fullUserItems = userItemRecs.map((r) => userFullItems.get(r.entryId));
  const fullUserFits = fixedBase + sum(fullUserItems) <= B;

  const selected = [];
  const selectedKeys = new Set();
  const add = (item) => {
    if (!item || selectedKeys.has(item.unitId)) return false;
    selected.push(item);
    selectedKeys.add(item.unitId);
    return true;
  };

  let used = fixedBase;
  let blocked = false;
  const tryGroup = (items, allowPartial = false) => {
    let all = true;
    for (const item of items) {
      if (used + item.cost <= B) {
        add(item);
        used += item.cost;
      } else {
        all = false;
        if (!allowPartial) { blocked = true; break; }
      }
    }
    return all;
  };

  if (fullUserFits) {
    tryGroup(fullUserItems);
  } else {
    // One whole-line core per user message first: every turn gets a visible
    // quote before any turn gets more depth. A message whose only lines are
    // oversized still gets an IndexOnly entry, not a character cut.
    tryGroup(userItemRecs.map((r) => userItems.get(r.entryId)), true);
  }
  if (!blocked) tryGroup(errorItems);
  if (!blocked) tryGroup(counterItems);
  if (!blocked) tryGroup(operationItems);

  // U depth uses only leftover budget, and only after the ledger groups have
  // been offered the budget; this prevents one long message from starving all
  // operation rows. Each upgrade replaces that record's current quote.
  if (!blocked && !fullUserFits && userMode === "auto") {
    const levels = new Map(userItemRecs.map((r) => [r.entryId, 0]));
    const maxLevels = new Map(userItemRecs.map((r) => [r.entryId, Math.max(0, (userItems.get(r.entryId).info?.displayable.length ?? 0) - 1)]));
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const rec of userItemRecs) {
        const current = levels.get(rec.entryId);
        const max = maxLevels.get(rec.entryId);
        if (current >= max) continue;
        const prevItem = current === 0 ? userItems.get(rec.entryId) : makeUserItem(rec, current, placeholderId, hiddenAddress, pageTable, maxRead, cover, coverMax);
        const nextItem = makeUserItem(rec, current + 1, placeholderId, hiddenAddress, pageTable, maxRead, cover, coverMax);
        if (!nextItem || nextItem.cost <= prevItem.cost) continue;
        const delta = nextItem.cost - prevItem.cost;
        if (used + delta > B) continue;
        const index = selected.findIndex((item) => item.unitId === prevItem.unitId);
        if (index >= 0) selected.splice(index, 1);
        selectedKeys.delete(prevItem.unitId);
        add(nextItem);
        used += delta;
        levels.set(rec.entryId, current + 1);
        progressed = true;
      }
    }
  }

  if (!blocked) tryGroup(anchorItems);

  // Build, then trim from the lowest priority if the final cover/count widths
  // pushed the exact byte count over the cap.
  let result = buildWith(selected, capChars, neededChars);
  const dropOrder = [...selected].sort((a, b) => {
    const rank = (item) => item.kind === "A" ? 4 : item.kind === "O" ? 3 : item.kind === "EC" ? 2 : 1;
    return rank(b) - rank(a) || b.order - a.order;
  });
  let dropIndex = 0;
  while (result.text.length > B && dropIndex < dropOrder.length) {
    const victim = dropOrder[dropIndex++];
    const index = selected.findIndex((item) => item.unitId === victim.unitId);
    if (index >= 0) selected.splice(index, 1);
    result = buildWith(selected, capChars, neededChars);
  }

  return { ...result, budget, neededChars, capChars, usedChars: result.text.length };
};

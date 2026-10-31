// Minimal reader used by the prototype experiments. The production reader must
// stream the session and enforce the same policy; this prototype works on the
// already-built catalog so the protocol and failure modes can be tested.

import { fieldsOfMessage, primaryTextField } from "./catalog.mjs";
import { CHARS_PER_TOKEN, COVER_MAX, PAGE_CHARS, READ_MAX } from "./render.mjs";

const READ_DEFAULT = PAGE_CHARS;
const VIEW_PAGE = 20;
const SCAN_PAGE = 8;

const lineStarts = (text) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") starts.push(i + 1);
  return starts;
};

const largestRun = (runs) =>
  runs.reduce((best, run) => (run.end - run.start > best.end - best.start ? run : best), runs[0]);

export const pageStartsFor = (run) => {
  const starts = [];
  for (let at = run.start; at < run.end; at += PAGE_CHARS) starts.push(at);
  return starts;
};

// Hidden runs come from the view manifest for Quoted entries and from the
// saved record for IndexOnly entries (the whole record is unshown). Every run
// carries a read call the reader itself can execute.
export const hiddenRunsOf = (catalog, entry) => {
  if (entry.status === "Quoted" && entry.fields) {
    const runs = [];
    for (const field of entry.fields) {
      const rec = catalog.E.find((r) => r.n === entry.n);
      const text = rec?.fields.find((f) => f.path === field.field)?.text ?? "";
      const shown = [...field.shown].sort((a, b) => a.start - b.start);
      const gaps = [];
      let cursor = 0;
      for (const span of shown) {
        if (span.start > cursor) gaps.push([cursor, span.start]);
        cursor = Math.max(cursor, span.end);
      }
      if (cursor < field.length) gaps.push([cursor, field.length]);
      // A gap that holds only line breaks/whitespace separates quoted lines;
      // it is not hidden content, so it gets no address. Edge whitespace is
      // trimmed so the address matches the line start shown by the U marker.
      for (const [rawStart, rawEnd] of gaps) {
        let start = rawStart;
        let end = rawEnd;
        while (start < end && /\s/.test(text[start])) start += 1;
        while (end > start && /\s/.test(text[end - 1])) end -= 1;
        if (end <= start) continue;
        runs.push({ field: field.field, start, end, total: field.length });
      }
    }
    const isText = (path) => path === "content" || path.endsWith(".text");
    return runs.sort((a, b) => (isText(b.field) ? 1 : 0) - (isText(a.field) ? 1 : 0) || a.start - b.start);
  }
  if (entry.status === "IndexOnly") {
    const rec = catalog.E.find((r) => r.n === entry.n);
    const primary = rec ? primaryTextField(rec.message) : null;
    if (!primary) return [];
    const extraFields = Math.max(0, (rec.fields?.length ?? 1) - 1);
    return [{ field: primary.path, start: 0, end: primary.text.length, total: primary.text.length, extraFields }];
  }
  return [];
};

export const hiddenRunsFor = (catalog, view, n) => {
  const entry = view.manifest.entries.find((e) => e.n === n);
  return entry ? hiddenRunsOf(catalog, entry) : [];
};

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  if (!Number.isInteger(n)) return fallback;
  return Math.max(min, Math.min(max, n));
};

const fieldOf = (rec, path) => {
  if (!path) return primaryTextField(rec.message);
  return rec.fields.find((f) => f.path === path);
};

const manifestOf = (view, n) => view.manifest.entries.find((e) => e.n === n);

const statusOf = (view, n) => manifestOf(view, n)?.status;

const policyReason = (catalog, n) => {
  const x = catalog.X.find((r) => r.n === n);
  return x?.reason;
};

const visibleForScan = (catalog, view, scope) => {
  if (scope === "all") {
    return catalog.E.filter((r) => !r.unavailable);
  }
  return catalog.E.filter((r) => {
    const status = statusOf(view, r.n);
    return status && status !== "Unavailable";
  });
};

const scanHits = (catalog, view, query, scope) => {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return { error: "scan requires a non-empty query." };
  const records = visibleForScan(catalog, view, scope);
  const hits = [];
  let fieldsSearched = 0;
  for (const rec of records) {
    for (const field of rec.fields) {
      fieldsSearched += 1;
      const hay = field.text.toLowerCase();
      let at = 0;
      while (at <= hay.length) {
        const index = hay.indexOf(q, at);
        if (index < 0) break;
        const start = Math.max(0, index - 120);
        const end = Math.min(field.text.length, index + q.length + 120);
        hits.push({
          n: rec.n,
          role: rec.role,
          field: field.path,
          offset: index,
          snippet: `${start > 0 ? "..." : ""}${field.text.slice(start, end).replace(/\n/g, " ").trim()}${end < field.text.length ? "..." : ""}`,
        });
        at = index + Math.max(1, q.length);
      }
    }
  }
  return { hits, fieldsSearched, records: records.length };
};

export const createReader = ({ catalog, view, legacy = false, hiddenAddress = false, pageTable = false, maxRead = READ_MAX, cover = false, coverMax = COVER_MAX }) => {
  const showAddress = hiddenAddress || pageTable;
  const runsOf = (entry) => hiddenRunsOf(catalog, entry);
  const hiddenText = (entry) => {
    if (!showAddress) return "";
    const runs = runsOf(entry);
    if (runs.length === 0) return "";
    const listed = runs.slice(0, 2);
    const spans = listed.map((r) => `field ${r.field} ${r.start}-${r.end} of ${r.total}`).join(", ");
    const calls = listed
      .map((r) => {
        const span = r.end - r.start;
        if (!pageTable || span <= PAGE_CHARS) {
          return `read: ${JSON.stringify({ read: entry.n, field: r.field, offset: r.start, length: PAGE_CHARS })}`;
        }
        const starts = pageStartsFor(r);
        const head = starts.slice(0, 12);
        const morePages = starts.length > head.length
          ? `,+${starts.length - head.length} more (last@${starts[starts.length - 1]})`
          : "";
        const length = Math.min(maxRead, span);
        const coverText = cover && span > maxRead
          ? `; cover: ${JSON.stringify({ read: entry.n, field: r.field, offset: r.start, cover: true })} ~${Math.ceil(Math.min(coverMax, span) / CHARS_PER_TOKEN)}tok`
          : "";
        return `span=${span} pages=${starts.length} windows=${Math.ceil(span / maxRead)}; pages@${head.join(",")}${morePages}; max: ${JSON.stringify({ read: entry.n, field: r.field, offset: r.start, length })} ~${Math.ceil(length / CHARS_PER_TOKEN)}tok; page: ${JSON.stringify({ read: entry.n, field: r.field, page: Math.min(2, starts.length) })}${coverText}`;
      })
      .join(" ");
    const more = runs.length > listed.length ? ` +${runs.length - listed.length} more hidden run${runs.length - listed.length === 1 ? "" : "s"}` : "";
    const extra = runs[0].extraFields > 0 ? `; ${runs[0].extraFields + 1} fields, field= selects another` : "";
    return ` hidden=${spans}${more}; ${calls}${extra}`;
  };
  const run = (args = {}) => {
    const viewId = args.view;
    if (viewId && viewId !== view.manifest.id) {
      return `view ${viewId} is not this view (${view.manifest.id}); re-open the view.`;
    }
    if (args.read !== undefined) {
      const payload = typeof args.read === "object" && args.read !== null ? { ...args.read } : { index: args.read };
      for (const key of ["field", "offset", "length", "page", "line", "revision", "scope", "cover"]) {
        if (args[key] !== undefined) payload[key] = args[key];
      }
      return read(payload);
    }
    if (args.range !== undefined) return range(args);
    if (args.scan !== undefined) return scan(args);
    if (args.touched !== undefined) return touched(args);
    return viewPage(args);
  };

  const viewPage = (args) => {
    const status = args.status ? String(args.status) : undefined;
    let entries = view.manifest.entries;
    if (status) entries = entries.filter((e) => e.status === status);
    const offset = clampInt(args.offset, 0, Math.max(0, entries.length), 0);
    const limit = clampInt(args.limit, 1, VIEW_PAGE, VIEW_PAGE);
    const page = entries.slice(offset, offset + limit);
    const lines = page.map((e) => {
      const ref = e.n == null ? `e:${e.entryId}` : `#${e.n}`;
      const spans = e.status === "Quoted" && e.fields
        ? ` spans=${e.fields.flatMap((f) => f.shown.map((s) => `${s.field}:${s.start}-${s.end}`)).join(",")}`
        : "";
      return `${ref} ${e.status} ${e.role} src=${e.sourceChars} shown=${e.shownChars}${e.reason ? ` reason=${e.reason}` : ""}${spans}${hiddenText(e)}`;
    });
    const end = offset + page.length;
    const more = end < entries.length ? ` next={"view":"${view.manifest.id}","offset":${end}${status ? `,"status":"${status}"` : ""}}` : " end of view";
    const custom = offset === 0 && !status && view.manifest.custom.length > 0
      ? `\ncustom: ${view.manifest.custom.map((c) => `${c.entryId}(${c.customType},${c.status})`).join(" ")}`
      : "";
    return `VIEW ${view.manifest.id} ${offset}-${end} of ${entries.length}${custom}\n${lines.join("\n")}${more}`;
  };

  const read = (payload) => {
    const raw = payload.index !== undefined
      ? payload
      : typeof payload.read === "number"
        ? { index: payload.read }
        : payload.read;
    const n = Number(raw.index);
    if (!Number.isInteger(n) || n < 0) return "read.index must be a #N number.";
    const entry = catalog.E.find((r) => r.n === n);
    if (!entry) {
      const x = catalog.X.find((r) => r.n === n);
      if (!x) return `#${n} is not in this saved history.`;
      if (x.reason === "policy-excluded") return `#${n} is not readable under the current policy.`;
      if (raw.scope !== "all") return `#${n} is ${x.reason}; use scope:"all" to read the original saved record explicitly.`;
      const msg = catalog.entryById.get(x.entryId)?.message;
      if (!msg) return `#${n} is unavailable (source record missing).`;
      return formatRead(n, msg.role, fieldsOfMessage(msg), raw, null);
    }
    const status = statusOf(view, n);
    if (!status) return `#${n} is not in view ${view.manifest.id}.`;
    if (status === "Unavailable") return `#${n} is unavailable (source record missing or unreadable).`;
    const xReason = policyReason(catalog, n);
    if (xReason === "policy-excluded") return `#${n} is not readable under the current policy.`;
    const useRevision = Boolean(raw.revision && entry.revisionEntryId && String(raw.revision) === entry.revisionEntryId);
    const fields = useRevision
      ? entry.fields
      : fieldsOfMessage(catalog.entryById.get(entry.entryId)?.message ?? entry.message);
    return formatRead(n, entry.role, fields, raw, view.manifest.entries.find((e) => e.n === n) ?? null);
  };

  const formatRead = (n, role, fields, raw, viewEntry = null) => {
    const field = raw.field
      ? fields.find((f) => f.path === raw.field)
      : (fields.find((f) => f.path === "content") ?? fields.find((f) => f.path.endsWith(".text")) ?? fields[0]);
    if (!field) {
      const paths = fields.map((f) => `"${f.path}"`).join(", ");
      const requested = raw.field
        ? `field ${JSON.stringify(raw.field)} is not in #${n}`
        : `#${n} has no text fields`;
      return `${requested}; available fields: ${paths || "(none)"}.`;
    }
    const hasPage = raw.page !== undefined && raw.page !== null;
    const hasLine = raw.line !== undefined && raw.line !== null;
    const wantsCover = raw.cover === true;
    if (hasPage && hasLine) return "read error: page and line are mutually exclusive.";
    if (wantsCover && (hasPage || hasLine)) {
      return "read error: cover cannot be combined with page or line; cover starts at offset.";
    }
    if (wantsCover && raw.length !== undefined && raw.length !== null) {
      return "read error: cover and length are mutually exclusive; cover is bounded by the host coverMax.";
    }
    if ((hasPage || hasLine) && raw.offset !== undefined) {
      return "read error: use offset, or page/line, not both.";
    }
    const runs = viewEntry ? runsOf(viewEntry) : [];
    let offset = 0;
    let defaultLength = READ_DEFAULT;
    if (wantsCover) {
      // The merged cover read: consecutive windows in ONE result, bounded by
      // coverMax, with the total length charged once. It is not a bigger read
      // window; the result is assembled server-side from the same pages.
      const target = runs.find((r) => r.field === field.path && (raw.offset === undefined || (raw.offset >= r.start && raw.offset < r.end)));
      const start = raw.offset !== undefined
        ? clampInt(raw.offset, 0, field.text.length, 0)
        : (target?.start ?? 0);
      if (start >= field.text.length) {
        return `offset ${start} is outside 0-${field.text.length} of field ${JSON.stringify(field.path)}.`;
      }
      const runEnd = target ? Math.min(target.end, field.text.length) : field.text.length;
      const end = Math.min(runEnd, start + coverMax);
      const text = field.text.slice(start, end);
      const chars = end - start;
      const windows = Math.ceil(chars / maxRead);
      const unread = runEnd - end;
      const head = `#${n} [${role}] field=${field.path} ${start}-${end} of ${field.text.length} (cover: ${windows} window${windows === 1 ? "" : "s"} merged, hidden span ${target ? `${target.start}-${target.end}` : `${start}-${runEnd}`})`;
      const cost = `[cost ${chars} chars ~${Math.ceil(chars / CHARS_PER_TOKEN)}tok; hidden span ${target ? target.start : start}-${runEnd}, unread ${unread}]`;
      const tail = unread > 0
        ? `[cover incomplete: ${chars} of ${runEnd - start} chars; next: read #${n} field="${field.path}" offset=${end} length=${maxRead}]`
        : `[end of hidden span; field continues to ${field.text.length}]`;
      return `${head}\n${text}\n${cost}\n${tail}`;
    }
    if (hasPage) {
      const run = largestRun(runs.filter((r) => r.field === field.path));
      if (!run) {
        return `#${n} has no hidden span in field ${JSON.stringify(field.path)}; use offset.`;
      }
      const pages = Math.ceil((run.end - run.start) / PAGE_CHARS);
      const page = Number(raw.page);
      if (!Number.isInteger(page) || page < 1 || page > pages) {
        return `page ${raw.page} is outside 1-${pages} for this hidden span; last page starts at ${run.start + (pages - 1) * PAGE_CHARS}.`;
      }
      offset = run.start + (page - 1) * PAGE_CHARS;
      defaultLength = PAGE_CHARS;
    } else if (hasLine) {
      const starts = lineStarts(field.text);
      const line = Number(raw.line);
      if (!Number.isInteger(line) || line < 1 || line > starts.length) {
        return `line ${raw.line} is outside 1-${starts.length} of field ${JSON.stringify(field.path)}.`;
      }
      offset = starts[line - 1];
      defaultLength = PAGE_CHARS;
    } else {
      offset = clampInt(raw.offset, 0, field.text.length, 0);
    }
    const length = clampInt(raw.length, 1, maxRead, defaultLength);
    const end = Math.min(field.text.length, offset + length);
    const text = field.text.slice(offset, end);
    const cost = (() => {
      if (!pageTable) return "";
      const chars = end - offset;
      const tok = Math.ceil(chars / CHARS_PER_TOKEN);
      const run = runs.find((r) => r.field === field.path && offset >= r.start && offset < r.end);
      const span = run ? `; hidden span ${run.start}-${run.end}, unread ${Math.max(0, run.end - end)}` : "";
      return `[cost ${chars} chars ~${tok}tok${span}]`;
    })();
    const next = end < field.text.length
      ? `\n[next: read #${n} field="${field.path}" offset=${end} length=${length}]`
      : "\n[end of field]";
    return `#${n} [${role}] field=${field.path} ${offset}-${end} of ${field.text.length}\n${text}${cost ? `\n${cost}` : ""}${next}`;
  };

  const scan = (args) => {
    const scope = args.scope === "all" ? "all" : "view";
    const result = scanHits(catalog, view, args.scan, scope);
    if (result.error) return result.error;
    if (result.hits.length === 0) {
      return `no match for "${args.scan}" in ${scope} fields (${result.records} records, ${result.fieldsSearched} fields). This is a negative result for this range and policy, not proof of absence.`;
    }
    const requestedOffset = clampInt(args.offset, 0, Math.max(0, result.hits.length), 0);
    const hits = result.hits.slice(requestedOffset, requestedOffset + (legacy ? SCAN_PAGE : VIEW_PAGE));
    const lines = hits.map((h) => legacy
      ? `#${h.n} ...${h.snippet}...`
      : `#${h.n} ${h.role} field=${h.field}@${h.offset} ...${h.snippet}...\n  read: {"read":${h.n},"field":"${h.field}","offset":${Math.max(0, h.offset - 120)},"length":800}`);
    const nextOffset = requestedOffset + hits.length;
    const more = nextOffset < result.hits.length
      ? `\n[next: {"scan":"${args.scan}","scope":"${scope}","offset":${nextOffset}}]`
      : "\n[end of matches]";
    return `SCAN "${args.scan}" scope=${scope} hits=${result.hits.length}\n${lines.join("\n")}${more}`;
  };

  const range = (args) => {
    const pair = Array.isArray(args.range) ? args.range : [];
    const from = Number(pair[0]);
    const to = Number(pair[1]);
    if (!Number.isInteger(from) || !Number.isInteger(to)) return "range must be [from,to] with integers.";
    const role = args.role ? String(args.role) : undefined;
    const page = clampInt(args.page, 1, 1000000, 1);
    const all = catalog.E
      .filter((r) => r.n >= Math.min(from, to) && r.n <= Math.max(from, to))
      .filter((r) => !role || r.role === role)
      .sort((a, b) => a.n - b.n);
    const offset = (page - 1) * 20;
    const rows = all.slice(offset, offset + 20).map((r) => {
      const status = statusOf(view, r.n) ?? "IndexOnly";
      const preview = primaryTextField(r.message)?.text.slice(0, 120).replace(/\n/g, " ") ?? "";
      return `#${r.n} ${status} ${r.role} src=${r.sourceChars} ${preview}`;
    });
    const next = offset + rows.length < all.length ? `\n[next: page ${page + 1}]` : "\n[end of range]";
    return `RANGE ${Math.min(from, to)}-${Math.max(from, to)}${role ? ` role=${role}` : ""} ${all.length} records\n${rows.join("\n")}${next}`;
  };

  const touched = (args) => {
    const path = String(args.touched ?? "");
    if (!path) return "touched requires a literal path.";
    const mutations = catalog.observations.operations.filter((r) => r.path === path);
    const hosts = catalog.observations.hostOperations.filter((r) => r.path === path);
    const reads = catalog.observations.reads.filter((r) => r.path === path);
    if (mutations.length + hosts.length + reads.length === 0) {
      return `No recorded file operation for ${JSON.stringify(path)} in this snapshot. This is not evidence about the current working tree.`;
    }
    const lines = [];
    for (const row of mutations) {
      lines.push(`mutation ${row.op} ${row.path} x${row.count} refs=${row.refs.map((r) => `#${r.callRef}/result#${r.resultRef}`).join(",")}${row.errorRefs.length ? " error observed" : ""}`);
    }
    for (const row of hosts) lines.push(`host ${row.op} ${row.path} (aggregate, no record ref)`);
    for (const row of reads) lines.push(`read request ${row.tool} ${row.path}${row.refs?.callRef != null ? ` (#${row.refs.callRef})` : ""}`);
    return `TOUCHED ${path}\n${lines.join("\n")}\nRecorded operations only; this is not a current diff.`;
  };

  return { run };
};

// Legacy reader used only as a control in the experiments: page from the first
// character, no field path, no hit offset, wide snippets.
export const createLegacyReader = ({ catalog, view }) => {
  const fullView = (rec) => rec.fields.map((f) => `[${f.path}]\n${f.text}`).join("\n");
  const run = (args = {}) => {
    if (args.read !== undefined) {
      const n = Number(typeof args.read === "number" ? args.read : args.read.index);
      if (!Number.isInteger(n)) return "read needs a #N.";
      const rec = catalog.E.find((r) => r.n === n);
      if (!rec) return `#${n} is not in this history.`;
      const text = fullView(rec);
      const offset = Math.max(0, Math.min(Number(args.read.offset ?? 0) || 0, text.length));
      const slice = text.slice(offset, offset + 1600);
      const rest = text.length - offset - slice.length;
      return slice + (rest > 0 ? `\n[${rest} more chars; read #${n} offset ${offset + slice.length}]` : "");
    }
    if (args.scan !== undefined) {
      const q = String(args.scan).toLowerCase();
      const hits = [];
      for (const rec of catalog.E) {
        const raw = fullView(rec);
        const at = raw.toLowerCase().indexOf(q);
        if (at < 0) continue;
        hits.push(`#${rec.n} ...${raw.slice(Math.max(0, at - 120), at + 180).replace(/\n/g, " ")}...`);
        if (hits.length >= 8) break;
      }
      return hits.length ? hits.join("\n") : `no match in this history; empty result is not proof of absence.`;
    }
    if (args.range !== undefined) {
      const [a, b] = args.range;
      const lines = [];
      for (const rec of catalog.E) {
        if (rec.n < a || rec.n > b) continue;
        const raw = fullView(rec);
        lines.push(`#${rec.n} ${raw.slice(0, 1600)}${raw.length > 1600 ? `\n[${raw.length - 1600} more chars; read #${rec.n}]` : ""}`);
        if (lines.length >= 10) break;
      }
      return lines.join("\n") || "empty range";
    }
    if (args.view !== undefined) {
      return `${view.manifest.counts.saved} saved; use read/range/scan.`;
    }
    if (args.touched !== undefined) {
      return "touched is not available in this reader.";
    }
    return "unknown reader action.";
  };
  return { run };
};

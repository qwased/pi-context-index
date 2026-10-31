// Deterministic catalog, effective-history partition and observation ledger.
// This is a prototype for the design; it is not part of the published package.

import { createHash } from "node:crypto";

export const SELF_ECHO_TOOLS = new Set(["context_index", "vcc_recall"]);

const MUTATION_RE = /^(write|edit|multiedit|quick_edit|target_edit|apply_patch|patch|create)$/i;
const READ_RE = /^(read|glob|grep|ls|find|semantic_query|semantic_grep|semantic_show)$/i;
const SHELL_RE = /^(bash|shell|exec|run|terminal)$/i;

export const isMutationName = (name) => MUTATION_RE.test(String(name ?? ""));
export const isReadName = (name) => READ_RE.test(String(name ?? ""));
export const isShellName = (name) => SHELL_RE.test(String(name ?? ""));

export const canonicalJson = (value) => {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
};

export const sha256 = (text) => createHash("sha256").update(String(text), "utf8").digest("hex");
export const shortHash = (text, n = 8) => sha256(text).slice(0, n);

const textParts = (content) => {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  return content.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text);
};

export const textOf = (content) => textParts(content).join("\n");

const isSelfEchoMessage = (msg) => {
  if (msg?.role === "toolResult" && SELF_ECHO_TOOLS.has(String(msg.toolName ?? "").toLowerCase())) return true;
  if (msg?.role !== "assistant" || !Array.isArray(msg.content)) return false;
  const calls = msg.content.filter((p) => p && p.type === "toolCall");
  return calls.length > 0 && calls.every((p) => SELF_ECHO_TOOLS.has(String(p.name ?? "").toLowerCase()));
};

const pushFields = (out, prefix, value) => {
  if (typeof value === "string") {
    out.push({ path: prefix, text: value });
    return;
  }
  if (typeof value === "number" || typeof value === "boolean" || value === null) {
    out.push({ path: prefix, text: String(value) });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => pushFields(out, `${prefix}.${i}`, item));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) pushFields(out, `${prefix}.${key}`, nested);
  }
};

/**
 * Canonical saved-field view used by read/scan. Field paths are stable; text
 * fields are exact saved strings. Self-echo calls/results are excluded.
 */
export const fieldsOfMessage = (msg) => {
  if (!msg || isSelfEchoMessage(msg)) return [];
  const out = [];
  if (msg.role === "bashExecution") {
    out.push({ path: "command", text: String(msg.command ?? "") });
    out.push({ path: "output", text: String(msg.output ?? "") });
    if (msg.exitCode !== undefined) out.push({ path: "exitCode", text: String(msg.exitCode) });
    return out;
  }
  if (msg.role === "toolResult") {
    out.push({ path: "toolName", text: String(msg.toolName ?? "") });
    out.push({ path: "toolCallId", text: String(msg.toolCallId ?? "") });
    out.push({ path: "isError", text: String(Boolean(msg.isError)) });
  }
  const content = msg.content;
  if (typeof content === "string") {
    out.push({ path: "content", text: content });
  } else if (Array.isArray(content)) {
    content.forEach((part, i) => {
      if (!part || typeof part !== "object") return;
      if (part.type === "text" && typeof part.text === "string") {
        out.push({ path: `content.${i}.text`, text: part.text });
      } else if (part.type === "toolCall" && !SELF_ECHO_TOOLS.has(String(part.name ?? "").toLowerCase())) {
        out.push({ path: `content.${i}.name`, text: String(part.name ?? "") });
        out.push({ path: `content.${i}.id`, text: String(part.id ?? "") });
        pushFields(out, `content.${i}.arguments`, part.arguments ?? {});
      }
    });
  }
  const nested = msg.nestedCalls;
  if (nested && Array.isArray(nested.calls)) {
    nested.calls.forEach((call, i) => {
      out.push({ path: `nestedCalls.calls.${i}.name`, text: String(call.name ?? "") });
      out.push({ path: `nestedCalls.calls.${i}.status`, text: String(call.status ?? "") });
      out.push({ path: `nestedCalls.calls.${i}.id`, text: String(call.id ?? "") });
      pushFields(out, `nestedCalls.calls.${i}.arguments`, call.arguments ?? {});
      if (call.error) out.push({ path: `nestedCalls.calls.${i}.error`, text: String(call.error) });
    });
  }
  return out;
};

export const primaryTextField = (msg) => {
  const fields = fieldsOfMessage(msg);
  const preferred = fields.find((f) => f.path === "content") ??
    fields.find((f) => f.path.endsWith(".text") && !f.path.startsWith("nestedCalls"));
  return preferred ?? fields.find((f) => f.text.length > 0);
};

export const countBlocks = (messages) => {
  let blocks = 0;
  for (const msg of messages) {
    if (!msg) continue;
    if (msg.role === "user" || msg.role === "bashExecution") { blocks += 1; continue; }
    if (msg.role === "toolResult") { blocks += 1; continue; }
    if (msg.role === "assistant") {
      if (typeof msg.content === "string") { if (msg.content.trim()) blocks += 1; continue; }
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (!part || typeof part !== "object") continue;
          if (part.type === "text" && part.text?.trim()) blocks += 1;
          else if (part.type === "toolCall") blocks += 1;
        }
      }
    }
  }
  return blocks;
};

const cloneWithReplacement = (msg, replacement) => {
  if (msg.role === "bashExecution") return { ...msg, command: replacement };
  if (Array.isArray(msg.content)) {
    const textIndex = msg.content.findIndex((p) => p && p.type === "text");
    if (textIndex >= 0) {
      const content = msg.content.map((p, i) => i === textIndex ? { ...p, text: replacement } : p);
      return { ...msg, content };
    }
    return { ...msg, content: [{ type: "text", text: replacement }] };
  }
  return { ...msg, content: replacement };
};

const projectBranch = (branch, opts) => {
  const edits = new Map();
  for (const entry of branch) {
    if (entry.type === "context_edit" && typeof entry.targetId === "string") edits.set(entry.targetId, entry);
  }
  const effective = [];
  const deleted = new Set();
  const custom = [];
  for (const entry of branch) {
    if (entry.type === "message" && entry.message) {
      const edit = edits.get(entry.id);
      if (edit?.delete === true) {
        deleted.add(entry.id);
        continue;
      }
      if (edit && typeof edit.replacement === "string") {
        effective.push({
          entry,
          message: cloneWithReplacement(entry.message, edit.replacement),
          revision: edit,
        });
      } else {
        effective.push({ entry, message: entry.message });
      }
      continue;
    }
    if (entry.type === "custom_message" || entry.type === "branch_summary") {
      const customType = entry.customType ?? entry.type;
      const excluded = entry.type === "custom_message" && (opts.skipCustomTypes ?? []).includes(customType);
      custom.push({ entry, customType, excluded });
    }
  }
  return { effective, deleted, custom, hasEdits: edits.size > 0 };
};

const shouldExcludeMessage = (msg, id, opts) => {
  if (!msg) return "unavailable";
  if (msg.role === "system") return "system";
  if (msg.role === "bashExecution" && msg.excludeFromContext) return "context-edit-excluded";
  if ((opts.policy?.excludeEntryIds ?? []).includes(id)) return "policy-excluded";
  return undefined;
};

export const branchPath = (entries, headId) => {
  const byId = new Map(entries.map((e) => [e.id, e]));
  const path = [];
  let current = byId.get(headId);
  const seen = new Set();
  while (current && !seen.has(current.id)) {
    seen.add(current.id);
    path.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return path;
};

const parseCounters = (msg, meta) => {
  const rows = [];
  for (const field of fieldsOfMessage(msg)) {
    if (!field.path.endsWith(".text") && field.path !== "output") continue;
    const text = field.text;
    const patterns = [
      /(\d+)\s+pass(?:ed)?\s*[/,;]\s*(\d+)\s+fail(?:ed)?/gi,
      /(\d+)\s+passed[^\n]*?(\d+)\s+failed/gi,
      /Ran\s+(\d+)\s+tests?[^\n]*?(\d+)\s+fail(?:ed|ures?)?/gi,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(text)) !== null) {
        const pass = Number(match[1]);
        const fail = Number(match[2]);
        if (!Number.isFinite(pass) || !Number.isFinite(fail)) continue;
        const raw = match[0];
        rows.push({
          kind: "counter",
          pass,
          fail,
          raw,
          field: field.path,
          offset: match.index,
          value: `${pass} pass / ${fail} fail`,
          ...meta,
        });
      }
    }
  }
  const seen = new Set();
  return rows.filter((row) => {
    const key = `${row.pass}\0${row.fail}\0${row.field}\0${row.offset}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const extractDirectCalls = (msg) => {
  if (msg?.role !== "assistant" || !Array.isArray(msg.content)) return [];
  return msg.content
    .filter((p) => p && p.type === "toolCall" && !SELF_ECHO_TOOLS.has(String(p.name ?? "").toLowerCase()))
    .map((p) => ({ id: String(p.id ?? ""), name: String(p.name ?? ""), args: p.arguments ?? {} }));
};

export const extractObservations = (catalog) => {
  const E = catalog.E;
  const rows = [];
  const errors = [];
  const counters = [];
  const reads = [];
  const unsupported = [];
  const pending = new Map();
  const addMutation = (row) => rows.push(row);
  const addError = (row) => errors.push(row);
  const addRead = (row) => reads.push(row);
  const addCounter = (row) => counters.push(row);
  const addUnsupported = (row) => unsupported.push(row);

  for (const rec of E) {
    if (rec.status === "unavailable") continue;
    const msg = rec.message;
    const refs = { callRef: rec.n, resultRef: undefined };
    const directCalls = extractDirectCalls(msg);
    if (directCalls.length > 0) {
      for (const call of directCalls) {
        pending.set(call.id, { ...call, callRef: rec.n });
      }
      continue;
    }
    if (msg.role === "bashExecution") {
      const meta = { refs: { callRef: rec.n, resultRef: rec.n }, tool: "bashExecution" };
      if (msg.exitCode !== 0 && msg.exitCode !== undefined) {
        addError({ ...meta, raw: String(msg.output ?? msg.command ?? "").slice(0, 200), textOffset: 0, field: "output" });
      }
      for (const counter of parseCounters({ ...msg, role: "bashExecution" }, meta)) addCounter(counter);
      continue;
    }
    if (msg.role !== "toolResult") continue;

    const call = pending.get(String(msg.toolCallId ?? ""));
    if (call) pending.delete(String(msg.toolCallId ?? ""));
    const callRef = call?.callRef ?? null;
    const resultRef = rec.n;
    const base = {
      refs: { callRef, resultRef },
      tool: call?.name ?? msg.toolName ?? "unknown",
      resultEntryId: rec.entryId,
      callEntryId: call ? E.find((x) => x.n === callRef)?.entryId : undefined,
    };
    const name = String(call?.name ?? msg.toolName ?? "");
    const args = call?.args ?? {};
    const literalPath = args.path ?? args.file_path ?? args.filePath ?? args.file ?? args.target;

    if (isMutationName(name)) {
      const path = typeof literalPath === "string" ? literalPath : "(path missing)";
      addMutation({
        kind: "call",
        op: /^write$/i.test(name) ? "write" : "edit",
        tool: name,
        path,
        refs: { callRef, resultRef },
        error: msg.isError === true,
        ...(base),
      });
      if (msg.isError === true) {
        addError({ ...base, raw: String(textOf(msg.content) || `observed error from ${name}`).slice(0, 200) });
      }
    } else if (isReadName(name)) {
      const path = typeof literalPath === "string" ? literalPath : "(path missing)";
      addRead({ path, tool: name, refs: { callRef, resultRef }, origin: "call" });
    } else if (isShellName(name)) {
      const command = String(args.command ?? args.cmd ?? "");
      const counterMeta = { refs: { callRef, resultRef }, tool: name, command };
      if (msg.isError === true) {
        addError({ ...base, raw: String(textOf(msg.content) || `observed error from ${name}`).slice(0, 200), command });
      }
      for (const counter of parseCounters(msg, counterMeta)) addCounter(counter);
    } else if (literalPath || args.command) {
      addUnsupported({ tool: name, refs: { callRef, resultRef }, path: typeof literalPath === "string" ? literalPath : undefined });
    }

    const nested = msg.nestedCalls;
    if (nested && Array.isArray(nested.calls)) {
      nested.calls.forEach((nestedCall, index) => {
        const nestedName = String(nestedCall.name ?? "");
        const nestedArgs = nestedCall.arguments ?? {};
        const nestedPath = nestedArgs.path ?? nestedArgs.file_path ?? nestedArgs.filePath ?? nestedArgs.file ?? nestedArgs.target;
        const nestedRefs = { callRef, resultRef, nestedIndex: index };
        const nestedBase = { ...base, tool: nestedName, nestedIndex: index, refs: nestedRefs };
        if (isMutationName(nestedName)) {
          const path = typeof nestedPath === "string" ? nestedPath : "(path missing)";
          addMutation({
            kind: "nested",
            op: /^write$/i.test(nestedName) ? "write" : "edit",
            tool: nestedName,
            path,
            refs: nestedRefs,
            error: nestedCall.status === "error" || Boolean(nestedCall.error),
            ...nestedBase,
          });
          if (nestedCall.status === "error" || nestedCall.error) {
            addError({ ...nestedBase, raw: String(nestedCall.error ?? "nested error").slice(0, 200) });
          }
        } else if (isReadName(nestedName)) {
          const path = typeof nestedPath === "string" ? nestedPath : "(path missing)";
          addRead({ path, tool: nestedName, refs: nestedRefs, origin: "nested" });
        } else if (isShellName(nestedName)) {
          const command = String(nestedArgs.command ?? nestedArgs.cmd ?? "");
          if (nestedCall.status === "error" || nestedCall.error) {
            addError({ ...nestedBase, raw: String(nestedCall.error ?? "nested error").slice(0, 200), command });
          }
          for (const counter of parseCounters({ role: "toolResult", content: nestedCall.output ?? nestedCall.text ?? "", toolName: nestedName }, { refs: nestedRefs, tool: nestedName, command })) {
            addCounter(counter);
          }
        } else if (nestedPath || nestedArgs.command) {
          addUnsupported({ tool: nestedName, refs: nestedRefs, path: typeof nestedPath === "string" ? nestedPath : undefined });
        }
      });
    }
  }

  // Host fileOps are structural aggregates, not call records: no #N, no text.
  for (const [kind, paths] of [
    ["write", catalog.hostFileOps?.written ?? []],
    ["edit", catalog.hostFileOps?.edited ?? []],
    ["read", catalog.hostFileOps?.read ?? []],
  ]) {
    for (const path of paths) {
      if (kind === "read") {
        addRead({ path, tool: "host", refs: {}, origin: "host" });
      } else {
        addMutation({
          kind: "host",
          op: kind,
          tool: "host",
          path,
          refs: {},
          error: false,
          origin: "host",
        });
      }
    }
  }

  // Merge call/nested mutations by op+path; retain every source reference.
  const grouped = new Map();
  for (const row of rows) {
    if (row.kind === "host") continue;
    const key = `${row.op}\0${row.path}`;
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        kind: "operation",
        op: row.op,
        path: row.path,
        tools: [row.tool],
        refs: [row.refs],
        errorRefs: row.error ? [row.refs] : [],
        count: 1,
      });
    } else {
      current.count += 1;
      current.refs.push(row.refs);
      if (row.error) current.errorRefs.push(row.refs);
      if (!current.tools.includes(row.tool)) current.tools.push(row.tool);
    }
  }
  const operations = [...grouped.values()].sort((a, b) => {
    const an = a.refs[0]?.callRef ?? Number.POSITIVE_INFINITY;
    const bn = b.refs[0]?.callRef ?? Number.POSITIVE_INFINITY;
    return an - bn || a.path.localeCompare(b.path);
  });
  const hostOperations = rows.filter((row) => row.kind === "host").map((row) => ({
    kind: "operation",
    op: row.op,
    path: row.path,
    tools: ["host"],
    refs: [],
    errorRefs: [],
    count: 1,
    origin: "host",
  }));

  // Deduplicate counters by value + result record + offset; never merge runs.
  const counterSeen = new Set();
  const uniqueCounters = counters.filter((row) => {
    const key = `${row.pass}\0${row.fail}\0${row.refs?.resultRef ?? ""}\0${row.field}\0${row.offset}`;
    if (counterSeen.has(key)) return false;
    counterSeen.add(key);
    return true;
  });

  const errorSeen = new Set();
  const uniqueErrors = errors.filter((row) => {
    const key = `${row.tool}\0${row.refs?.callRef ?? ""}\0${row.refs?.resultRef ?? ""}\0${row.refs?.nestedIndex ?? ""}\0${row.raw}`;
    if (errorSeen.has(key)) return false;
    errorSeen.add(key);
    return true;
  });

  return {
    operations,
    hostOperations,
    counters: uniqueCounters,
    errors: uniqueErrors,
    reads,
    unsupported,
    mutationTotal: operations.reduce((sum, row) => sum + row.count, 0),
    mutationPaths: [...new Set(operations.map((row) => row.path))].sort(),
  };
};

export const buildCatalog = (fixture, opts = {}) => {
  const entries = fixture.entries;
  const branch = branchPath(entries, fixture.headId);
  const branchIds = new Set(branch.map((e) => e.id));
  const projected = projectBranch(branch, { skipCustomTypes: opts.skipCustomTypes ?? fixture.expected?.skipCustomTypes ?? [] });
  const skipCustomTypes = opts.skipCustomTypes ?? fixture.expected?.skipCustomTypes ?? [];
  const policy = opts.policy ?? {};

  let n = 0;
  const I = [];
  const nById = new Map();
  const entryById = new Map();
  for (const entry of entries) {
    entryById.set(entry.id, entry);
    if (entry.type === "message" && entry.message) {
      const rec = {
        n,
        entryId: entry.id,
        role: entry.message.role,
        entry,
        digest: sha256(canonicalJson(entry.message)),
      };
      I.push(rec);
      nById.set(entry.id, n);
      n += 1;
    } else {
      I.push({ n: null, entryId: entry.id, kind: entry.type, entry });
    }
  }

  const cutIndex = fixture.firstKeptEntryId ? branch.findIndex((e) => e.id === fixture.firstKeptEntryId) : -1;
  const liveIds = new Set(
    cutIndex >= 0
      ? branch.slice(cutIndex).filter((e) => e.type === "message" && e.message).map((e) => e.id)
      : [],
  );

  const effectiveById = new Map(projected.effective.map((p) => [p.entry.id, p]));
  const E = [];
  const eIds = new Set();
  for (const p of projected.effective) {
    const entry = p.entry;
    const msg = p.message;
    const excluded = shouldExcludeMessage(msg, entry.id, { policy });
    if (excluded) continue;
    if (msg.role === "custom" && skipCustomTypes.includes(msg.customType)) continue;
    if (eIds.has(entry.id)) continue; // one identity per source entry; blocks may be many
    eIds.add(entry.id);
    const unavailable = (opts.unavailableIds ?? []).includes(entry.id);
    const fields = unavailable ? [] : fieldsOfMessage(msg);
    E.push({
      n: nById.get(entry.id),
      entryId: entry.id,
      role: msg.role,
      entry,
      message: msg,
      fields,
      revisionEntryId: p.revision?.id,
      sourceChars: fields.reduce((sum, f) => sum + f.text.length, 0),
      live: liveIds.has(entry.id),
      unavailable,
      status: unavailable ? "Unavailable" : liveIds.has(entry.id) ? "Live" : "IndexOnly",
      reason: unavailable ? "source-unavailable" : undefined,
    });
  }

  const X = [];
  for (const rec of I) {
    if (rec.n === null) continue;
    if (eIds.has(rec.entryId)) continue;
    const entry = entryById.get(rec.entryId);
    const msg = entry?.message;
    let reason;
    if (msg?.role === "system") reason = "system";
    else if (!branchIds.has(rec.entryId)) reason = "off-branch";
    else if (projected.deleted.has(rec.entryId)) reason = "context-edit-excluded";
    else if ((policy.excludeEntryIds ?? []).includes(rec.entryId)) reason = "policy-excluded";
    else if (msg?.role === "bashExecution" && msg.excludeFromContext) reason = "context-edit-excluded";
    else reason = "not-effective";
    X.push({ n: rec.n, entryId: rec.entryId, reason, role: msg?.role });
  }

  const custom = projected.custom.map(({ entry, customType, excluded }) => ({
    entryId: entry.id,
    customType,
    excluded,
    n: null,
    status: excluded ? "Excluded" : "Metadata",
    reason: excluded ? "policy-excluded" : "unnumbered-custom",
  }));

  const hostFileOps = fixture.expected?.hostFileOps ?? {};
  const catalog = {
    refSpace: opts.refSpace ?? shortHash(`ref:${fixture.headId}:${fixture.expected?.shape ?? "A"}`),
    snapshot: {
      sourceId: opts.sourceId ?? "synthetic",
      sourceEndBytes: opts.sourceEndBytes ?? entries.length,
      prefixDigest: opts.prefixDigest ?? shortHash(canonicalJson(entries)),
      branchHeadId: fixture.headId,
    },
    I,
    E,
    X,
    custom,
    branch,
    branchIds,
    nById,
    entryById,
    liveIds,
    projected,
    hostFileOps,
    hasContextEdits: projected.hasEdits,
    limitedReason: cutIndex < 0 ? "missing-history" : projected.hasEdits ? "edited-checkpoint" : undefined,
    blocks: countBlocks(E.map((r) => r.message)),
    messages: E.length,
  };

  catalog.observations = extractObservations(catalog);
  catalog.counts = computeCatalogCounts(catalog);
  return catalog;
};

export const computeCatalogCounts = (catalog) => {
  const byStatus = { Live: 0, Quoted: 0, IndexOnly: 0, Unavailable: 0 };
  for (const rec of catalog.E) byStatus[rec.status] = (byStatus[rec.status] ?? 0) + 1;
  const x = {};
  for (const rec of catalog.X) x[rec.reason] = (x[rec.reason] ?? 0) + 1;
  return {
    saved: catalog.I.filter((r) => r.n !== null).length,
    effective: catalog.E.length,
    live: byStatus.Live,
    quoted: byStatus.Quoted,
    indexOnly: byStatus.IndexOnly,
    unavailable: byStatus.Unavailable,
    x: catalog.X.length,
    xByReason: x,
    custom: catalog.custom.length,
    customExcluded: catalog.custom.filter((r) => r.excluded).length,
    blocks: catalog.blocks,
    unaccounted: catalog.E.filter((r) => !["Live", "Quoted", "IndexOnly", "Unavailable"].includes(r.status)).length,
  };
};

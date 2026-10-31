// Synthetic session fixtures for the pi-context-index prototype.
// No real session text, paths or identifiers are used here.

const TASK_FILLER = [
  "The saved record is the authority; the rendering is a deterministic projection of it.",
  "A missing record and an empty record must never be rendered as the same thing.",
  "The reader should expose field paths, offsets and a next page rather than a first-page guess.",
  "Do not merge two runs just because their counters happen to share a number.",
  "The view must preserve source order even when selection follows a different priority.",
  "A large tool result is addressed by a span; it is never copied in full into the view.",
  "Line boundaries are the display unit; a single overlong line is read by address.",
  "A fence opened in a hidden middle must be restored before the shown tail.",
  "The policy digest is part of the recipe; a stricter policy is a different input.",
  "No cache may hold a reference identity that the source cannot rebuild.",
  "The cover reports counts from the catalog, not from the selected rows.",
  "An unshown span remains in the view manifest with its exact range.",
  "The reader's range, scan and read must agree on the same snapshot and policy.",
  "Do not treat a tool request as proof of a disk effect.",
  "The live tail is not quoted again; its records are marked Live.",
  "The previous summary is not a source for this view.",
  "A structural marker is never mistaken for a quoted source line.",
  "The executable calls printed by the view must parse with the real reader.",
  "The prototype should report how many records are unaccounted for, not hide the number.",
  "The final view must stop growing when the needed cost is reached.",
];

const TASK_BOOK_LINES = (() => {
  const lines = [];
  const add = (...items) => lines.push(...items);
  add(
    "Task book: rebuild the context index prototype without semantic extraction.",
    "Do not regenerate tests/fixtures/allocator-golden.json.",
    "Background: the current brief is a selection, not a catalog; the new view must keep every saved record addressable.",
    "Never use Math.min(...array) or Math.max(...array); long branches can exceed the host argument limit.",
  );
  add(...TASK_FILLER.slice(0, 5));
  add("Write a failing test before each fix.");
  add(...TASK_FILLER.slice(5, 9));
  add("Use a temporary config path for tests; never the user config.");
  add(...TASK_FILLER.slice(9, 13));
  add("Do not commit, tag, push, or publish until I say so.");
  add(...TASK_FILLER.slice(13, 16));
  add("Keep each change under 200 lines.");
  add(...TASK_FILLER.slice(16, 20));
  add(
    "For long messages, use line-level excerpts, never character cuts.",
    "Do not read the task book file into the compaction view.",
    "Acceptance: the structural tests must pass before any model experiment.",
    "Report aggregate numbers only; no session text in docs or commits.",
  );
  return lines;
})();

const FILLER = [
  "Checked the next area and updated the local notes.",
  "Reviewed the current file layout before making the next change.",
  "The next step is a small structural change, followed by a test.",
  "Inspected the record shape and kept the source order.",
  "Continued the implementation without changing the public format.",
  "Compared the two candidate layouts and kept the simpler one.",
  "Read the neighboring module to keep the new code isolated.",
  "Added a targeted assertion for the boundary case.",
  "The working tree still has the expected files.",
  "Looked at the existing test helper and reused its shape.",
];

const shuffle = (n, seed = 0x9e3779b9) => {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17; x >>>= 0;
    x ^= x << 5; x >>>= 0;
    return x / 0x100000000;
  };
};

const textOf = (content) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((p) => p && p.type === "text").map((p) => p.text).join("\n");
  }
  return "";
};

const assistantText = (text) => ({
  role: "assistant",
  content: [{ type: "text", text }],
});
const userText = (text) => ({ role: "user", content: text });
const toolCall = (id, name, args) => ({
  role: "assistant",
  content: [{ type: "toolCall", id, name, arguments: args }],
});
const toolResult = (id, name, text, isError = false, nestedCalls) => ({
  role: "toolResult",
  toolCallId: id,
  toolName: name,
  content: [{ type: "text", text }],
  isError,
  ...(nestedCalls ? { nestedCalls } : {}),
});

const giantResult = (tailLine) => {
  const lines = [];
  for (let i = 0; i < 260; i++) {
    lines.push(`log line ${String(i).padStart(3, "0")}: reading test file fixture-${i % 17}.ts; no failing assertion in this line.`);
  }
  const body = lines.join("\n");
  const target = tailLine;
  return `${body}\n${target}\nrun finished`;
};

const TASK_BOOK = TASK_BOOK_LINES.join("\n");
const EXTERNAL_TASK_BOOK = TASK_BOOK;

const MUTATION_PATHS = [
  "src/allocator.ts",
  "src/fences.ts",
  "src/brief.ts",
  "src/rank.ts",
  "src/summarize.ts",
  "src/format.ts",
  "src/recall-full.ts",
  "src/search-entries.ts",
  "src/details.ts",
  "src/hooks/before-compact.ts",
  "tests/allocator-golden.test.ts",
  "docs/plans/plan.md",
];

export const CONSTRAINTS = [
  { id: "golden", needle: "allocator-golden.json" },
  { id: "spread", needle: "Math.min" },
  { id: "failing-test", needle: "failing test" },
  { id: "temp-config", needle: "temporary config" },
  { id: "no-commit", needle: "Do not commit" },
  { id: "line-cap", needle: "200 lines" },
  { id: "line-level", needle: "line-level" },
  { id: "task-book", needle: "task book file" },
];

export const UNVERIFIED = [
  { id: "tui", needle: "TUI" },
  { id: "replay", needle: "real-session hook replay" },
  { id: "npm", needle: "npm publish" },
];

export const makeFixture = (shape = "A") => {
  const entries = [];
  const mainMessages = [];
  let idSeq = 0;
  let lastBranch = null;
  const random = shuffle(0x12345678);

  const add = (entry, { onMain = true, parent = lastBranch } = {}) => {
    entry.id = `e${String(idSeq++).padStart(4, "0")}`;
    entry.parentId = parent ?? null;
    entries.push(entry);
    if (entry.type === "message" && entry.message) mainMessages.push(entry);
    if (onMain) lastBranch = entry.id;
    return entry;
  };

  const addMessage = (message, options) => add({ type: "message", message }, options);
  const addPair = (id, name, args, resultText, isError = false, nestedCalls) => {
    const call = addMessage(toolCall(id, name, args));
    const result = addMessage(toolResult(id, name, resultText, isError, nestedCalls));
    return { call, result };
  };

  // #0: system occupies a #N slot but is not conversation content.
  addMessage({ role: "system", content: "System prompt and tool loadout. ".repeat(30) });

  // #1: first-message shape A (long task book) or B (short instruction + path).
  const firstUser = shape === "B"
    ? "Follow docs/plans/task-book.md and start with the allocator failure. Use the task-book constraints."
    : TASK_BOOK;
  addMessage(userText(firstUser));

  // A per-turn injected custom message: no #N, excluded by policy.
  add({
    type: "custom_message",
    customType: "goal-loop",
    content: "Injected per-turn state: current goal is the prototype.",
  });

  addMessage(assistantText("I will start by recording the failure, then make the smallest structural change. The task-book constraints remain the source of truth."));

  // Early write, then the 19K test result with the deep fact.
  addPair(
    "tc_write_alpha",
    "write",
    { path: "src/allocator.ts", content: "export const x = 1;\n" },
    "write request recorded",
  );
  const earlyTest = addPair(
    "tc_test_early",
    "bash",
    { command: "bun test tests/allocator-golden.test.ts" },
    giantResult("422 pass / 0 fail"),
  );
  const earlyCounterOffset = textOf(earlyTest.result.message.content).indexOf("422 pass / 0 fail");

  addMessage(userText("Keep tests isolated; use a temporary config path for the harness."));
  addMessage(assistantText("The harness will use a temporary config path. Next I will update the allocator and keep the change small."));

  // Off-branch records: they occupy #N but are not in the current branch.
  addMessage(userText("OFFBRANCH: this alternative instruction must not enter the current view."), {
    onMain: false,
    parent: mainMessages[3].id,
  });
  addMessage(assistantText("OFFBRANCH: alternative narration."), {
    onMain: false,
    parent: mainMessages[3].id,
  });

  // Sixty direct write/edit calls, one path each. One edit is an observed error.
  // Together with the early write and ten nested calls, the ledger has 71
  // mutation requests across 71 unique literal paths.
  const directCount = 60;
  const directPaths = [];
  for (let i = 0; i < directCount; i++) {
    const path = `src/ops/op-${String(i).padStart(3, "0")}.ts`;
    directPaths.push(path);
    const kind = i % 4 === 0 ? "write" : "edit";
    const isError = i === 7;
    addPair(
      `tc_direct_${i}`,
      kind,
      kind === "write"
        ? { path, content: `// synthetic write ${i}\n` }
        : { path, oldText: `old-${i}`, newText: `new-${i}` },
      isError ? "edit failed: pattern not found" : "file operation recorded",
      isError,
    );
    if (i % 13 === 4) {
      addMessage(assistantText(FILLER[i % FILLER.length]));
    }
  }

  // Five codemode calls with two nested calls each: ten unique nested paths,
  // one nested error. The outer result is not itself an error.
  const nestedPaths = [];
  for (let i = 0; i < 10; i++) nestedPaths.push(`src/nested/n-${String(i).padStart(3, "0")}.ts`);
  for (let i = 0; i < 5; i++) {
    const id = `tc_nested_${i}`;
    const calls = [
      {
        id: `${id}/call/0`,
        name: i % 2 === 0 ? "write" : "edit",
        arguments: { path: nestedPaths[i * 2], content: `nested ${i}` },
        status: "ok",
      },
      {
        id: `${id}/call/1`,
        name: i === 3 ? "write" : "edit",
        arguments: { path: nestedPaths[i * 2 + 1], content: `nested ${i} b` },
        status: i === 3 ? "error" : "ok",
        ...(i === 3 ? { error: "permission denied" } : {}),
      },
    ];
    addPair(
      id,
      "codemode",
      { code: `// goal: synthetic nested operation ${i}\nwrite(...)` },
      "script complete",
      false,
      { calls, complete: true },
    );
  }

  // One unsupported tool with a path-like argument: it must not become a file op.
  addPair("tc_custom", "custom_sync", { path: "src/custom.ts" }, "custom sync recorded");

  // A read request for touched listing.
  addPair("tc_read_doc", "read", { file_path: "docs/plans/task-book.md" }, "Read: task book body (not copied into the view).");

  addMessage(userText("Continue; do not commit yet. The old task-book constraint still stands for now."));
  addMessage(assistantText("I will continue with the ledger and the structural tests. The TUI manual check was not run; the real-session hook replay was not run."));

  // Mid test: a second, distinct counter vector.
  const midTest = addPair(
    "tc_test_mid",
    "bash",
    { command: "bun test tests/brief.test.ts" },
    "243 pass / 0 fail",
  );

  // A failed typecheck is an observed error, not a counter.
  addPair(
    "tc_typecheck_fail",
    "bash",
    { command: "bun run typecheck" },
    "error TS2322: Type 'string' is not assignable to type 'number'.",
    true,
  );

  // The later instruction that changes the commit rule; both records stay in order.
  addMessage(userText("Now commit and tag the release, then push. Do not publish to npm."));
  addMessage(assistantText("I will commit and tag after the final suite. The npm publish step remains out of scope."));

  // A self-echo record: the reader's own call must not become a new work fact.
  addPair("tc_self_echo", "context_index", { view: "v-old", offset: 0 }, "view page for an older summary");

  // Filler until the prefix is large enough for the realistic budget.
  let filler = 0;
  while (mainMessages.length < 440) {
    if (filler % 7 === 0) {
      addMessage(assistantText(FILLER[filler % FILLER.length]));
      filler++;
      continue;
    }
    const id = `tc_fill_${filler}`;
    const path = `docs/filler-${filler}.md`;
    addPair(id, "read", { file_path: path }, `Read ${path}: ${"line of synthetic filler. ".repeat(4)}`);
    filler++;
  }

  // The retained tail: exactly 30 messages, all live. It contains current
  // status and the 1139 count; it must not contain the early 422 fact.
  const tailStart = entries.length;
  addMessage(userText("Continue from the current state."));
  const finalTest = addPair(
    "tc_test_final",
    "bash",
    { command: "bun test" },
    "Pi 1.4.0 compatibility: 1139 pass / 0 fail",
  );
  addMessage(assistantText("The final suite ran; collecting the working-tree status."));
  addPair("tc_git_status", "bash", { command: "git status --short" }, "87 changed / 155 unchanged");
  addPair("tc_git_commit", "bash", { command: "git commit -am 'synthetic commit'" }, "created commit abc123");
  addPair("tc_git_tag", "bash", { command: "git tag v0.2.0" }, "created tag v0.2.0");
  addPair("tc_git_push", "bash", { command: "git push origin master" }, "pushed master");
  addMessage(assistantText("npm publish was not run."));
  while (mainMessages.length < 470) {
    const remaining = 470 - mainMessages.length;
    if (remaining === 1) {
      addMessage(assistantText("The current tail is still available for the next turn."));
      break;
    }
    const id = `tc_tail_fill_${filler}`;
    addPair(id, "read", { file_path: `docs/tail-${filler}.md` }, "Read tail filler.");
    filler++;
  }

  const headId = lastBranch;
  const firstKeptEntryId = entries[tailStart].id;

  // Ground truth: global #N is file order over counted message entries.
  const nById = new Map();
  let n = 0;
  for (const entry of entries) {
    if (entry.type === "message" && entry.message) nById.set(entry.id, n++);
  }
  const nOf = (entry) => nById.get(entry.id);
  const callEntry = (callId) => entries.find((e) =>
    Array.isArray(e.message?.content) && e.message.content.some((p) => p?.type === "toolCall" && p.id === callId));
  const resultEntry = (callId) => entries.find((e) => e.message?.toolCallId === callId);

  const early = { pass: 422, fail: 0, ref: nOf(earlyTest.result), callRef: nOf(earlyTest.call), offset: earlyCounterOffset };
  const mid = { pass: 243, fail: 0, ref: nOf(midTest.result), callRef: nOf(midTest.call) };
  const late = { pass: 1139, fail: 0, ref: nOf(finalTest.result), callRef: nOf(finalTest.call) };

  const directErrorCall = callEntry("tc_direct_7");
  const directErrorResult = resultEntry("tc_direct_7");
  const nestedErrorCall = callEntry("tc_nested_3");
  const nestedErrorResult = resultEntry("tc_nested_3");
  const typecheckCall = callEntry("tc_typecheck_fail");
  const typecheckError = resultEntry("tc_typecheck_fail");

  const mutationPaths = [...new Set(["src/allocator.ts", ...directPaths, ...nestedPaths])].sort();

  const expected = {
    shape,
    taskBook: TASK_BOOK,
    externalTaskBook: EXTERNAL_TASK_BOOK,
    early,
    mid,
    late,
    testVectors: [
      { pass: 422, fail: 0, ref: early.ref },
      { pass: 243, fail: 0, ref: mid.ref },
      { pass: 1139, fail: 0, ref: late.ref },
    ],
    mutationCount: 1 + directCount + 10,
    mutationPaths,
    errors: [
      { tool: "edit", ref: nOf(directErrorResult) ?? null, callRef: nOf(directErrorCall) ?? null },
      { tool: "write", ref: nOf(nestedErrorResult) ?? null, callRef: nOf(nestedErrorCall) ?? null },
      { tool: "bash", ref: nOf(typecheckError) ?? null, callRef: nOf(typecheckCall) ?? null },
    ],
    constraints: CONSTRAINTS,
    unverified: UNVERIFIED,
    pi100: null,
    state: { committed: true, tagged: true, pushed: true, npm_published: false },
    mayCommit: true,
    tailStartId: firstKeptEntryId,
    tailMessages: mainMessages.length - mainMessages.findIndex((e) => e.id === firstKeptEntryId),
    expectedSaved: n,
    expectedE: n - 3, // system + two off-branch records
    expectedLive: mainMessages.length - mainMessages.findIndex((e) => e.id === firstKeptEntryId),
    expectedX: { system: 1, offbranch: 2 },
    hostFileOps: {
      read: ["README.md"],
      written: ["src/host-only.ts"],
      edited: [],
    },
    skipCustomTypes: ["goal-loop"],
    ctxTokens: 410462,
  };

  return { entries, headId, firstKeptEntryId, expected };
};

export const makeEditFixture = () => {
  // A small context-edit fixture: the original user text is replaced by a revision entry.
  const entries = [];
  let idSeq = 0;
  let last = null;
  const add = (entry, parent = last) => {
    entry.id = `x${String(idSeq++).padStart(3, "0")}`;
    entry.parentId = parent ?? null;
    entries.push(entry);
    last = entry.id;
    return entry;
  };
  add({ type: "message", message: { role: "system", content: "system" } });
  const original = add({ type: "message", message: { role: "user", content: "original requirement: keep the old format." } });
  add({ type: "message", message: { role: "assistant", content: [{ type: "text", text: "old narration" }] } });
  const edit = add({
    type: "context_edit",
    targetId: original.id,
    replacement: "revised requirement: use the new span format.",
  });
  add({ type: "message", message: { role: "user", content: "continue with the revised requirement" } });
  return { entries, headId: last, firstKeptEntryId: entries[entries.length - 1].id, editId: edit.id, expected: {} };
};

export const fixtureSummary = (fixture) => {
  const counted = fixture.entries.filter((e) => e.type === "message" && e.message);
  const roles = {};
  for (const e of counted) roles[e.message.role] = (roles[e.message.role] ?? 0) + 1;
  return { entries: fixture.entries.length, messages: counted.length, roles, headId: fixture.headId, firstKeptEntryId: fixture.firstKeptEntryId };
};

import { describe, expect, test } from "bun:test";
import {
  captureSource,
  effectiveFields,
  entryVisibility,
  isSelfEchoToolField,
  primaryEffectiveField,
  projectHistory,
  type SourceSnapshot,
} from "../src/source";
import type { Cut } from "../src/cut";
import { readStoredField } from "../src/reader";
import {
  assistantEntry,
  chain,
  fakeManager,
  toolResultEntry,
  userEntry,
} from "./fixtures/entries";

const cutAt = (snapshot: SourceSnapshot, firstKeptEntryId: string): Cut => {
  const cutIndex = firstKeptEntryId
    ? (snapshot.branchIndex.get(firstKeptEntryId) ?? snapshot.branch.length)
    : snapshot.branch.length;
  return {
    firstKeptEntryId,
    cutIndex,
    reason: firstKeptEntryId ? "keep-turns" : "compact-all",
    requestedKeep: 1,
    keptUserTurns: 1,
    totalUserTurns: 1,
    tailTokens: 0,
    tailTokenLimit: 16_000,
  };
};

describe("captureSource", () => {
  test("fixes ids, branch membership, file order and the watermark", () => {
    const b = chain();
    b.user("u1", "start");
    b.assistant("a1", "plan");
    b.user("u2", "go");
    const offBranch = userEntry("u-off", "a1", "branch that was left");
    const entries = [...b.entries, offBranch];
    const manager = fakeManager(entries, { leafId: "u2", sessionId: "s-1" });
    const snapshot = captureSource(manager);

    expect(snapshot.sessionId).toBe("s-1");
    expect(snapshot.headId).toBe("u2");
    expect(snapshot.watermarkId).toBe("u-off");
    expect(snapshot.branch.map((entry) => entry.id)).toEqual(["u1", "a1", "u2"]);
    expect([...snapshot.fileOrder]).toEqual([
      ["u1", 0],
      ["a1", 1],
      ["u2", 2],
      ["u-off", 3],
    ]);
    expect(snapshot.branchIndex.has("u-off")).toBe(false);
    expect(snapshot.hasContextEdits).toBe(false);
    expect(Object.isFrozen(snapshot.entries)).toBe(true);
    expect(Object.isFrozen(snapshot.branch)).toBe(true);
  });

  test("keeps the captured snapshot immutable after appends and tree switches", () => {
    const b = chain();
    b.user("u1", "first");
    b.assistant("a1", "work");
    b.user("u2", "second");
    const manager = fakeManager(b.entries, { leafId: "u2" });
    const before = captureSource(manager);

    b.user("u3", "third");
    b.assistant("a3", "reply");
    // A fresh capture follows the new leaf; the old one is already fixed.
    const after = captureSource(fakeManager(b.entries));

    expect(before.branch.map((entry) => entry.id)).toEqual(["u1", "a1", "u2"]);
    expect(before.entries).toHaveLength(3);
    expect(after.branch.map((entry) => entry.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "u3",
      "a3",
    ]);

    // A tree switch changes membership for new work but keeps same-file ids
    // addressable. An old ref is not reclassified from a watermark.
    const switched = captureSource(fakeManager(b.entries, { leafId: "u2" }));
    expect(switched.branch.map((entry) => entry.id)).toEqual(["u1", "a1", "u2"]);
    expect(switched.branchIndex.has("u3")).toBe(false);
    expect(switched.branchIndex.has("u1")).toBe(true);
    expect(readStoredField(b.entries, "e:u3").ok).toBe(true);
    expect(entryVisibility(switched, "u3")?.excludedReason).toBe("off-branch");
  });
});

describe("projectHistory", () => {
  test("splits effective records into live and history by real membership", () => {
    const b = chain();
    b.user("u1", "first goal");
    b.assistant("a1", "plan");
    b.user("u2", "second");
    b.assistant("a2", "work");
    b.user("u3", "third");
    b.assistant("a3", "done");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, cutAt(snapshot, "u3"));

    expect(history.records.map((record) => record.info.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
      "u3",
      "a3",
    ]);
    expect(history.live.map((record) => record.info.id)).toEqual(["u3", "a3"]);
    expect(history.history.map((record) => record.info.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "a2",
    ]);
    expect(history.counts).toEqual({
      saved: 6,
      effective: 6,
      live: 2,
      outside: 0,
    });
  });

  test("an edit replaces displayed text and points at the edit entry", () => {
    const b = chain();
    b.user("u1", "original requirement");
    b.assistant("a1", "work");
    b.edit("edit1", "u1", "corrected requirement");
    b.user("u2", "live turn");
    const snapshot = captureSource(fakeManager(b.entries));
    expect(snapshot.hasContextEdits).toBe(true);
    const history = projectHistory(snapshot, cutAt(snapshot, "u2"));

    const record = history.records.find((entry) => entry.info.id === "u1");
    expect(record).toBeDefined();
    if (!record) throw new Error("expected the edited record");
    expect(record.info.effective).toBe(true);
    expect(record.info.contentStorageId).toBe("edit1");
    expect(record.info.primaryField).toBe("/replacement/content");
    expect(record.editId).toBe("edit1");
    expect(record.storageEntry.id).toBe("edit1");
    const projected = record.messages[0] as { content?: unknown } | undefined;
    expect(projected?.content).toBe("corrected requirement");

    const fields = effectiveFields(record);
    expect(fields).toEqual([
      {
        ownerId: "u1",
        storageId: "edit1",
        path: "/replacement/content",
        kind: "text",
        text: "corrected requirement",
      },
    ]);
    expect(primaryEffectiveField(record)).toEqual({
      ownerId: "u1",
      storageId: "edit1",
      path: "/replacement/content",
      kind: "text",
      text: "corrected requirement",
    });

    // Explicit read of the original and of the storage entry stay distinct.
    const original = readStoredField(b.entries, "e:u1");
    expect(original.ok && original.field.text).toBe("original requirement");
    const stored = readStoredField(b.entries, "e:edit1");
    expect(stored.ok && stored.field.path).toBe("/replacement/content");
    expect(stored.ok && stored.field.text).toBe("corrected requirement");

    const visibility = entryVisibility(snapshot, "u1");
    expect(visibility).toEqual({
      onBranch: true,
      derived: false,
      effective: true,
      contentStorageId: "edit1",
      editId: "edit1",
    });
  });

  test("replacement:null removes the record from the effective set but not the archive", () => {
    const b = chain();
    b.user("u1", "text to omit");
    b.assistant("a1", "work");
    b.edit("edit1", "u1", null);
    b.user("u2", "live turn");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, cutAt(snapshot, "u2"));

    expect(history.records.map((record) => record.info.id)).toEqual(["a1", "u2"]);
    expect(history.excluded.map((info) => [info.id, info.excludedReason])).toEqual([
      ["u1", "edited"],
    ]);
    expect(history.counts.effective).toBe(2);
    expect(history.counts.saved).toBe(3);
    expect(history.counts.saved).toBe(
      history.counts.effective + history.excluded.length + history.counts.outside,
    );

    const visibility = entryVisibility(snapshot, "u1");
    expect(visibility?.effective).toBe(false);
    expect(visibility?.excludedReason).toBe("edited");

    const original = readStoredField(b.entries, "e:u1");
    expect(original.ok && original.field.text).toBe("text to omit");
  });

  test("an edited compaction checkpoint bounds capsule candidates", () => {
    const b = chain();
    b.user("u1", "old goal");
    b.assistant("a1", "old work");
    b.compaction("c1", "a1", "old summary");
    b.user("u2", "new direction");
    b.edit("edit1", "c1", "corrected summary");
    b.user("u3", "live turn");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, cutAt(snapshot, "u3"));

    expect(history.lowerBoundId).toBe("c1");
    expect(history.history.map((record) => record.info.id)).toEqual(["u2"]);
    expect(history.live.map((record) => record.info.id)).toEqual(["u3"]);
    // Pre-checkpoint records stay effective (addressable and searchable) but
    // are not capsule candidates after the checkpoint was edited.
    expect(history.records.map((record) => record.info.id)).toEqual([
      "u1",
      "a1",
      "u2",
      "u3",
    ]);
    expect(history.derived.map((entry) => entry.id)).toEqual(["c1"]);
  });

  test("excludes system messages, self echoes and off-branch records", () => {
    const b = chain();
    b.system("s1", "system instructions");
    b.user("u1", "hello");
    b.toolResult("r1", { toolName: "context_index", text: "echo" });
    b.assistant("a1", "done");
    b.customMessage("cm1", "extension note", { customType: "test.note" });
    b.user("u2", "live turn");
    const off = userEntry("off1", "a1", "other branch");
    const entries = [...b.entries, off];
    const snapshot = captureSource(fakeManager(entries, { leafId: "u2" }));
    const history = projectHistory(snapshot, cutAt(snapshot, "u2"));

    expect(history.records.map((record) => record.info.id)).toEqual([
      "u1",
      "a1",
      "cm1",
      "u2",
    ]);
    expect(
      history.excluded.map((info) => [info.id, info.excludedReason]),
    ).toEqual([
      ["s1", "system"],
      ["r1", "self-echo"],
    ]);
    expect(history.offBranch.map((info) => [info.id, info.excludedReason])).toEqual([
      ["off1", "off-branch"],
    ]);
    expect(history.counts).toEqual({
      saved: 7,
      effective: 4,
      live: 1,
      outside: 1,
    });
    expect(history.counts.saved).toBe(
      history.counts.effective + history.excluded.length + history.counts.outside,
    );
    expect(entryVisibility(snapshot, "r1")?.excludedReason).toBe("self-echo");
    expect(entryVisibility(snapshot, "s1")?.excludedReason).toBe("system");
    expect(entryVisibility(snapshot, "cm1")?.effective).toBe(true);
    expect(entryVisibility(snapshot, "cm1")?.derived).toBe(false);
    expect(entryVisibility(snapshot, "c1")).toBeUndefined();
  });

  test("compact-all puts every effective record in history", () => {
    const b = chain();
    b.user("u1", "one");
    b.assistant("a1", "two");
    const snapshot = captureSource(fakeManager(b.entries));
    const history = projectHistory(snapshot, cutAt(snapshot, ""));
    expect(history.live).toHaveLength(0);
    expect(history.history.map((record) => record.info.id)).toEqual(["u1", "a1"]);
    expect(history.counts.live).toBe(0);
  });
});
describe("self-echo tool fields", () => {
  test("excludes context_index call arguments but keeps other tool fields", () => {
    const assistant = assistantEntry("a1", null, [
      {
        type: "toolCall",
        id: "call-1",
        name: "context_index",
        arguments: { action: "search", query: "echoed query" },
      },
      {
        type: "toolCall",
        id: "call-2",
        name: "read",
        arguments: { path: "fixture/synthetic.ts" },
      },
      { type: "text", text: "assistant note" },
    ]);
    expect(isSelfEchoToolField(assistant, "/message/content/0/arguments/query")).toBe(
      true,
    );
    expect(isSelfEchoToolField(assistant, "/message/content/1/arguments/path")).toBe(
      false,
    );
    expect(isSelfEchoToolField(assistant, "/message/content/2/text")).toBe(false);

    const result = toolResultEntry("r1", "a1", {
      toolName: "codemode",
      nestedCalls: {
        complete: true,
        calls: [
          {
            id: "nested-1",
            name: "context_index",
            arguments: { action: "read", ref: "e:u1" },
            status: "ok",
          },
          {
            id: "nested-2",
            name: "read",
            arguments: { path: "fixture/synthetic.ts" },
            status: "ok",
          },
        ],
      },
    });
    expect(
      isSelfEchoToolField(
        result,
        "/message/nestedCalls/calls/0/arguments/ref",
      ),
    ).toBe(true);
    expect(
      isSelfEchoToolField(
        result,
        "/message/nestedCalls/calls/1/arguments/path",
      ),
    ).toBe(false);
  });
});

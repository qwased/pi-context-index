import { describe, expect, test } from "bun:test";
import {
  editableContentBase,
  enumerateFields,
  fieldList,
  formatPointer,
  joinPointer,
  parsePointer,
  primaryFieldPath,
  primaryFieldOf,
} from "../src/fields";
import { readStoredField } from "../src/reader";
import {
  assistantEntry,
  bashExecutionEntry,
  branchSummaryEntry,
  compactionEntry,
  contextEditEntry,
  customMessageEntry,
  toolResultEntry,
  userEntry,
  userPartsEntry,
} from "./fixtures/entries";

const paths = (entry: Parameters<typeof fieldList>[0]): string[] =>
  fieldList(entry).map((field) => field.path);

describe("JSON Pointer helpers", () => {
  test("escape and parse reference tokens", () => {
    expect(joinPointer("/message/content", "a/b")).toBe(
      "/message/content/a~1b",
    );
    expect(parsePointer("/a~1b/c~0d")).toEqual(["a/b", "c~d"]);
    expect(parsePointer("")).toEqual([]);
    expect(parsePointer("a")).toBeUndefined();
    expect(formatPointer(["a/b", "c~d"])).toBe("/a~1b/c~0d");
  });
});

describe("enumerateFields", () => {
  test("user string content is one text field", () => {
    const entry = userEntry("u1", null, "hello");
    expect(fieldList(entry)).toEqual([
      {
        ownerId: "u1",
        storageId: "u1",
        path: "/message/content",
        kind: "text",
        text: "hello",
      },
    ]);
    expect([...enumerateFields(entry)]).toEqual(fieldList(entry));
  });

  test("array content keeps text blocks and excludes thinking and images", () => {
    const entry = userPartsEntry("u1", null, [
      { type: "text", text: "visible" },
      { type: "thinking", thinking: "private reasoning" },
      { type: "image", mimeType: "image/png", data: "AA==" },
      { type: "text", text: "second" },
    ]);
    expect(fieldList(entry).map((field) => [field.path, field.text])).toEqual([
      ["/message/content/0/text", "visible"],
      ["/message/content/3/text", "second"],
    ]);
  });

  test("toolCall arguments flatten to JSON Pointer fields with canonical scalars", () => {
    const entry = assistantEntry("a1", null, [
      { type: "text", text: "calling" },
      {
        type: "toolCall",
        id: "call-1",
        name: "write",
        arguments: {
          path: "src/a b.ts",
          "a/b": "slash",
          "t~n": 2,
          nested: { ok: true },
          list: [null, "x"],
        },
      },
    ]);
    expect(fieldList(entry).map((field) => [field.path, field.kind, field.text])).toEqual([
      ["/message/content/0/text", "text", "calling"],
      ["/message/content/1/arguments/path", "argument", "src/a b.ts"],
      ["/message/content/1/arguments/a~1b", "argument", "slash"],
      ["/message/content/1/arguments/t~0n", "scalar", "2"],
      ["/message/content/1/arguments/nested/ok", "scalar", "true"],
      ["/message/content/1/arguments/list/0", "scalar", "null"],
      ["/message/content/1/arguments/list/1", "argument", "x"],
    ]);
  });

  test("nestedCalls expose arguments, argumentsBytes, error and status", () => {
    const entry = toolResultEntry("r1", null, {
      text: "script output",
      toolName: "codemode",
      nestedCalls: {
        complete: false,
        calls: [
          {
            id: "n1",
            name: "write",
            arguments: { path: "src/x.ts", content: "a" },
            status: "ok",
            durationMs: 3,
          },
          {
            id: "n2",
            name: "read",
            argumentsBytes: 20_031,
            status: "error",
            error: "ENOENT: missing",
          },
          { id: "n3", name: "bash", status: "unfinished" },
        ],
      },
      details: {
        calls: [{ args: JSON.stringify({ path: "details-preview.ts" }) }],
      },
    });
    expect(fieldList(entry).map((field) => [field.path, field.kind, field.text])).toEqual([
      ["/message/content/0/text", "result", "script output"],
      ["/message/nestedCalls/calls/0/arguments/path", "argument", "src/x.ts"],
      ["/message/nestedCalls/calls/0/arguments/content", "argument", "a"],
      ["/message/nestedCalls/calls/0/status", "scalar", "ok"],
      ["/message/nestedCalls/calls/1/argumentsBytes", "scalar", "20031"],
      ["/message/nestedCalls/calls/1/error", "result", "ENOENT: missing"],
      ["/message/nestedCalls/calls/1/status", "scalar", "error"],
      ["/message/nestedCalls/calls/2/status", "scalar", "unfinished"],
    ]);
    // Pi's TUI details preview is not a field source.
    expect(paths(entry).some((path) => path.startsWith("/message/details"))).toBe(false);
    expect(JSON.stringify(fieldList(entry))).not.toContain("details-preview.ts");
  });

  test("bashExecution exposes command, output and exit code", () => {
    const entry = bashExecutionEntry("b1", null, "bun test", "42 pass\n0 fail", {
      exitCode: 0,
    });
    expect(fieldList(entry).map((field) => [field.path, field.kind, field.text])).toEqual([
      ["/message/command", "argument", "bun test"],
      ["/message/output", "result", "42 pass\n0 fail"],
      ["/message/exitCode", "scalar", "0"],
    ]);
    const hidden = bashExecutionEntry("b2", null, "!! secret", "secret output", {
      excludeFromContext: true,
    });
    expect(paths(hidden)).toEqual(["/message/command", "/message/output"]);
  });

  test("custom messages, summaries and replacements use their stored paths", () => {
    expect(fieldList(customMessageEntry("cm1", null, "note")).map((f) => f.path)).toEqual([
      "/content",
    ]);
    expect(
      fieldList(
        customMessageEntry("cm2", null, [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ]),
      ).map((f) => f.path),
    ).toEqual(["/content/0/text", "/content/1/text"]);
    expect(fieldList(compactionEntry("c1", null, "x", "summary")).map((f) => f.path)).toEqual([
      "/summary",
    ]);
    expect(
      fieldList(branchSummaryEntry("bs1", null, "from", "branch summary")).map((f) => f.path),
    ).toEqual(["/summary"]);
    expect(fieldList(contextEditEntry("e1", null, "u1", "replacement")).map((f) => f.path)).toEqual([
      "/replacement/content",
    ]);
    expect(fieldList(contextEditEntry("e2", null, "u1", null))).toEqual([]);
    expect(editableContentBase(userEntry("u1", null, "x"))).toBe("/message/content");
    expect(editableContentBase(customMessageEntry("cm1", null, "x"))).toBe("/content");
    expect(editableContentBase(compactionEntry("c1", null, "x", "s"))).toBeUndefined();
  });
});

describe("primary fields", () => {
  test("pick the first text block and skip media-only content", () => {
    expect(primaryFieldPath(userEntry("u1", null, "plain"))).toBe("/message/content");
    expect(
      primaryFieldPath(
        userPartsEntry("u2", null, [
          { type: "image", mimeType: "image/png", data: "AA==" },
          { type: "text", text: "second block" },
        ]),
      ),
    ).toBe("/message/content/1/text");
    expect(
      primaryFieldPath(
        assistantEntry("a1", null, [
          { type: "toolCall", id: "c1", name: "bash", arguments: {} },
        ]),
      ),
    ).toBeUndefined();
    expect(
      primaryFieldPath(toolResultEntry("r1", null, { text: "result" })),
    ).toBe("/message/content/0/text");
    expect(primaryFieldPath(bashExecutionEntry("b1", null, "cmd", "out"))).toBe(
      "/message/output",
    );
    expect(primaryFieldPath(contextEditEntry("e1", null, "u1", "replacement"))).toBe(
      "/replacement/content",
    );
    expect(primaryFieldPath(contextEditEntry("e2", null, "u1", null))).toBeUndefined();
    expect(primaryFieldOf(userEntry("u1", null, "plain"))?.text).toBe("plain");
  });

  test("codemode multi-part results select the last text block", () => {
    const header = "Script completed\nWall time 0.0 seconds\nOutput:\n";
    const shortBody = toolResultEntry("r-short", null, {
      toolName: "codemode",
      content: [
        { type: "text", text: header },
        { type: "text", text: "short body" },
      ],
    });
    expect(primaryFieldPath(shortBody)).toBe("/message/content/1/text");
    expect(primaryFieldOf(shortBody)?.text).toBe("short body");

    const longBody = toolResultEntry("r-long", null, {
      toolName: "codemode",
      content: [
        { type: "text", text: header },
        { type: "text", text: "x".repeat(2_000) },
      ],
    });
    expect(primaryFieldPath(longBody)).toBe("/message/content/1/text");
    expect(primaryFieldOf(longBody)?.text).toBe("x".repeat(2_000));
  });

  test("codemode skips trailing non-text blocks and keeps JSON text raw", () => {
    const header = "Script completed\nWall time 0.0 seconds\nOutput:\n";
    const json = '{"ok":true,"count":42}';
    const entry = toolResultEntry("r-json", null, {
      toolName: "codemode",
      content: [
        { type: "text", text: header },
        { type: "text", text: json },
        { type: "image", mimeType: "image/png", data: "AA==" },
      ],
    });
    expect(primaryFieldPath(entry)).toBe("/message/content/1/text");
    expect(primaryFieldOf(entry)?.text).toBe(json);
  });

  test("non-codemode multi-part results still use the first text block", () => {
    const entry = toolResultEntry("r-first", null, {
      toolName: "bash",
      content: [
        { type: "text", text: "first block" },
        { type: "text", text: "second block" },
      ],
    });
    expect(primaryFieldPath(entry)).toBe("/message/content/0/text");

    const assistant = assistantEntry("a-thinking", null, [
      { type: "thinking", thinking: "private reasoning" },
      { type: "text", text: "visible answer" },
    ]);
    expect(primaryFieldPath(assistant)).toBe("/message/content/1/text");
    expect(primaryFieldOf(assistant)?.text).toBe("visible answer");
  });
});

describe("codemode default reads", () => {
  test("the body is the default and the header stays addressable", () => {
    const header = "Script completed\nWall time 0.0 seconds\nOutput:\n";
    const entries = [
      toolResultEntry("r-read", null, {
        toolName: "codemode",
        content: [
          { type: "text", text: header },
          { type: "text", text: "short body" },
        ],
      }),
    ];
    const body = readStoredField(entries, "e:r-read");
    expect(body.ok).toBe(true);
    if (body.ok) {
      expect(body.field.path).toBe("/message/content/1/text");
      expect(body.field.text).toBe("short body");
    }
    const explicit = readStoredField(
      entries,
      "e:r-read",
      "/message/content/0/text",
    );
    expect(explicit.ok).toBe(true);
    if (explicit.ok) expect(explicit.field.text).toContain("Script completed");
  });
});

describe("stored field reads", () => {
  test("explicit pointers address text and scalars, including escaped keys", () => {
    const entries = [
      assistantEntry("a1", null, [
        {
          type: "toolCall",
          id: "c1",
          name: "write",
          arguments: { "a/b": "slash", n: 7 },
        },
      ]),
      toolResultEntry("r1", null, {
        nestedCalls: {
          complete: false,
          calls: [{ id: "n1", name: "read", argumentsBytes: 1234, status: "ok" }],
        },
      }),
    ];
    const escaped = readStoredField(
      entries,
      "e:a1",
      "/message/content/0/arguments/a~1b",
    );
    expect(escaped.ok).toBe(true);
    if (escaped.ok) {
      expect(escaped.field.text).toBe("slash");
      expect(escaped.field.kind).toBe("argument");
    }
    const scalar = readStoredField(
      entries,
      "e:r1",
      "/message/nestedCalls/calls/0/argumentsBytes",
    );
    expect(scalar.ok).toBe(true);
    if (scalar.ok) {
      expect(scalar.field.text).toBe("1234");
      expect(scalar.field.kind).toBe("scalar");
    }
    const object = readStoredField(
      entries,
      "e:r1",
      "/message/nestedCalls/calls/0",
    );
    expect(object.ok).toBe(false);
    if (!object.ok) expect(object.reason).toBe("field_not_text");
  });

  test("missing refs, ids, fields and primaries fail with explicit reasons", () => {
    const entries = [
      assistantEntry("a1", null, [
        { type: "toolCall", id: "c1", name: "bash", arguments: {} },
      ]),
    ];
    const badRef = readStoredField(entries, "nope");
    expect(badRef.ok).toBe(false);
    if (!badRef.ok) expect(badRef.reason).toBe("invalid_ref");
    const missing = readStoredField(entries, "e:absent");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.reason).toBe("not_found");
    const noPrimary = readStoredField(entries, "e:a1");
    expect(noPrimary.ok).toBe(false);
    if (!noPrimary.ok) expect(noPrimary.reason).toBe("primary_not_found");
    const noField = readStoredField(entries, "e:a1", "/message/nope");
    expect(noField.ok).toBe(false);
    if (!noField.ok) expect(noField.reason).toBe("field_not_found");
    const notPointer = readStoredField(entries, "e:a1", "message/content");
    expect(notPointer.ok).toBe(false);
    if (!notPointer.ok) expect(notPointer.reason).toBe("field_not_found");
  });
});

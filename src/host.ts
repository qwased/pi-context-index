/** Host adapter: one direct reader tool and the single compaction hook.
 *
 * The hook captures an immutable source snapshot, chooses its own tail cut,
 * projects the effective history and hands the rendered capsule to Pi. The
 * tool exposes list/search/read behind one per-run budget. Any compaction
 * failure is a hard cancel: returning nothing would let Pi call its model
 * summarizer.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
} from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type { CapsuleDetails } from "./model";
import {
  DEFAULT_SETTINGS,
  SETTINGS_FILE_NAME,
  parseSettings,
  type ContextIndexSettings,
} from "./settings";
import { captureSource, projectHistory } from "./source";
import { chooseCut, parseCompactionInstructions } from "./cut";
import { buildCapsule as renderCapsule } from "./render";
import {
  executeReader,
  type ReaderArgs,
  type ReaderContext,
  type ReaderToolResult,
} from "./reader";
import {
  ReaderRunBudget,
  RUN_READ_MAX_CALLS,
} from "./budget";

export interface HookCapsule {
  summary: string;
  firstKeptEntryId: string;
  details: CapsuleDetails;
}

export type CapsuleBuilder = (
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
) => HookCapsule;

export interface RegisterContextIndexOptions {
  /** Host-test seam for the mandatory cancel-on-failure transition. */
  buildCapsule?: CapsuleBuilder;
  /** Directory holding pi-context-index.json; defaults to Pi's agent dir. */
  agentDir?: string;
}

type SettingsLoad =
  | { ok: true; settings: ContextIndexSettings }
  | { ok: false; message: string };

const contextWindowOf = (ctx: ExtensionContext): number =>
  ctx.getContextUsage()?.contextWindow ?? ctx.model?.contextWindow ?? 0;

const loadSettingsFrom = (agentDir: string): SettingsLoad => {
  const file = join(agentDir, SETTINGS_FILE_NAME);
  if (!existsSync(file)) {
    return { ok: true, settings: { ...DEFAULT_SETTINGS } };
  }
  let raw: unknown;
  try {
    const text = readFileSync(file, "utf8");
    raw = JSON.parse(text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);
  } catch (error) {
    return {
      ok: false,
      message:
        SETTINGS_FILE_NAME +
        " is not valid JSON: " +
        (error instanceof Error ? error.message : String(error)),
    };
  }
  const parsed = parseSettings(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      message:
        SETTINGS_FILE_NAME +
        ": " +
        parsed.errors.map((entry) => entry.field + " " + entry.message).join("; "),
    };
  }
  return { ok: true, settings: parsed.settings };
};

export const loadSettingsFile = (agentDir: string): SettingsLoad =>
  loadSettingsFrom(agentDir);

/** Default capsule builder: capture, cut, project, select, render. */
export const buildHookCapsule = (
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
  settings: ContextIndexSettings = DEFAULT_SETTINGS,
): HookCapsule => {
  const snapshot = captureSource(ctx.sessionManager, event.branchEntries);
  const parsed = parseCompactionInstructions(event.customInstructions);
  const keep = parsed.keep ?? settings.keepUserTurns;
  const contextWindow = contextWindowOf(ctx);
  const cutResult = chooseCut({
    snapshot,
    keepUserTurns: keep,
    reason: event.reason,
    contextWindow,
  });
  if (!cutResult.ok) {
    throw new Error("Nothing to compact: " + cutResult.reason);
  }
  const history = projectHistory(snapshot, cutResult.cut);
  const capsule = renderCapsule({
    history,
    config: {
      viewMaxChars: settings.viewMaxChars,
      keepUserTurns: settings.keepUserTurns,
    },
    contextWindow,
    instructions: parsed.instructions,
  });
  return {
    summary: capsule.text,
    firstKeptEntryId: cutResult.cut.firstKeptEntryId,
    details: capsule.details,
  };
};

const readerParameters = Type.Object(
  {
    action: Type.Union([
      Type.Literal("list"),
      Type.Literal("search"),
      Type.Literal("read"),
    ]),
    ref: Type.Optional(
      Type.String({ description: "Native record reference: e:<entryId>." }),
    ),
    field: Type.Optional(
      Type.String({ description: "JSON Pointer of one stored field." }),
    ),
    role: Type.Optional(
      Type.String({
        description: "Optional role filter: user, assistant, toolResult, custom, edit.",
      }),
    ),
    query: Type.Optional(Type.String({ description: "Search terms or literal." })),
    match: Type.Optional(
      Type.Union([Type.Literal("terms"), Type.Literal("literal")]),
    ),
    scope: Type.Optional(
      Type.Union([Type.Literal("branch"), Type.Literal("session")]),
    ),
    cursor: Type.Optional(Type.String({ description: "Cursor from a previous result." })),
    offset: Type.Optional(
      Type.Integer({ minimum: 0, description: "Start offset in UTF-16 units." }),
    ),
    length: Type.Optional(
      Type.Integer({ minimum: 1, description: "Requested chars; capped at 12,000." }),
    ),
    full: Type.Optional(
      Type.Boolean({ description: "Read the whole stored field." }),
    ),
  },
  { additionalProperties: false },
);

export const registerContextIndex = (
  pi: ExtensionAPI,
  options: RegisterContextIndexOptions = {},
): void => {
  const agentDir = options.agentDir ?? getAgentDir();
  const readSettings = (): SettingsLoad => loadSettingsFrom(agentDir);
  let runBudget: ReaderRunBudget | null = null;

  const budgetFor = (settings: ContextIndexSettings): ReaderRunBudget => {
    if (!runBudget) {
      runBudget = new ReaderRunBudget(settings.runReadMaxChars, RUN_READ_MAX_CALLS);
    }
    return runBudget;
  };

  const injectedBuilder = options.buildCapsule;
  const buildCapsule =
    injectedBuilder ??
    ((event: SessionBeforeCompactEvent, ctx: ExtensionContext) => {
      const loaded = readSettings();
      if (!loaded.ok) throw new Error(loaded.message);
      return buildHookCapsule(event, ctx, loaded.settings);
    });

  pi.on("session_start", () => {
    runBudget = null;
  });

  pi.on("before_agent_start", () => {
    const loaded = readSettings();
    runBudget = new ReaderRunBudget(
      loaded.ok ? loaded.settings.runReadMaxChars : DEFAULT_SETTINGS.runReadMaxChars,
      RUN_READ_MAX_CALLS,
    );
  });

  pi.registerTool({
    name: "context_index",
    label: "Context Index",
    description:
      "Inspect the saved session: list records or one record's fields and headings, search saved text (BM25 terms or literal), and read exact stored fields with bounded windows or full:true. The continuation summary points at stored addresses.",
    promptGuidelines: [
      "The context index quotes saved history. Use the latest user instructions with the live tail. When an omitted instruction matters, call context_index (directly, or as tools.context_index(...) inside a codemode script): list to browse, search to locate, read to inspect. Use full:true for a complete instruction; a partial result carries the next read. Reuse source text already in context.",
    ],
    exposure: "direct",
    parameters: readerParameters,
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const loaded = readSettings();
      if (!loaded.ok) {
        const details = { action: params.action, error: loaded.message };
        return {
          content: [
            {
              type: "text",
              text: "[context_index settings error] " + loaded.message,
            },
          ],
          details,
          isError: true,
        };
      }
      const budget = budgetFor(loaded.settings);
      const result: ReaderToolResult = await executeReader(
        params as unknown as ReaderArgs,
        ctx as unknown as ReaderContext,
        budget,
        signal,
      );
      return result;
    },
  });

  pi.on("session_before_compact", async (event, ctx) => {
    try {
      event.signal.throwIfAborted();
      const capsule = buildCapsule(event, ctx);
      event.signal.throwIfAborted();
      return {
        compaction: {
          summary: capsule.summary,
          firstKeptEntryId: capsule.firstKeptEntryId,
          tokensBefore: event.preparation.tokensBefore,
          details: capsule.details,
        },
      };
    } catch {
      // Returning nothing here would let Pi fall back to its model summary.
      return { cancel: true };
    }
  });
};

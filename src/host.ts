/** P0 host adapter: one direct reader tool and the single compaction hook. */

import { createHash } from "node:crypto";
import type {
  ExtensionAPI,
  ExtensionContext,
  SessionBeforeCompactEvent,
  SessionEntry,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import {
  DETAILS_KIND,
  FIELD_VERSION,
  SCHEMA_VERSION,
  SELECTOR_VERSION,
  type CapsuleDetails,
  type CapsuleRecipe,
  type Span,
} from "./model";
import { DEFAULT_SETTINGS } from "./settings";
import {
  fitGraphemePrefix,
  primaryTextField,
  readStoredField,
} from "./reader";

const CAPSULE_PLACEHOLDER = "000000000000";

/** P0 capsule bytes are capped by viewMaxChars until the real budget lands. */
const CAPSULE_LIMIT = DEFAULT_SETTINGS.viewMaxChars;

const SNAPSHOT_VERSION = 1;

interface ReadDetails {
  action: "read";
  ref: string;
  ownerId?: string;
  storageId?: string;
  field?: string;
  start?: number;
  end?: number;
  chars?: number;
  complete?: boolean;
  error?: string;
}

export interface ThinCapsule {
  summary: string;
  firstKeptEntryId: string;
  details: CapsuleDetails;
}

export type CapsuleBuilder = (
  event: SessionBeforeCompactEvent,
  ctx: ExtensionContext,
) => ThinCapsule;

export interface RegisterContextIndexOptions {
  /** Host-test seam for the mandatory cancel-on-failure transition. */
  buildCapsule?: CapsuleBuilder;
}

const isMessageRecord = (entry: SessionEntry): boolean =>
  entry.type === "message" || entry.type === "custom_message";

interface QuoteSource {
  entry: SessionEntry;
  field: string;
  text: string;
}

const collectSummarizedUsers = (
  branch: readonly SessionEntry[],
  cutIndex: number,
): QuoteSource[] => {
  const candidates: QuoteSource[] = [];
  for (let index = 0; index < cutIndex; index++) {
    const entry = branch[index];
    if (!entry || entry.type !== "message" || entry.message.role !== "user") {
      continue;
    }
    const primary = primaryTextField(entry);
    if (!primary || primary.text.length === 0) continue;
    candidates.push({
      entry,
      field: primary.path,
      text: primary.text,
    });
  }
  if (candidates.length === 0) return [];
  const first = candidates[0];
  const recent = candidates.slice(-3);
  if (candidates.length <= 4) return candidates;
  return first ? [first, ...recent] : recent;
};

const canonicalSnapshotId = (input: {
  sessionId: string;
  headId: string | null;
  watermarkId: string | null;
  recipe: CapsuleRecipe;
  shown: Span[];
}): string => {
  const canonical = JSON.stringify({
    version: SNAPSHOT_VERSION,
    sessionId: input.sessionId,
    headId: input.headId,
    watermarkId: input.watermarkId,
    recipe: input.recipe,
    shown: input.shown.map((span) => [
      span.ownerId,
      span.storageId,
      span.field,
      span.start,
      span.end,
    ]),
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 12);
};

/** Bounded P0 capsule: header plus exact user quotes with `e:<entryId>` refs. */
export const buildThinCapsule: CapsuleBuilder = (event, ctx) => {
  const branch = event.branchEntries;
  const firstKeptEntryId = event.preparation.firstKeptEntryId;
  const cutIndex = branch.findIndex((entry) => entry.id === firstKeptEntryId);
  if (cutIndex < 0) {
    throw new Error(
      `firstKeptEntryId ${firstKeptEntryId} is not on the current branch`,
    );
  }

  const messageEntries = branch.filter(isMessageRecord);
  const firstSavedId = messageEntries[0]?.id ?? branch[0]?.id ?? "?";
  const lastSavedId = messageEntries.at(-1)?.id ?? branch.at(-1)?.id ?? "?";
  const sessionId = ctx.sessionManager.getSessionId();
  const headId = ctx.sessionManager.getLeafId() ?? branch.at(-1)?.id ?? null;
  const watermarkId = branch.at(-1)?.id ?? null;
  const contextWindow =
    ctx.getContextUsage()?.contextWindow ?? ctx.model?.contextWindow ?? 0;

  const recipe: CapsuleRecipe = {
    selectorVersion: SELECTOR_VERSION,
    fieldVersion: FIELD_VERSION,
    budgetChars: CAPSULE_LIMIT,
    contextWindow,
    keep: DEFAULT_SETTINGS.keepUserTurns,
  };

  const header = (snapshotId: string): string =>
    [
      `[Context index v1 | snapshot=${snapshotId}]`,
      `Saved records: ${messageEntries.length} (e:${firstSavedId}..e:${lastSavedId}); live tail starts at e:${firstKeptEntryId}.`,
      `Exact stored text. To read an omitted original: context_index {"action":"read","ref":"e:<id>","field":"<field>"}.`,
    ].join("\n");

  const measuredHeader = header(CAPSULE_PLACEHOLDER);
  const selected = collectSummarizedUsers(branch, cutIndex);

  // Fixed per-quote allowance covers the label, an optional omission marker and
  // the separators; the final length check below is authoritative.
  const PER_QUOTE_OVERHEAD = 320;
  const SEPARATOR_OVERHEAD = 8;
  let textBudget =
    CAPSULE_LIMIT -
    measuredHeader.length -
    selected.length * PER_QUOTE_OVERHEAD -
    SEPARATOR_OVERHEAD;

  const blocks: string[] = [];
  const shown: Span[] = [];
  for (let index = 0; index < selected.length; index++) {
    const quote = selected[index];
    if (!quote) continue;
    const share = Math.floor(textBudget / (selected.length - index));
    if (share <= 0) break;
    const end = fitGraphemePrefix(quote.text, share);
    const partial = end < quote.text.length;
    const label = `U e:${quote.entry.id} | field=${quote.field} | ${
      partial ? `partial 0-${end}/${quote.text.length}` : "full"
    }`;
    const marker = partial
      ? `[e:${quote.entry.id}: ${end}-${quote.text.length} chars omitted; read field ${quote.field} with context_index.]`
      : "";
    blocks.push(
      [label, quote.text.slice(0, end), ...(marker ? [marker] : [])].join(
        "\n",
      ),
    );
    shown.push({
      ownerId: quote.entry.id,
      storageId: quote.entry.id,
      field: quote.field,
      start: 0,
      end,
    });
    textBudget -= end;
  }

  if (selected.length > 0 && blocks.length === 0) {
    const refs = selected
      .map((quote) => `e:${quote.entry.id} (${quote.field})`)
      .join(", ");
    blocks.push(`No room to quote stored text; read ${refs} with context_index.`);
  }

  const snapshotId = canonicalSnapshotId({
    sessionId,
    headId,
    watermarkId,
    recipe,
    shown,
  });
  const finalHeader = header(snapshotId);
  const summary = [finalHeader, ...blocks].join("\n\n");

  if (summary.length > CAPSULE_LIMIT) {
    throw new Error(
      `capsule length ${summary.length} exceeds ${CAPSULE_LIMIT}`,
    );
  }

  const quoted = new Set(shown.map((span) => span.ownerId)).size;
  const saved = messageEntries.length;
  const live = branch
    .slice(cutIndex)
    .filter(isMessageRecord).length;

  const details: CapsuleDetails = {
    kind: DETAILS_KIND,
    schemaVersion: SCHEMA_VERSION,
    sourceSessionId: sessionId,
    sourceHeadId: headId,
    sourceWatermarkId: watermarkId,
    firstKeptEntryId,
    snapshotId,
    recipe,
    shown,
    observations: [],
    counts: {
      saved,
      effective: saved,
      live,
      quoted,
      indexOnly: Math.max(0, saved - live - quoted),
      outside: 0,
    },
    usedChars: summary.length,
  };

  return { summary, firstKeptEntryId, details };
};

export const registerContextIndex = (
  pi: ExtensionAPI,
  options: RegisterContextIndexOptions = {},
): void => {
  const buildCapsule = options.buildCapsule ?? buildThinCapsule;

  pi.registerTool({
    name: "context_index",
    label: "Context Index",
    description:
      "Read one saved session record by its native e:<entryId> reference. The continuation summary names the stored field to read. Returns the exact stored text.",
    promptGuidelines: [
      "When an omitted user instruction matters, use context_index read with the field shown in the summary. Reuse source text already in context.",
    ],
    exposure: "direct",
    parameters: Type.Object(
      {
        action: Type.Literal("read"),
        ref: Type.String({
          description: "Native record reference: e:<entryId>.",
        }),
        field: Type.Optional(
          Type.String({
            description:
              "JSON Pointer of a stored text field; defaults to the record's primary text field.",
          }),
        ),
      },
      { additionalProperties: false },
    ),
    async execute(_toolCallId, params, signal, _onUpdate, ctx) {
      signal?.throwIfAborted();
      const result = readStoredField(
        ctx.sessionManager.getEntries(),
        params.ref,
        params.field,
      );
      if (!result.ok) {
        return {
          content: [{ type: "text", text: result.detail }],
          details: {
            action: "read",
            ref: params.ref,
            error: result.reason,
          } satisfies ReadDetails,
          isError: true,
        };
      }
      const field = result.field;
      return {
        content: [{ type: "text", text: field.text }],
        details: {
          action: "read",
          ref: params.ref,
          ownerId: field.ownerId,
          storageId: field.storageId,
          field: field.path,
          start: 0,
          end: field.text.length,
          chars: field.text.length,
          complete: true,
        } satisfies ReadDetails,
      };
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

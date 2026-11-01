/**
 * Capacity constants and local token estimates.
 *
 * Everything here is a versioned implementation constant, not a user setting.
 * The design (docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md section 9.1 and 10.2)
 * fixes the scale: 3 UTF-16 chars per token for planning, images at 4,800
 * chars. The scale is a capacity estimate, never exact token billing.
 */

/** Planning scale used by the tail cut and the reader headroom. */
export const CHARS_PER_TOKEN = 3;

/** Chars attributed to one image part, mirroring Pi's own estimate. */
export const IMAGE_CONTENT_CHARS = 4_800;

/** Tail cap for manual/threshold compaction: min(16,000, 0.25 * W). */
export const TAIL_MAX_TOKENS = 16_000;
export const TAIL_WINDOW_FRACTION = 0.25;

/** Tighter tail for overflow recovery: min(8,000, 0.15 * W). */
export const OVERFLOW_TAIL_MAX_TOKENS = 8_000;
export const OVERFLOW_WINDOW_FRACTION = 0.15;

/** Capsule cap: min(viewMaxChars, max(2,400, floor(0.06 * W))). */
export const CAPSULE_MIN_CHARS = 2_400;
export const CAPSULE_WINDOW_FRACTION = 0.06;

const safeJsonStringify = (value: unknown): string => {
  try {
    return JSON.stringify(value ?? "") ?? "";
  } catch {
    return "";
  }
};

/**
 * Char length of a message's token-bearing content: text and thinking blocks,
 * tool-call names and arguments, images at a fixed cost, nested tool results.
 * Metadata such as nestedCalls is not model context and is not counted here.
 */
export const estimateContentChars = (content: unknown): number => {
  if (typeof content === "string") return content.length;
  if (!Array.isArray(content)) return 0;
  return content.reduce((sum: number, part: unknown) => {
    if (typeof part !== "object" || part === null) return sum;
    const record = part as Record<string, unknown>;
    switch (record["type"]) {
      case "text":
        return sum + (typeof record["text"] === "string" ? record["text"].length : 0);
      case "thinking":
        return (
          sum +
          (typeof record["thinking"] === "string" ? record["thinking"].length : 0)
        );
      case "toolCall": {
        const args = record["arguments"] ?? record["input"];
        const argChars =
          typeof args === "string" ? args.length : safeJsonStringify(args).length;
        const nameChars =
          typeof record["name"] === "string" ? record["name"].length : 0;
        return sum + nameChars + argChars;
      }
      case "toolResult": {
        const nested = record["content"];
        return (
          sum +
          (typeof nested === "string"
            ? nested.length
            : safeJsonStringify(nested).length)
        );
      }
      case "image":
        return sum + IMAGE_CONTENT_CHARS;
      default:
        return (
          sum + (typeof record["text"] === "string" ? record["text"].length : 0)
        );
    }
  }, 0);
};

/** Char length of anything a message contributes to model context. */
export const estimateMessageChars = (message: unknown): number => {
  if (typeof message !== "object" || message === null) return 0;
  const record = message as Record<string, unknown>;
  if (record["role"] === "bashExecution") {
    const command =
      typeof record["command"] === "string" ? record["command"].length : 0;
    const output = typeof record["output"] === "string" ? record["output"].length : 0;
    return command + output;
  }
  return estimateContentChars(record["content"]);
};

export const estimateTokensFromChars = (
  chars: number,
  charsPerToken: number = CHARS_PER_TOKEN,
): number => Math.ceil(chars / charsPerToken);

/** Token cap for the retained tail. Unknown windows fall back to the base cap. */
export const tailTokenLimit = (
  contextWindow: number,
  reason: "manual" | "threshold" | "overflow",
): number => {
  const overflow = reason === "overflow";
  const base = overflow ? OVERFLOW_TAIL_MAX_TOKENS : TAIL_MAX_TOKENS;
  if (!(contextWindow > 0)) return base;
  const fraction = overflow ? OVERFLOW_WINDOW_FRACTION : TAIL_WINDOW_FRACTION;
  return Math.min(base, Math.floor(fraction * contextWindow));
};

/** Hard capsule cap. Unknown windows still get the narrow-end floor. */
export const capsuleCap = (
  viewMaxChars: number,
  contextWindow: number,
): number => {
  if (!(contextWindow > 0)) return Math.min(viewMaxChars, CAPSULE_MIN_CHARS);
  return Math.min(
    viewMaxChars,
    Math.max(CAPSULE_MIN_CHARS, Math.floor(CAPSULE_WINDOW_FRACTION * contextWindow)),
  );
};

// ── reader output caps and the per-run budget (§10.2) ─────────────────────

export const LIST_SEARCH_OUTPUT_CAP = 4_000;
export const READ_OUTPUT_CAP = 12_000;
export const FULL_READ_OUTPUT_CAP = 48_000;
export const READ_DEFAULT_LENGTH = 6_000;
export const READ_MAX_LENGTH = 12_000;
export const RUN_READ_MAX_CALLS = 8;
export const RUN_READ_MAX_CHARS = 48_000;
export const RESULT_FRAME_RESERVE = 512;
export const BUDGET_EXHAUSTED_FLOOR = 512;
export const LIST_PAGE_SIZE = 20;
export const SEARCH_PAGE_SIZE = 10;
export const SEARCH_SCAN_SLICE_MS = 3_000;

export interface Reservation {
  readonly chars: number;
  readonly settled: boolean;
  readonly released: boolean;
}

/**
 * One agent run's reader ledger. Reservations happen synchronously before the
 * first await; in-flight grants reduce headroom for sibling calls. A new run
 * gets a new ledger, while a reservation always settles against the ledger it
 * was created on.
 */
export class ReaderRunBudget {
  private remaining: number;
  private callsLeft: number;
  private flight = 0;
  private spent = 0;
  private readonly reservations = new Map<
    Reservation,
    { chars: number; state: "active" | "settled" | "released" }
  >();

  constructor(
    readonly maxChars: number = RUN_READ_MAX_CHARS,
    readonly maxCalls: number = RUN_READ_MAX_CALLS,
  ) {
    this.remaining = Math.max(0, maxChars);
    this.callsLeft = Math.max(0, maxCalls);
  }

  get remainingChars(): number {
    return this.remaining;
  }

  get remainingCalls(): number {
    return this.callsLeft;
  }

  get inFlightChars(): number {
    return this.flight;
  }

  get usedChars(): number {
    return this.spent;
  }

  /** Reserve output space and one call, or null for a short diagnostic. */
  reserve(outputCap: number, headroomChars: number): Reservation | null {
    if (this.callsLeft <= 0) return null;
    const chars = Math.min(outputCap, this.remaining, headroomChars);
    if (!(chars > BUDGET_EXHAUSTED_FLOOR)) return null;
    this.callsLeft--;
    this.remaining -= chars;
    this.flight += chars;
    const reservation: Reservation = {
      chars,
      settled: false,
      released: false,
    };
    this.reservations.set(reservation, { chars, state: "active" });
    return reservation;
  }

  settle(reservation: Reservation, actualChars: number): void {
    const entry = this.reservations.get(reservation);
    if (!entry || entry.state !== "active") return;
    const actual = Math.max(0, Math.min(entry.chars, actualChars));
    this.remaining += entry.chars - actual;
    this.flight -= entry.chars;
    this.spent += actual;
    entry.state = "settled";
  }

  release(reservation: Reservation): void {
    const entry = this.reservations.get(reservation);
    if (!entry || entry.state !== "active") return;
    this.remaining += entry.chars;
    this.flight -= entry.chars;
    this.callsLeft++;
    entry.state = "released";
  }
}

/** Reserve tokens: min(8192, model.maxTokens) + ceil(0.05 * W). */
export const contextReserveTokens = (
  contextWindow: number,
  maxOutputTokens: number,
): number => {
  if (!(contextWindow > 0)) return 0;
  const output = Math.max(0, Math.min(8_192, maxOutputTokens));
  return output + Math.ceil(0.05 * contextWindow);
};

/**
 * Reader headroom in chars. Unknown windows return Infinity so the caller's
 * output cap is the only limit; otherwise the formula follows design §10.2.
 */
export const contextHeadroomChars = (input: {
  contextWindow: number;
  usedTokens: number | null;
  maxOutputTokens: number;
  inFlightChars: number;
}): number => {
  if (!(input.contextWindow > 0)) return Number.POSITIVE_INFINITY;
  const used = Math.max(0, input.usedTokens ?? 0);
  const free = Math.max(
    0,
    input.contextWindow -
      used -
      contextReserveTokens(input.contextWindow, input.maxOutputTokens),
  );
  return Math.max(0, Math.floor(3 * free) - input.inFlightChars);
};


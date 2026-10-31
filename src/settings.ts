/**
 * User settings from docs/plans/PI_CONTEXT_INDEX_V0_1_DESIGN.md §12.
 * The file lives in Pi's agent directory as pi-context-index.json. Loading
 * and writing the file belongs to the host adapter; this module only owns the
 * defaults and the boundary check, so an invalid value never reaches the
 * allocator.
 */

export const SETTINGS_FILE_NAME = "pi-context-index.json";

export interface ContextIndexSettings {
  /** Hard cap for the rendered continuation capsule, in UTF-16 characters. */
  viewMaxChars: number;
  /** User turns kept as the live tail. 0 means compact everything. */
  keepUserTurns: number;
  /** Cumulative characters one agent run may re-inject through the reader. */
  runReadMaxChars: number;
}

export const SETTINGS_LIMITS = {
  viewMaxChars: { min: 2_400, max: 24_000 },
  keepUserTurns: { min: 0, max: 10 },
  runReadMaxChars: { min: 12_000, max: 96_000 },
} as const;

export const DEFAULT_SETTINGS: Readonly<ContextIndexSettings> = Object.freeze({
  viewMaxChars: 12_000,
  keepUserTurns: 1,
  runReadMaxChars: 48_000,
});

export interface SettingsError {
  field: string;
  message: string;
}

export type ParseSettingsResult =
  | { ok: true; settings: ContextIndexSettings }
  | { ok: false; errors: SettingsError[] };

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const parseSettings = (raw: unknown): ParseSettingsResult => {
  if (raw === undefined || raw === null) {
    return { ok: true, settings: { ...DEFAULT_SETTINGS } };
  }
  if (!isPlainObject(raw)) {
    return {
      ok: false,
      errors: [{ field: "(root)", message: "settings must be a JSON object" }],
    };
  }

  const settings: ContextIndexSettings = { ...DEFAULT_SETTINGS };
  const errors: SettingsError[] = [];

  for (const field of Object.keys(SETTINGS_LIMITS) as Array<
    keyof ContextIndexSettings
  >) {
    if (!(field in raw)) continue;
    const value = raw[field];
    const { min, max } = SETTINGS_LIMITS[field];
    if (typeof value !== "number" || !Number.isInteger(value)) {
      errors.push({ field, message: `${field} must be an integer` });
      continue;
    }
    if (value < min || value > max) {
      errors.push({
        field,
        message: `${field} must be between ${min} and ${max}`,
      });
      continue;
    }
    settings[field] = value;
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, settings };
};

import { describe, expect, test } from "bun:test";
import {
  DEFAULT_SETTINGS,
  SETTINGS_FILE_NAME,
  SETTINGS_LIMITS,
  parseSettings,
} from "../src/settings";

const fields = ["viewMaxChars", "keepUserTurns", "runReadMaxChars"] as const;

describe("defaults", () => {
  test("match the design", () => {
    expect(SETTINGS_FILE_NAME).toBe("pi-context-index.json");
    expect(DEFAULT_SETTINGS).toEqual({
      viewMaxChars: 12_000,
      keepUserTurns: 1,
      runReadMaxChars: 48_000,
    });
  });

  test("missing, null and empty input all yield a fresh copy", () => {
    for (const raw of [undefined, null, {}]) {
      const result = parseSettings(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) continue;
      expect(result.settings).toEqual({ ...DEFAULT_SETTINGS });
      expect(result.settings).not.toBe(DEFAULT_SETTINGS);
    }
  });
});

describe("valid overrides", () => {
  test("accepts every boundary", () => {
    const raw = {
      viewMaxChars: SETTINGS_LIMITS.viewMaxChars.min,
      keepUserTurns: SETTINGS_LIMITS.keepUserTurns.max,
      runReadMaxChars: SETTINGS_LIMITS.runReadMaxChars.min,
    };
    const result = parseSettings(raw);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings).toEqual(raw);
  });

  test("accepts partial settings and keeps the other defaults", () => {
    const result = parseSettings({ keepUserTurns: 0 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings.keepUserTurns).toBe(0);
      expect(result.settings.viewMaxChars).toBe(DEFAULT_SETTINGS.viewMaxChars);
      expect(result.settings.runReadMaxChars).toBe(
        DEFAULT_SETTINGS.runReadMaxChars,
      );
    }
  });

  test("ignores unknown keys so older or future files still load", () => {
    const result = parseSettings({ keepUserTurns: 3, legacy: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.keepUserTurns).toBe(3);
  });
});

describe("rejections", () => {
  test("rejects a non-object root", () => {
    for (const raw of ["x", 3, true, []]) {
      const result = parseSettings(raw);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.field).toBe("(root)");
    }
  });

  test("rejects non-integers for each field", () => {
    for (const field of fields) {
      for (const value of ["12000", 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        const result = parseSettings({ [field]: value });
        expect(result.ok).toBe(false);
        if (!result.ok) expect(result.errors[0]?.field).toBe(field);
      }
    }
  });

  test("rejects values outside each range", () => {
    const cases = [
      ["viewMaxChars", SETTINGS_LIMITS.viewMaxChars.min - 1],
      ["viewMaxChars", SETTINGS_LIMITS.viewMaxChars.max + 1],
      ["keepUserTurns", SETTINGS_LIMITS.keepUserTurns.min - 1],
      ["keepUserTurns", SETTINGS_LIMITS.keepUserTurns.max + 1],
      ["runReadMaxChars", SETTINGS_LIMITS.runReadMaxChars.min - 1],
      ["runReadMaxChars", SETTINGS_LIMITS.runReadMaxChars.max + 1],
    ] as const;
    for (const [field, value] of cases) {
      const result = parseSettings({ [field]: value });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]?.field).toBe(field);
    }
  });

  test("reports every invalid field in one pass", () => {
    const result = parseSettings({
      viewMaxChars: 100,
      keepUserTurns: 99,
      runReadMaxChars: "many",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.field)).toEqual([
        "viewMaxChars",
        "keepUserTurns",
        "runReadMaxChars",
      ]);
    }
  });
});

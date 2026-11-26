import { describe, expect, it } from "vitest";
import { themeKey, themeTokens } from "@lib/shared/theme";

describe("themeKey", () => {
  it("maps DTO theme states to lowercase keys", () => {
    expect(themeKey("Harmony")).toBe("harmony");
    expect(themeKey("Uneasy")).toBe("uneasy");
    expect(themeKey("Horror")).toBe("horror");
  });

  it("falls back to harmony for unknown states", () => {
    expect(themeKey("bogus")).toBe("harmony");
  });
});

describe("themeTokens", () => {
  it("harmony = bright/calm palette", () => {
    expect(themeTokens("harmony")).toEqual({
      "--medo-scene-bg": "#ecfdf5",
      "--medo-scene-fg": "#065f46",
      "--medo-accent": "#16a34a",
    });
  });

  it("uneasy = smoky/amber palette", () => {
    expect(themeTokens("uneasy")).toEqual({
      "--medo-scene-bg": "#292524",
      "--medo-scene-fg": "#fef3c7",
      "--medo-accent": "#f59e0b",
    });
  });

  it("horror = dark/blue palette", () => {
    expect(themeTokens("horror")).toEqual({
      "--medo-scene-bg": "#0f172a",
      "--medo-scene-fg": "#e0f2fe",
      "--medo-accent": "#38bdf8",
    });
  });
});

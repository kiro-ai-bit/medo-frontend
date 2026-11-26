export type ThemeKey = "harmony" | "uneasy" | "horror";

export function themeKey(state: string): ThemeKey {
  const k = state.toLowerCase();
  return (k === "uneasy" || k === "horror" ? k : "harmony") as ThemeKey;
}

export interface ThemeTokens {
  "--medo-scene-bg": string;
  "--medo-scene-fg": string;
  "--medo-accent": string;
}

/** FR-FE-105: Harmony bright/calm, Uneasy smoky/amber, Horror dark/blue. */
export function themeTokens(key: ThemeKey): ThemeTokens {
  switch (key) {
    case "uneasy":
      return {
        "--medo-scene-bg": "#292524",
        "--medo-scene-fg": "#fef3c7",
        "--medo-accent": "#f59e0b",
      };
    case "horror":
      return {
        "--medo-scene-bg": "#0f172a",
        "--medo-scene-fg": "#e0f2fe",
        "--medo-accent": "#38bdf8",
      };
    default:
      return {
        "--medo-scene-bg": "#ecfdf5",
        "--medo-scene-fg": "#065f46",
        "--medo-accent": "#16a34a",
      };
  }
}

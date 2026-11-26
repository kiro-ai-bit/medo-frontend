"use client";

import type { CSSProperties, ReactNode } from "react";
import { usePatientContext } from "@features/patient-context";
import { useGamification } from "./hooks";
import { useGamificationStore } from "@lib/state/client/gamificationStore";
import { themeKey, themeTokens } from "@lib/shared/theme";

/**
 * Global theme shell (FR-FE-105 / LLD §8.13): resolves the active patient,
 * reads gamification live (last-known memory fallback, LD-FE-15), and publishes
 * the theme tokens as CSS custom properties + `data-theme` on the app shell.
 * Tokens are opt-in — components consume the vars; no global color override
 * (keeps card/text contrast intact across themes).
 */
export function ThemeShell({ children }: { children: ReactNode }) {
  const ctx = usePatientContext();
  const patientId = ctx?.patientId ?? "";
  const q = useGamification(patientId);
  const lastKnown = useGamificationStore((s) =>
    patientId ? s.byPatient[patientId] : undefined,
  );

  const snap = q.data ?? lastKnown ?? null;
  const key = themeKey(snap?.themeState ?? "Harmony");
  const tokens = themeTokens(key);

  return (
    <div data-theme={key} style={tokens as CSSProperties}>
      {children}
    </div>
  );
}

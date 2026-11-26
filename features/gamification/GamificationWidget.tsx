"use client";

import { themeKey, themeTokens } from "@lib/shared/theme";
import { useConnectivity } from "@lib/state/client/connectivityStore";
import { useGamification } from "./hooks";
import { useGamificationStore } from "@lib/state/client/gamificationStore";

/**
 * Harmony Points + Theme widget (FR-FE-024/105). API-only: live data when the
 * query succeeds online; last-known memory snapshot or retained data marked
 * stale when degraded/failed; hidden when nothing is known (LD-FE-15).
 */
export function GamificationWidget({ patientId }: { patientId: string }) {
  const q = useGamification(patientId);
  const lastKnown = useGamificationStore((s) => s.byPatient[patientId]);
  const online = useConnectivity() === "online";

  const snap = q.data ?? lastKnown ?? null;
  if (!snap) return null;

  const stale =
    !online ||
    q.isError ||
    q.isRefetchError ||
    (!q.data && lastKnown !== undefined);
  const tokens = themeTokens(themeKey(snap.themeState));

  return (
    <div
      data-testid="gamification-widget"
      className="flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
      style={{
        background: tokens["--medo-scene-bg"],
        color: tokens["--medo-scene-fg"],
        borderColor: tokens["--medo-accent"],
      }}
    >
      <span data-testid="harmony-points">{snap.harmonyPoints} pts</span>
      <span data-testid="theme-state">{snap.themeState}</span>
      {stale ? (
        <span data-testid="gamification-stale" className="opacity-60">
          stale
        </span>
      ) : null}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { gamificationClient } from "@lib/api/gamification";
import { useGamificationStore } from "@lib/state/client/gamificationStore";
import { queryKeys } from "@lib/state/query/queryKeys";
import { useEffect } from "react";

/** Gamification read — API-only; last-known kept in memory store (LD-FE-15). */
export function useGamification(patientId: string) {
  const q = useQuery({
    queryKey: queryKeys.gamification(patientId),
    queryFn: () => gamificationClient.getGamification(patientId),
    enabled: patientId.length > 0,
  });
  const remember = useGamificationStore((s) => s.remember);
  useEffect(() => {
    if (q.data) {
      remember(patientId, {
        harmonyPoints: q.data.harmonyPoints,
        themeState: q.data.themeState,
      });
    }
  }, [q.data, patientId, remember]);
  return q;
}

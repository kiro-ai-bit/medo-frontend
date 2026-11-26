"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { scheduleDoseClient } from "@lib/api/schedule-dose";
import { medicineClient } from "@lib/api/medicine";
import { gamificationClient } from "@lib/api/gamification";
import { useConnectivity } from "@lib/state/client/connectivityStore";
import { queryClient } from "@lib/state/query/queryClient";
import { queryKeys } from "@lib/state/query/queryKeys";
import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { enqueueWrite } from "@lib/offline/queue/queue";
import { isApiError } from "@lib/api/http/errors";
import { cacheDose, syncDoseSlice } from "./sync";
import { takenOutcomeFor, doseWindowLabel, type DoseWindow } from "./window";

export function useDoseWindowQuery(
  patientId: string,
  from: string,
  to: string,
) {
  return useQuery({
    queryKey: queryKeys.doses(patientId, from, to),
    enabled: patientId.length > 0,
    queryFn: async () => {
      const [doses, medicines, schedules] = await Promise.all([
        scheduleDoseClient.listDoses(patientId, from, to),
        medicineClient.listMedicines(patientId),
        scheduleDoseClient.listSchedules(patientId),
      ]);
      await syncDoseSlice({ patientId, doses, medicines, schedules });
      return { doses, medicines, schedules };
    },
    refetchInterval: 15 * 60_000,
  });
}

export function useTodayFanout(patientId: string) {
  // Stable day-boundary window — millisecond-precision keys would refetch forever.
  const today = new Date().toISOString().slice(0, 10);
  const from = `${new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10)}T00:00:00.000Z`;
  const to = `${today}T23:59:59.999Z`;
  const doses = useDoseWindowQuery(patientId, from, to);
  const gamification = useQuery({
    queryKey: queryKeys.gamification(patientId),
    queryFn: () => gamificationClient.getGamification(patientId),
    enabled: patientId.length > 0,
  });
  return { doses, gamification, today };
}

function isOfflineFailure(e: unknown): boolean {
  return isApiError(e) && e.status === 0;
}

async function enqueueDoseWrite(
  patientId: string,
  doseId: string,
  kind: "outcome" | "snooze",
  outcome?: string,
): Promise<void> {
  await enqueueWrite({
    type: kind,
    patientId,
    doseId,
    payload:
      kind === "outcome" ? { outcome, markedAt: new Date().toISOString() } : {},
  });
}

/** markOutcome: online → API + cache + targeted invalidate; offline → queue (LD-FE-20). */
export function useMarkDose(patientId: string) {
  const connectivity = useConnectivity();
  const m = useMutation({
    mutationFn: async (input: {
      doseId: string;
      outcome: string;
      window: DoseWindow;
    }) => {
      if (connectivity === "degraded") {
        await enqueueDoseWrite(
          patientId,
          input.doseId,
          "outcome",
          input.outcome,
        );
        return null;
      }
      try {
        return await scheduleDoseClient.markOutcome(input.doseId, {
          outcome: input.outcome as "taken-on-time" | "taken-late" | "skipped",
        });
      } catch (e) {
        if (isOfflineFailure(e)) {
          await enqueueDoseWrite(
            patientId,
            input.doseId,
            "outcome",
            input.outcome,
          );
          return null;
        }
        throw e;
      }
    },
    onSuccess: async (dose) => {
      if (dose) await cacheDose(dose);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["doses", patientId] }),
        queryClient.invalidateQueries({ queryKey: ["medicines", patientId] }),
        queryClient.invalidateQueries({
          queryKey: ["gamification", patientId],
        }),
        queryClient.invalidateQueries({ queryKey: ["feed", "unread"] }),
      ]);
    },
  });
  return {
    taken: (doseId: string, window: DoseWindow) =>
      m.mutateAsync({ doseId, outcome: takenOutcomeFor(window), window }),
    skip: (doseId: string) =>
      m.mutateAsync({ doseId, outcome: "skipped", window: "on-time" }),
    pending: m.isPending,
    queued: m.data === null,
  };
}

export function useSnoozeDose(patientId: string) {
  const connectivity = useConnectivity();
  const m = useMutation({
    mutationFn: async (doseId: string) => {
      if (connectivity === "degraded") {
        await enqueueDoseWrite(patientId, doseId, "snooze");
        return null;
      }
      try {
        return await scheduleDoseClient.snoozeDose(doseId);
      } catch (e) {
        if (isOfflineFailure(e)) {
          await enqueueDoseWrite(patientId, doseId, "snooze");
          return null;
        }
        throw e;
      }
    },
    onSuccess: async (dose) => {
      if (dose) await cacheDose(dose);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["doses", patientId] }),
        queryClient.invalidateQueries({ queryKey: ["medicines", patientId] }),
        queryClient.invalidateQueries({
          queryKey: ["gamification", patientId],
        }),
        queryClient.invalidateQueries({ queryKey: ["feed", "unread"] }),
      ]);
    },
  });
  return {
    snooze: (doseId: string) => m.mutateAsync(doseId),
    pending: m.isPending,
  };
}

export { doseWindowLabel };
export type { DoseWindow };
export { usePatientContextStore };

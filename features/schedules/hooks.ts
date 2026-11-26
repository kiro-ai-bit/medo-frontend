"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type {
  CreateScheduleRequest,
  SchedulePatchRequest,
} from "@kiro-ai-bit/contracts";
import { scheduleDoseClient } from "@lib/api/schedule-dose";
import { queryClient } from "@lib/state/query/queryClient";
import { queryKeys } from "@lib/state/query/queryKeys";
import { scheduleCache } from "@lib/offline/db/caches";

export function useSchedules(patientId: string) {
  return useQuery({
    queryKey: queryKeys.schedules(patientId),
    queryFn: async () => {
      const schedules = await scheduleDoseClient.listSchedules(patientId);
      await scheduleCache.upsertSchedules(
        schedules.map((s) => ({
          scheduleId: s.id,
          patientId: s.patientId,
          medicineId: s.medicineId,
          timezone: s.timezone,
          doseTimes: s.doseTimes,
          startDate: s.startDate,
          endDate: s.endDate,
          rrule: s.recurrence.kind === "rrule" ? s.recurrence.rrule : null,
          fetchedAt: new Date().toISOString(),
        })),
      );
      return schedules;
    },
    enabled: patientId.length > 0,
  });
}

export function useSchedule(id: string) {
  return useQuery({
    queryKey: queryKeys.schedule(id),
    queryFn: () => scheduleDoseClient.getSchedule(id),
    enabled: id.length > 0,
  });
}

function invalidate(patientId: string) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["schedules", patientId] }),
    queryClient.invalidateQueries({ queryKey: ["schedule"] }),
    queryClient.invalidateQueries({ queryKey: ["doses", patientId] }),
  ]);
}

export function useCreateSchedule(patientId: string) {
  return useMutation({
    mutationFn: (input: CreateScheduleRequest) =>
      scheduleDoseClient.createSchedule(patientId, input),
    onSuccess: () => invalidate(patientId),
  });
}

export function usePatchSchedule(patientId: string) {
  return useMutation({
    mutationFn: (input: { id: string; patch: SchedulePatchRequest }) =>
      scheduleDoseClient.patchSchedule(input.id, input.patch),
    onSuccess: () => invalidate(patientId),
  });
}

export function useDeleteSchedule(patientId: string) {
  return useMutation({
    mutationFn: (id: string) => scheduleDoseClient.deleteSchedule(id),
    onSuccess: () => invalidate(patientId),
  });
}

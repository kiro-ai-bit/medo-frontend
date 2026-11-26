import type {
  DoseDetailDto,
  DoseSummaryDto,
  ScheduleSummaryDto,
} from "@kiro-ai-bit/contracts";
import type { PatientMedicineSummaryDto } from "@kiro-ai-bit/contracts";
import {
  doseCache,
  evictDosesOutsideWindow,
  medicineCache,
  scheduleCache,
} from "@lib/offline/db/caches";
import { metaStore } from "@lib/offline/db/caches";
import type { CachedDose } from "@lib/offline/db/medoDb";
import { DateTime } from "luxon";

function toCachedDose(d: DoseSummaryDto | DoseDetailDto): CachedDose {
  return {
    doseId: d.id,
    patientId: d.patientId,
    scheduleId: d.scheduleId,
    medicineId: d.medicineId,
    localDate: d.localDate,
    doseTime: d.doseTime,
    scheduledAt: d.scheduledAt,
    outcome: d.outcome === "unmarked" ? null : d.outcome,
    snoozedUntil: d.snoozedUntil,
    skippedByUser: d.skippedByUser,
    actorId: d.actorId,
    markedAt: d.markedAt,
    fetchedAt: new Date().toISOString(),
  };
}

function toCachedMedicine(m: PatientMedicineSummaryDto): {
  medicineId: string;
  patientId: string;
  displayName: string;
  dosage: string;
  photoUrl: string | null;
  dosesRemaining: number | null;
  refillThreshold: number | null;
  archived: boolean;
  fetchedAt: string;
} {
  return {
    medicineId: m.id,
    patientId: m.patientId,
    displayName: m.catalog.brandName,
    dosage: m.dosage,
    photoUrl: m.catalog.photos.A ?? m.catalog.photos.B ?? m.catalog.photos.C,
    dosesRemaining: m.dosesRemaining,
    refillThreshold: m.refillThreshold ?? null,
    archived: false,
    fetchedAt: new Date().toISOString(),
  };
}

function toCachedSchedule(s: ScheduleSummaryDto) {
  return {
    scheduleId: s.id,
    patientId: s.patientId,
    medicineId: s.medicineId,
    timezone: s.timezone,
    doseTimes: s.doseTimes,
    startDate: s.startDate,
    endDate: s.endDate,
    rrule: s.recurrence.kind === "rrule" ? s.recurrence.rrule : null,
    fetchedAt: new Date().toISOString(),
  };
}

/** Populate-on-read cache write (HD-FE-05 / §8.5); server stays truth. */
export async function syncDoseSlice(input: {
  patientId: string;
  doses: (DoseSummaryDto | DoseDetailDto)[];
  medicines: PatientMedicineSummaryDto[];
  schedules: ScheduleSummaryDto[];
}): Promise<void> {
  const { patientId } = input;
  const from = DateTime.now().minus({ days: 7 }).toISODate()!;
  const to = DateTime.now().plus({ days: 1 }).toISODate()!;
  await Promise.all([
    doseCache.upsertDoses(input.doses.map(toCachedDose)),
    medicineCache.upsertMedicines(input.medicines.map(toCachedMedicine)),
    scheduleCache.upsertSchedules(input.schedules.map(toCachedSchedule)),
  ]);
  await evictDosesOutsideWindow(patientId, from, to);
  await metaStore.set("lastFullSyncAt", new Date().toISOString());
}

/** Single-row upsert after a successful mark/snooze (keeps Dexie fresh pre-refetch). */
export async function cacheDose(dose: DoseDetailDto): Promise<void> {
  await doseCache.upsertDoses([toCachedDose(dose)]);
}

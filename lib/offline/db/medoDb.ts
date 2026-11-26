import Dexie, { type Table } from "dexie";

export interface CachedDose {
  doseId: string;
  patientId: string;
  scheduleId: string;
  medicineId: string;
  localDate: string;
  doseTime: string;
  scheduledAt: string;
  outcome: string | null;
  snoozedUntil: string | null;
  skippedByUser: boolean;
  actorId: string | null;
  markedAt: string | null;
  fetchedAt: string;
}

export interface CachedMedicine {
  medicineId: string;
  patientId: string;
  displayName: string;
  dosage: string;
  photoUrl: string | null;
  dosesRemaining: number | null;
  refillThreshold: number | null;
  archived: boolean;
  fetchedAt: string;
}

export interface CachedSchedule {
  scheduleId: string;
  patientId: string;
  medicineId: string;
  timezone: string;
  doseTimes: string[];
  startDate: string | null;
  endDate: string | null;
  rrule: string | null;
  fetchedAt: string;
}

export type QueueEntryType = "outcome" | "snooze";

export interface QueueEntry {
  entryId?: number;
  type: QueueEntryType;
  patientId: string;
  doseId: string;
  payload: { outcome?: string; markedAt?: string };
  enqueuedAt: string;
  attempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  dead?: boolean;
}

export interface MetaRow {
  key: string;
  value: unknown;
}

/** Dexie `medo` v1 — the ONLY client persistence boundary (LD-FE-08). */
export class MedoDb extends Dexie {
  doses!: Table<CachedDose, string>;
  medicines!: Table<CachedMedicine, string>;
  schedules!: Table<CachedSchedule, string>;
  writeQueue!: Table<QueueEntry, number>;
  meta!: Table<MetaRow, string>;

  constructor() {
    super("medo");
    this.version(1).stores({
      doses:
        "doseId, [patientId+scheduledAt], [patientId+localDate], [patientId+outcome]",
      medicines: "medicineId, patientId",
      schedules: "scheduleId, [patientId+medicineId]",
      writeQueue: "++entryId, enqueuedAt, patientId",
      meta: "key",
    });
  }
}

export const medoDb = new MedoDb();

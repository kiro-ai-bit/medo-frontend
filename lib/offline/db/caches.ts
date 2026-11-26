import {
  medoDb,
  type CachedDose,
  type CachedMedicine,
  type CachedSchedule,
} from "./medoDb";

export const doseCache = {
  async upsertDoses(rows: CachedDose[]): Promise<void> {
    await medoDb.doses.bulkPut(rows);
  },
  async dosesForRange(patientId: string, from: string, to: string) {
    return medoDb.doses
      .where("[patientId+localDate]")
      .between([patientId, from], [patientId, to], true, true)
      .toArray();
  },
  async getDose(doseId: string): Promise<CachedDose | undefined> {
    return medoDb.doses.get(doseId);
  },
  async purgePatient(patientId: string): Promise<void> {
    await Promise.all([
      medoDb.doses.where("patientId").equals(patientId).delete(),
      medoDb.medicines.where("patientId").equals(patientId).delete(),
      medoDb.schedules.where("patientId").equals(patientId).delete(),
      medoDb.writeQueue.where("patientId").equals(patientId).delete(),
    ]);
  },
};

export const medicineCache = {
  async upsertMedicines(rows: CachedMedicine[]): Promise<void> {
    await medoDb.medicines.bulkPut(rows);
  },
  async medicinesFor(patientId: string): Promise<CachedMedicine[]> {
    return medoDb.medicines.where("patientId").equals(patientId).toArray();
  },
};

export const scheduleCache = {
  async upsertSchedules(rows: CachedSchedule[]): Promise<void> {
    await medoDb.schedules.bulkPut(rows);
  },
  async schedulesFor(patientId: string): Promise<CachedSchedule[]> {
    return medoDb.schedules.where("patientId").equals(patientId).toArray();
  },
};

export async function evictDosesOutsideWindow(
  patientId: string,
  fromLocalDate: string,
  toLocalDate: string,
): Promise<void> {
  const rows = await medoDb.doses
    .where("patientId")
    .equals(patientId)
    .toArray();
  const doomed = rows
    .filter((d) => d.localDate < fromLocalDate || d.localDate > toLocalDate)
    .map((d) => d.doseId);
  if (doomed.length > 0) await medoDb.doses.bulkDelete(doomed);
}

export const metaStore = {
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const row = await medoDb.meta.get(key);
    return row?.value as T | undefined;
  },
  async set(key: string, value: unknown): Promise<void> {
    await medoDb.meta.put({ key, value });
  },
  async delete(key: string): Promise<void> {
    await medoDb.meta.delete(key);
  },
};

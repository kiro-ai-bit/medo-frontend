import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { medoDb } from "@lib/offline/db/medoDb";
import {
  doseCache,
  evictDosesOutsideWindow,
  medicineCache,
  metaStore,
  scheduleCache,
} from "@lib/offline/db/caches";
import { enqueueWrite, pendingCount } from "@lib/offline/queue/queue";

const PID = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function dose(over: Record<string, unknown> = {}) {
  return {
    doseId: crypto.randomUUID(),
    patientId: PID,
    scheduleId: crypto.randomUUID(),
    medicineId: crypto.randomUUID(),
    localDate: "2026-11-26",
    doseTime: "08:00",
    scheduledAt: "2026-11-26T03:00:00.000Z",
    outcome: null,
    snoozedUntil: null,
    skippedByUser: false,
    actorId: null,
    markedAt: null,
    fetchedAt: "2026-11-26T00:00:00.000Z",
    ...over,
  };
}

afterEach(async () => {
  await medoDb.open();
  await Promise.all(medoDb.tables.map((t) => t.clear()));
});

describe("medoDb v1 schema (INV-FE-1/4, LD-FE-08)", () => {
  it("has exactly the 5 locked stores", async () => {
    await medoDb.open();
    expect(medoDb.tables.map((t) => t.name).sort()).toEqual([
      "doses",
      "medicines",
      "meta",
      "schedules",
      "writeQueue",
    ]);
  });

  it("doses store exposes the three patient-scoped indexes", async () => {
    await medoDb.open();
    const idx = medoDb.table("doses").schema.indexes.map((i) => i.name);
    expect(idx).toEqual(
      expect.arrayContaining([
        "[patientId+scheduledAt]",
        "[patientId+localDate]",
        "[patientId+outcome]",
      ]),
    );
  });

  it("doseCache upserts, ranges and purges per patient", async () => {
    const other = dose({ patientId: OTHER });
    await doseCache.upsertDoses([dose(), other]);
    expect(
      await doseCache.dosesForRange(PID, "2026-11-25", "2026-11-27"),
    ).toHaveLength(1);
    await doseCache.purgePatient(PID);
    expect(await medoDb.doses.count()).toBe(1);
    expect(await medoDb.doses.get(other.doseId)).toBeDefined();
  });

  it("medicineCache + scheduleCache round-trip display rows", async () => {
    await medicineCache.upsertMedicines([
      {
        medicineId: "m1",
        patientId: PID,
        displayName: "Amoxicillin",
        dosage: "500mg",
        photoUrl: null,
        dosesRemaining: 12,
        refillThreshold: 6,
        archived: false,
        fetchedAt: "2026-11-26T00:00:00.000Z",
      },
    ]);
    await scheduleCache.upsertSchedules([
      {
        scheduleId: "s1",
        patientId: PID,
        medicineId: "m1",
        timezone: "Asia/Karachi",
        doseTimes: ["08:00"],
        startDate: "2026-11-01",
        endDate: null,
        rrule: null,
        fetchedAt: "2026-11-26T00:00:00.000Z",
      },
    ]);
    expect(await medicineCache.medicinesFor(PID)).toHaveLength(1);
    expect(await scheduleCache.schedulesFor(PID)).toHaveLength(1);
  });

  it("evictDosesOutsideWindow removes rows outside [from,to] localDate", async () => {
    await doseCache.upsertDoses([
      dose({ localDate: "2026-11-10" }),
      dose({ localDate: "2026-11-20" }),
      dose({ localDate: "2026-11-26" }),
      dose({ localDate: "2026-12-05" }),
    ]);
    await evictDosesOutsideWindow(PID, "2026-11-19", "2026-11-27");
    const left = await doseCache.dosesForRange(PID, "2020-01-01", "2030-01-01");
    expect(left.map((d) => d.localDate).sort()).toEqual([
      "2026-11-20",
      "2026-11-26",
    ]);
  });

  it("meta store round-trips JSON values", async () => {
    await metaStore.set("lastFullSyncAt", "2026-11-26T01:00:00.000Z");
    await metaStore.set("endedLinks:abc", true);
    expect(await metaStore.get<string>("lastFullSyncAt")).toBe(
      "2026-11-26T01:00:00.000Z",
    );
    expect(await metaStore.get<boolean>("endedLinks:abc")).toBe(true);
    expect(await metaStore.get("missing")).toBeUndefined();
  });
});

describe("writeQueue (LD-FE-09/10, INV-FE-3)", () => {
  it("enqueueWrite appends FIFO entries and counts pending", async () => {
    const a = await enqueueWrite({
      type: "outcome",
      patientId: PID,
      doseId: "d1",
      payload: { outcome: "taken-on-time" },
    });
    const b = await enqueueWrite({
      type: "snooze",
      patientId: PID,
      doseId: "d2",
      payload: {},
    });
    expect(a.entryId).toBeLessThan(b.entryId!);
    expect(await pendingCount()).toBe(2);
    const rows = await medoDb.writeQueue.orderBy("entryId").toArray();
    expect(rows.map((r) => r.doseId)).toEqual(["d1", "d2"]);
    expect(rows[0]!.attempts).toBe(0);
    expect(rows[0]!.nextAttemptAt).toBeTruthy();
  });
});

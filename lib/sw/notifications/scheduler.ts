import { DateTime } from "luxon";
import {
  medoDb,
  type CachedDose as CachedDoseRow,
} from "@lib/offline/db/medoDb";
import { metaStore } from "@lib/offline/db/caches";
import {
  reminderInstants,
  type ReminderInstant,
  type ReminderRole,
} from "./reminderRhythm";

export const SELF_PATIENT_KEY = "reminder:selfPatientId";
export const SELF_ROLE_KEY = "reminder:role";
const FIRED_KEY = "reminderFired";
const HORIZON_DAYS = 7;

type FiredMap = Record<string, string>;

let timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function getFiredSet(): Promise<FiredMap> {
  return (await metaStore.get<FiredMap>(FIRED_KEY)) ?? {};
}

async function markFired(key: string): Promise<void> {
  const fired = await getFiredSet();
  fired[key] = new Date().toISOString();
  // Prune entries older than 2 days — keys embed the fire instant anyway.
  const cutoff = Date.now() - 2 * 86_400_000;
  for (const [k, iso] of Object.entries(fired)) {
    if (Date.parse(iso) < cutoff) delete fired[k];
  }
  await metaStore.set(FIRED_KEY, fired);
}

function outcomeHint(window: ReminderInstant["window"]): string {
  return window === "early" || window === "on-time"
    ? "taken-on-time"
    : "taken-late";
}

async function fireInstant(
  dose: CachedDoseRow,
  instant: ReminderInstant,
): Promise<void> {
  const fresh = await medoDb.doses.get(dose.doseId);
  if (!fresh || fresh.outcome !== null || fresh.skippedByUser) return;
  const med = await medoDb.medicines.get(dose.medicineId);
  const name = med?.displayName ?? "your medicine";
  const dosage = med?.dosage ? ` ${med.dosage}` : "";
  const reg = (globalThis as { registration?: ServiceWorkerRegistration })
    .registration;
  if (!reg) return;
  const options = {
    body: `${name}${dosage} — scheduled at ${dose.doseTime}. Open Medo to mark it.`,
    tag: instant.tag,
    icon: med?.photoUrl ?? "/icons/icon-192.png",
    data: {
      doseId: dose.doseId,
      url: `/today?dose=${dose.doseId}`,
      kind: "dose",
      actionOutcome: outcomeHint(instant.window),
    },
    actions: [
      { action: "taken", title: "Taken" },
      { action: "snooze", title: "Snooze" },
    ],
  } as unknown as NotificationOptions;
  await reg.showNotification("Time for your medicine", options);
  await markFired(instant.key);
}

/**
 * LLD §8.6 / LD-FE-12: recompute all reminder instants from Dexie.
 * Runs in the SW on: page message, SW activate, connectivity-restore message.
 */
export async function rescheduleAll(now: Date = new Date()): Promise<void> {
  for (const t of timers.values()) clearTimeout(t);
  timers = new Map();

  const [doses, schedules, fired, role, selfPatientId] = await Promise.all([
    medoDb.doses.toArray(),
    medoDb.schedules.toArray(),
    getFiredSet(),
    metaStore.get<ReminderRole>(SELF_ROLE_KEY),
    metaStore.get<string>(SELF_PATIENT_KEY),
  ]);
  const tzBySchedule = new Map(
    schedules.map((s) => [s.scheduleId, s.timezone]),
  );
  const horizonEnd = DateTime.fromJSDate(now).plus({ days: HORIZON_DAYS });

  for (const dose of doses) {
    if (dose.outcome !== null || dose.skippedByUser) continue;
    if (DateTime.fromISO(dose.localDate) > horizonEnd) continue;
    const effectiveRole: ReminderRole =
      role === "patient" && dose.patientId === selfPatientId
        ? "patient"
        : "caregiver";
    const tz = tzBySchedule.get(dose.scheduleId) ?? "UTC";
    for (const instant of reminderInstants(dose, tz, effectiveRole, now)) {
      if (fired[instant.key]) continue;
      const delay = Date.parse(instant.at) - now.getTime();
      if (delay <= 0) continue;
      timers.set(
        instant.key,
        setTimeout(() => {
          timers.delete(instant.key);
          void fireInstant(dose, instant).catch(() => {});
        }, delay),
      );
    }
  }
}

import { DateTime } from "luxon";

export type ReminderRole = "patient" | "caregiver";
export type ReminderWindow = "early" | "on-time" | "late" | "hourly";

export interface RhythmDose {
  doseId: string;
  scheduledAt: string;
  localDate: string;
  outcome: string | null;
  skippedByUser: boolean;
  snoozedUntil: string | null;
}

export interface ReminderInstant {
  /** ISO instant the notification should fire. */
  at: string;
  window: ReminderWindow;
  /** Notification tag per LLD §8.6 — replaces prior same-window ping. */
  tag: string;
  /** Dedup key across SW restarts (fired set in Dexie meta). */
  key: string;
}

/**
 * Reminder rhythm (Map 1 t06 / FR-FE-091):
 * patient — T−30 (early), T (on-time), T+1h (late), then hourly until marked/midnight.
 * caregiver — backup from T+1h, hourly until marked/midnight (silent in patient window).
 * Midnight = end of dose.localDate in the schedule timezone (missed-lock boundary).
 */
export function reminderInstants(
  dose: RhythmDose,
  scheduleTimezone: string,
  role: ReminderRole,
  now: Date,
): ReminderInstant[] {
  if (dose.outcome !== null || dose.skippedByUser) return [];

  const tz = scheduleTimezone || "UTC";
  const todayLocal = DateTime.fromJSDate(now).setZone(tz).toISODate();
  if (todayLocal && dose.localDate < todayLocal) return [];

  const scheduled = DateTime.fromISO(dose.scheduledAt);
  if (!scheduled.isValid) return [];

  // First instant of the next schedule-local day = missed-lock boundary.
  const dayEnd = DateTime.fromISO(dose.localDate, { zone: tz })
    .plus({ days: 1 })
    .startOf("day");
  if (!dayEnd.isValid) return [];

  const offsets: { minutes: number; window: ReminderWindow }[] =
    role === "patient"
      ? [
          { minutes: -30, window: "early" },
          { minutes: 0, window: "on-time" },
          { minutes: 60, window: "late" },
        ]
      : [{ minutes: 60, window: "late" }];

  const instants: ReminderInstant[] = [];
  const push = (at: DateTime, window: ReminderWindow) => {
    if (!at.isValid || at >= dayEnd) return;
    const iso = at.toUTC().toISO();
    if (!iso) return;
    instants.push({
      at: iso,
      window,
      tag: `dose:${dose.doseId}:${window}`,
      key: `${dose.doseId}:${window}:${iso}`,
    });
  };

  for (const o of offsets)
    push(scheduled.plus({ minutes: o.minutes }), o.window);

  // Hourly continuation from T+2h (patient) / T+2h (caregiver starts T+1h,
  // next hourly at T+2h) until the local-day boundary.
  let hourly = scheduled.plus({ minutes: 120 });
  while (hourly < dayEnd && instants.length < 48) {
    push(hourly, "hourly");
    hourly = hourly.plus({ hours: 1 });
  }

  const snoozedUntil = dose.snoozedUntil
    ? DateTime.fromISO(dose.snoozedUntil)
    : null;
  return instants.filter((i) => {
    const at = DateTime.fromISO(i.at);
    if (at <= DateTime.fromJSDate(now)) return false;
    if (snoozedUntil?.isValid && at <= snoozedUntil) return false;
    return true;
  });
}

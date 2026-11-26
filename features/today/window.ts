import { DateTime } from "luxon";

export type DoseWindow =
  "upcoming" | "takeable" | "on-time" | "late" | "missed" | "marked";

export interface WindowDose {
  scheduledAt: string;
  localDate: string;
  outcome: string | null;
  skippedByUser: boolean;
}

const OUTCOME_LABELS: Record<string, string> = {
  "taken-on-time": "Taken on time",
  "taken-late": "Taken late",
  skipped: "Skipped",
  missed: "Missed",
};

export function outcomeLabel(outcome: string | null): string | null {
  if (!outcome || outcome === "unmarked") return null;
  return OUTCOME_LABELS[outcome] ?? outcome;
}

/** Display-only window label (LLD §8.9); server owns outcome classification. */
export function doseWindowLabel(
  dose: WindowDose,
  scheduleTimezone: string,
  now: Date,
): { window: DoseWindow; label: string } {
  const marked = dose.outcome !== null && dose.outcome !== "unmarked";
  if (marked) {
    return {
      window: "marked",
      label: outcomeLabel(dose.outcome) ?? dose.outcome!,
    };
  }
  const nowLocalDate = DateTime.fromJSDate(now)
    .setZone(scheduleTimezone)
    .toISODate();
  if (nowLocalDate && nowLocalDate > dose.localDate) {
    return { window: "missed", label: "Missed" };
  }
  const scheduled = DateTime.fromISO(dose.scheduledAt);
  const diffMin = scheduled.diff(DateTime.fromJSDate(now), "minutes").minutes;
  if (diffMin > 30) return { window: "upcoming", label: "Upcoming" };
  if (diffMin > 0) return { window: "takeable", label: "Take now" };
  if (diffMin >= -60) return { window: "on-time", label: "On time" };
  return { window: "late", label: "Late" };
}

/** Client-side markable outcome for the Taken action (LD-SCH-09 accept matrix). */
export function takenOutcomeFor(
  window: DoseWindow,
): "taken-on-time" | "taken-late" {
  return window === "late" || window === "missed"
    ? "taken-late"
    : "taken-on-time";
}

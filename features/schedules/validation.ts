import type { RecurrenceInput } from "./recurrence";

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Strict HH:mm check for a single dose time. */
export function isHhmm(value: string): boolean {
  return HHMM.test(value);
}

/** Strict yyyy-mm-dd calendar-date check (shape only; real dates validated by compare). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/**
 * Validate guided-builder input before submit (PRD schedule-builder rules:
 * ≥1 date or repeat rule; ≥1 valid HH:mm dose time; start ≤ end).
 * Returns an error message, or null when valid.
 */
export function validateScheduleInput(input: {
  kind: RecurrenceInput["kind"];
  dates: string[];
  byDay: string[];
  doseTimes: string[];
  startDate: string;
  endDate: string;
}): string | null {
  if (input.kind === "once") {
    if (input.dates.length === 0) return "Select at least one date";
    if (input.dates.some((d) => !isIsoDate(d)))
      return "Dates must be yyyy-mm-dd";
  } else if (input.kind === "weekly" && input.byDay.length === 0) {
    return "Select at least one weekday";
  }
  if (input.doseTimes.length === 0) return "At least one dose time required";
  if (input.doseTimes.some((t) => !isHhmm(t)))
    return "Dose times must be HH:MM (00:00–23:59)";
  if (input.startDate && !isIsoDate(input.startDate))
    return "Start date must be yyyy-mm-dd";
  if (input.endDate && !isIsoDate(input.endDate))
    return "End date must be yyyy-mm-dd";
  if (
    input.startDate &&
    input.endDate &&
    isIsoDate(input.startDate) &&
    isIsoDate(input.endDate) &&
    input.endDate < input.startDate
  ) {
    return "End date must be on or after start date";
  }
  return null;
}

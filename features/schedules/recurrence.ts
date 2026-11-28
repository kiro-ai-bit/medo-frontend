import type { RecurrenceDto } from "@kiro-ai-bit/contracts";

export type RecurrenceKind = "once" | "weekly" | "monthly" | "yearly";

export interface RecurrenceInput {
  kind: RecurrenceKind;
  /** ISO dates (yyyy-mm-dd) for kind=once → date-list recurrence. */
  dates?: string[];
  interval?: number; // >=1, default 1
  /** Weekdays for weekly: MO..SU subset. */
  byDay?: string[];
}

const BYDAY_ORDER = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Build the contract RecurrenceDto from guided-builder input. */
export function buildRecurrence(input: RecurrenceInput): RecurrenceDto {
  if (input.kind === "once") {
    const dates = [...new Set(input.dates ?? [])].sort();
    if (dates.length === 0) throw new Error("At least one date is required");
    return { kind: "date-list", dates };
  }
  const freq = input.kind.toUpperCase();
  const interval = Math.max(1, Math.floor(input.interval ?? 1));
  const parts = [`FREQ=${freq}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (input.kind === "weekly" && input.byDay?.length) {
    const ordered = BYDAY_ORDER.filter((d) => input.byDay!.includes(d));
    if (ordered.length) parts.push(`BYDAY=${ordered.join(",")}`);
  }
  return { kind: "rrule", rrule: parts.join(";") };
}

/** Human preview of the recurrence for the builder UI. */
export function describeRecurrence(input: RecurrenceInput): string {
  if (input.kind === "once") {
    const n = new Set(input.dates ?? []).size;
    return n === 1 ? "Once on 1 selected date" : `Once on ${n} selected dates`;
  }
  const interval = Math.max(1, Math.floor(input.interval ?? 1));
  const every = interval === 1 ? "Every" : `Every ${interval}`;
  if (input.kind === "weekly") {
    const days = (input.byDay ?? []).length
      ? ` on ${input.byDay!.join(", ")}`
      : "";
    const weeks = interval === 1 ? "week" : "weeks";
    return `${every} ${weeks}${days}`;
  }
  const unit = input.kind === "monthly" ? "month" : "year";
  const noun = interval === 1 ? unit : `${unit}s`;
  return interval === 1 ? `Every ${noun}` : `${every} ${noun}`;
}

/** Default schedule timezone = browser IANA tz. */
export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

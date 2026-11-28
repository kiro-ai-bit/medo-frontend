import { describe, expect, it } from "vitest";
import {
  isHhmm,
  isIsoDate,
  validateScheduleInput,
} from "@features/schedules/validation";

const base = {
  kind: "weekly" as const,
  dates: [] as string[],
  byDay: ["MO"],
  doseTimes: ["08:00"],
  startDate: "2026-11-28",
  endDate: "",
};

describe("isHhmm / isIsoDate", () => {
  it("accepts valid values only", () => {
    expect(isHhmm("08:00")).toBe(true);
    expect(isHhmm("23:59")).toBe(true);
    expect(isHhmm("24:00")).toBe(false);
    expect(isHhmm("8:00")).toBe(false);
    expect(isHhmm("08:60")).toBe(false);
    expect(isIsoDate("2026-11-28")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("28-11-2026")).toBe(false);
  });
});

describe("validateScheduleInput", () => {
  it("accepts a valid weekly schedule", () => {
    expect(validateScheduleInput(base)).toBeNull();
  });

  it("rejects weekly with no weekdays", () => {
    expect(validateScheduleInput({ ...base, byDay: [] })).toMatch(/weekday/i);
  });

  it("rejects once with no dates or bad dates", () => {
    expect(validateScheduleInput({ ...base, kind: "once", dates: [] })).toMatch(
      /date/i,
    );
    expect(
      validateScheduleInput({ ...base, kind: "once", dates: ["nope"] }),
    ).toMatch(/yyyy-mm-dd/);
  });

  it("rejects empty or malformed dose times", () => {
    expect(validateScheduleInput({ ...base, doseTimes: [] })).toMatch(
      /dose time/i,
    );
    expect(validateScheduleInput({ ...base, doseTimes: ["8am"] })).toMatch(
      /HH:MM/,
    );
    expect(
      validateScheduleInput({ ...base, doseTimes: ["08:00", "25:99"] }),
    ).toMatch(/HH:MM/);
  });

  it("rejects end before start", () => {
    expect(
      validateScheduleInput({
        ...base,
        startDate: "2026-12-01",
        endDate: "2026-11-30",
      }),
    ).toMatch(/end date/i);
    expect(
      validateScheduleInput({
        ...base,
        startDate: "2026-12-01",
        endDate: "2026-12-01",
      }),
    ).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import {
  reminderInstants,
  type RhythmDose,
} from "@lib/sw/notifications/reminderRhythm";

const TZ = "Asia/Karachi"; // UTC+5, no DST

function dose(over: Partial<RhythmDose> = {}): RhythmDose {
  // 2026-11-26 08:00 PKT = 03:00 UTC
  return {
    doseId: "d1",
    scheduledAt: "2026-11-26T03:00:00.000Z",
    localDate: "2026-11-26",
    outcome: null,
    skippedByUser: false,
    snoozedUntil: null,
    ...over,
  };
}

describe("reminderInstants", () => {
  it("patient: T-30/T/T+1h then hourly until schedule-local midnight", () => {
    const now = new Date("2026-11-25T20:00:00.000Z"); // day before
    const instants = reminderInstants(dose(), TZ, "patient", now);
    const ats = instants.map((i) => i.at);
    expect(ats[0]).toBe("2026-11-26T02:30:00.000Z"); // T-30
    expect(ats[1]).toBe("2026-11-26T03:00:00.000Z"); // T
    expect(ats[2]).toBe("2026-11-26T04:00:00.000Z"); // T+1h
    expect(ats[3]).toBe("2026-11-26T05:00:00.000Z"); // hourly T+2h
    expect(instants[0]!.window).toBe("early");
    expect(instants[1]!.window).toBe("on-time");
    expect(instants[2]!.window).toBe("late");
    expect(instants[3]!.window).toBe("hourly");
    // Last instant before PKT midnight = 2026-11-26T19:00:00.000Z
    const last = Date.parse(ats.at(-1)!);
    expect(last).toBeLessThan(Date.parse("2026-11-26T19:00:00.000Z"));
    expect(last).toBeGreaterThanOrEqual(Date.parse("2026-11-26T18:00:00.000Z"));
  });

  it("caregiver: silent in patient window, backup from T+1h", () => {
    const now = new Date("2026-11-25T20:00:00.000Z");
    const instants = reminderInstants(dose(), TZ, "caregiver", now);
    expect(instants[0]!.at).toBe("2026-11-26T04:00:00.000Z");
    expect(instants[0]!.window).toBe("late");
    expect(instants.every((i) => i.window !== "early")).toBe(true);
    expect(instants.some((i) => i.window === "on-time")).toBe(false);
  });

  it("suppresses doses with outcome or plan-skip", () => {
    const now = new Date("2026-11-25T20:00:00.000Z");
    expect(
      reminderInstants(dose({ outcome: "taken-on-time" }), TZ, "patient", now),
    ).toEqual([]);
    expect(
      reminderInstants(dose({ skippedByUser: true }), TZ, "patient", now),
    ).toEqual([]);
  });

  it("suppresses doses whose localDate is before today in schedule tz", () => {
    const now = new Date("2026-11-26T20:00:00.000Z"); // 27th 01:00 PKT
    expect(reminderInstants(dose(), TZ, "patient", now)).toEqual([]);
  });

  it("filters past instants and honors snoozedUntil", () => {
    // now = 02:45 UTC → T-30 (02:30) past; T (03:00) future
    const now = new Date("2026-11-26T02:45:00.000Z");
    const instants = reminderInstants(dose(), TZ, "patient", now);
    expect(instants[0]!.at).toBe("2026-11-26T03:00:00.000Z");
    // snooze until 04:30 → T and T+1h suppressed
    const snoozed = reminderInstants(
      dose({ snoozedUntil: "2026-11-26T04:30:00.000Z" }),
      TZ,
      "patient",
      now,
    );
    expect(snoozed[0]!.at).toBe("2026-11-26T05:00:00.000Z");
  });

  it("produces dedup keys and dose-scoped tags", () => {
    const now = new Date("2026-11-25T20:00:00.000Z");
    const instants = reminderInstants(dose(), TZ, "patient", now);
    const keys = new Set(instants.map((i) => i.key));
    expect(keys.size).toBe(instants.length);
    expect(instants[0]!.tag).toBe("dose:d1:early");
  });
});

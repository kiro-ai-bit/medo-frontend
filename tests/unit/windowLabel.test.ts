import { describe, expect, it } from "vitest";
import { DateTime } from "luxon";
import { doseWindowLabel, takenOutcomeFor } from "@features/today/window";

const TZ = "Asia/Karachi"; // UTC+5
// scheduledAt 2026-11-26T03:00Z = 08:00 PKT
const dose = {
  scheduledAt: "2026-11-26T03:00:00.000Z",
  localDate: "2026-11-26",
  outcome: null,
  skippedByUser: false,
};
const at = (iso: string) => new Date(iso);

describe("doseWindowLabel (LLD §8.9)", () => {
  it("upcoming before T-30m", () => {
    const r = doseWindowLabel(dose, TZ, at("2026-11-26T02:00:00Z"));
    expect(r.window).toBe("upcoming");
  });
  it("takeable inside T-30..T", () => {
    const r = doseWindowLabel(dose, TZ, at("2026-11-26T02:45:00Z"));
    expect(r.window).toBe("takeable");
  });
  it("on-time T..T+60m", () => {
    const r = doseWindowLabel(dose, TZ, at("2026-11-26T03:30:00Z"));
    expect(r.window).toBe("on-time");
  });
  it("late after T+60m same localDate", () => {
    const r = doseWindowLabel(dose, TZ, at("2026-11-26T05:00:00Z"));
    expect(r.window).toBe("late");
  });
  it("missed once schedule-local date passes", () => {
    // 2026-11-27 01:00 PKT = 2026-11-26T20:00Z
    const r = doseWindowLabel(dose, TZ, at("2026-11-26T20:30:00Z"));
    expect(r.window).toBe("missed");
  });
  it("marked doses return outcome label", () => {
    const r = doseWindowLabel(
      { ...dose, outcome: "taken-on-time" },
      TZ,
      at("2026-11-26T03:30:00Z"),
    );
    expect(r.window).toBe("marked");
    expect(r.label).toBe("Taken on time");
  });
  it("uses schedule tz for the missed boundary, not device tz", () => {
    // device in UTC: 2026-11-26T19:00Z = 00:00 PKT Nov 27 -> missed
    expect(
      DateTime.fromISO("2026-11-26T19:00:00Z").setZone(TZ).toISODate(),
    ).toBe("2026-11-27");
    const r = doseWindowLabel(dose, TZ, at("2026-11-26T19:00:00Z"));
    expect(r.window).toBe("missed");
  });
});

describe("takenOutcomeFor (LD-SCH-09 accept matrix)", () => {
  it("late window -> taken-late", () => {
    expect(takenOutcomeFor("late")).toBe("taken-late");
  });
  it("non-late window -> taken-on-time", () => {
    expect(takenOutcomeFor("on-time")).toBe("taken-on-time");
    expect(takenOutcomeFor("takeable")).toBe("taken-on-time");
    expect(takenOutcomeFor("upcoming")).toBe("taken-on-time");
  });
});

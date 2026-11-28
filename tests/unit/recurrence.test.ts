import { describe, expect, it } from "vitest";
import {
  buildRecurrence,
  describeRecurrence,
  browserTimezone,
} from "@features/schedules/recurrence";

describe("buildRecurrence", () => {
  it("once → date-list sorted deduped", () => {
    expect(
      buildRecurrence({
        kind: "once",
        dates: ["2026-12-05", "2026-12-01", "2026-12-05"],
      }),
    ).toEqual({ kind: "date-list", dates: ["2026-12-01", "2026-12-05"] });
  });

  it("once with no dates throws", () => {
    expect(() => buildRecurrence({ kind: "once", dates: [] })).toThrow();
  });

  it("weekly → RRULE with canonical BYDAY order", () => {
    expect(
      buildRecurrence({
        kind: "weekly",
        interval: 2,
        byDay: ["SU", "MO", "WE"],
      }),
    ).toEqual({
      kind: "rrule",
      rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,SU",
    });
  });

  it("monthly/yearly → RRULE, interval omitted when 1", () => {
    expect(buildRecurrence({ kind: "monthly" })).toEqual({
      kind: "rrule",
      rrule: "FREQ=MONTHLY",
    });
    expect(buildRecurrence({ kind: "yearly", interval: 1 })).toEqual({
      kind: "rrule",
      rrule: "FREQ=YEARLY",
    });
  });
});

describe("describeRecurrence", () => {
  it("previews weekly with days", () => {
    expect(
      describeRecurrence({ kind: "weekly", interval: 1, byDay: ["MO", "FR"] }),
    ).toBe("Every week on MO, FR");
  });
  it("previews plural intervals with correct units", () => {
    expect(describeRecurrence({ kind: "weekly", interval: 2 })).toBe(
      "Every 2 weeks",
    );
    expect(describeRecurrence({ kind: "monthly", interval: 1 })).toBe(
      "Every month",
    );
    expect(describeRecurrence({ kind: "monthly", interval: 3 })).toBe(
      "Every 3 months",
    );
    expect(describeRecurrence({ kind: "yearly", interval: 1 })).toBe(
      "Every year",
    );
    expect(describeRecurrence({ kind: "yearly", interval: 2 })).toBe(
      "Every 2 years",
    );
  });
  it("previews once count", () => {
    expect(describeRecurrence({ kind: "once", dates: ["2026-12-01"] })).toBe(
      "Once on 1 selected date",
    );
  });
});

describe("browserTimezone", () => {
  it("returns an IANA string", () => {
    expect(browserTimezone()).toMatch(/\//);
  });
});

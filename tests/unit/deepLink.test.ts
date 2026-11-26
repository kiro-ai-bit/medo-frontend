import { describe, expect, it } from "vitest";
import { feedItemHref, resolveDeepLink } from "@lib/sw/push/deepLink";
import { parsePushPayload } from "@lib/sw/push/payload";

describe("resolveDeepLink (LD-FE-13)", () => {
  it("honors data.url verbatim", () => {
    expect(resolveDeepLink({ url: "/today?dose=abc-123", kind: "dose" })).toBe(
      "/today?dose=abc-123",
    );
  });

  it("falls back per kind when url missing", () => {
    expect(resolveDeepLink({ kind: "dose" })).toBe("/today");
    expect(resolveDeepLink({ kind: "care" })).toBe("/care-links");
    expect(resolveDeepLink({ kind: "refill" })).toBe("/medicines");
  });

  it("unknown/invalid shapes → /today", () => {
    expect(resolveDeepLink({})).toBe("/today");
    expect(resolveDeepLink({ url: "https://evil.example/x" })).toBe("/today");
    expect(resolveDeepLink({ url: "//evil.example" })).toBe("/today");
    expect(resolveDeepLink({ url: "javascript:alert(1)" })).toBe("/today");
  });
});

describe("feedItemHref", () => {
  it("maps feed types to surfaces (FR-FE-078)", () => {
    expect(feedItemHref("care_link")).toBe("/care-links");
    expect(feedItemHref("refill")).toBe("/medicines");
    expect(feedItemHref("system")).toBe("/notifications");
  });
});

describe("parsePushPayload", () => {
  it("parses the LD-NOT-16/18 server shape", () => {
    const p = parsePushPayload(
      JSON.stringify({
        title: "Take Amoxicillin 500mg",
        body: "Scheduled 08:00",
        tag: "medo-dose-d1",
        data: { doseId: "d1", url: "/today?dose=d1" },
      }),
    );
    expect(p).toEqual({
      title: "Take Amoxicillin 500mg",
      body: "Scheduled 08:00",
      tag: "medo-dose-d1",
      data: { doseId: "d1", url: "/today?dose=d1" },
    });
  });

  it("tolerates objects, garbage, and missing fields", () => {
    expect(parsePushPayload(null)).toBeNull();
    expect(parsePushPayload("not json")).toBeNull();
    expect(parsePushPayload(42)).toBeNull();
    const p = parsePushPayload({ title: "Hi" });
    expect(p?.title).toBe("Hi");
    expect(p?.body).toBe("");
    expect(p?.data).toBeUndefined();
  });
});

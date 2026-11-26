import { describe, expect, it } from "vitest";
import type { LinkListItem } from "@kiro-ai-bit/contracts";
import { actorLabel } from "@features/today/actor";

const ME = "11111111-1111-4111-8111-111111111111";
const CG = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

const links: LinkListItem[] = [
  {
    linkId: "44444444-4444-4444-8444-444444444444",
    direction: "as-patient",
    counterpart: { userId: CG, displayName: "Caregiver A" },
    createdAt: "2026-11-26T00:00:00.000Z",
  },
];

describe("actorLabel", () => {
  it("returns null when actorId is null", () => {
    expect(actorLabel(null, ME, links)).toBeNull();
  });

  it("labels the session user as 'marked by you'", () => {
    expect(actorLabel(ME, ME, links)).toBe("marked by you");
  });

  it("labels a linked caregiver with display name", () => {
    expect(actorLabel(CG, ME, links)).toBe("marked by caregiver (Caregiver A)");
  });

  it("labels an unknown actor as generic caregiver", () => {
    expect(actorLabel(OTHER, ME, links)).toBe("marked by caregiver");
  });

  it("works when links are empty", () => {
    expect(actorLabel(CG, ME, [])).toBe("marked by caregiver");
  });

  it("labels the patient counterpart for a caregiver viewer", () => {
    const caregiverLinks: LinkListItem[] = [
      {
        linkId: "55555555-5555-4555-8555-555555555555",
        direction: "as-caregiver",
        counterpart: { userId: ME, displayName: "Patient A" },
        createdAt: "2026-11-26T00:00:00.000Z",
      },
    ];
    // Viewer is the caregiver (session CG); dose marked by the patient (ME).
    expect(actorLabel(ME, CG, caregiverLinks)).toBe(
      "marked by patient (Patient A)",
    );
    // Viewer marked it themself.
    expect(actorLabel(CG, CG, caregiverLinks)).toBe("marked by you");
    // Unknown actor (e.g. another caregiver) stays generic.
    expect(actorLabel(OTHER, CG, caregiverLinks)).toBe("marked by caregiver");
  });
});

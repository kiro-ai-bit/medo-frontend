import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import {
  NoPatientContextError,
  requirePatientContext,
  resolvePatientContext,
  usePatientContextStore,
} from "@lib/state/client/patientContextStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { medoDb } from "@lib/offline/db/medoDb";
import { doseCache } from "@lib/offline/db/caches";
import { enqueueWrite, pendingCount } from "@lib/offline/queue/queue";
import { handleLinkEnd } from "@features/patient-context";

const PATIENT = "11111111-1111-4111-8111-111111111111";
const LINK = "33333333-3333-4333-8333-333333333333";

function setRole(role: "Patient" | "Caregiver", userId = PATIENT) {
  useSessionStore.setState({
    status: "authenticated",
    userId,
    me: {
      displayName: "T",
      timezone: "UTC",
      role,
      email: "t@t.co",
      emailVerified: true,
    },
  });
}

afterEach(async () => {
  usePatientContextStore.getState().reset();
  useSessionStore.setState({ status: "anonymous", userId: null, me: null });
  await medoDb.open();
  await Promise.all(medoDb.tables.map((t) => t.clear()));
});

describe("patient context resolution (HD-FE-04)", () => {
  it("Patient role resolves self via session userId", () => {
    setRole("Patient");
    expect(resolvePatientContext()).toEqual({
      patientId: PATIENT,
      source: "self",
    });
  });

  it("Caregiver resolves selected link's counterpart patientId", () => {
    setRole("Caregiver", "99999999-9999-4999-8999-999999999999");
    expect(resolvePatientContext()).toBeNull();
    usePatientContextStore.getState().selectLink({
      linkId: LINK,
      direction: "as-caregiver",
      counterpart: { userId: PATIENT, displayName: "Patient A" },
      createdAt: "2026-11-26T00:00:00.000Z",
    });
    expect(resolvePatientContext()).toEqual({
      patientId: PATIENT,
      source: "link",
    });
  });

  it("requirePatientContext throws NoPatientContextError when unresolved", () => {
    setRole("Caregiver");
    expect(() => requirePatientContext()).toThrow(NoPatientContextError);
  });
});

describe("link-end detection (FR-FE-006/007)", () => {
  it("handleLinkEnd purges patient slice + queue rows, clears selection, sets banner", async () => {
    setRole("Caregiver", "99999999-9999-4999-8999-999999999999");
    usePatientContextStore.getState().selectLink({
      linkId: LINK,
      direction: "as-caregiver",
      counterpart: { userId: PATIENT, displayName: "Patient A" },
      createdAt: "2026-11-26T00:00:00.000Z",
    });
    await doseCache.upsertDoses([
      {
        doseId: "d1",
        patientId: PATIENT,
        scheduleId: "s1",
        medicineId: "m1",
        localDate: "2026-11-26",
        doseTime: "08:00",
        scheduledAt: "2026-11-26T03:00:00.000Z",
        outcome: null,
        snoozedUntil: null,
        skippedByUser: false,
        actorId: null,
        markedAt: null,
        fetchedAt: "2026-11-26T00:00:00.000Z",
      },
    ]);
    await enqueueWrite({
      type: "outcome",
      patientId: PATIENT,
      doseId: "d1",
      payload: { outcome: "taken-on-time" },
    });
    await handleLinkEnd(LINK);
    expect(await medoDb.doses.count()).toBe(0);
    expect(await pendingCount()).toBe(0);
    expect(usePatientContextStore.getState().patientId).toBeNull();
    expect(usePatientContextStore.getState().endedLinkBanner).toBe(LINK);
  });
});

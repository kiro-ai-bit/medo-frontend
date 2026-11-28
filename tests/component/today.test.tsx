import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TodayScreen } from "@features/today";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { medoDb } from "@lib/offline/db/medoDb";
import { jsonResponse, resetStores } from "../helpers";

vi.mock("next/navigation", () => ({
  useSearchParams: () =>
    new URLSearchParams("dose=d1000000-0000-4000-8000-000000000001"),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/today",
}));

const PID = "11111111-1111-4111-8111-111111111111";
const DID = "d1000000-0000-4000-8000-000000000001";

function doseDto(over: Record<string, unknown> = {}) {
  return {
    id: DID,
    medicineId: "51000000-0000-4000-8000-000000000001",
    patientId: PID,
    scheduleId: "61000000-0000-4000-8000-000000000001",
    localDate: new Date().toLocaleDateString("en-CA", {
      timeZone: "Asia/Karachi",
    }),
    doseTime: "08:00",
    scheduledAt: new Date(Date.now() - 30 * 60_000).toISOString(),
    outcome: "unmarked",
    skippedByUser: false,
    snoozedUntil: null,
    actorId: null,
    markedAt: null,
    ...over,
  };
}

function medDto(
  photos: { A: string | null; B: string | null; C: string | null } = {
    A: null,
    B: null,
    C: null,
  },
) {
  return {
    id: "51000000-0000-4000-8000-000000000001",
    patientId: PID,
    catalogEntryId: "71000000-0000-4000-8000-000000000001",
    catalog: {
      brandName: "Amoxicillin",
      form: "capsule",
      packagingQuantity: 21,
      photos,
    },
    prescribingDoctor: "Dr X",
    dosage: "500mg",
    dosesRemaining: 10,
    refillThreshold: 6,
    price: 100,
    pharmacyName: "Pharm",
    createdAt: "2026-11-26T00:00:00.000Z",
  };
}

function schedDto() {
  return {
    id: "61000000-0000-4000-8000-000000000001",
    patientId: PID,
    medicineId: "51000000-0000-4000-8000-000000000001",
    recurrence: { kind: "rrule", rrule: "FREQ=DAILY" },
    doseTimes: ["08:00"],
    timezone: "Asia/Karachi",
    startDate: "2026-11-01",
    endDate: null,
    exceptionCount: 0,
    createdAt: "2026-11-26T00:00:00.000Z",
    updatedAt: "2026-11-26T00:00:00.000Z",
  };
}

function mockApi(
  over: {
    doses?: unknown[];
    links?: unknown[];
    invites?: unknown[];
    failOutcome?: boolean;
    medPhotos?: { A: string | null; B: string | null; C: string | null };
  } = {},
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/patients/") && url.includes("/doses?")) {
        return jsonResponse(200, {
          doses: over.doses ?? [doseDto()],
          from: "2026-11-19T00:00:00.000Z",
          to: "2026-11-27T00:00:00.000Z",
        });
      }
      if (url.includes("/v1/medicines?")) {
        return jsonResponse(200, {
          medicines: [medDto(over.medPhotos)],
        });
      }
      if (url.includes("/v1/patients/") && url.includes("/schedules")) {
        return jsonResponse(200, { schedules: [schedDto()] });
      }
      if (url.includes("/gamification")) {
        return jsonResponse(200, {
          harmonyPoints: 10,
          themeState: "Harmony",
          updatedAt: null,
        });
      }
      if (url.includes("/v1/care/invites")) {
        return jsonResponse(200, { invites: over.invites ?? [] });
      }
      if (url.includes("/v1/care/links")) {
        return jsonResponse(200, { links: over.links ?? [] });
      }
      if (method === "POST" && url.includes("/outcome")) {
        if (over.failOutcome) throw new TypeError("Failed to fetch");
        return jsonResponse(200, {
          ...doseDto(),
          outcome: "taken-on-time",
          markedAt: "2026-11-26T01:00:00.000Z",
          createdAt: "2026-11-26T00:00:00.000Z",
          updatedAt: "2026-11-26T01:00:00.000Z",
        });
      }
      if (method === "POST" && url.includes("/snoop"))
        return jsonResponse(200, doseDto());
      if (method === "POST" && url.includes("/snooze"))
        return jsonResponse(200, doseDto());
      return jsonResponse(404, {
        error: { code: "NOT_FOUND", message: "nf", requestId: "r" },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderToday() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TodayScreen />
    </QueryClientProvider>,
  );
}

beforeEach(async () => {
  resetStores();
  usePatientContextStore.getState().reset();
  await medoDb.open();
  await Promise.all(medoDb.tables.map((t) => t.clear()));
  useSessionStore.setState({
    status: "authenticated",
    userId: PID,
    accessToken: "tok",
    expiresAt: "2999-01-01T00:00:00.000Z",
    me: {
      displayName: "Pat",
      timezone: "Asia/Karachi",
      role: "Patient",
      email: "p@p.co",
      emailVerified: true,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("TodayScreen", () => {
  it("renders dose cards with window badge and deep-link highlight", async () => {
    mockApi();
    renderToday();
    await waitFor(() => expect(screen.getByTestId("dose-list")).toBeTruthy());
    expect(screen.getByText("Amoxicillin")).toBeTruthy();
    expect(screen.getAllByTestId("window-badge").length).toBeGreaterThan(0);
    const card = document.querySelector(`[data-dose-id="${DID}"]`);
    expect(card?.getAttribute("data-highlight")).toBe("true");
  });

  it("mark Taken calls outcome API online", async () => {
    const fetchMock = mockApi();
    renderToday();
    await waitFor(() => screen.getByText("Taken"), { timeout: 8000 });
    fireEvent.click(screen.getByText("Taken"));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            ([u, i]) => String(u).includes("/outcome") && i?.method === "POST",
          ),
        ).toBe(true),
      { timeout: 8000 },
    );
  });

  it("degraded mode enqueues outcome instead of calling API", async () => {
    mockApi({ failOutcome: true });
    renderToday();
    await waitFor(() => screen.getByText("Taken"), { timeout: 8000 });
    fireEvent.click(screen.getByText("Taken"));
    await waitFor(async () => expect(await medoDb.writeQueue.count()).toBe(1), {
      timeout: 8000,
    });
    const entry = await medoDb.writeQueue.toArray();
    expect(entry[0]!.type).toBe("outcome");
    expect(entry[0]!.doseId).toBe(DID);
    expect(entry[0]!.payload.outcome).toBe("taken-on-time");
  });

  it("renders only doses whose localDate is today in the schedule timezone", async () => {
    const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString(
      "en-CA",
      { timeZone: "Asia/Karachi" },
    );
    mockApi({
      doses: [
        doseDto(),
        doseDto({
          id: "d2000000-0000-4000-8000-000000000002",
          localDate: yesterday,
          doseTime: "19:19",
          scheduledAt: new Date(Date.now() - 86_400_000).toISOString(),
        }),
      ],
    });
    renderToday();
    await waitFor(() => expect(screen.getByTestId("dose-list")).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Amoxicillin")).toBeTruthy());
    expect(screen.queryByText(/19:19/)).toBeNull();
    expect(screen.getByText(/08:00/)).toBeTruthy();
  });

  it("renders the catalog photo on dose cards when present", async () => {
    mockApi({
      medPhotos: {
        A: "https://photos.example.com/a.jpg",
        B: null,
        C: null,
      },
    });
    renderToday();
    await waitFor(() => expect(screen.getByTestId("dose-list")).toBeTruthy());
    const img = document.querySelector(
      '[data-dose-id] img[src="https://photos.example.com/a.jpg"]',
    );
    expect(img).toBeTruthy();
  });

  it("shows empty state when no doses", async () => {
    mockApi({ doses: [] });
    renderToday();
    await waitFor(() => screen.getByText("No doses scheduled."), {
      timeout: 8000,
    });
  });

  it("caregiver without selection sees patient switcher", async () => {
    useSessionStore.setState({
      me: {
        displayName: "CG",
        timezone: "Asia/Karachi",
        role: "Caregiver",
        email: "c@c.co",
        emailVerified: true,
      },
      userId: "99999999-9999-4999-8999-999999999999",
    });
    mockApi({
      links: [
        {
          linkId: "81000000-0000-4000-8000-000000000001",
          direction: "as-caregiver",
          counterpart: { userId: PID, displayName: "Patient A" },
          createdAt: "2026-11-26T00:00:00.000Z",
        },
      ],
    });
    renderToday();
    await waitFor(() => screen.getByTestId("patient-switcher"), {
      timeout: 8000,
    });
    expect(screen.getByText("Patient A")).toBeTruthy();
  });

  it("caregiver with no links sees received invites and a care-links path", async () => {
    useSessionStore.setState({
      me: {
        displayName: "CG",
        timezone: "Asia/Karachi",
        role: "Caregiver",
        email: "c@c.co",
        emailVerified: true,
      },
      userId: "99999999-9999-4999-8999-999999999999",
    });
    mockApi({
      links: [],
      invites: [
        {
          inviteId: "82000000-0000-4000-8000-000000000001",
          direction: "received",
          counterpartyDisplayName: "testp",
          expiresAt: "2026-12-05T00:00:00.000Z",
          createdAt: "2026-11-28T00:00:00.000Z",
        },
      ],
    });
    renderToday();
    await waitFor(() => screen.getByTestId("pending-invites"), {
      timeout: 8000,
    });
    await waitFor(() => screen.getByText(/testp invited you/), {
      timeout: 8000,
    });
    expect(
      screen.getAllByText(/invite link from your email/i).length,
    ).toBeGreaterThan(0);
    const careLink = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === "/care-links");
    expect(careLink).toBeTruthy();
  });
});

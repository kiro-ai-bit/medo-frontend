import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MedicinesScreen } from "@features/medicines";
import { ScheduleBuilderScreen } from "@features/schedules";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { medoDb } from "@lib/offline/db/medoDb";
import { jsonResponse, resetStores } from "../helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/medicines",
  useParams: () => ({ id: "" }),
  useSearchParams: () => new URLSearchParams(),
}));

const PID = "11111111-1111-4111-8111-111111111111";
const MID = "51000000-0000-4000-8000-000000000001";

function medDto() {
  return {
    id: MID,
    patientId: PID,
    catalogEntryId: "71000000-0000-4000-8000-000000000001",
    catalog: {
      brandName: "Amoxicillin",
      form: "capsule",
      packagingQuantity: 21,
      photos: { A: null, B: null, C: null },
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

function mockApi(over: { medicines?: unknown[]; fail?: boolean } = {}) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (over.fail) throw new TypeError("Failed to fetch");
    if (url.includes("/v1/medicines?")) {
      return jsonResponse(200, { medicines: over.medicines ?? [medDto()] });
    }
    if (url.includes("/v1/patients/") && url.includes("/schedules")) {
      return jsonResponse(201, {
        id: "61000000-0000-4000-8000-000000000001",
        patientId: PID,
        medicineId: MID,
        recurrence: { kind: "rrule", rrule: "FREQ=WEEKLY" },
        doseTimes: ["08:00"],
        timezone: "Asia/Karachi",
        startDate: "2026-11-26",
        endDate: null,
        exceptions: [],
        resolvedStartDate: "2026-11-26",
        exceptionCount: 0,
        createdAt: "2026-11-26T00:00:00.000Z",
        updatedAt: "2026-11-26T00:00:00.000Z",
      });
    }
    return jsonResponse(404, {
      error: { code: "NOT_FOUND", message: "nf", requestId: "r" },
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWith(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
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

describe("MedicinesScreen", () => {
  it("lists medicines (ready state)", async () => {
    mockApi();
    renderWith(<MedicinesScreen />);
    await waitFor(
      () => expect(screen.getByTestId("medicine-list")).toBeTruthy(),
      { timeout: 8000 },
    );
    expect(screen.getByText("Amoxicillin")).toBeTruthy();
    expect(screen.getByText(/10 doses left/)).toBeTruthy();
  });

  it("shows empty state", async () => {
    mockApi({ medicines: [] });
    renderWith(<MedicinesScreen />);
    await waitFor(
      () => expect(screen.getByText(/No medicines yet/)).toBeTruthy(),
      { timeout: 8000 },
    );
  });
});

describe("ScheduleBuilderScreen", () => {
  it("shows medicine options and RRULE preview", async () => {
    mockApi();
    renderWith(<ScheduleBuilderScreen />);
    await waitFor(() => screen.getByText(/Amoxicillin/), { timeout: 8000 });
    expect(screen.getByTestId("rrule-preview").textContent).toContain(
      "FREQ=WEEKLY",
    );
  });

  it("empty medicines → empty state message", async () => {
    mockApi({ medicines: [] });
    renderWith(<ScheduleBuilderScreen />);
    await waitFor(
      () => expect(screen.getByText("Add a medicine first.")).toBeTruthy(),
      {
        timeout: 8000,
      },
    );
  });
});

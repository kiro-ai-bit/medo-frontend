import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PatientContextBar } from "@features/patient-context";
import type { LinkListItem } from "@kiro-ai-bit/contracts";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { jsonResponse, resetStores } from "../helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/today",
  useSearchParams: () => new URLSearchParams(),
}));

const PATIENT: LinkListItem = {
  linkId: "22222222-2222-4222-8222-222222222222",
  direction: "as-caregiver",
  counterpart: {
    userId: "11111111-1111-4111-8111-111111111111",
    displayName: "Patient A",
  },
  createdAt: "2026-11-26T00:00:00.000Z",
};

function mockLinks(links: unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => jsonResponse(200, { links })),
  );
}

function asCaregiver() {
  useSessionStore.setState({
    status: "authenticated",
    userId: "99999999-9999-4999-8999-999999999999",
    accessToken: "tok",
    expiresAt: "2999-01-01T00:00:00.000Z",
    me: {
      displayName: "CG",
      timezone: "Asia/Karachi",
      role: "Caregiver",
      email: "cg@x.co",
      emailVerified: true,
    },
  });
}

function renderBar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <PatientContextBar />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetStores();
  usePatientContextStore.getState().reset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PatientContextBar", () => {
  it("renders nothing for patient sessions", async () => {
    useSessionStore.setState({
      status: "authenticated",
      userId: "11111111-1111-4111-8111-111111111111",
      accessToken: "tok",
      expiresAt: "2999-01-01T00:00:00.000Z",
      me: {
        displayName: "Pat",
        timezone: "Asia/Karachi",
        role: "Patient",
        email: "p@x.co",
        emailVerified: true,
      },
    });
    mockLinks([]);
    const { container } = renderBar();
    await new Promise((r) => setTimeout(r, 100));
    expect(container.firstChild).toBeNull();
  });

  it("lists linked patients and selects one into context", async () => {
    asCaregiver();
    mockLinks([PATIENT]);
    renderBar();
    const select = await screen.findByRole("combobox");
    await waitFor(() =>
      expect(screen.getByRole("option", { name: "Patient A" })).toBeTruthy(),
    );
    fireEvent.change(select, { target: { value: PATIENT.linkId } });
    const ctx = usePatientContextStore.getState();
    expect(ctx.selectedLinkId).toBe(PATIENT.linkId);
    expect(ctx.patientId).toBe(PATIENT.counterpart.userId);
    expect(ctx.source).toBe("link");
  });

  it("clears the selection via the placeholder option", async () => {
    asCaregiver();
    mockLinks([PATIENT]);
    usePatientContextStore.getState().selectLink(PATIENT);
    renderBar();
    const select = await screen.findByRole("combobox");
    fireEvent.change(select, { target: { value: "" } });
    expect(usePatientContextStore.getState().patientId).toBeNull();
  });
});

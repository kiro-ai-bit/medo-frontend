import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CareLinksScreen } from "@features/care";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { jsonResponse, resetStores } from "../helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/care-links",
  useSearchParams: () => new URLSearchParams(),
}));

const PID = "11111111-1111-4111-8111-111111111111";
const LINK_ID = "22222222-2222-4222-8222-222222222222";
const INVITE_ID = "33333333-3333-4333-8333-333333333333";

const sentInvite = {
  inviteId: INVITE_ID,
  direction: "sent",
  counterpartyEmail: "cg@example.com",
  expiresAt: "2026-12-03T00:00:00.000Z",
  createdAt: "2026-11-26T00:00:00.000Z",
};
const receivedInvite = {
  inviteId: "44444444-4444-4444-8444-444444444444",
  direction: "received",
  counterpartyDisplayName: "Patient A",
  expiresAt: "2026-12-03T00:00:00.000Z",
  createdAt: "2026-11-26T00:00:00.000Z",
};
const link = {
  linkId: LINK_ID,
  direction: "as-patient",
  counterpart: {
    userId: "55555555-5555-4555-8555-555555555555",
    displayName: "CG One",
  },
  createdAt: "2026-11-26T00:00:00.000Z",
};

function mockApi(over: { invites?: unknown[]; links?: unknown[] } = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/care/invites") && method === "GET") {
        return jsonResponse(200, { invites: over.invites ?? [] });
      }
      if (url.includes("/v1/care/links") && method === "GET") {
        return jsonResponse(200, { links: over.links ?? [] });
      }
      if (method === "POST" && url.includes("/end")) {
        return jsonResponse(200, {
          linkId: LINK_ID,
          status: "ended",
          endedAt: "2026-11-26T01:00:00.000Z",
        });
      }
      if (method === "POST" && url.includes("/resend")) {
        return jsonResponse(200, {
          inviteId: INVITE_ID,
          expiresAt: "2026-12-03T00:00:00.000Z",
        });
      }
      if (method === "POST" && url.includes("/cancel")) {
        return jsonResponse(200, { inviteId: INVITE_ID, status: "cancelled" });
      }
      if (method === "POST" && url.includes("/links/invites")) {
        return jsonResponse(201, {
          inviteId: INVITE_ID,
          caregiverEmail: "cg@example.com",
          expiresAt: "2026-12-03T00:00:00.000Z",
          status: "pending",
        });
      }
      return jsonResponse(404, {
        error: { code: "NOT_FOUND", message: "nf", requestId: "r" },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CareLinksScreen />
    </QueryClientProvider>,
  );
}

function asRole(role: "Patient" | "Caregiver") {
  useSessionStore.setState({
    status: "authenticated",
    userId: PID,
    accessToken: "tok",
    expiresAt: "2999-01-01T00:00:00.000Z",
    me: {
      displayName: role === "Patient" ? "Pat" : "CG",
      timezone: "Asia/Karachi",
      role,
      email: `${role.toLowerCase()}@x.co`,
      emailVerified: true,
    },
  });
}

beforeEach(() => {
  resetStores();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("CareLinksScreen", () => {
  it("patient sees create-invite form, sent invite actions, and links", async () => {
    asRole("Patient");
    const fetchMock = mockApi({ invites: [sentInvite], links: [link] });
    renderScreen();
    await waitFor(() => screen.getByText("cg@example.com"), { timeout: 8000 });
    expect(screen.getByLabelText(/caregiver email/i)).toBeTruthy();
    expect(screen.getByText("CG One")).toBeTruthy();

    fireEvent.click(screen.getByText("End link"));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    fireEvent.click(screen.getByText("Confirm end"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes("/end") && i?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("patient can create an invite", async () => {
    asRole("Patient");
    const fetchMock = mockApi();
    renderScreen();
    await waitFor(() => screen.getByLabelText(/caregiver email/i), {
      timeout: 8000,
    });
    fireEvent.change(screen.getByLabelText(/caregiver email/i), {
      target: { value: "newcg@x.co" },
    });
    fireEvent.click(screen.getByText("Send invite"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes("/v1/care/links/invites") &&
            i?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("caregiver sees received invites with email-link hint and no create form", async () => {
    asRole("Caregiver");
    mockApi({
      invites: [receivedInvite],
      links: [
        {
          ...link,
          direction: "as-caregiver",
          counterpart: { userId: PID, displayName: "Patient A" },
        },
      ],
    });
    renderScreen();
    await waitFor(() => screen.getAllByText("Patient A").length, {
      timeout: 8000,
    });
    expect(screen.queryByLabelText(/caregiver email/i)).toBeNull();
    expect(screen.getByTestId("invite-email-hint")).toBeTruthy();
  });

  it("shows requires-connection when degraded", async () => {
    asRole("Patient");
    useConnectivityStore.setState({ status: "degraded" });
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderScreen();
    await waitFor(() => screen.getByTestId("care-links-offline"), {
      timeout: 8000,
    });
  });
});

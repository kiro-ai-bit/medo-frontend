import "fake-indexeddb/auto";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InviteScreen } from "@features/care";
import { useSessionStore } from "@lib/state/client/sessionStore";
import {
  peekPendingInvite,
  stashPendingInvite,
} from "@lib/state/client/inviteHandoff";
import { jsonResponse, resetStores } from "../helpers";

const TOKEN = "invite_token_abc";
const pushed: string[] = [];

vi.mock("next/navigation", () => ({
  useParams: () => ({ token: TOKEN }),
  useRouter: () => ({
    replace: vi.fn(),
    push: (p: string) => pushed.push(p),
  }),
  usePathname: () => `/invite/${TOKEN}`,
  useSearchParams: () => new URLSearchParams(),
}));

const preview = {
  patientDisplayName: "Patient A",
  expiresAt: "2026-12-03T00:00:00.000Z",
};

function mockApi(over: { previewStatus?: number; acceptStatus?: number } = {}) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes(`/v1/care/invites/${TOKEN}`) && method === "GET") {
        return over.previewStatus === 404
          ? jsonResponse(404, {
              error: { code: "NOT_FOUND", message: "nf", requestId: "r" },
            })
          : jsonResponse(200, preview);
      }
      if (url.includes("/accept") && method === "POST") {
        return over.acceptStatus === 403
          ? jsonResponse(403, {
              error: { code: "FORBIDDEN", message: "no", requestId: "r" },
            })
          : jsonResponse(201, {
              linkId: "22222222-2222-4222-8222-222222222222",
              patientId: "11111111-1111-4111-8111-111111111111",
              caregiverId: "33333333-3333-4333-8333-333333333333",
              createdAt: "2026-11-26T00:00:00.000Z",
            });
      }
      if (url.includes("/decline") && method === "POST") {
        return jsonResponse(200, {
          inviteId: "44444444-4444-4444-8444-444444444444",
          status: "declined",
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
      <InviteScreen />
    </QueryClientProvider>,
  );
}

function asRole(role: "Patient" | "Caregiver") {
  useSessionStore.setState({
    status: "authenticated",
    userId: "99999999-9999-4999-8999-999999999999",
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
  pushed.length = 0;
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("InviteScreen", () => {
  it("anonymous visitor sees preview + login/signup carrying the token", async () => {
    mockApi();
    renderScreen();
    await waitFor(() => screen.getByText(/Patient A/), { timeout: 8000 });
    const login = screen.getByRole("link", { name: /log in/i });
    expect(login.getAttribute("href")).toContain(
      `/login?next=${encodeURIComponent(`/invite/${TOKEN}`)}`,
    );
    const signup = screen.getByRole("link", {
      name: /create account|sign up/i,
    });
    expect(signup.getAttribute("href")).toContain("/signup");
    // Anonymous landing stashes the token for the auth detour (LLD §6.10).
    await waitFor(() => expect(peekPendingInvite()).toBe(TOKEN));
  });

  it("dead token renders terminal state", async () => {
    mockApi({ previewStatus: 404 });
    renderScreen();
    await waitFor(() => screen.getByTestId("invite-terminal"), {
      timeout: 8000,
    });
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  it("patient-role session sees role explanation, no accept button", async () => {
    asRole("Patient");
    mockApi();
    renderScreen();
    await waitFor(() => screen.getByTestId("invite-wrong-role"), {
      timeout: 8000,
    });
    expect(screen.queryByRole("button", { name: /accept/i })).toBeNull();
  });

  it("caregiver accepts the invite and sees success", async () => {
    asRole("Caregiver");
    const fetchMock = mockApi();
    renderScreen();
    await waitFor(() => screen.getByRole("button", { name: /accept/i }), {
      timeout: 8000,
    });
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => screen.getByTestId("invite-accepted"), {
      timeout: 8000,
    });
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) => String(u).includes("/accept") && i?.method === "POST",
      ),
    ).toBe(true);
  });

  it("caregiver declines the invite and the stash is cleared", async () => {
    asRole("Caregiver");
    stashPendingInvite(TOKEN);
    const fetchMock = mockApi();
    renderScreen();
    await waitFor(() => screen.getByRole("button", { name: /decline/i }), {
      timeout: 8000,
    });
    fireEvent.click(screen.getByRole("button", { name: /decline/i }));
    await waitFor(() => screen.getByTestId("invite-declined"), {
      timeout: 8000,
    });
    expect(
      fetchMock.mock.calls.some(
        ([u, i]) => String(u).includes("/decline") && i?.method === "POST",
      ),
    ).toBe(true);
    await waitFor(() => expect(peekPendingInvite()).toBeNull());
  });

  it("accept 403 shows email/role explanation", async () => {
    asRole("Caregiver");
    mockApi({ acceptStatus: 403 });
    renderScreen();
    await waitFor(() => screen.getByRole("button", { name: /accept/i }), {
      timeout: 8000,
    });
    fireEvent.click(screen.getByRole("button", { name: /accept/i }));
    await waitFor(() => screen.getByTestId("invite-accept-error"), {
      timeout: 8000,
    });
  });
});

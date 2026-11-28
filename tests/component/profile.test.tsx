import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileScreen } from "@features/profile";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { jsonResponse, resetStores, errorEnvelope } from "../helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/profile",
  useSearchParams: () => new URLSearchParams(),
}));

const { purgeClientState } = vi.hoisted(() => ({
  purgeClientState: vi.fn(async () => undefined),
}));
vi.mock("@features/auth/purge", () => ({ purgeClientState }));
vi.mock("@lib/sw/push/pushLifecycle", () => ({
  removeSubscription: vi.fn(async () => undefined),
}));

const ME = {
  displayName: "Ayesha Khan",
  timezone: "Asia/Karachi",
  role: "Caregiver" as const,
  email: "ayesha@example.com",
  emailVerified: true,
};

function mockApi(
  over: {
    patchStatus?: number;
    patchBody?: unknown;
    deleteStatus?: number;
    deleteBody?: unknown;
  } = {},
) {
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/me") && method === "PATCH") {
        if (over.patchStatus && over.patchStatus !== 200) {
          return jsonResponse(over.patchStatus, over.patchBody);
        }
        return jsonResponse(200, over.patchBody ?? ME);
      }
      if (url.includes("/v1/me") && method === "DELETE") {
        if (over.deleteStatus === 409) {
          return jsonResponse(
            409,
            over.deleteBody ??
              errorEnvelope("CONFLICT", "account has active care links"),
          );
        }
        return jsonResponse(204);
      }
      if (url.includes("/v1/auth/logout-all") && method === "POST") {
        return jsonResponse(204);
      }
      if (url.includes("/v1/auth/logout") && method === "POST") {
        return jsonResponse(204);
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
      <ProfileScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetStores();
  purgeClientState.mockClear();
  useSessionStore.setState({
    status: "authenticated",
    userId: "22222222-2222-4222-8222-222222222222",
    accessToken: "tok",
    expiresAt: "2999-01-01T00:00:00.000Z",
    me: ME,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProfileScreen", () => {
  it("renders profile fields from the session", () => {
    mockApi();
    renderScreen();
    expect(screen.getByText("Ayesha Khan")).toBeTruthy();
    expect(screen.getByText("ayesha@example.com")).toBeTruthy();
    expect(screen.getByText("Caregiver")).toBeTruthy();
  });

  it("PATCHes only changed fields and updates the session", async () => {
    const fetchMock = mockApi({
      patchBody: { ...ME, displayName: "Ayesha B" },
    });
    renderScreen();
    const nameInput = screen.getByLabelText(/display name/i);
    fireEvent.change(nameInput, { target: { value: "Ayesha B" } });
    fireEvent.click(screen.getByText("Save profile"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes("/v1/me") &&
            i?.method === "PATCH" &&
            JSON.parse(String(i.body)).displayName === "Ayesha B" &&
            !("timezone" in JSON.parse(String(i.body))),
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(useSessionStore.getState().me?.displayName).toBe("Ayesha B"),
    );
  });

  it("logout requires confirm and runs purge flow", async () => {
    const fetchMock = mockApi();
    renderScreen();
    fireEvent.click(screen.getByText("Log out"));
    // nothing until confirm
    expect(
      fetchMock.mock.calls.some(([u]) => String(u).includes("/logout")),
    ).toBe(false);
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Log out",
      )!,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes("/v1/auth/logout") &&
            !String(u).includes("logout-all") &&
            i?.method === "POST",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(purgeClientState).toHaveBeenCalledWith("logout"),
    );
  });

  it("logout-all posts to logout-all and purges", async () => {
    const fetchMock = mockApi();
    renderScreen();
    fireEvent.click(screen.getByText("Log out all devices"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Log out all devices",
      )!,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes("/v1/auth/logout-all") && i?.method === "POST",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(purgeClientState).toHaveBeenCalledWith("logout"),
    );
  });

  it("warns about unsynced offline changes before logout", async () => {
    useConnectivityStore.setState({ pendingSyncCount: 3 });
    mockApi();
    renderScreen();
    fireEvent.click(screen.getByText("Log out"));
    expect(await screen.findByText(/3 unsynced/i)).toBeTruthy();
  });

  it("delete account confirms, calls DELETE /v1/me, purges as deleted", async () => {
    const fetchMock = mockApi();
    renderScreen();
    fireEvent.click(screen.getByText("Delete account"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Delete",
      )!,
    );
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) => String(u).includes("/v1/me") && i?.method === "DELETE",
        ),
      ).toBe(true),
    );
    await waitFor(() =>
      expect(purgeClientState).toHaveBeenCalledWith("deleted"),
    );
  });

  it("delete blocked by active care links shows end-links-first path", async () => {
    mockApi({ deleteStatus: 409 });
    renderScreen();
    fireEvent.click(screen.getByText("Delete account"));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(
      Array.from(dialog.querySelectorAll("button")).find(
        (b) => b.textContent === "Delete",
      )!,
    );
    await waitFor(() =>
      expect(screen.getByText(/active care links/i)).toBeTruthy(),
    );
    expect(screen.getByText("Care Links")).toBeTruthy();
    expect(purgeClientState).not.toHaveBeenCalled();
  });
});

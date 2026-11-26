import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationsScreen } from "@features/notifications";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { jsonResponse, resetStores } from "../helpers";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => "/notifications",
  useSearchParams: () => new URLSearchParams(),
}));

const UID = "22222222-2222-4222-8222-222222222222";

function item(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    type: "system",
    title: `Title ${id.slice(0, 4)}`,
    body: `Body ${id.slice(0, 4)}`,
    createdAt: "2026-11-26T01:00:00.000Z",
    readAt: null,
    ...over,
  };
}

function mockApi(
  over: {
    pages?: { items: unknown[]; nextCursor: string | null }[];
    unread?: number;
    prefs?: unknown;
    failFeed?: boolean;
  } = {},
) {
  const pages = over.pages ?? [
    { items: [item("a1000000-0000-4000-8000-000000000001")], nextCursor: null },
  ];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      if (url.includes("/v1/notifications/unread-count")) {
        return jsonResponse(200, { unread: over.unread ?? 1 });
      }
      if (url.includes("/v1/notifications/read-all") && method === "POST") {
        return jsonResponse(200, { marked: 1 });
      }
      if (method === "POST" && /\/v1\/notifications\/[^/]+\/read/.test(url)) {
        return jsonResponse(
          200,
          item("a1000000-0000-4000-8000-000000000001", {
            readAt: "2026-11-26T02:00:00.000Z",
          }),
        );
      }
      if (url.includes("/v1/notifications?")) {
        if (over.failFeed) throw new TypeError("Failed to fetch");
        const cursor = new URL(url).searchParams.get("cursor");
        const idx = cursor ? Number(cursor) : 0;
        const page = pages[idx] ?? { items: [], nextCursor: null };
        return jsonResponse(200, page);
      }
      if (url.includes("/v1/notification-preferences")) {
        if (method === "PUT") {
          return jsonResponse(200, {
            refillAlerts: true,
            careLinkNotifications: false,
          });
        }
        return jsonResponse(
          200,
          over.prefs ?? { refillAlerts: true, careLinkNotifications: true },
        );
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
      <NotificationsScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetStores();
  useSessionStore.setState({
    status: "authenticated",
    userId: UID,
    accessToken: "tok",
    expiresAt: "2999-01-01T00:00:00.000Z",
    me: {
      displayName: "U",
      timezone: "UTC",
      role: "Patient",
      email: "u@u.co",
      emailVerified: true,
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("NotificationsScreen", () => {
  it("renders feed rows with unread badge and marks read on open", async () => {
    const fetchMock = mockApi({ unread: 3 });
    renderScreen();
    await waitFor(() => expect(screen.getByTestId("feed-list")).toBeTruthy(), {
      timeout: 8000,
    });
    expect(screen.getByTestId("unread-badge").textContent).toBe("3");
    const row = screen
      .getByTestId("feed-list")
      .querySelector("[data-feed-id]")!;
    expect(row.getAttribute("data-unread")).toBe("true");
    fireEvent.click(row as HTMLElement);
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes("/read") &&
            !String(u).includes("read-all") &&
            i?.method === "POST",
        ),
      ).toBe(true),
    );
  });

  it("mark-all-read posts to read-all", async () => {
    const fetchMock = mockApi();
    renderScreen();
    // Button is disabled until the feed loads (empty items → every() → true).
    await waitFor(() => screen.getByTestId("feed-list"), { timeout: 8000 });
    fireEvent.click(screen.getByText("Mark all read"));
    await waitFor(
      () =>
        expect(
          fetchMock.mock.calls.some(
            ([u, i]) => String(u).includes("/read-all") && i?.method === "POST",
          ),
        ).toBe(true),
      { timeout: 8000 },
    );
  });

  it("paginates via cursor on Load more", async () => {
    const fetchMock = mockApi({
      pages: [
        {
          items: [item("a1000000-0000-4000-8000-000000000001")],
          nextCursor: "1",
        },
        {
          items: [
            item("b2000000-0000-4000-8000-000000000002", {
              readAt: "2026-11-26T03:00:00.000Z",
            }),
          ],
          nextCursor: null,
        },
      ],
    });
    renderScreen();
    await waitFor(() => screen.getByText("Load more"), { timeout: 8000 });
    fireEvent.click(screen.getByText("Load more"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u]) => String(u).includes("cursor=1")),
      ).toBe(true),
    );
    await waitFor(() => expect(screen.getByText("Title b200")).toBeTruthy());
  });

  it("shows empty state and offline state on failure", async () => {
    mockApi({ pages: [{ items: [], nextCursor: null }] });
    const { unmount } = renderScreen();
    await waitFor(() => screen.getByText("No notifications yet."), {
      timeout: 8000,
    });
    unmount();

    // Full outage: every request fails → degraded holds (INV-FE-6).
    useConnectivityStore.setState({ status: "degraded" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    renderScreen();
    await waitFor(
      () => screen.getByText("You are offline. Showing last known data."),
      {
        timeout: 8000,
      },
    );
  });

  it("prefs shows exactly two toggles and PUTs changes", async () => {
    const fetchMock = mockApi();
    renderScreen();
    await waitFor(() => screen.getByTestId("pref-refillAlerts"), {
      timeout: 8000,
    });
    expect(screen.getByTestId("pref-careLinkNotifications")).toBeTruthy();
    expect(screen.getByText("Dose reminders")).toBeTruthy();
    expect(screen.getByText("Sign-in emails")).toBeTruthy();
    fireEvent.click(screen.getByTestId("pref-refillAlerts"));
    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, i]) =>
            String(u).includes("/v1/notification-preferences") &&
            i?.method === "PUT",
        ),
      ).toBe(true),
    );
  });
});

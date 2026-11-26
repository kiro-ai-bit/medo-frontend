import "fake-indexeddb/auto";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GamificationWidget } from "@features/gamification";
import { useGamificationStore } from "@lib/state/client/gamificationStore";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { queryClient } from "@lib/state/query/queryClient";
import { queryKeys } from "@lib/state/query/queryKeys";
import { jsonResponse, resetStores } from "../helpers";

const PID = "11111111-1111-4111-8111-111111111111";

function mockGamification(
  body: unknown = {
    harmonyPoints: 25,
    themeState: "Uneasy",
    updatedAt: "2026-11-26T00:00:00.000Z",
  },
  status = 200,
) {
  const fetchMock = vi.fn(async () => jsonResponse(status, body));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderWidget(patientId = PID) {
  return render(
    <QueryClientProvider client={queryClient}>
      <GamificationWidget patientId={patientId} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetStores();
  useGamificationStore.setState({ byPatient: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GamificationWidget", () => {
  it("renders points + theme from the API", async () => {
    mockGamification();
    renderWidget();
    await waitFor(() =>
      expect(screen.getByTestId("gamification-widget")).toBeTruthy(),
    );
    expect(screen.getByText(/25/)).toBeTruthy();
    expect(screen.getByText(/Uneasy/)).toBeTruthy();
  });

  it("updates without reload when the query is invalidated", async () => {
    let points = 10;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(200, {
          harmonyPoints: points,
          themeState: "Harmony",
          updatedAt: null,
        }),
      ),
    );
    renderWidget();
    await waitFor(() => expect(screen.getByText(/10/)).toBeTruthy());
    points = 20;
    await queryClient.invalidateQueries({
      queryKey: queryKeys.gamification(PID),
    });
    await waitFor(() => expect(screen.getByText(/20/)).toBeTruthy());
  });

  it("marks live data stale when connectivity degrades", async () => {
    mockGamification();
    renderWidget();
    await waitFor(() =>
      expect(screen.getByTestId("gamification-widget")).toBeTruthy(),
    );
    expect(screen.queryByTestId("gamification-stale")).toBeNull();
    useConnectivityStore.setState({ status: "degraded" });
    await waitFor(() =>
      expect(screen.getByTestId("gamification-stale")).toBeTruthy(),
    );
  });

  it("shows last-known values with stale marker when the fetch fails", async () => {
    useGamificationStore.getState().remember(PID, {
      harmonyPoints: 7,
      themeState: "Harmony",
    });
    mockGamification(
      { error: { code: "X", message: "x", requestId: "r" } },
      500,
    );
    renderWidget();
    await waitFor(() =>
      expect(screen.getByTestId("gamification-widget")).toBeTruthy(),
    );
    expect(screen.getByText(/7/)).toBeTruthy();
    expect(screen.getByTestId("gamification-stale")).toBeTruthy();
  });

  it("renders nothing when there is no data and no last-known", async () => {
    mockGamification(undefined, 500);
    const { container } = renderWidget();
    await new Promise((r) => setTimeout(r, 200));
    expect(container.firstChild).toBeNull();
  });
});

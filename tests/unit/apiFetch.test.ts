import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { apiFetch, setUnauthorizedHandler } from "@lib/api/http/apiFetch";
import { ApiError } from "@lib/api/http/errors";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { errorEnvelope, jsonResponse, resetStores } from "../helpers";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const okSchema = z.object({ ok: z.boolean() });

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
});

describe("apiFetch", () => {
  it("attaches Bearer token and parses response via schema", async () => {
    useSessionStore.setState({ accessToken: "tok-1" });
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    const res = await apiFetch({ method: "GET", path: "/v1/me" }, okSchema);
    expect(res).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://api.test/v1/me");
    expect((init.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer tok-1",
    );
  });

  it("does not attach Bearer on auth routes", async () => {
    useSessionStore.setState({ accessToken: "tok-1" });
    fetchMock.mockResolvedValue(jsonResponse(200, { ok: true }));
    await apiFetch(
      { method: "POST", path: "/v1/auth/refresh", isAuthRoute: true },
      okSchema,
    );
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(
      (init.headers as Record<string, string>)["authorization"],
    ).toBeUndefined();
  });

  it("normalizes error envelope into ApiError with details", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        400,
        errorEnvelope("VALIDATION_FAILED", "bad input", { field: "email" }),
      ),
    );
    const err = await apiFetch(
      { method: "GET", path: "/v1/x" },
      okSchema,
    ).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(400);
    expect(err.code).toBe("VALIDATION_FAILED");
    expect(err.details).toEqual({ field: "email" });
    expect(err.requestId).toBe("req-1");
  });

  it("engages degraded connectivity on network failure and clears on success", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      apiFetch({ method: "GET", path: "/v1/x" }, okSchema),
    ).rejects.toMatchObject({
      status: 0,
      code: "NETWORK_ERROR",
    });
    expect(useConnectivityStore.getState().status).toBe("degraded");

    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    await apiFetch({ method: "GET", path: "/v1/x" }, okSchema);
    expect(useConnectivityStore.getState().status).toBe("online");
  });

  it("HTTP error responses do NOT engage degraded mode", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(500, errorEnvelope("INTERNAL", "boom")),
    );
    await expect(
      apiFetch({ method: "GET", path: "/v1/x" }, okSchema),
    ).rejects.toBeInstanceOf(ApiError);
    expect(useConnectivityStore.getState().status).toBe("online");
  });

  it("401 triggers single-flight refresh then retries once", async () => {
    const handler = vi.fn(async () => {
      useSessionStore.setState({ accessToken: "tok-2" });
      return true;
    });
    setUnauthorizedHandler(handler);

    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(401, errorEnvelope("UNAUTHORIZED", "expired")),
      )
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    const res = await apiFetch({ method: "GET", path: "/v1/x" }, okSchema);
    expect(res).toEqual({ ok: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [, retryInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect((retryInit.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer tok-2",
    );
  });

  it("concurrent 401s share a single refresh attempt", async () => {
    let resolveRefresh: (v: boolean) => void = () => {};
    const handler = vi.fn(
      () =>
        new Promise<boolean>((res) => {
          resolveRefresh = res;
        }),
    );
    setUnauthorizedHandler(handler);

    fetchMock
      .mockResolvedValueOnce(jsonResponse(401, errorEnvelope("UNAUTHORIZED")))
      .mockResolvedValueOnce(jsonResponse(401, errorEnvelope("UNAUTHORIZED")))
      .mockImplementation(() =>
        Promise.resolve(jsonResponse(200, { ok: true })),
      );

    const p1 = apiFetch({ method: "GET", path: "/v1/a" }, okSchema);
    const p2 = apiFetch({ method: "GET", path: "/v1/b" }, okSchema);
    await vi.waitFor(() => expect(handler).toHaveBeenCalledTimes(1));
    resolveRefresh(true);
    await expect(p1).resolves.toEqual({ ok: true });
    await expect(p2).resolves.toEqual({ ok: true });
  });

  it("refresh failure throws 401 ApiError (handler owns purge)", async () => {
    const handler = vi.fn(async () => false);
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      jsonResponse(401, errorEnvelope("UNAUTHORIZED")),
    );
    await expect(
      apiFetch({ method: "GET", path: "/v1/x" }, okSchema),
    ).rejects.toMatchObject({
      status: 401,
      code: "UNAUTHORIZED",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("auth routes never trigger the interceptor", async () => {
    const handler = vi.fn(async () => true);
    setUnauthorizedHandler(handler);
    fetchMock.mockResolvedValue(
      jsonResponse(401, errorEnvelope("UNAUTHORIZED")),
    );
    await expect(
      apiFetch(
        { method: "POST", path: "/v1/auth/login", isAuthRoute: true },
        okSchema,
      ),
    ).rejects.toBeInstanceOf(ApiError);
    expect(handler).not.toHaveBeenCalled();
  });

  it("zod parse failure throws INVALID_RESPONSE ApiError", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { wrong: 1 }));
    await expect(
      apiFetch({ method: "GET", path: "/v1/x" }, okSchema),
    ).rejects.toMatchObject({
      code: "INVALID_RESPONSE",
    });
  });
});

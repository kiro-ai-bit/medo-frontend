import { beforeEach, describe, expect, it, vi } from "vitest";
import { identityClient } from "@lib/api/identity";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { jsonResponse, resetStores } from "../helpers";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const USER = {
  userId: "11111111-1111-4111-8111-111111111111",
  accessToken: "at-1",
  expiresAt: "2026-11-26T12:00:00.000Z",
};
const ME = {
  displayName: "Test User",
  timezone: "Asia/Karachi",
  role: "Patient",
  email: "a@b.com",
  emailVerified: true,
};

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    init,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe("identityClient", () => {
  it("signup posts contract body to /v1/auth/signup", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        userId: USER.userId,
        email: "a@b.com",
        role: "Patient",
      }),
    );
    const res = await identityClient.signup({
      name: "Test",
      email: "a@b.com",
      password: "password123",
      role: "Patient",
    });
    expect(res.userId).toBe(USER.userId);
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/auth/signup");
    expect(c.init.method).toBe("POST");
    expect(c.body).toEqual({
      name: "Test",
      email: "a@b.com",
      password: "password123",
      role: "Patient",
    });
  });

  it("login posts credentials with include and returns session tokens", async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, USER));
    const res = await identityClient.login({
      email: "a@b.com",
      password: "pw",
    });
    expect(res.accessToken).toBe("at-1");
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/auth/login");
    expect(c.init.credentials).toBe("include");
    const headers = c.init.headers as Record<string, string>;
    expect(headers["authorization"]).toBeUndefined();
  });

  it("refresh sends cookie credentials, no body, no Bearer", async () => {
    useSessionStore.setState({ accessToken: "stale" });
    fetchMock.mockResolvedValue(jsonResponse(200, USER));
    await identityClient.refresh();
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/auth/refresh");
    expect(c.init.method).toBe("POST");
    expect(c.init.credentials).toBe("include");
    expect(c.init.body).toBeUndefined();
    expect(
      (c.init.headers as Record<string, string>)["authorization"],
    ).toBeUndefined();
  });

  it("logout posts with Bearer + cookie credentials", async () => {
    useSessionStore.setState({ accessToken: "at-1" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await identityClient.logout();
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/auth/logout");
    expect(c.init.credentials).toBe("include");
    expect((c.init.headers as Record<string, string>)["authorization"]).toBe(
      "Bearer at-1",
    );
  });

  it("forgotPassword posts email and parses accepted envelope", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { accepted: true }));
    const res = await identityClient.forgotPassword({ email: "a@b.com" });
    expect(res).toEqual({ accepted: true });
    expect(lastCall().url).toBe("http://api.test/v1/auth/forgot-password");
  });

  it("resetPassword posts token+password, 204 void", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await identityClient.resetPassword({
      token: "tok",
      password: "newpass123",
    });
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/auth/reset-password");
    expect(c.body).toEqual({ token: "tok", password: "newpass123" });
  });

  it("verifyEmail posts token, 204 void", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await identityClient.verifyEmail("vtok");
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/auth/verify-email");
    expect(c.body).toEqual({ token: "vtok" });
  });

  it("resendVerification posts email", async () => {
    fetchMock.mockResolvedValue(jsonResponse(202, { accepted: true }));
    await identityClient.resendVerification({ email: "a@b.com" });
    expect(lastCall().url).toBe("http://api.test/v1/auth/resend-verification");
  });

  it("getMe GETs /v1/me with Bearer and parses MeDto", async () => {
    useSessionStore.setState({ accessToken: "at-1" });
    fetchMock.mockResolvedValue(jsonResponse(200, ME));
    const me = await identityClient.getMe();
    expect(me.emailVerified).toBe(true);
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/me");
    expect(c.init.method).toBe("GET");
  });

  it("patchMe PATCHes /v1/me", async () => {
    useSessionStore.setState({ accessToken: "at-1" });
    fetchMock.mockResolvedValue(
      jsonResponse(200, { ...ME, displayName: "New" }),
    );
    const me = await identityClient.patchMe({ displayName: "New" });
    expect(me.displayName).toBe("New");
    const c = lastCall();
    expect(c.init.method).toBe("PATCH");
    expect(c.body).toEqual({ displayName: "New" });
  });

  it("deleteMe DELETEs /v1/me", async () => {
    useSessionStore.setState({ accessToken: "at-1" });
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await identityClient.deleteMe();
    expect(lastCall().init.method).toBe("DELETE");
    expect(lastCall().url).toBe("http://api.test/v1/me");
  });
});

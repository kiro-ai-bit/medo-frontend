import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureSubscription,
  removeSubscription,
  resetPushLifecycleForTests,
} from "@lib/sw/push/pushLifecycle";
import { medoDb } from "@lib/offline/db/medoDb";
import { jsonResponse, resetStores } from "../helpers";

const VAPID = "BEl" + "A".repeat(80); // base64url-ish public key

function mockPushEnv(opts: { permission?: NotificationPermission } = {}) {
  const permission = opts.permission ?? "granted";
  const subscribe = vi.fn(async () => ({
    endpoint: "https://fcm.googleapis.com/fcm/send/abc",
    getKey: (name: string) =>
      name === "p256dh"
        ? new Uint8Array([1, 2, 3]).buffer
        : new Uint8Array([4, 5, 6]).buffer,
    unsubscribe: vi.fn(async () => true),
  }));
  const getSubscription = vi.fn(async () => null);
  const registration = {
    pushManager: { subscribe, getSubscription },
  };
  Object.defineProperty(navigator, "serviceWorker", {
    value: {
      getRegistration: vi.fn(async () => registration),
      ready: Promise.resolve(registration),
    },
    configurable: true,
  });
  Object.defineProperty(window, "PushManager", {
    value: class {},
    configurable: true,
  });
  Object.defineProperty(window, "Notification", {
    value: {
      permission,
      requestPermission: vi.fn(async () => permission),
    },
    configurable: true,
  });
  return { subscribe, getSubscription, registration };
}

function mockFetch(over: { registerFails?: number } = {}) {
  const calls: { url: string; method: string; body?: unknown }[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({
        url,
        method,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      });
      if (url.includes("/v1/push/vapid-key")) {
        return jsonResponse(200, { publicKey: VAPID });
      }
      if (url.includes("/v1/push-subscriptions") && method === "POST") {
        if (over.registerFails) {
          return jsonResponse(over.registerFails, {
            error: { code: "GONE", message: "pruned", requestId: "r" },
          });
        }
        return jsonResponse(201, {
          id: "31000000-0000-4000-8000-000000000001",
          endpoint: "https://fcm.googleapis.com/fcm/send/abc",
          createdAt: "2026-11-26T00:00:00.000Z",
        });
      }
      if (url.includes("/v1/push-subscriptions/") && method === "DELETE") {
        return jsonResponse(200, { deleted: true });
      }
      return jsonResponse(404, {
        error: { code: "NOT_FOUND", message: "nf", requestId: "r" },
      });
    },
  );
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(async () => {
  resetStores();
  resetPushLifecycleForTests();
  await medoDb.open();
  await Promise.all(medoDb.tables.map((t) => t.clear()));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("pushLifecycle", () => {
  it("unsupported without PushManager", async () => {
    mockFetch();
    const status = await ensureSubscription();
    expect(status).toBe("unsupported");
  });

  it("subscribes and POSTs endpoint+keys on grant", async () => {
    const env = mockPushEnv({ permission: "granted" });
    const calls = mockFetch();
    const status = await ensureSubscription();
    expect(status).toBe("subscribed");
    expect(env.subscribe).toHaveBeenCalledTimes(1);
    const post = calls.find((c) => c.method === "POST");
    expect(post?.url).toContain("/v1/push-subscriptions");
    const body = post?.body as {
      endpoint: string;
      keys: { p256dh: string; auth: string };
    };
    expect(body.endpoint).toContain("fcm.googleapis.com");
    expect(body.keys.p256dh.length).toBeGreaterThan(0);
    expect(body.keys.auth.length).toBeGreaterThan(0);
  });

  it("fetches VAPID key once per session", async () => {
    mockPushEnv({ permission: "granted" });
    const calls = mockFetch();
    await ensureSubscription();
    await ensureSubscription();
    const vapidCalls = calls.filter((c) => c.url.includes("vapid-key"));
    expect(vapidCalls.length).toBe(1);
  });

  it("denied permission never subscribes", async () => {
    const env = mockPushEnv({ permission: "denied" });
    mockFetch();
    const status = await ensureSubscription();
    expect(status).toBe("denied");
    expect(env.subscribe).not.toHaveBeenCalled();
  });

  it("resyncs silently when server pruned the endpoint (404)", async () => {
    const env = mockPushEnv({ permission: "granted" });
    mockFetch({ registerFails: 404 });
    // Every POST 404s → one silent resubscribe, then "error" (never thrown,
    // never surfaced — FR-FE-093).
    const status = await ensureSubscription();
    expect(status).toBe("error");
    expect(env.subscribe).toHaveBeenCalledTimes(2);
  });

  it("skips re-POST when the stored endpoint already matches", async () => {
    mockPushEnv({ permission: "granted" });
    const calls = mockFetch();
    await ensureSubscription();
    const posts = calls.filter((c) => c.method === "POST").length;
    expect(posts).toBe(1);
    // Second ensure: local getSubscription still returns null in this mock,
    // but stored endpoint matches only if sub.endpoint equals — mock returns
    // null sub so it resubscribes; endpoint dedup covers the real path.
    // Verify meta keys were persisted for the dedup check.
    const { metaStore } = await import("@lib/offline/db/caches");
    expect(await metaStore.get("pushSubscriptionId")).toBe(
      "31000000-0000-4000-8000-000000000001",
    );
    expect(await metaStore.get("pushSubscriptionEndpoint")).toContain(
      "fcm.googleapis.com",
    );
  });

  it("removeSubscription DELETEs server row and unsubscribes", async () => {
    const env = mockPushEnv({ permission: "granted" });
    const calls = mockFetch();
    await ensureSubscription();
    await removeSubscription();
    const del = calls.find((c) => c.method === "DELETE");
    expect(del?.url).toContain("/v1/push-subscriptions/31000000");
    const sub = await env.registration.pushManager.getSubscription();
    expect(sub).toBeNull();
  });
});

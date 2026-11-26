import { CacheFirst, NavigationRoute, NetworkOnly, Serwist } from "serwist";
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import { ExpirationPlugin } from "@serwist/expiration";
import { isApiRequest, isCacheablePhoto } from "@lib/sw/rules";
import { rescheduleAll } from "@lib/sw/notifications/scheduler";
import { handleNotificationAction } from "@lib/sw/notifications/actions";
import { onNotificationClick, onPush } from "@lib/sw/push/handlers";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[];
  }
}

declare const self: WorkerGlobalScope;

const PHOTO_CACHE = "medo-photos";

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  precacheOptions: { cleanupOutdatedCaches: true },
  // LD-FE-11: next-navigation update — no skipWaiting, claim on activate.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      // Photos: immutable R2 keys — CacheFirst, 500 entries / 30 days (LD-FE-11).
      matcher: ({ url, request }) => isCacheablePhoto(url, request.method),
      handler: new CacheFirst({
        cacheName: PHOTO_CACHE,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 500,
            maxAgeSeconds: 30 * 24 * 3600,
          }),
        ],
      }),
    },
    {
      // API: never cached — NetworkOnly (Dexie is the offline store).
      matcher: ({ url }) => isApiRequest(url),
      handler: new NetworkOnly(),
    },
  ],
});

// Navigations fall back to the precached app shell when offline (LD-FE-11).
serwist.registerRoute(
  new NavigationRoute(
    async () => {
      const shell = await caches.match("/");
      if (!shell) throw new Error("app shell not precached");
      return shell;
    },
    { denylist: [/^\/_next\//, /^\/api\//, /\/sw\.js$/] },
  ),
);

serwist.addEventListeners();

// LD-FE-12/13: push display, notification actions + deep-link, reschedule.
// Serwist's WorkerGlobalScope type lacks the push/notification event maps.
const swEvents = self as unknown as {
  addEventListener(type: string, listener: (event: unknown) => void): void;
};

swEvents.addEventListener("push", (event) => {
  onPush(event as Parameters<typeof onPush>[0]);
});

swEvents.addEventListener("notificationclick", (event) => {
  const e = event as Parameters<typeof onNotificationClick>[0];
  onNotificationClick(e, (action, data) =>
    handleNotificationAction(
      action,
      data as { doseId?: string; actionOutcome?: string },
    ),
  );
});

swEvents.addEventListener("message", (event) => {
  const e = event as {
    data?: { type?: string };
    waitUntil(p: Promise<unknown>): void;
  };
  if (e.data?.type === "medo:reschedule") {
    e.waitUntil(rescheduleAll());
  }
});

swEvents.addEventListener("activate", (event) => {
  const e = event as { waitUntil(p: Promise<unknown>): void };
  e.waitUntil(rescheduleAll());
});

export default serwist;

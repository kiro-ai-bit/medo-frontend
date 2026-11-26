"use client";

import { notificationClient } from "@lib/api/notification";
import { isApiError } from "@lib/api/http/errors";
import { metaStore } from "@lib/offline/db/caches";
import { iosInstallRequired, pushSupported } from "./installGate";

const SUB_ID_KEY = "pushSubscriptionId";
const SUB_ENDPOINT_KEY = "pushSubscriptionEndpoint";

export type PushStatus =
  | "unsupported"
  | "install-required"
  | "default"
  | "denied"
  | "subscribed"
  | "error";

let vapidKeyCache: string | null = null;

export function resetPushLifecycleForTests(): void {
  vapidKeyCache = null;
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function bufferToBase64Url(buf: ArrayBuffer | null): string | null {
  if (!buf) return null;
  const bytes = new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null;
  return (
    (await navigator.serviceWorker.getRegistration()) ??
    (await navigator.serviceWorker.ready.catch(() => null))
  );
}

/** LLD §8.7 / FR-FE-089/093: permission → subscribe → POST once per device. */
export async function ensureSubscription(): Promise<PushStatus> {
  if (!pushSupported()) return "unsupported";
  if (iosInstallRequired()) return "install-required";

  const vapid =
    vapidKeyCache ?? (await notificationClient.getVapidKey()).publicKey;
  vapidKeyCache = vapid;

  if (Notification.permission === "denied") return "denied";

  const reg = await swRegistration();
  if (!reg) return "unsupported";

  if (Notification.permission === "default") {
    // Must be called inside a user gesture — callers gate on click.
    const result = await Notification.requestPermission();
    if (result !== "granted") return result === "denied" ? "denied" : "default";
  }

  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    });
  }

  // §8.7: once per device — skip the POST when the stored endpoint matches.
  const knownId = await metaStore.get<string>(SUB_ID_KEY);
  const knownEndpoint = await metaStore.get<string>(SUB_ENDPOINT_KEY);
  if (knownId && knownEndpoint === sub.endpoint) return "subscribed";

  const register = async (s: PushSubscription) => {
    const p256dh = bufferToBase64Url(s.getKey("p256dh"));
    const auth = bufferToBase64Url(s.getKey("auth"));
    if (!p256dh || !auth) return null;
    const dto = await notificationClient.registerPushSubscription({
      endpoint: s.endpoint,
      keys: { p256dh, auth },
    });
    await metaStore.set(SUB_ID_KEY, dto.id);
    await metaStore.set(SUB_ENDPOINT_KEY, s.endpoint);
    return dto;
  };

  try {
    if (!(await register(sub))) return "error";
  } catch (e) {
    // FR-FE-093: 404/410/403 = server pruned the endpoint — resubscribe once,
    // silently. Other failures are never surfaced to the user.
    if (!(isApiError(e) && [403, 404, 410].includes(e.status))) {
      return "error";
    }
    try {
      await sub.unsubscribe().catch(() => {});
      const fresh = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapid),
      });
      if (!(await register(fresh))) return "error";
    } catch {
      return "error";
    }
  }
  return "subscribed";
}

/** Best-effort unsubscribe + server DELETE — used by logout (FR-FE-010). */
export async function removeSubscription(): Promise<void> {
  try {
    const subId = await metaStore.get<string>(SUB_ID_KEY);
    if (subId) {
      await notificationClient
        .removePushSubscription(subId)
        .catch(() => undefined);
    }
    const reg = await swRegistration();
    const sub = await reg?.pushManager.getSubscription();
    await sub?.unsubscribe().catch(() => undefined);
  } finally {
    await metaStore.delete(SUB_ID_KEY);
    await metaStore.delete(SUB_ENDPOINT_KEY);
  }
}

export { iosInstallRequired, pushSupported };

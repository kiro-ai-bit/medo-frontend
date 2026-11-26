import { resolveDeepLink } from "./deepLink";
import { parsePushPayload } from "./payload";

interface PushEventLike {
  data: { json(): unknown; text(): string } | null;
  waitUntil(p: Promise<unknown>): void;
}

interface NotificationEventLike {
  notification: {
    data?: { url?: string; kind?: string; doseId?: string };
    close(): void;
  };
  action: string;
  waitUntil(p: Promise<unknown>): void;
}

/** LD-FE-13 / FR-FE-092: push payload → OS notification → deep-link on click. */
export function onPush(event: PushEventLike): void {
  event.waitUntil(
    (async () => {
      const raw = event.data ? safeJson(event.data) : null;
      const payload = parsePushPayload(raw);
      if (!payload) return;
      const reg = (globalThis as { registration?: ServiceWorkerRegistration })
        .registration;
      if (!reg) return;
      await reg.showNotification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: "/icons/icon-192.png",
        data: {
          doseId: payload.data?.doseId,
          url: payload.data?.url,
          kind: payload.data?.doseId ? "dose" : "system",
        },
      });
    })(),
  );
}

function safeJson(data: { json(): unknown; text(): string }): unknown {
  try {
    return data.json();
  } catch {
    try {
      return JSON.parse(data.text());
    } catch {
      return null;
    }
  }
}

interface SwClient {
  url: string;
  focus(): Promise<unknown>;
  navigate?(url: string): Promise<unknown>;
}

interface SwScope {
  clients: {
    matchAll(o: {
      type: string;
      includeUncontrolled: boolean;
    }): Promise<readonly SwClient[]>;
    openWindow(url: string): Promise<unknown>;
  };
  location: { origin: string };
}

const sw = () => globalThis as unknown as SwScope;

export async function focusOrOpen(url: string): Promise<void> {
  const clients = await sw().clients.matchAll({
    type: "window",
    includeUncontrolled: true,
  });
  for (const c of clients) {
    const clientUrl = new URL(c.url);
    if (clientUrl.origin === sw().location.origin) {
      await c.focus();
      // Focus alone drops the deep-link — navigate the existing window too.
      if (clientUrl.pathname + clientUrl.search !== url) {
        await c.navigate?.(url);
      }
      return;
    }
  }
  await sw().clients.openWindow(url);
}

/** notificationclick: action buttons enqueue; plain click deep-links. */
export function onNotificationClick(
  event: NotificationEventLike,
  onAction: (action: string, data: unknown) => Promise<void>,
): void {
  event.waitUntil(
    (async () => {
      event.notification.close();
      if (event.action) {
        await onAction(event.action, event.notification.data);
        return;
      }
      const data = event.notification.data;
      const url = resolveDeepLink({
        url: typeof data?.url === "string" ? data.url : undefined,
        kind:
          data?.kind === "dose" ||
          data?.kind === "care" ||
          data?.kind === "refill"
            ? data.kind
            : "dose",
      });
      await focusOrOpen(url);
    })(),
  );
}

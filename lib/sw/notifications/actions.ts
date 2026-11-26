import { enqueueWrite } from "@lib/offline/queue/queue";

export type NotificationAction = "taken" | "snooze";

interface NotificationData {
  doseId?: string;
  actionOutcome?: string;
}

/**
 * LD-FE-12 / FR-FE-091b / §8.3: Taken/Snooze from a local notification takes
 * the SAME write path as the UI — `enqueueWrite` gives FIFO order, cap/age
 * eviction, and pending-count sync. The SW holds no access token, so the
 * entry replays to the API on the next client trigger.
 */
export async function handleNotificationAction(
  action: string,
  data: NotificationData | undefined,
): Promise<void> {
  if (action !== "taken" && action !== "snooze") return;
  const doseId = data?.doseId;
  if (!doseId) return;

  // enqueueWrite needs patientId — resolve from the cached dose row.
  const { medoDb } = await import("@lib/offline/db/medoDb");
  const dose = await medoDb.doses.get(doseId);
  if (!dose) return;

  await enqueueWrite({
    type: action === "taken" ? "outcome" : "snooze",
    patientId: dose.patientId,
    doseId,
    payload:
      action === "taken"
        ? {
            outcome: data?.actionOutcome ?? "taken-on-time",
            markedAt: new Date().toISOString(),
          }
        : {},
  });

  const clients = await (
    globalThis as unknown as {
      clients: {
        matchAll(o: {
          type: string;
          includeUncontrolled: boolean;
        }): Promise<readonly { postMessage(m: unknown): void }[]>;
      };
    }
  ).clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of clients) c.postMessage({ type: "medo:queue-changed" });
}

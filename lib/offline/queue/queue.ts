import { scheduleDoseClient } from "@lib/api/schedule-dose";
import { isApiError } from "@lib/api/http/errors";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { medoDb, type QueueEntry } from "../db/medoDb";
import { metaStore } from "../db/caches";

export const MAX_QUEUE_ENTRIES = 200;
export const MAX_QUEUE_AGE_DAYS = 7;

const PENDING_KEY = "pendingSyncCount";
const EVICTED_KEY = "evictedCount";

export interface EnqueueInput {
  type: QueueEntry["type"];
  patientId: string;
  doseId: string;
  payload: QueueEntry["payload"];
}

async function syncPendingCount(): Promise<void> {
  const n = await medoDb.writeQueue.count();
  await metaStore.set(PENDING_KEY, n);
  useConnectivityStore.getState().setPendingSyncCount(n);
}

function warnQueue(message: string): void {
  useConnectivityStore.getState().setQueueNotice(message);
}

/** FIFO enqueue inside one Dexie tx; evicts oldest beyond cap (LD-FE-09). */
export async function enqueueWrite(input: EnqueueInput): Promise<QueueEntry> {
  const now = new Date().toISOString();
  const entry: QueueEntry = {
    type: input.type,
    patientId: input.patientId,
    doseId: input.doseId,
    payload: input.payload,
    enqueuedAt: now,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
  };
  await medoDb.transaction("rw", [medoDb.writeQueue, medoDb.meta], async () => {
    const id = (await medoDb.writeQueue.add(entry)) as number;
    entry.entryId = id;
    const cutoff = new Date(
      Date.now() - MAX_QUEUE_AGE_DAYS * 86_400_000,
    ).toISOString();
    const stale = await medoDb.writeQueue
      .where("enqueuedAt")
      .below(cutoff)
      .toArray();
    if (stale.length > 0) {
      await medoDb.writeQueue.bulkDelete(stale.map((e) => e.entryId!));
      const ageEvicted =
        ((await metaStore.get<number>(EVICTED_KEY)) ?? 0) + stale.length;
      await metaStore.set(EVICTED_KEY, ageEvicted);
      warnQueue(
        `${stale.length} offline change${stale.length === 1 ? "" : "s"} older than ${MAX_QUEUE_AGE_DAYS} days ${stale.length === 1 ? "was" : "were"} discarded.`,
      );
    }
    const count = await medoDb.writeQueue.count();
    if (count > MAX_QUEUE_ENTRIES) {
      const overflow = count - MAX_QUEUE_ENTRIES;
      const oldest = await medoDb.writeQueue
        .orderBy("entryId")
        .limit(overflow)
        .toArray();
      await medoDb.writeQueue.bulkDelete(oldest.map((e) => e.entryId!));
      const evicted =
        ((await metaStore.get<number>(EVICTED_KEY)) ?? 0) + overflow;
      await metaStore.set(EVICTED_KEY, evicted);
      warnQueue(
        `Offline queue is full — ${overflow} oldest change${overflow === 1 ? "" : "s"} discarded.`,
      );
    }
  });
  await syncPendingCount();
  return entry;
}

export async function pendingCount(): Promise<number> {
  return medoDb.writeQueue.count();
}

export interface ReplayHandlers {
  markOutcome: (doseId: string, outcome: string) => Promise<unknown>;
  snoozeDose: (doseId: string) => Promise<unknown>;
}

const defaultHandlers: ReplayHandlers = {
  // Contract MarkDoseOutcomeRequestSchema is strict {outcome} — markedAt is
  // stored for diagnostics but never sent (server stamps its own time).
  markOutcome: (doseId, outcome) =>
    scheduleDoseClient.markOutcome(doseId, {
      outcome: outcome as "taken-on-time" | "taken-late" | "skipped",
    }),
  snoozeDose: (doseId) => scheduleDoseClient.snoozeDose(doseId),
};

let replaying = false;

function backoffMs(attempts: number): number {
  const base = Math.min(30 * 60_000, 2 ** attempts * 60_000);
  const jitter = 0.8 + Math.random() * 0.4;
  return Math.round(base * jitter);
}

function isPermanent(e: unknown): boolean {
  if (!isApiError(e)) return false;
  return (
    e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429
  );
}

/** Ordered FIFO replay, single-flight, head-of-line blocking (§8.3). */
export async function replayQueue(
  handlers: ReplayHandlers = defaultHandlers,
): Promise<{ sent: number; remaining: number }> {
  if (replaying || useConnectivityStore.getState().status !== "online") {
    return { sent: 0, remaining: await pendingCount() };
  }
  replaying = true;
  let sent = 0;
  try {
    const now = Date.now();
    const rows = await medoDb.writeQueue.orderBy("entryId").toArray();
    for (const entry of rows) {
      if (entry.dead) continue;
      if (Date.parse(entry.nextAttemptAt) > now) break;
      try {
        if (entry.type === "outcome") {
          await handlers.markOutcome(
            entry.doseId,
            entry.payload.outcome ?? "taken-on-time",
          );
        } else {
          await handlers.snoozeDose(entry.doseId);
        }
        await medoDb.writeQueue.delete(entry.entryId!);
        sent++;
      } catch (e) {
        const attempts = entry.attempts + 1;
        // 429 Retry-After wins over exponential backoff (LD-FE-10).
        const retryAfter = isApiError(e) ? e.retryAfterSeconds : null;
        const delay =
          retryAfter != null ? retryAfter * 1000 : backoffMs(attempts);
        await medoDb.writeQueue.update(entry.entryId!, {
          attempts,
          lastError: isApiError(e) ? e.code : "UNKNOWN",
          nextAttemptAt: new Date(Date.now() + delay).toISOString(),
          ...(isPermanent(e) ? { dead: true } : {}),
        });
        if (isPermanent(e)) {
          warnQueue("An offline change couldn't be synced and was set aside.");
        }
        break;
      }
    }
  } finally {
    replaying = false;
    await syncPendingCount();
  }
  return { sent, remaining: await pendingCount() };
}

export async function clearQueue(): Promise<void> {
  await medoDb.writeQueue.clear();
  await syncPendingCount();
}

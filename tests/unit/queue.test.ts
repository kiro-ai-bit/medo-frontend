import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { medoDb } from "@lib/offline/db/medoDb";
import { metaStore } from "@lib/offline/db/caches";
import {
  MAX_QUEUE_ENTRIES,
  enqueueWrite,
  pendingCount,
  replayQueue,
  type ReplayHandlers,
} from "@lib/offline/queue/queue";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { ApiError } from "@lib/api/http/errors";

const PID = "11111111-1111-4111-8111-111111111111";

function okHandlers(calls: string[]): ReplayHandlers {
  return {
    markOutcome: async (doseId, outcome) => {
      calls.push(`outcome:${doseId}:${outcome}`);
    },
    snoozeDose: async (doseId) => {
      calls.push(`snooze:${doseId}`);
    },
  };
}

async function seed(doseId: string, over: Record<string, unknown> = {}) {
  return enqueueWrite({
    type: "outcome",
    patientId: PID,
    doseId,
    payload: { outcome: "taken-on-time" },
    ...over,
  } as never);
}

afterEach(async () => {
  await medoDb.open();
  await Promise.all(medoDb.tables.map((t) => t.clear()));
  useConnectivityStore.getState().reset();
  vi.restoreAllMocks();
});

describe("replayQueue (LD-FE-10, §8.3, INV-FE-3)", () => {
  it("replays FIFO in entryId order and deletes sent rows", async () => {
    useConnectivityStore.getState().clear();
    await seed("d1");
    await seed("d2");
    await enqueueWrite({
      type: "snooze",
      patientId: PID,
      doseId: "d3",
      payload: {},
    });
    const calls: string[] = [];
    const res = await replayQueue(okHandlers(calls));
    expect(calls).toEqual([
      "outcome:d1:taken-on-time",
      "outcome:d2:taken-on-time",
      "snooze:d3",
    ]);
    expect(res.sent).toBe(3);
    expect(await pendingCount()).toBe(0);
  });

  it("does not run while degraded", async () => {
    useConnectivityStore.getState().engage();
    await seed("d1");
    const calls: string[] = [];
    const res = await replayQueue(okHandlers(calls));
    expect(res.sent).toBe(0);
    expect(calls).toEqual([]);
    expect(await pendingCount()).toBe(1);
  });

  it("head-of-line blocks on future nextAttemptAt", async () => {
    useConnectivityStore.getState().clear();
    await seed("d1");
    await seed("d2");
    await medoDb.writeQueue.update(
      (await medoDb.writeQueue.orderBy("entryId").first())!.entryId!,
      {
        nextAttemptAt: new Date(Date.now() + 60_000).toISOString(),
      },
    );
    const calls: string[] = [];
    const res = await replayQueue(okHandlers(calls));
    expect(calls).toEqual([]);
    expect(res.sent).toBe(0);
    expect(await pendingCount()).toBe(2);
  });

  it("failed entry gets attempts+1, lastError, bounded nextAttemptAt, and blocks the rest", async () => {
    useConnectivityStore.getState().clear();
    await seed("d1");
    await seed("d2");
    const calls: string[] = [];
    const failOnce: ReplayHandlers = {
      markOutcome: async () => {
        throw new ApiError({
          status: 500,
          code: "DEPENDENCY_UNAVAILABLE",
          message: "x",
        });
      },
      snoozeDose: async (d) => calls.push(`snooze:${d}`),
    };
    await replayQueue(failOnce);
    const row = (await medoDb.writeQueue.orderBy("entryId").toArray())[0];
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toBe("DEPENDENCY_UNAVAILABLE");
    expect(row?.dead).toBeFalsy();
    expect(Date.parse(row!.nextAttemptAt)).toBeGreaterThan(Date.now());
    expect(Date.parse(row!.nextAttemptAt)).toBeLessThanOrEqual(
      Date.now() + 40 * 60_000,
    );
    // head-of-line: d2 never attempted
    expect(calls).toEqual([]);
    expect(await pendingCount()).toBe(2);
  });

  it("marks dead on permanent 4xx (not 401/429) and skips it on later replays", async () => {
    useConnectivityStore.getState().clear();
    await seed("d1");
    await seed("d2");
    const calls: string[] = [];
    const permanent: ReplayHandlers = {
      markOutcome: async (doseId) => {
        if (doseId === "d1")
          throw new ApiError({
            status: 422,
            code: "VALIDATION_FAILED",
            message: "x",
          });
        calls.push(`outcome:${doseId}`);
      },
      snoozeDose: async () => {},
    };
    await replayQueue(permanent);
    const dead = (await medoDb.writeQueue.orderBy("entryId").toArray())[0];
    expect(dead?.dead).toBe(true);
    expect(dead?.attempts).toBe(1);
    // d2 blocked behind dead head this run; force nextAttemptAt past then replay
    await medoDb.writeQueue.update(
      (await medoDb.writeQueue.orderBy("entryId").first())!.entryId!,
      {
        nextAttemptAt: new Date(Date.now() - 1000).toISOString(),
      },
    );
    await replayQueue(permanent);
    expect(calls).toEqual(["outcome:d2"]);
    expect(await medoDb.writeQueue.count()).toBe(1); // dead row retained for warning
  });

  it.each([401, 429])(
    "does NOT mark dead on retryable status %i",
    async (status) => {
      useConnectivityStore.getState().clear();
      await seed("d1");
      const h: ReplayHandlers = {
        markOutcome: async () => {
          throw new ApiError({ status, code: "X", message: "x" });
        },
        snoozeDose: async () => {},
      };
      await replayQueue(h);
      const row = (await medoDb.writeQueue.orderBy("entryId").toArray())[0];
      expect(row?.dead).toBeFalsy();
      expect(row?.attempts).toBe(1);
    },
  );
});

describe("enqueueWrite cap + age eviction (LD-FE-09)", () => {
  it("evicts oldest beyond MAX_QUEUE_ENTRIES and bumps meta.evictedCount", async () => {
    for (let i = 0; i < MAX_QUEUE_ENTRIES + 5; i++) {
      await seed(`d${i}`);
    }
    expect(await pendingCount()).toBe(MAX_QUEUE_ENTRIES);
    const rows = await medoDb.writeQueue.orderBy("entryId").toArray();
    expect(rows[0]!.doseId).toBe("d5"); // oldest 5 evicted
    expect(await metaStore.get<number>("evictedCount")).toBe(5);
  });

  it("evicts entries older than MAX_QUEUE_AGE_DAYS on enqueue", async () => {
    const old = await seed("old");
    await medoDb.writeQueue.update(old.entryId!, {
      enqueuedAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    });
    await seed("new");
    const ids = (await medoDb.writeQueue.toArray()).map((r) => r.doseId);
    expect(ids).toEqual(["new"]);
  });
});

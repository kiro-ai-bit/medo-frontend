import { queryClient } from "./queryClient";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { replayQueue } from "@lib/offline/queue/queue";
import { notifyServiceWorker } from "@lib/sw/bridge";

let registered = false;
let bootInvalidated = false;

/** FR-FE-083 triggers: boot invalidate + connectivity-restore replay→invalidate. */
export function registerRefreshTriggers(): void {
  if (registered || typeof window === "undefined") return;
  registered = true;

  useConnectivityStore.subscribe((state, prev) => {
    if (prev.status === "degraded" && state.status === "online") {
      void replayQueue()
        .catch(() => {})
        .then(() => queryClient.invalidateQueries());
      // LD-FE-12: connectivity-restore → SW reminder recompute.
      notifyServiceWorker("medo:reschedule");
    }
  });
}

export function invalidateOnBoot(): void {
  if (bootInvalidated) return;
  bootInvalidated = true;
  void queryClient.invalidateQueries();
  // LD-FE-12: app-open → SW reminder recompute.
  notifyServiceWorker("medo:reschedule");
}

export function resetRefreshTriggersForTests(): void {
  registered = false;
  bootInvalidated = false;
}

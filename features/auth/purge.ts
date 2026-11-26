import { runPurgeSteps } from "@lib/state/client/purgeSteps";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { useGamificationStore } from "@lib/state/client/gamificationStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { queryClient } from "@lib/state/query/queryClient";

export type PurgeReason = "logout" | "expired" | "deleted";

/**
 * Single purge routine (LD-FE-04 / FR-FE-010): offline store + query cache +
 * zustand state + session cleared, then hard-route to /login. Hard navigation
 * guarantees the memory-only access token is dropped. Never throws.
 */
export async function purgeClientState(reason: PurgeReason): Promise<void> {
  await runPurgeSteps();
  try {
    queryClient.clear();
  } catch {
    // query client unavailable — continue purge
  }
  const notice =
    reason === "expired" ? "expired" : reason === "deleted" ? "deleted" : null;
  useSessionStore.getState().clear(notice);
  useConnectivityStore.getState().reset();
  useGamificationStore.getState().reset();
  if (typeof window !== "undefined" && window.location.pathname !== "/login") {
    const suffix = notice ? `?reason=${notice}` : "";
    window.location.assign(`/login${suffix}`);
  }
}

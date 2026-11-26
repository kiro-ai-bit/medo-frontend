import { create } from "zustand";

export type ConnectivityStatus = "online" | "degraded";

interface ConnectivityState {
  status: ConnectivityStatus;
  pendingSyncCount: number;
  /** One-shot user warning for queue eviction/dead entries (FR-FE-086). */
  queueNotice: string | null;
  engage: () => void;
  clear: () => void;
  setPendingSyncCount: (n: number) => void;
  setQueueNotice: (notice: string | null) => void;
  reset: () => void;
}

export const useConnectivityStore = create<ConnectivityState>()((set) => ({
  status: "online",
  pendingSyncCount: 0,
  queueNotice: null,
  engage: () => set({ status: "degraded" }),
  clear: () => set({ status: "online" }),
  setPendingSyncCount: (n) => set({ pendingSyncCount: n }),
  setQueueNotice: (notice) => set({ queueNotice: notice }),
  reset: () =>
    set({ status: "online", pendingSyncCount: 0, queueNotice: null }),
}));

export function useConnectivity(): ConnectivityStatus {
  return useConnectivityStore((s) => s.status);
}

/**
 * Browser online/offline signals (LLD §8.1 / HD-FE-06).
 * `offline` engages degraded immediately; `online` does NOT clear — clearing
 * requires proof via a successful apiFetch (INV-FE-6). The optional probe
 * fires API traffic whose 2xx response performs the proof-clear.
 */
export function registerConnectivityListeners(
  onOnlineProbe?: () => void,
): () => void {
  const onOffline = () => useConnectivityStore.getState().engage();
  const onOnline = () => onOnlineProbe?.();
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };
}

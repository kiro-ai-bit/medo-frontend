import { create } from "zustand";

export type ConnectivityStatus = "online" | "degraded";

interface ConnectivityState {
  status: ConnectivityStatus;
  pendingSyncCount: number;
  engage: () => void;
  clear: () => void;
  setPendingSyncCount: (n: number) => void;
  reset: () => void;
}

export const useConnectivityStore = create<ConnectivityState>()((set) => ({
  status: "online",
  pendingSyncCount: 0,
  engage: () => set({ status: "degraded" }),
  clear: () => set({ status: "online" }),
  setPendingSyncCount: (n) => set({ pendingSyncCount: n }),
  reset: () => set({ status: "online", pendingSyncCount: 0 }),
}));

export function useConnectivity(): ConnectivityStatus {
  return useConnectivityStore((s) => s.status);
}

/** Browser online/offline signals — first half of the dual-signal FSM (LLD §8.1). */
export function registerConnectivityListeners(): () => void {
  const onOffline = () => useConnectivityStore.getState().engage();
  const onOnline = () => useConnectivityStore.getState().clear();
  window.addEventListener("offline", onOffline);
  window.addEventListener("online", onOnline);
  return () => {
    window.removeEventListener("offline", onOffline);
    window.removeEventListener("online", onOnline);
  };
}

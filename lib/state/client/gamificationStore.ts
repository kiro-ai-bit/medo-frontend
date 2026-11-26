import { create } from "zustand";

export interface GamificationSnapshot {
  harmonyPoints: number;
  themeState: string;
}

interface GamificationState {
  /** Last-known values per patient — memory only, NEVER Dexie (LD-FE-15, INV-FE-1). */
  byPatient: Record<string, GamificationSnapshot>;
  remember: (patientId: string, snap: GamificationSnapshot) => void;
  reset: () => void;
}

export const useGamificationStore = create<GamificationState>()((set) => ({
  byPatient: {},
  remember: (patientId, snap) =>
    set((s) => ({ byPatient: { ...s.byPatient, [patientId]: snap } })),
  reset: () => set({ byPatient: {} }),
}));

import { useSessionStore } from "@lib/state/client/sessionStore";
import type { LinkListItem } from "@kiro-ai-bit/contracts";
import { create } from "zustand";

export type PatientContextSource = "self" | "link";

interface PatientContextState {
  patientId: string | null;
  source: PatientContextSource | null;
  selectedLinkId: string | null;
  selectedLink: LinkListItem | null;
  endedLinkBanner: string | null;
  setSelf: (patientId: string) => void;
  selectLink: (link: LinkListItem) => void;
  clearSelection: () => void;
  markLinkEnded: (linkId: string) => void;
  clearBanner: () => void;
  reset: () => void;
}

export const usePatientContextStore = create<PatientContextState>()((set) => ({
  patientId: null,
  source: null,
  selectedLinkId: null,
  selectedLink: null,
  endedLinkBanner: null,
  setSelf: (patientId) =>
    set({
      patientId,
      source: "self",
      selectedLinkId: null,
      selectedLink: null,
    }),
  selectLink: (link) => {
    const patientId =
      link.direction === "as-caregiver" ? link.counterpart.userId : null;
    set({
      patientId,
      source: patientId ? "link" : null,
      selectedLinkId: link.linkId,
      selectedLink: link,
    });
  },
  clearSelection: () =>
    set({
      patientId: null,
      source: null,
      selectedLinkId: null,
      selectedLink: null,
    }),
  markLinkEnded: (linkId) => set({ endedLinkBanner: linkId }),
  clearBanner: () => set({ endedLinkBanner: null }),
  reset: () =>
    set({
      patientId: null,
      source: null,
      selectedLinkId: null,
      selectedLink: null,
      endedLinkBanner: null,
    }),
}));

/** Resolved patient context: Patient→session sub; Caregiver→switcher selection (HD-FE-04). */
export function resolvePatientContext(): {
  patientId: string;
  source: PatientContextSource;
} | null {
  const me = useSessionStore.getState().me;
  if (!me) return null;
  if (me.role === "Patient") {
    const userId = useSessionStore.getState().userId;
    return userId ? { patientId: userId, source: "self" } : null;
  }
  const ctx = usePatientContextStore.getState();
  if (ctx.patientId && ctx.source === "link") {
    return { patientId: ctx.patientId, source: "link" };
  }
  return null;
}

export class NoPatientContextError extends Error {
  constructor() {
    super("No patient context resolved");
    this.name = "NoPatientContextError";
  }
}

export function requirePatientContext(): {
  patientId: string;
  source: PatientContextSource;
} {
  const ctx = resolvePatientContext();
  if (!ctx) throw new NoPatientContextError();
  return ctx;
}

"use client";

import { useQuery } from "@tanstack/react-query";
import type { LinkListItem } from "@kiro-ai-bit/contracts";
import { careClient } from "@lib/api/care";
import { setForbiddenHandler } from "@lib/api/http/apiFetch";
import { doseCache, metaStore } from "@lib/offline/db/caches";
import { medoDb } from "@lib/offline/db/medoDb";
import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { queryKeys } from "@lib/state/query/queryKeys";
import { useEffect } from "react";
import { useSessionStore } from "@lib/state/client/sessionStore";

/** Care links — API-only, never Dexie (FR-FE-043). */
export function useCareLinks() {
  const role = useSessionStore((s) => s.me?.role);
  return useQuery({
    queryKey: queryKeys.links(),
    queryFn: () => careClient.listLinks(),
    select: (res) => res,
    enabled: role === "Caregiver" || role === "Patient",
  });
}

/** Reactive patient context: Patient→session sub; Caregiver→switcher selection (HD-FE-04). */
export function usePatientContext(): {
  patientId: string;
  role: "patient" | "caregiver";
  source: "self" | "link";
} | null {
  const me = useSessionStore((s) => s.me);
  const userId = useSessionStore((s) => s.userId);
  const ctxPatientId = usePatientContextStore((s) => s.patientId);
  const ctxSource = usePatientContextStore((s) => s.source);
  if (!me) return null;
  if (me.role === "Patient") {
    return userId
      ? { patientId: userId, role: "patient", source: "self" }
      : null;
  }
  if (ctxPatientId && ctxSource === "link") {
    return { patientId: ctxPatientId, role: "caregiver", source: "link" };
  }
  return null;
}

export {
  requirePatientContext,
  NoPatientContextError,
} from "@lib/state/client/patientContextStore";

/** Link-end handling: purge patient slice + queue rows + selection; banner flag (meta-persisted). */
export async function handleLinkEnd(linkId: string): Promise<void> {
  const ctx = usePatientContextStore.getState();
  const patientId = ctx.patientId;
  if (patientId) await doseCache.purgePatient(patientId);
  ctx.clearSelection();
  ctx.markLinkEnded(linkId);
  await metaStore.set(`endedLinks:${linkId}`, true);
}

/**
 * Link-end detection (FR-FE-006/007): (a) links refresh diff — selected link
 * vanished; (b) any patient-scoped call returns 403 → forbidden handler.
 */
export function useLinkEndWatch(): void {
  const links = useCareLinks();
  const selectedLinkId = usePatientContextStore((s) => s.selectedLinkId);

  useEffect(() => {
    setForbiddenHandler(() => {
      const s = usePatientContextStore.getState();
      if (s.source === "link" && s.selectedLinkId) {
        void handleLinkEnd(s.selectedLinkId);
      }
    });
    return () => setForbiddenHandler(null);
  }, []);

  // Hydrate persisted ended-link banner (meta.endedLinks:*) on mount (FR-FE-006b).
  useEffect(() => {
    void (async () => {
      const keys = await medoDb.meta
        .where("key")
        .startsWith("endedLinks:")
        .keys();
      const latest = keys.map(String).sort().at(-1);
      if (latest && !usePatientContextStore.getState().endedLinkBanner) {
        usePatientContextStore
          .getState()
          .markLinkEnded(latest!.slice("endedLinks:".length));
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedLinkId || !links.data) return;
    const stillThere = links.data.some(
      (l: LinkListItem) => l.linkId === selectedLinkId,
    );
    if (!stillThere) void handleLinkEnd(selectedLinkId);
  }, [links.data, selectedLinkId]);
}

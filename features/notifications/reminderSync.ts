"use client";

import { useEffect } from "react";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { metaStore } from "@lib/offline/db/caches";
import { notifyServiceWorker } from "@lib/sw/bridge";
import {
  SELF_PATIENT_KEY,
  SELF_ROLE_KEY,
} from "@lib/sw/notifications/scheduler";
import type { ReminderRole } from "@lib/sw/notifications/reminderRhythm";

/**
 * LD-FE-12: keep the SW scheduler's role markers in Dexie meta and trigger
 * a recompute whenever the session/patient context changes.
 */
export function useReminderMetaSync(): void {
  const me = useSessionStore((s) => s.me);
  const userId = useSessionStore((s) => s.userId);

  useEffect(() => {
    if (!me || !userId) return;
    const role: ReminderRole = me.role === "Patient" ? "patient" : "caregiver";
    void Promise.all([
      metaStore.set(SELF_ROLE_KEY, role),
      metaStore.set(SELF_PATIENT_KEY, userId),
    ]).then(() => notifyServiceWorker("medo:reschedule"));
  }, [me, userId]);
}

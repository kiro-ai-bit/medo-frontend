"use client";

import { useEffect, type ReactNode } from "react";
import { registerPurgeStep } from "@lib/state/client/purgeSteps";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@features/auth";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { queryClient } from "@lib/state/query/queryClient";
import {
  invalidateOnBoot,
  registerRefreshTriggers,
} from "@lib/state/query/refreshTriggers";
import { registerConnectivityListeners } from "@lib/state/client/connectivityStore";
import { medoDb } from "@lib/offline/db/medoDb";
import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { SwRegister } from "@components/SwRegister";
import { onServiceWorkerMessage, notifyServiceWorker } from "@lib/sw/bridge";
import { replayQueue } from "@lib/offline/queue/queue";

registerPurgeStep(async () => {
  await medoDb.delete();
  usePatientContextStore.getState().reset();
});

function BootEffects() {
  const status = useSessionStore((s) => s.status);
  // `online` event = probe only; degraded clears on first 2xx apiFetch (INV-FE-6).
  useEffect(
    () =>
      registerConnectivityListeners(() => void queryClient.invalidateQueries()),
    [],
  );
  useEffect(() => {
    registerRefreshTriggers();
  }, []);
  // SW notification actions enqueue writes — replay + refresh on signal.
  useEffect(
    () =>
      onServiceWorkerMessage((data) => {
        if (data.type !== "medo:queue-changed") return;
        void replayQueue()
          .catch(() => {})
          .then(() => queryClient.invalidateQueries());
      }),
    [],
  );
  useEffect(() => {
    if (status === "authenticated") invalidateOnBoot();
  }, [status]);
  // LD-FE-12: periodic recompute while the app is open (no periodic-sync v1).
  useEffect(() => {
    const t = setInterval(
      () => notifyServiceWorker("medo:reschedule"),
      15 * 60_000,
    );
    return () => clearInterval(t);
  }, []);
  return null;
}

function QueueNotice() {
  const notice = useConnectivityStore((s) => s.queueNotice);
  const dismiss = useConnectivityStore((s) => s.setQueueNotice);
  if (!notice) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 bg-amber-100 px-4 py-2 text-sm text-amber-900"
    >
      <span>{notice}</span>
      <button
        type="button"
        aria-label="Dismiss"
        className="font-semibold"
        onClick={() => dismiss(null)}
      >
        ✕
      </button>
    </div>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BootEffects />
        <SwRegister />
        <QueueNotice />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

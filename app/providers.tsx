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

registerPurgeStep(async () => {
  await medoDb.delete();
  usePatientContextStore.getState().reset();
});

function BootEffects() {
  const status = useSessionStore((s) => s.status);
  useEffect(() => registerConnectivityListeners(), []);
  useEffect(() => {
    registerRefreshTriggers();
  }, []);
  useEffect(() => {
    if (status === "authenticated") invalidateOnBoot();
  }, [status]);
  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BootEffects />
        {children}
      </AuthProvider>
    </QueryClientProvider>
  );
}

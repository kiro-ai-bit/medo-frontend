"use client";

import { useEffect, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@features/auth";
import { queryClient } from "@lib/state/query/queryClient";
import { registerConnectivityListeners } from "@lib/state/client/connectivityStore";

export function AppProviders({ children }: { children: ReactNode }) {
  useEffect(() => registerConnectivityListeners(), []);
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}

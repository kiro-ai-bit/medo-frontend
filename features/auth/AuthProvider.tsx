"use client";

import { useEffect, type ReactNode } from "react";
import { setUnauthorizedHandler } from "@lib/api/http/apiFetch";
import { identityClient } from "@lib/api/identity";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { bootSession, handleUnauthorized } from "./session";

/**
 * AuthProvider (LD-FE-02 / HD-FE-03): registers the 401 interceptor, runs boot
 * rehydration (silent refresh → GET /v1/me → hydrate), and gates first render
 * until the session status is resolved.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const status = useSessionStore((s) => s.status);
  const me = useSessionStore((s) => s.me);

  useEffect(() => {
    setUnauthorizedHandler(handleUnauthorized);
    void bootSession();
    return () => setUnauthorizedHandler(null);
  }, []);

  // Profile may be missing after establishSession's getMe failure — retry once.
  useEffect(() => {
    if (status === "authenticated" && me === null) {
      void identityClient
        .getMe()
        .then((m) => useSessionStore.getState().setMe(m))
        .catch(() => undefined);
    }
  }, [status, me]);

  if (status === "booting") {
    return (
      <div
        className="flex min-h-dvh items-center justify-center text-sm text-zinc-500"
        role="status"
      >
        Loading…
      </div>
    );
  }
  return <>{children}</>;
}

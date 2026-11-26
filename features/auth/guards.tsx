"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useSessionStore } from "@lib/state/client/sessionStore";
import type { Role } from "@lib/shared/types";
import { VerifyInterstitial } from "./VerifyInterstitial";
import { NoAccess } from "@lib/shared/no-access";

/** Public-only guard: authenticated sessions are redirected to the app home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);

  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);

  if (status === "authenticated") return null;
  return <>{children}</>;
}

interface SessionGuardProps {
  children: ReactNode;
  /** When set, sessions whose role is not listed see the no-access page. */
  allowedRoles?: Role[];
}

/**
 * Session guard (HD-FE-09): unauthenticated → /login?next=<path>;
 * unverified email → verify interstitial; wrong role → no-access page.
 */
export function SessionGuard({ children, allowedRoles }: SessionGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = useSessionStore((s) => s.status);
  const me = useSessionStore((s) => s.me);

  const next = `${pathname}${searchParams.size ? `?${searchParams.toString()}` : ""}`;
  useEffect(() => {
    if (status === "anonymous") {
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [status, router, next]);

  if (status === "anonymous") return null;
  if (status !== "authenticated") return null;
  if (!me) {
    return (
      <div
        className="flex min-h-dvh items-center justify-center text-sm text-zinc-500"
        role="status"
      >
        Loading…
      </div>
    );
  }

  if (!me.emailVerified) {
    return <VerifyInterstitial />;
  }

  if (allowedRoles && !allowedRoles.includes(me.role)) {
    return <NoAccess />;
  }

  return <>{children}</>;
}

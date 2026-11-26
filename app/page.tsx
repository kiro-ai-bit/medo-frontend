"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessionStore } from "@lib/state/client/sessionStore";

export default function HomePage() {
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const me = useSessionStore((s) => s.me);

  useEffect(() => {
    if (status === "anonymous") router.replace("/login");
    else if (status === "authenticated") router.replace("/today");
  }, [status, me?.emailVerified, router]);

  return (
    <div
      className="flex min-h-dvh items-center justify-center text-sm text-zinc-500"
      role="status"
    >
      Loading…
    </div>
  );
}

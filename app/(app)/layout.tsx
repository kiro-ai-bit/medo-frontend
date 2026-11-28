"use client";

import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { SessionGuard } from "@features/auth";
import { PatientContextBar } from "@features/patient-context";
import { ThemeShell } from "@features/gamification";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <SessionGuard>
        <ThemeShell>
          <div className="flex items-center justify-between border-b border-zinc-200 bg-white/60 px-4 py-2">
            <Link href="/today" className="text-sm font-semibold text-zinc-900">
              Medo
            </Link>
            <Link
              href="/profile"
              className="text-sm text-zinc-600 hover:underline"
            >
              Profile
            </Link>
          </div>
          <PatientContextBar />
          {children}
        </ThemeShell>
      </SessionGuard>
    </Suspense>
  );
}

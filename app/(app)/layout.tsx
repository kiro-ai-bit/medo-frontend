"use client";

import { Suspense, type ReactNode } from "react";
import { SessionGuard } from "@features/auth";
import { PatientContextBar } from "@features/patient-context";
import { ThemeShell } from "@features/gamification";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <SessionGuard>
        <ThemeShell>
          <PatientContextBar />
          {children}
        </ThemeShell>
      </SessionGuard>
    </Suspense>
  );
}

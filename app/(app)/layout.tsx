"use client";

import { Suspense, type ReactNode } from "react";
import { SessionGuard } from "@features/auth";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense>
      <SessionGuard>{children}</SessionGuard>
    </Suspense>
  );
}

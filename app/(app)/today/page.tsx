"use client";

import { useLogout } from "@features/auth";
import { Button } from "@components/ui/button";
import { useSessionStore } from "@lib/state/client/sessionStore";

export default function TodayPage() {
  const me = useSessionStore((s) => s.me);
  const { logout } = useLogout();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Today</h1>
        <Button variant="outline" size="sm" onClick={() => void logout()}>
          Log out
        </Button>
      </header>
      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <p className="text-sm text-zinc-600">
          Welcome, <strong>{me?.displayName ?? "there"}</strong> (
          {me?.role ?? "—"}).
        </p>
        <p className="mt-2 text-sm text-zinc-500">
          Dose tracking, medicines, schedules, notifications and gamification
          land in tickets 25–29.
        </p>
      </section>
    </main>
  );
}

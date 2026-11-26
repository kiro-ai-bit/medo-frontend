"use client";

import Link from "next/link";
import { useUnreadCount } from "./hooks";

/** Unread-count badge linking to /notifications (FR-FE-075). */
export function NotificationBell() {
  const unread = useUnreadCount();
  const count = unread.data?.unread ?? 0;
  return (
    <Link
      href="/notifications"
      className="relative inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-sm text-zinc-700 hover:bg-zinc-50"
      aria-label={
        count > 0 ? `Notifications, ${count} unread` : "Notifications"
      }
      data-testid="notification-bell"
    >
      <span aria-hidden>🔔</span>
      {count > 0 ? (
        <span
          className="rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
          data-testid="bell-unread-count"
        >
          {count}
        </span>
      ) : null}
    </Link>
  );
}

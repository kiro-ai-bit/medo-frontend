"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { FeedItemDto } from "@kiro-ai-bit/contracts";
import { SectionState, type SectionStatus } from "@lib/shared/six-state";
import { useConnectivity } from "@lib/state/client/connectivityStore";
import { feedItemHref } from "@lib/sw/push/deepLink";
import { Button } from "@components/ui/button";
import {
  useFeed,
  useMarkAllRead,
  useMarkRead,
  usePrefs,
  usePutPrefs,
  useUnreadCount,
} from "./hooks";

function FeedRow({
  item,
  onOpen,
}: {
  item: FeedItemDto;
  onOpen: (item: FeedItemDto) => void;
}) {
  const unread = item.readAt === null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(item)}
        className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left ${
          unread
            ? "border-amber-200 bg-amber-50/60"
            : "border-zinc-200 bg-white"
        }`}
        data-feed-id={item.id}
        data-unread={unread || undefined}
      >
        <span
          aria-hidden
          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
            unread ? "bg-amber-500" : "bg-transparent"
          }`}
        />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium">{item.title}</span>
          <span className="mt-0.5 block text-sm text-zinc-600">
            {item.body}
          </span>
          <span className="mt-1 block text-xs text-zinc-400">
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: "medium",
              timeStyle: "short",
            }).format(new Date(item.createdAt))}
          </span>
        </span>
      </button>
    </li>
  );
}

function PrefsSection() {
  const prefs = usePrefs();
  const put = usePutPrefs();
  const connectivity = useConnectivity();
  const offline = connectivity === "degraded";

  const toggle = (key: "refillAlerts" | "careLinkNotifications") => (
    <label className="flex items-center justify-between gap-4 py-2 text-sm">
      <span>
        {key === "refillAlerts" ? "Refill alerts" : "Care link updates"}
      </span>
      <input
        type="checkbox"
        data-testid={`pref-${key}`}
        checked={prefs.data?.[key] ?? true}
        disabled={offline || put.isPending || prefs.isPending}
        onChange={(e) => put.mutate({ [key]: e.target.checked })}
        className="h-4 w-4 accent-amber-600"
      />
    </label>
  );

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4"
      data-testid="prefs-section"
    >
      <h2 className="text-sm font-semibold">Notification preferences</h2>
      {offline ? (
        <p className="mt-2 text-xs text-zinc-500">
          Preferences require a connection.
        </p>
      ) : null}
      <div className="mt-2 divide-y divide-zinc-100">
        {toggle("refillAlerts")}
        {toggle("careLinkNotifications")}
        <div className="flex items-center justify-between gap-4 py-2 text-sm text-zinc-500">
          <span>Dose reminders</span>
          <span className="text-xs">Always on</span>
        </div>
        <div className="flex items-center justify-between gap-4 py-2 text-sm text-zinc-500">
          <span>Sign-in emails</span>
          <span className="text-xs">Always on</span>
        </div>
      </div>
      {put.isError ? (
        <p className="mt-2 text-xs text-red-600">Could not save preferences.</p>
      ) : null}
    </section>
  );
}

export function NotificationsScreen() {
  const router = useRouter();
  const connectivity = useConnectivity();
  const feed = useFeed();
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = feed.data?.pages.flatMap((p) => p.items) ?? [];
  const status: SectionStatus = feed.isPending
    ? "loading"
    : feed.isError && items.length === 0
      ? connectivity === "degraded"
        ? "offline"
        : "error"
      : items.length === 0
        ? "empty"
        : "ready";

  const open = (item: FeedItemDto) => {
    if (item.readAt === null) markRead.mutate(item.id);
    const href = feedItemHref(item.type);
    if (href !== "/notifications") router.push(href);
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Notifications</h1>
        <div className="flex items-center gap-3">
          {unread.data && unread.data.unread > 0 ? (
            <span
              className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-semibold text-white"
              data-testid="unread-badge"
            >
              {unread.data.unread}
            </span>
          ) : null}
          <Button
            size="sm"
            variant="outline"
            disabled={markAll.isPending || items.every((i) => i.readAt)}
            onClick={() => markAll.mutate()}
          >
            Mark all read
          </Button>
        </div>
      </header>

      <SectionState
        status={status}
        emptyMessage="No notifications yet."
        errorMessage={
          feed.error instanceof Error ? feed.error.message : undefined
        }
        onRetry={() => void feed.refetch()}
      >
        <ul className="flex flex-col gap-2" data-testid="feed-list">
          {items.map((item) => (
            <FeedRow key={item.id} item={item} onOpen={open} />
          ))}
        </ul>
        {feed.hasNextPage ? (
          <div className="mt-4 text-center">
            <Button
              variant="outline"
              disabled={feed.isFetchingNextPage}
              onClick={() => void feed.fetchNextPage()}
            >
              {feed.isFetchingNextPage ? "Loading…" : "Load more"}
            </Button>
          </div>
        ) : null}
      </SectionState>

      {connectivity === "degraded" && items.length > 0 ? (
        <p className="text-xs text-zinc-500" data-testid="feed-stale">
          Offline — showing last known notifications.
        </p>
      ) : null}

      <PrefsSection />

      <p className="text-sm">
        <Link href="/settings/push" className="text-amber-700 underline">
          Push notification settings
        </Link>
      </p>
    </main>
  );
}

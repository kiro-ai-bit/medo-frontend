"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { notificationClient } from "@lib/api/notification";
import { queryClient } from "@lib/state/query/queryClient";
import { queryKeys } from "@lib/state/query/queryKeys";
import type { PutNotificationPrefsRequest } from "@kiro-ai-bit/contracts";
import { useEffect, useState } from "react";
import {
  ensureSubscription,
  pushSupported,
  removeSubscription,
  type PushStatus,
} from "@lib/sw/push/pushLifecycle";
import { iosInstallRequired } from "@lib/sw/push/installGate";

const FEED_PAGE_SIZE = 20;

/** Cursor-paginated feed — API-only, never Dexie (FR-FE-075/077, INV-FE-1). */
export function useFeed() {
  return useInfiniteQuery({
    queryKey: queryKeys.feedList(),
    queryFn: ({ pageParam }) =>
      notificationClient.listFeed(pageParam, FEED_PAGE_SIZE),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useUnreadCount() {
  return useQuery({
    queryKey: queryKeys.feedUnread(),
    queryFn: () => notificationClient.unreadCount(),
  });
}

function invalidateFeed() {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: queryKeys.feedList() }),
    queryClient.invalidateQueries({ queryKey: queryKeys.feedUnread() }),
  ]);
}

export function useMarkRead() {
  return useMutation({
    mutationFn: (id: string) => notificationClient.markRead(id),
    onSuccess: invalidateFeed,
  });
}

export function useMarkAllRead() {
  return useMutation({
    mutationFn: () => notificationClient.markAllRead(),
    onSuccess: invalidateFeed,
  });
}

export function usePrefs() {
  return useQuery({
    queryKey: queryKeys.prefs(),
    queryFn: () => notificationClient.getPrefs(),
  });
}

export function usePutPrefs() {
  return useMutation({
    mutationFn: (input: PutNotificationPrefsRequest) =>
      notificationClient.putPrefs(input),
    onSuccess: (prefs) => {
      queryClient.setQueryData(queryKeys.prefs(), prefs);
    },
  });
}

export interface PushControls {
  status: PushStatus | "checking";
  enable: () => Promise<PushStatus>;
  disable: () => Promise<void>;
}

/** Push lifecycle state for UI — permission + local subscription probe. */
export function usePushControls(): PushControls {
  const [status, setStatus] = useState<PushStatus | "checking">("checking");

  // Probe once on mount: supported? iOS gate? permission? local sub?
  useEffect(() => {
    let alive = true;
    void (async () => {
      if (!pushSupported()) return alive && setStatus("unsupported");
      if (iosInstallRequired()) return alive && setStatus("install-required");
      if (Notification.permission === "denied")
        return alive && setStatus("denied");
      const reg = await navigator.serviceWorker
        ?.getRegistration()
        .catch(() => null);
      const sub = await reg?.pushManager.getSubscription().catch(() => null);
      if (!alive) return;
      setStatus(
        Notification.permission === "granted" && sub ? "subscribed" : "default",
      );
    })();
    return () => {
      alive = false;
    };
  }, []);

  return {
    status,
    enable: async () => {
      const s = await ensureSubscription().catch(() => "error" as const);
      setStatus(s);
      return s;
    },
    disable: async () => {
      await removeSubscription().catch(() => undefined);
      setStatus("default");
    },
  };
}

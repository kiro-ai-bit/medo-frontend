import {
  DeletePushSubscriptionResponseSchema,
  PutNotificationPrefsRequestSchema,
  FeedItemDtoSchema,
  FeedListResponseSchema,
  MarkAllReadResponseSchema,
  NotificationPrefsDtoSchema,
  PushSubscriptionDtoSchema,
  RegisterPushSubscriptionRequestSchema,
  UnreadCountResponseSchema,
  VapidKeyResponseSchema,
  type FeedItemDto,
  type FeedListResponse,
  type MarkAllReadResponse,
  type NotificationPrefsDto,
  type PutNotificationPrefsRequest,
  type PushSubscriptionDto,
  type RegisterPushSubscriptionRequest,
  type UnreadCountResponse,
  type VapidKeyResponse,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";

export const notificationClient = {
  async listFeed(cursor?: string, limit = 20): Promise<FeedListResponse> {
    const qs = new URLSearchParams();
    if (cursor) qs.set("cursor", cursor);
    qs.set("limit", String(limit));
    return apiFetch(
      { method: "GET", path: `/v1/notifications?${qs}` },
      FeedListResponseSchema,
    );
  },

  async unreadCount(): Promise<UnreadCountResponse> {
    return apiFetch(
      { method: "GET", path: "/v1/notifications/unread-count" },
      UnreadCountResponseSchema,
    );
  },

  async markRead(id: string): Promise<FeedItemDto> {
    return apiFetch(
      { method: "POST", path: `/v1/notifications/${id}/read` },
      FeedItemDtoSchema,
    );
  },

  async markAllRead(): Promise<MarkAllReadResponse> {
    return apiFetch(
      { method: "POST", path: "/v1/notifications/read-all" },
      MarkAllReadResponseSchema,
    );
  },

  async getPrefs(): Promise<NotificationPrefsDto> {
    return apiFetch(
      { method: "GET", path: "/v1/notification-preferences" },
      NotificationPrefsDtoSchema,
    );
  },

  async putPrefs(
    input: PutNotificationPrefsRequest,
  ): Promise<NotificationPrefsDto> {
    return apiFetch(
      {
        method: "PUT",
        path: "/v1/notification-preferences",
        body: PutNotificationPrefsRequestSchema.parse(input),
      },
      NotificationPrefsDtoSchema,
    );
  },

  /** Public route — no auth material required (LD-NOT vapid-key). */
  async getVapidKey(): Promise<VapidKeyResponse> {
    return apiFetch(
      { method: "GET", path: "/v1/push/vapid-key", isAuthRoute: true },
      VapidKeyResponseSchema,
    );
  },

  async registerPushSubscription(
    input: RegisterPushSubscriptionRequest,
  ): Promise<PushSubscriptionDto> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/push-subscriptions",
        body: RegisterPushSubscriptionRequestSchema.parse(input),
      },
      PushSubscriptionDtoSchema,
    );
  },

  async removePushSubscription(id: string) {
    return apiFetch(
      { method: "DELETE", path: `/v1/push-subscriptions/${id}` },
      DeletePushSubscriptionResponseSchema,
    );
  },
};

export type NotificationClient = typeof notificationClient;

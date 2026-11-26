"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

export type AsyncStatus = "idle" | "pending" | "success" | "error";

export interface AsyncState<E = unknown> {
  status: AsyncStatus;
  error: E | null;
}

export function idleState<E = unknown>(): AsyncState<E> {
  return { status: "idle", error: null };
}

export type SectionStatus =
  "loading" | "empty" | "error" | "offline" | "unauthorized" | "ready";

interface SectionStateProps {
  status: SectionStatus;
  emptyMessage?: string;
  errorMessage?: string;
  onRetry?: () => void;
  children: ReactNode;
}

const STATUS_TEXT: Record<Exclude<SectionStatus, "ready">, string> = {
  loading: "Loading…",
  empty: "Nothing here yet.",
  error: "Something went wrong.",
  offline: "You are offline. Showing last known data.",
  unauthorized: "You do not have access to this.",
};

export function SectionState({
  status,
  emptyMessage,
  errorMessage,
  onRetry,
  children,
}: SectionStateProps) {
  if (status === "ready") return <>{children}</>;
  return (
    <div
      role={
        status === "error" || status === "unauthorized" ? "alert" : "status"
      }
      className={cn(
        "rounded-lg border border-zinc-200 bg-white p-6 text-center text-sm text-zinc-600",
        status === "error" && "border-red-200 text-red-700",
        status === "unauthorized" && "border-amber-200 text-amber-700",
      )}
      data-state={status}
    >
      <p>
        {status === "empty" && emptyMessage
          ? emptyMessage
          : status === "error" && errorMessage
            ? errorMessage
            : STATUS_TEXT[status]}
      </p>
      {status === "error" && onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-3 rounded-md border border-zinc-300 px-3 py-1 text-sm hover:bg-zinc-50"
        >
          Retry
        </button>
      ) : null}
    </div>
  );
}

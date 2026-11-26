"use client";

import { useMutation } from "@tanstack/react-query";
import type {
  ForgotPasswordRequest,
  LoginRequest,
  ResendVerificationRequest,
  ResetPasswordRequest,
  SignupRequest,
} from "@kiro-ai-bit/contracts";
import { identityClient } from "@lib/api/identity";
import { ApiError, isApiError } from "@lib/api/http/errors";
import type { AsyncState } from "@lib/shared/six-state";
import { idleState } from "@lib/shared/six-state";
import { establishSession } from "./session";
import { purgeClientState } from "./purge";

function toAsyncState(
  status: "idle" | "pending" | "success" | "error",
  error: unknown,
): AsyncState<ApiError> {
  if (status === "error") {
    return {
      status: "error",
      error: isApiError(error)
        ? error
        : new ApiError({
            status: 0,
            code: "UNKNOWN",
            message: "Unexpected error",
          }),
    };
  }
  if (status === "success") return { status: "success", error: null };
  if (status === "pending") return { status: "pending", error: null };
  return idleState<ApiError>();
}

export function useSignup() {
  const m = useMutation({
    mutationFn: (input: SignupRequest) => identityClient.signup(input),
  });
  return {
    submit: async (input: SignupRequest) => {
      await m.mutateAsync(input);
    },
    state: toAsyncState(m.status, m.error),
    response: m.data ?? null,
  };
}

export function useLogin() {
  const m = useMutation({
    mutationFn: async (input: LoginRequest) => {
      const res = await identityClient.login(input);
      await establishSession({
        userId: res.userId,
        accessToken: res.accessToken,
        expiresAt: res.expiresAt,
      });
      return res;
    },
  });
  const error = isApiError(m.error) ? m.error : null;
  const cooldownSeconds =
    error && error.status === 429
      ? (error.retryAfterSeconds ?? cooldownFromDetails(error))
      : null;
  return {
    submit: async (input: LoginRequest) => {
      await m.mutateAsync(input);
    },
    state: toAsyncState(m.status, m.error),
    error,
    cooldownSeconds,
  };
}

function cooldownFromDetails(error: ApiError): number | null {
  const v =
    error.details?.["cooldownSeconds"] ?? error.details?.["retryAfterSeconds"];
  return typeof v === "number" && v > 0 ? v : null;
}

export function useVerifyEmail(token: string) {
  const m = useMutation({
    mutationFn: () => identityClient.verifyEmail(token),
  });
  return {
    run: () => m.mutate(),
    state: toAsyncState(m.status, m.error),
    error: isApiError(m.error) ? m.error : null,
  };
}

export function useResendVerification() {
  const m = useMutation({
    mutationFn: (input: ResendVerificationRequest) =>
      identityClient.resendVerification(input),
  });
  return {
    submit: async (input: ResendVerificationRequest) => {
      await m.mutateAsync(input);
    },
    state: toAsyncState(m.status, m.error),
  };
}

export function useForgotPassword() {
  const m = useMutation({
    mutationFn: (input: ForgotPasswordRequest) =>
      identityClient.forgotPassword(input),
  });
  return {
    submit: async (input: ForgotPasswordRequest) => {
      await m.mutateAsync(input);
    },
    // Always shows neutral confirmation — enumeration-safe (FR-IDT-022).
    state: toAsyncState(m.status, m.error),
    error: isApiError(m.error) ? m.error : null,
  };
}

export function useResetPassword(token: string) {
  const m = useMutation({
    mutationFn: (input: Omit<ResetPasswordRequest, "token">) =>
      identityClient.resetPassword({ token, ...input }),
  });
  return {
    submit: async (input: Omit<ResetPasswordRequest, "token">) => {
      await m.mutateAsync(input);
    },
    state: toAsyncState(m.status, m.error),
    error: isApiError(m.error) ? m.error : null,
  };
}

export function useLogout() {
  return {
    logout: async (scope: "device" | "all" = "device") => {
      try {
        if (scope === "all") await identityClient.logoutAll();
        else await identityClient.logout();
      } catch {
        // best-effort — purge always runs (FR-FE-010)
      }
      // Push subscription DELETE — best-effort before purge (FR-FE-010/§8.12).
      const { removeSubscription } = await import("@lib/sw/push/pushLifecycle");
      await removeSubscription().catch(() => undefined);
      await purgeClientState("logout");
    },
  };
}

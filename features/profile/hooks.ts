"use client";

import { useMutation } from "@tanstack/react-query";
import type { PatchMeRequest } from "@kiro-ai-bit/contracts";
import { identityClient } from "@lib/api/identity";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { purgeClientState } from "@features/auth/purge";

/** PATCH /v1/me — persists profile fields and refreshes session `me` (FR-FE-104). */
export function useUpdateProfile() {
  const m = useMutation({
    mutationFn: async (input: PatchMeRequest) => {
      const res = await identityClient.patchMe(input);
      useSessionStore.getState().setMe(res);
      return res;
    },
  });
  return {
    submit: (input: PatchMeRequest) => m.mutateAsync(input),
    pending: m.isPending,
    error: m.error,
    reset: m.reset,
  };
}

/** DELETE /v1/me — on success runs the deleted-account purge (FR-FE-107). */
export function useDeleteAccount() {
  const m = useMutation({
    mutationFn: () => identityClient.deleteMe(),
    onSuccess: () => void purgeClientState("deleted"),
  });
  return {
    submit: () => m.mutateAsync(),
    pending: m.isPending,
    error: m.error,
    reset: m.reset,
  };
}

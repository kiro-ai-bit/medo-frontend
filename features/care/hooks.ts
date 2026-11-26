"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import type { CreateInviteRequest } from "@kiro-ai-bit/contracts";
import { careClient } from "@lib/api/care";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { queryClient } from "@lib/state/query/queryClient";
import { queryKeys } from "@lib/state/query/queryKeys";

/** Pending invites, caller-scoped — API-only, never Dexie (INV-FE-1). */
export function useInvites() {
  const role = useSessionStore((s) => s.me?.role);
  return useQuery({
    queryKey: queryKeys.invites(),
    queryFn: () => careClient.listInvites(),
    enabled: role === "Caregiver" || role === "Patient",
  });
}

function useInviteMutation<TVars, TRes>(fn: (v: TVars) => Promise<TRes>) {
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.invites() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.links() }),
      ]),
  });
}

export function useCreateInvite() {
  return useInviteMutation((input: CreateInviteRequest) =>
    careClient.createInvite(input),
  );
}

export function useResendInvite() {
  return useInviteMutation((inviteId: string) =>
    careClient.resendInvite(inviteId),
  );
}

export function useCancelInvite() {
  return useInviteMutation((inviteId: string) =>
    careClient.cancelInvite(inviteId),
  );
}

export function useAcceptInvite(token: string) {
  return useInviteMutation(() => careClient.acceptInvite(token));
}

export function useDeclineInvite(token: string) {
  return useInviteMutation(() => careClient.declineInvite(token));
}

export function useEndLink() {
  return useInviteMutation((linkId: string) => careClient.endLink(linkId));
}

/** Public locator preview — no session needed (FR-FE-042). */
export function useInvitePreview(token: string) {
  return useQuery({
    queryKey: queryKeys.invite(token),
    queryFn: () => careClient.getInvitePreview(token),
    retry: false,
  });
}

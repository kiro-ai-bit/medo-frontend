"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { isApiError } from "@lib/api/http/errors";
import { useSessionStore } from "@lib/state/client/sessionStore";
import {
  clearPendingInvite,
  stashPendingInvite,
} from "@lib/state/client/inviteHandoff";
import { Button } from "@components/ui/button";
import { useAcceptInvite, useDeclineInvite, useInvitePreview } from "./hooks";

const expiryFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * `/invite/[token]` landing (LLD §6.10): public locator preview; anonymous →
 * login/signup carrying `next=/invite/<token>`; authenticated Patient → role
 * explanation; Caregiver → accept/decline; dead token → terminal state.
 */
export function InviteScreen() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const status = useSessionStore((s) => s.status);
  const role = useSessionStore((s) => s.me?.role);

  const preview = useInvitePreview(token);
  const accept = useAcceptInvite(token);
  const decline = useDeclineInvite(token);

  const next = `/invite/${token}`;
  const authenticated = status === "authenticated";

  // Carry the invite destination through the signup→verify→login detour
  // (LLD §6.10): stash for anonymous visitors; clear on terminal/resolution.
  useEffect(() => {
    if (!authenticated && preview.isSuccess) stashPendingInvite(token);
  }, [authenticated, preview.isSuccess, token]);
  useEffect(() => {
    if (
      preview.isError &&
      isApiError(preview.error) &&
      preview.error.status === 404
    ) {
      clearPendingInvite();
    }
  }, [preview.isError, preview.error]);
  useEffect(() => {
    if (accept.isSuccess || decline.isSuccess) clearPendingInvite();
  }, [accept.isSuccess, decline.isSuccess]);

  if (preview.isPending) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
        <p className="text-sm text-zinc-500" role="status">
          Loading invite…
        </p>
      </main>
    );
  }

  if (preview.isError) {
    const dead = isApiError(preview.error) && preview.error.status === 404;
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
        <div
          className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6 text-center"
          data-testid={dead ? "invite-terminal" : "invite-error"}
        >
          <h1 className="text-lg font-semibold">Care invite</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {dead
              ? "This invite is no longer valid — it may have expired or already been used. Ask the patient to send a new one."
              : "Could not load this invite. Check your connection and try again."}
          </p>
          {!dead ? (
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void preview.refetch()}
            >
              Retry
            </Button>
          ) : null}
        </div>
      </main>
    );
  }

  const p = preview.data;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <div className="w-full max-w-sm rounded-xl border border-zinc-200 bg-white p-6">
        <h1 className="text-lg font-semibold">Care invite</h1>
        <p className="mt-2 text-sm text-zinc-600">
          <strong>{p.patientDisplayName}</strong> invited you to help manage
          their medicines on Medo.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Invite expires {expiryFmt.format(new Date(p.expiresAt))}.
        </p>

        {!authenticated ? (
          <div className="mt-5 space-y-2">
            <Link
              href={`/login?next=${encodeURIComponent(next)}`}
              className="block w-full rounded-md bg-zinc-900 px-4 py-2 text-center text-sm font-medium text-white hover:bg-zinc-700"
            >
              Log in
            </Link>
            <Link
              href={`/signup?next=${encodeURIComponent(next)}`}
              className="block w-full rounded-md border border-zinc-300 px-4 py-2 text-center text-sm font-medium hover:bg-zinc-50"
            >
              Create account
            </Link>
            <p className="text-xs text-zinc-500">
              You will need a caregiver account to accept.
            </p>
          </div>
        ) : role === "Patient" ? (
          <div className="mt-5" data-testid="invite-wrong-role">
            <p className="text-sm text-amber-800">
              Only caregiver accounts can accept care invites. This account is
              registered as a patient — log in with your caregiver account
              instead.
            </p>
          </div>
        ) : accept.isSuccess ? (
          <div className="mt-5 space-y-2" data-testid="invite-accepted">
            <p className="text-sm text-emerald-700">
              Care link created — you can now manage this patient&apos;s
              medicines.
            </p>
            <Button className="w-full" onClick={() => router.push("/today")}>
              Go to Today
            </Button>
          </div>
        ) : decline.isSuccess ? (
          <div className="mt-5 space-y-2" data-testid="invite-declined">
            <p className="text-sm text-zinc-600">
              Invite declined. The patient will not be notified beyond the
              in-app notice.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => router.push("/today")}
            >
              Continue
            </Button>
          </div>
        ) : (
          <div className="mt-5 space-y-2">
            {accept.isError ? (
              <p
                className="text-sm text-red-600"
                role="alert"
                data-testid="invite-accept-error"
              >
                {isApiError(accept.error) && accept.error.status === 403
                  ? "This invite was sent to a different email, or your account can't accept it."
                  : isApiError(accept.error) && accept.error.status === 404
                    ? "This invite is no longer valid."
                    : "Could not accept the invite — try again."}
              </p>
            ) : null}
            {decline.isError ? (
              <p className="text-sm text-red-600" role="alert">
                Could not decline the invite — try again.
              </p>
            ) : null}
            <Button
              className="w-full"
              disabled={accept.isPending || decline.isPending}
              onClick={() => void accept.mutateAsync().catch(() => {})}
            >
              {accept.isPending ? "Accepting…" : "Accept invite"}
            </Button>
            <Button
              variant="outline"
              className="w-full"
              disabled={accept.isPending || decline.isPending}
              onClick={() => void decline.mutateAsync().catch(() => {})}
            >
              {decline.isPending ? "Declining…" : "Decline"}
            </Button>
          </div>
        )}
      </div>
    </main>
  );
}

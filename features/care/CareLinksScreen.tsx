"use client";

import { useState } from "react";
import type { InviteListItem, LinkListItem } from "@kiro-ai-bit/contracts";
import { CreateInviteRequestSchema } from "@kiro-ai-bit/contracts";
import { SectionState } from "@lib/shared/six-state";
import { useConnectivity } from "@lib/state/client/connectivityStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { isApiError } from "@lib/api/http/errors";
import { Button } from "@components/ui/button";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import {
  useCancelInvite,
  useCreateInvite,
  useEndLink,
  useInvites,
  useResendInvite,
} from "./hooks";
import { ConfirmDialog } from "./ConfirmDialog";
import { useCareLinks } from "@features/patient-context";

const expiryFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function InviteRow({ invite }: { invite: InviteListItem }) {
  const resend = useResendInvite();
  const cancel = useCancelInvite();
  const offline = useConnectivity() === "degraded";
  const pending = resend.isPending || cancel.isPending;
  const expiry = expiryFmt.format(new Date(invite.expiresAt));
  const actionError = resend.error ?? cancel.error;

  if (invite.direction === "received") {
    return (
      <li
        className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4"
        data-testid="invite-received"
      >
        <div>
          <p className="font-medium">
            {invite.counterpartyDisplayName ?? "A patient"} invited you
          </p>
          <p className="text-sm text-zinc-500">Expires {expiry}</p>
        </div>
        <p className="text-xs text-zinc-500" data-testid="invite-email-hint">
          Open the invite link from your email to accept or decline.
        </p>
      </li>
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white p-4">
      <div>
        <p className="font-medium">{invite.counterpartyEmail}</p>
        <p className="text-sm text-zinc-500">Expires {expiry}</p>
        {actionError ? (
          <p className="mt-1 text-xs text-red-600" role="alert">
            Action failed — try again.
          </p>
        ) : null}
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || offline}
          onClick={() =>
            void resend.mutateAsync(invite.inviteId).catch(() => {})
          }
        >
          Resend
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={pending || offline}
          onClick={() =>
            void cancel.mutateAsync(invite.inviteId).catch(() => {})
          }
        >
          Cancel
        </Button>
      </div>
    </li>
  );
}

function EndLinkButton({ link }: { link: LinkListItem }) {
  const end = useEndLink();
  const offline = useConnectivity() === "degraded";
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        disabled={offline}
        onClick={() => setOpen(true)}
      >
        End link
      </Button>
      {open ? (
        <ConfirmDialog
          title={`End link with ${link.counterpart.displayName}?`}
          body="They will immediately lose access to this patient's medicines and doses. This cannot be undone."
          confirmLabel={end.isPending ? "Ending…" : "Confirm end"}
          pending={end.isPending}
          error={end.isError ? "Could not end the link — try again." : null}
          onCancel={() => setOpen(false)}
          onConfirm={() => {
            void end
              .mutateAsync(link.linkId)
              .then(() => setOpen(false))
              .catch(() => {});
          }}
        />
      ) : null}
    </>
  );
}

export function CareLinksScreen() {
  const role = useSessionStore((s) => s.me?.role);
  const connectivity = useConnectivity();
  const links = useCareLinks();
  const invites = useInvites();
  const create = useCreateInvite();
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const offline = connectivity === "degraded";
  const isPatient = role === "Patient";

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSentTo(null);
    const parsed = CreateInviteRequestSchema.safeParse({
      caregiverEmail: email,
    });
    if (!parsed.success) {
      setFormError("Enter a valid email address.");
      return;
    }
    try {
      await create.mutateAsync(parsed.data);
      setSentTo(parsed.data.caregiverEmail);
      setEmail("");
    } catch (err) {
      setFormError(
        isApiError(err) && err.status === 409
          ? "An invite or link already exists for this caregiver."
          : "Could not send the invite — try again.",
      );
    }
  };

  return (
    <main
      className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6"
      data-testid="care-links-screen"
    >
      <h1 className="text-xl font-semibold">Care links</h1>

      {isPatient ? (
        <section className="rounded-xl border border-zinc-200 bg-white p-4">
          <h2 className="font-medium">Invite a caregiver</h2>
          <form
            onSubmit={(e) => void onCreate(e)}
            className="mt-3 flex items-end gap-2"
          >
            <div className="flex-1 space-y-1">
              <Label htmlFor="caregiver-email">Caregiver email</Label>
              <Input
                id="caregiver-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={offline}
              />
            </div>
            <Button type="submit" disabled={offline || create.isPending}>
              Send invite
            </Button>
          </form>
          {sentTo ? (
            <p className="mt-2 text-sm text-emerald-700" role="status">
              Invite sent to {sentTo} — it expires in 7 days.
            </p>
          ) : null}
          {formError ? (
            <p className="mt-2 text-sm text-red-600" role="alert">
              {formError}
            </p>
          ) : null}
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 font-medium">Pending invites</h2>
        {offline ? (
          <div data-testid="care-links-offline">
            <SectionState status="offline">{null}</SectionState>
          </div>
        ) : invites.isPending ? (
          <SectionState status="loading">{null}</SectionState>
        ) : invites.isError ? (
          <SectionState status="error" onRetry={() => void invites.refetch()}>
            {null}
          </SectionState>
        ) : (invites.data ?? []).length === 0 ? (
          <SectionState status="empty" emptyMessage="No pending invites.">
            {null}
          </SectionState>
        ) : (
          <ul className="flex flex-col gap-2">
            {(invites.data ?? []).map((i) => (
              <InviteRow key={i.inviteId} invite={i} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-medium">Active links</h2>
        {offline ? (
          <SectionState status="offline">{null}</SectionState>
        ) : links.isPending ? (
          <SectionState status="loading">{null}</SectionState>
        ) : links.isError ? (
          <SectionState status="error" onRetry={() => void links.refetch()}>
            {null}
          </SectionState>
        ) : (links.data ?? []).length === 0 ? (
          <SectionState status="empty" emptyMessage="No care links yet.">
            {null}
          </SectionState>
        ) : (
          <ul className="flex flex-col gap-2">
            {(links.data ?? []).map((l) => (
              <li
                key={l.linkId}
                className="flex items-center justify-between rounded-lg border border-zinc-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium">{l.counterpart.displayName}</p>
                  <p className="text-sm text-zinc-500">
                    {l.direction === "as-patient" ? "Caregiver" : "Patient"}
                  </p>
                </div>
                <EndLinkButton link={l} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

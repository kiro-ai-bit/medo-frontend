"use client";

import Link from "next/link";
import { useInvites } from "@features/care";

const expiryFmt = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

/**
 * Received care invites for a caregiver with no linked patient yet
 * (FR-FE-005a). Accept/decline stays email-link-only by design — the
 * invite token is a locator, never exposed in-app.
 */
export function PendingInvites() {
  const invites = useInvites();
  const received = (invites.data ?? []).filter(
    (i) => i.direction === "received",
  );

  return (
    <section
      className="rounded-xl border border-zinc-200 bg-white p-4"
      data-testid="pending-invites"
    >
      <h2 className="text-sm font-medium text-zinc-700">Pending invites</h2>
      {invites.isPending ? (
        <p className="mt-2 text-sm text-zinc-500">Loading…</p>
      ) : received.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">
          No pending invites — if you expected one, open the invite link from
          your email.
        </p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {received.map((i) => (
            <li key={i.inviteId} className="text-sm">
              <p className="font-medium">
                {i.counterpartyDisplayName ?? "A patient"} invited you
              </p>
              <p className="text-xs text-zinc-500">
                Expires {expiryFmt.format(new Date(i.expiresAt))} — open the
                invite link from your email to accept or decline.
              </p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm">
        <Link href="/care-links" className="text-zinc-600 underline">
          Manage care links
        </Link>
      </p>
    </section>
  );
}

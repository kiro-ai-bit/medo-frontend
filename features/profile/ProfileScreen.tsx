"use client";

import Link from "next/link";
import { useState } from "react";
import type { PatchMeRequest } from "@kiro-ai-bit/contracts";
import { Button } from "@components/ui/button";
import { ConfirmDialog } from "@features/care/ConfirmDialog";
import { useLogout } from "@features/auth";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { isApiError } from "@lib/api/http/errors";
import { useDeleteAccount, useUpdateProfile } from "./hooks";

type ConfirmKind = "logout" | "logout-all" | "delete";

const TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf("timeZone");
  } catch {
    return [];
  }
})();

/** /profile — own profile edit + session controls + account deletion (FR-FE-104/107/108). */
export function ProfileScreen() {
  const me = useSessionStore((s) => s.me);
  const pendingSync = useConnectivityStore((s) => s.pendingSyncCount);
  const { logout } = useLogout();
  const update = useUpdateProfile();
  const del = useDeleteAccount();

  const [displayName, setDisplayName] = useState(me?.displayName ?? "");
  const [timezone, setTimezone] = useState(me?.timezone ?? "");
  const [saved, setSaved] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);
  const [deleteBlocked, setDeleteBlocked] = useState(false);

  if (!me) return null;

  const patch: PatchMeRequest = {};
  const trimmedName = displayName.trim();
  if (trimmedName !== "" && trimmedName !== me.displayName) {
    patch.displayName = trimmedName;
  }
  if (timezone !== "" && timezone !== me.timezone) {
    patch.timezone = timezone;
  }
  const dirty = Object.keys(patch).length > 0;

  const queueWarning =
    pendingSync > 0
      ? ` ${pendingSync} unsynced offline change${pendingSync === 1 ? "" : "s"} will be lost.`
      : "";

  const onSave = async () => {
    setSaved(false);
    update.reset();
    try {
      await update.submit(patch);
      setSaved(true);
    } catch {
      // error surfaced via update.error below
    }
  };

  const onConfirm = async () => {
    if (confirm === "logout") {
      setConfirm(null);
      await logout("device");
    } else if (confirm === "logout-all") {
      setConfirm(null);
      await logout("all");
    } else if (confirm === "delete") {
      try {
        await del.submit();
        setConfirm(null);
      } catch (e) {
        if (isApiError(e) && e.status === 409) {
          setConfirm(null);
          setDeleteBlocked(true);
        }
        // other errors stay in the dialog via del.error
      }
    }
  };

  const deleteError =
    del.error != null
      ? isApiError(del.error) && del.error.status === 409
        ? "This account has active care links. End them on the Care Links page first."
        : "Could not delete the account. Try again."
      : null;

  const dialogCopy: Record<
    ConfirmKind,
    { title: string; body: string; label: string }
  > = {
    logout: {
      title: "Log out?",
      body: `This signs you out on this device.${queueWarning}`,
      label: "Log out",
    },
    "logout-all": {
      title: "Log out all devices?",
      body: `This signs you out everywhere, including this device.${queueWarning}`,
      label: "Log out all devices",
    },
    delete: {
      title: "Delete account?",
      body: "This permanently deletes your account and data. This cannot be undone.",
      label: "Delete",
    },
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Profile</h1>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-zinc-500">Name</dt>
          <dd>{me.displayName}</dd>
          <dt className="text-zinc-500">Email</dt>
          <dd>{me.email}</dd>
          <dt className="text-zinc-500">Role</dt>
          <dd>{me.role}</dd>
          <dt className="text-zinc-500">Email verified</dt>
          <dd>{me.emailVerified ? "Yes" : "No"}</dd>
        </dl>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold">Edit profile</h2>
        <div className="mt-3 flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input
              className="rounded-md border border-zinc-300 px-3 py-2"
              value={displayName}
              maxLength={80}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Timezone
            <input
              className="rounded-md border border-zinc-300 px-3 py-2"
              list="medo-timezones"
              value={timezone}
              onChange={(e) => {
                setTimezone(e.target.value);
                setSaved(false);
              }}
            />
            <datalist id="medo-timezones">
              {TIMEZONES.map((tz) => (
                <option key={tz} value={tz} />
              ))}
            </datalist>
          </label>
          {saved ? (
            <p className="text-sm text-emerald-700" role="status">
              Profile saved.
            </p>
          ) : null}
          {update.error != null ? (
            <p className="text-sm text-red-600" role="alert">
              Could not save profile. Check the fields and try again.
            </p>
          ) : null}
          <div>
            <Button
              size="sm"
              disabled={!dirty || trimmedName === "" || update.pending}
              onClick={() => void onSave()}
            >
              Save profile
            </Button>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="text-base font-semibold">Session</h2>
        <div className="mt-3 flex flex-col gap-2">
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setConfirm("logout")}
          >
            Log out
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="self-start"
            onClick={() => setConfirm("logout-all")}
          >
            Log out all devices
          </Button>
        </div>
      </section>

      <section className="rounded-xl border border-red-200 bg-white p-4">
        <h2 className="text-base font-semibold text-red-700">Danger zone</h2>
        {deleteBlocked ? (
          <p className="mt-2 text-sm text-amber-700" role="alert">
            You have active care links. End them on the{" "}
            <Link href="/care-links" className="underline">
              Care Links
            </Link>{" "}
            page first, then delete your account.
          </p>
        ) : null}
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="border-red-300 text-red-700"
            onClick={() => {
              del.reset();
              setConfirm("delete");
            }}
          >
            Delete account
          </Button>
        </div>
      </section>

      {confirm ? (
        <ConfirmDialog
          title={dialogCopy[confirm].title}
          body={dialogCopy[confirm].body}
          confirmLabel={dialogCopy[confirm].label}
          pending={confirm === "delete" ? del.pending : false}
          error={confirm === "delete" ? deleteError : null}
          onConfirm={() => void onConfirm()}
          onCancel={() => setConfirm(null)}
        />
      ) : null}
    </main>
  );
}

"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import { usePushControls } from "./hooks";
import { iosInstallRequired } from "@lib/sw/push/installGate";

/**
 * LD-FE-18 / FR-FE-089/090: gesture-gated "Enable reminders" CTA on Today —
 * rendered only after the first successful Today load (parent gates mount).
 * Persistent prompt states: denied → guidance; iOS → install gate first.
 */
export function PushEnableCta() {
  const { status, enable } = usePushControls();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (status === "checking" || status === "subscribed" || done) return null;

  if (iosInstallRequired()) {
    if (dismissed) return null;
    return (
      <div
        className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        data-testid="push-install-gate"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-medium">Enable dose reminders</p>
            <p className="mt-1">
              On iPhone/iPad, add Medo to your Home Screen (Share → Add to Home
              Screen), then open it from there to turn on reminders.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            className="text-amber-700"
            onClick={() => setDismissed(true)}
          >
            ✕
          </button>
        </div>
      </div>
    );
  }

  if (status === "denied") {
    return (
      <div
        className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600"
        data-testid="push-denied-prompt"
      >
        Notifications are blocked — enable them in your browser settings to get
        dose reminders, or keep using the Today screen.
      </div>
    );
  }

  if (status === "unsupported") return null;

  return (
    <div
      className="flex items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-white p-4"
      data-testid="push-cta"
    >
      <p className="text-sm text-zinc-600">
        Turn on reminders to get dose alerts on this device.
      </p>
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          setPending(true);
          void enable()
            .then((s) => {
              if (s === "subscribed") setDone(true);
            })
            .finally(() => setPending(false));
        }}
      >
        Enable reminders
      </Button>
    </div>
  );
}

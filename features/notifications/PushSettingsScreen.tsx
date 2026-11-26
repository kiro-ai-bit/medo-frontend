"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import { SectionState } from "@lib/shared/six-state";
import { usePushControls } from "./hooks";
import { iosInstallRequired } from "@lib/sw/push/installGate";

/** /settings/push — push lifecycle UI (FR-FE-089/090/093). */
export function PushSettingsScreen() {
  const { status, enable, disable } = usePushControls();
  const [pending, setPending] = useState(false);
  const iosGate = iosInstallRequired();

  const onEnable = async () => {
    setPending(true);
    try {
      await enable();
    } finally {
      setPending(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col gap-6 p-6">
      <h1 className="text-xl font-semibold">Push notifications</h1>

      {status === "checking" ? (
        <SectionState status="loading">Checking push status…</SectionState>
      ) : status === "unsupported" ? (
        <SectionState status="ready">
          <p className="text-sm text-zinc-600">
            This browser does not support push notifications. You will still see
            reminders inside the app.
          </p>
        </SectionState>
      ) : iosGate ? (
        <SectionState status="ready">
          <div data-testid="ios-install-gate">
            <p className="text-sm font-medium">Install Medo first</p>
            <p className="mt-1 text-sm text-zinc-600">
              On iPhone and iPad, push reminders only work after you add Medo to
              your Home Screen:
            </p>
            <ol className="mt-2 list-decimal pl-5 text-sm text-zinc-600">
              <li>Tap the Share button in Safari.</li>
              <li>Choose &quot;Add to Home Screen&quot;.</li>
              <li>Open Medo from the Home Screen and enable reminders.</li>
            </ol>
          </div>
        </SectionState>
      ) : status === "denied" ? (
        <SectionState status="ready">
          <p className="text-sm text-zinc-600">
            Notifications are blocked in your browser settings. Allow
            notifications for this site to receive dose reminders, or rely on
            the in-app Today screen and email fallback.
          </p>
        </SectionState>
      ) : status === "subscribed" ? (
        <SectionState status="ready">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-700">
              Push reminders are enabled on this device.
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => {
                setPending(true);
                void disable().finally(() => setPending(false));
              }}
            >
              Disable
            </Button>
          </div>
        </SectionState>
      ) : (
        <SectionState status="ready">
          <div className="flex items-center justify-between">
            <p className="text-sm text-zinc-600">
              Get dose reminders on this device, even when the app is closed.
            </p>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => void onEnable()}
            >
              Enable reminders
            </Button>
          </div>
        </SectionState>
      )}
    </main>
  );
}

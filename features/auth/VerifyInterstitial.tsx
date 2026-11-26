"use client";

import { useState } from "react";
import { Button } from "@components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@components/ui/card";
import { useLogout, useResendVerification } from "./hooks";
import { useSessionStore } from "@lib/state/client/sessionStore";

/** Verify-email interstitial (FR-FE-004): session exists but email unverified. */
export function VerifyInterstitial() {
  const me = useSessionStore((s) => s.me);
  const { submit, state } = useResendVerification();
  const { logout } = useLogout();
  const [resent, setResent] = useState(false);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Verify your email</CardTitle>
          <CardDescription>
            We sent a verification link to{" "}
            <strong>{me?.email ?? "your email"}</strong>. Open it to continue.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {resent || state.status === "success" ? (
            <p className="text-sm text-emerald-700" role="status">
              Verification email sent — check your inbox.
            </p>
          ) : null}
          {state.status === "error" ? (
            <p className="text-sm text-red-600" role="alert">
              Could not resend right now. Try again later.
            </p>
          ) : null}
          <Button
            className="w-full"
            disabled={state.status === "pending"}
            onClick={() => {
              if (!me?.email) return;
              void submit({ email: me.email }).then(() => setResent(true));
            }}
          >
            {state.status === "pending"
              ? "Sending…"
              : "Resend verification email"}
          </Button>
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => void logout()}
          >
            Log out
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

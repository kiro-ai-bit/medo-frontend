"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LoginRequest } from "@kiro-ai-bit/contracts";
import { LoginRequestSchema } from "@kiro-ai-bit/contracts";
import { Button } from "@components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@components/ui/card";
import { Input } from "@components/ui/input";
import { Label } from "@components/ui/label";
import { useLogin, useResendVerification } from "../hooks";
import { isApiError } from "@lib/api/http/errors";
import { consumePendingInvite } from "@lib/state/client/inviteHandoff";

export function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const notice = searchParams.get("reason") ?? searchParams.get("notice");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { submit, state, error, cooldownSeconds } = useLogin();
  const resend = useResendVerification();
  const [cooldownLeft, setCooldownLeft] = useState<number | null>(null);

  useEffect(() => {
    if (cooldownSeconds === null) {
      setCooldownLeft(null);
      return;
    }
    setCooldownLeft(cooldownSeconds);
    const t = setInterval(() => {
      setCooldownLeft((v) => (v === null || v <= 1 ? null : v - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldownSeconds]);

  const unverified =
    isApiError(error) &&
    error.status === 403 &&
    error.code === "EMAIL_NOT_VERIFIED";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const parsed = LoginRequestSchema.safeParse({
      email,
      password,
    } satisfies LoginRequest);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await submit(parsed.data);
      // Explicit `next` wins; otherwise resume a stashed care-invite landing
      // (LLD §6.10 — survives the verify-email detour via localStorage).
      const stashed = consumePendingInvite();
      const safeNext =
        next && next.startsWith("/") && !next.startsWith("//")
          ? next
          : stashed
            ? `/invite/${encodeURIComponent(stashed)}`
            : "/";
      router.replace(safeNext);
    } catch {
      // error state rendered below
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Log in to Medo</CardTitle>
          <CardDescription>Manage medicines and doses.</CardDescription>
        </CardHeader>
        <CardContent>
          {notice === "expired" ? (
            <p
              className="mb-4 rounded-md bg-amber-50 p-3 text-sm text-amber-800"
              role="status"
            >
              Your session expired — please log in again.
            </p>
          ) : null}
          {notice === "reset" ? (
            <p
              className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
              role="status"
            >
              Password updated — log in with your new password.
            </p>
          ) : null}
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {fieldError ? (
              <p className="text-sm text-red-600" role="alert">
                {fieldError}
              </p>
            ) : null}
            {cooldownLeft !== null ? (
              <p className="text-sm text-amber-700" role="alert">
                Too many failed attempts — try again in{" "}
                {Math.ceil(cooldownLeft / 60)} min.
              </p>
            ) : error && !unverified ? (
              <p className="text-sm text-red-600" role="alert">
                {error.message}
              </p>
            ) : null}
            {unverified ? (
              <div className="space-y-2 rounded-md bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  Your email is not verified yet.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={resend.state.status === "pending"}
                  onClick={() => void resend.submit({ email })}
                >
                  Resend verification email
                </Button>
              </div>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={state.status === "pending" || cooldownLeft !== null}
            >
              {state.status === "pending" ? "Logging in…" : "Log in"}
            </Button>
          </form>
          <div className="mt-4 flex justify-between text-sm">
            <Link
              href="/forgot-password"
              className="text-zinc-600 hover:underline"
            >
              Forgot password?
            </Link>
            <Link
              href={
                next ? `/signup?next=${encodeURIComponent(next)}` : "/signup"
              }
              className="text-zinc-600 hover:underline"
            >
              Create account
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

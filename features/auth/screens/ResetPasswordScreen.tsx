"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { passwordSchema } from "@kiro-ai-bit/contracts";
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
import { useResetPassword } from "../hooks";

export function ResetPasswordScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { submit, state, error } = useResetPassword(token);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    if (!token) {
      setFieldError(
        "Missing reset token — open the link from your email again.",
      );
      return;
    }
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid password");
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match.");
      return;
    }
    try {
      await submit({ password });
    } catch {
      // error rendered below
    }
  };

  if (state.status === "success") {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Password updated</CardTitle>
            <CardDescription>
              All existing sessions were signed out. Log in with your new
              password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button
              className="w-full"
              onClick={() => router.push("/login?notice=reset")}
            >
              Go to login
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Choose a new password</CardTitle>
          <CardDescription>At least 8 characters.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="password">New password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </div>
            {fieldError ? (
              <p className="text-sm text-red-600" role="alert">
                {fieldError}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error.status === 401
                  ? "This reset link is expired or already used."
                  : error.message}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={state.status === "pending" || !token}
            >
              {state.status === "pending" ? "Updating…" : "Update password"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-zinc-600">
            <Link href="/login" className="hover:underline">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

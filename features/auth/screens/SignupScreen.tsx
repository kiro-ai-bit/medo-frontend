"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  SignupRequestSchema,
  type SignupRequest,
} from "@kiro-ai-bit/contracts";
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
import { useSignup, useResendVerification } from "../hooks";
import type { Role } from "@lib/shared/types";

export function SignupScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("Patient");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const { submit, state, response } = useSignup();
  const error = state.error;
  const resend = useResendVerification();

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const parsed = SignupRequestSchema.safeParse({
      name,
      email,
      password,
      role,
    } satisfies SignupRequest);
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid input");
      return;
    }
    try {
      await submit(parsed.data);
      setDone(true);
    } catch {
      // error rendered below
    }
  };

  if (done && response) {
    return (
      <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle>Check your email</CardTitle>
            <CardDescription>
              We sent a verification link to <strong>{response.email}</strong>.
              Verify it, then log in.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button
              variant="outline"
              className="w-full"
              disabled={resend.state.status === "pending"}
              onClick={() => void resend.submit({ email: response.email })}
            >
              Resend verification email
            </Button>
            <Button
              className="w-full"
              onClick={() =>
                router.push(
                  `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`,
                )
              }
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
          <CardTitle>Create your Medo account</CardTitle>
          <CardDescription>
            Patient or caregiver — one account, one role.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
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
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-xs text-zinc-500">At least 8 characters.</p>
            </div>
            <div className="space-y-1">
              <Label htmlFor="role">I am a</Label>
              <select
                id="role"
                className="flex h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm"
                value={role}
                onChange={(e) => setRole(e.target.value as Role)}
              >
                <option value="Patient">Patient</option>
                <option value="Caregiver">Caregiver</option>
              </select>
            </div>
            {fieldError ? (
              <p className="text-sm text-red-600" role="alert">
                {fieldError}
              </p>
            ) : null}
            {error ? (
              <p className="text-sm text-red-600" role="alert">
                {error.code === "CONFLICT"
                  ? "An account with this email already exists."
                  : error.message}
              </p>
            ) : null}
            <Button
              type="submit"
              className="w-full"
              disabled={state.status === "pending"}
            >
              {state.status === "pending" ? "Creating…" : "Sign up"}
            </Button>
          </form>
          <p className="mt-4 text-sm text-zinc-600">
            Already have an account?{" "}
            <Link
              href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
              className="hover:underline"
            >
              Log in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}

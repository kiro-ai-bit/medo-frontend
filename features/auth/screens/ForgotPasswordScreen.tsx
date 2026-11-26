"use client";

import { useState } from "react";
import Link from "next/link";
import { ForgotPasswordRequestSchema } from "@kiro-ai-bit/contracts";
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
import { useForgotPassword } from "../hooks";

export function ForgotPasswordScreen() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const { submit, state, error } = useForgotPassword();
  const [sent, setSent] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    const parsed = ForgotPasswordRequestSchema.safeParse({ email });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Invalid email");
      return;
    }
    try {
      await submit(parsed.data);
      setSent(true);
    } catch {
      // error rendered below
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Reset your password</CardTitle>
          <CardDescription>
            We will email you a reset link if the account exists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent || state.status === "success" ? (
            <p className="text-sm text-emerald-700" role="status">
              If an account exists for that email, a reset link is on its way.
            </p>
          ) : (
            <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {fieldError ? (
                <p className="text-sm text-red-600" role="alert">
                  {fieldError}
                </p>
              ) : null}
              {error ? (
                <p className="text-sm text-red-600" role="alert">
                  {error.message}
                </p>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={state.status === "pending"}
              >
                {state.status === "pending" ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}
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

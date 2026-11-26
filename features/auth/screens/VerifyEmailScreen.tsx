"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { emailSchema } from "@kiro-ai-bit/contracts";
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
import { useResendVerification, useVerifyEmail } from "../hooks";

export function VerifyEmailScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const { run, state, error } = useVerifyEmail(token);
  const resend = useResendVerification();
  const [resendEmail, setResendEmail] = useState("");
  const [resent, setResent] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (token && !ran.current) {
      ran.current = true;
      run();
    }
  }, [token]);

  if (!token) {
    return (
      <Shell
        title="Invalid link"
        description="This verification link is missing its token."
      >
        <Button className="w-full" onClick={() => router.push("/login")}>
          Go to login
        </Button>
      </Shell>
    );
  }

  if (state.status === "pending" || state.status === "idle") {
    return (
      <Shell title="Verifying…" description="Confirming your email address.">
        <p className="text-sm text-zinc-500" role="status">
          One moment.
        </p>
      </Shell>
    );
  }

  if (state.status === "success") {
    return (
      <Shell
        title="Email verified"
        description="Your account is ready. Log in to continue."
      >
        <Button className="w-full" onClick={() => router.push("/login")}>
          Go to login
        </Button>
      </Shell>
    );
  }

  return (
    <Shell
      title="Verification failed"
      description={
        error && error.status === 401
          ? "This verification link is expired or already used."
          : (error?.message ?? "Something went wrong.")
      }
    >
      {resent || resend.state.status === "success" ? (
        <p className="mb-3 text-sm text-emerald-700" role="status">
          Verification email sent.
        </p>
      ) : null}
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const parsed = emailSchema.safeParse(resendEmail);
          if (parsed.success) {
            void resend
              .submit({ email: parsed.data })
              .then(() => setResent(true));
          }
        }}
      >
        <div className="space-y-1">
          <Label htmlFor="resend-email">Resend to email</Label>
          <Input
            id="resend-email"
            type="email"
            required
            value={resendEmail}
            onChange={(e) => setResendEmail(e.target.value)}
          />
        </div>
        <Button
          type="submit"
          variant="outline"
          className="w-full"
          disabled={resend.state.status === "pending"}
        >
          Resend verification email
        </Button>
      </form>
      <p className="mt-3 text-center text-sm text-zinc-600">
        <Link href="/login" className="hover:underline">
          Back to login
        </Link>
      </p>
    </Shell>
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </main>
  );
}

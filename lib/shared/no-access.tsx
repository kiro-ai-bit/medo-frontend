"use client";

import { useRouter } from "next/navigation";
import { Button } from "@components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@components/ui/card";

export function NoAccess() {
  const router = useRouter();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-zinc-50 p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>No access</CardTitle>
          <CardDescription>
            This area is not available for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => router.push("/")}
          >
            Back to home
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

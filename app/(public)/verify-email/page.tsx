import { Suspense } from "react";
import { PublicOnly, VerifyEmailScreen } from "@features/auth";

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <PublicOnly>
        <VerifyEmailScreen />
      </PublicOnly>
    </Suspense>
  );
}

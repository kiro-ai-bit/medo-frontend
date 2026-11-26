import { Suspense } from "react";
import { PublicOnly, ResetPasswordScreen } from "@features/auth";

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <PublicOnly>
        <ResetPasswordScreen />
      </PublicOnly>
    </Suspense>
  );
}

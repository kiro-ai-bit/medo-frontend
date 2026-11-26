import { Suspense } from "react";
import { PublicOnly, ForgotPasswordScreen } from "@features/auth";

export default function ForgotPasswordPage() {
  return (
    <Suspense>
      <PublicOnly>
        <ForgotPasswordScreen />
      </PublicOnly>
    </Suspense>
  );
}

import { Suspense } from "react";
import { PublicOnly, SignupScreen } from "@features/auth";

export default function SignupPage() {
  return (
    <Suspense>
      <PublicOnly>
        <SignupScreen />
      </PublicOnly>
    </Suspense>
  );
}

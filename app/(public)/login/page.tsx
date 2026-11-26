import { Suspense } from "react";
import { PublicOnly, LoginScreen } from "@features/auth";

export default function LoginPage() {
  return (
    <Suspense>
      <PublicOnly>
        <LoginScreen />
      </PublicOnly>
    </Suspense>
  );
}

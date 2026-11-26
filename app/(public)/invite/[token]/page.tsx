import { Suspense } from "react";
import { InviteScreen } from "@features/care";

export default function InvitePage() {
  return (
    <Suspense>
      <InviteScreen />
    </Suspense>
  );
}

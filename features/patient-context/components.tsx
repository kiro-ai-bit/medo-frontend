"use client";

import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { useCareLinks } from "./hooks";
import { SectionState } from "@lib/shared/six-state";

/** Caregiver patient picker; empty state = "accept an invite" (FR-FE-005a). */
export function PatientSwitcher() {
  const links = useCareLinks();
  const selectLink = usePatientContextStore((s) => s.selectLink);
  const patientLinks = (links.data ?? []).filter(
    (l) => l.direction === "as-caregiver",
  );

  if (links.isPending)
    return <SectionState status="loading">Loading…</SectionState>;
  if (links.isError) {
    return (
      <SectionState status="error" onRetry={() => void links.refetch()}>
        Could not load your care links.
      </SectionState>
    );
  }
  if (patientLinks.length === 0) {
    return (
      <SectionState
        status="empty"
        emptyMessage="No linked patients yet — accept a care invite to get started."
      >
        {null}
      </SectionState>
    );
  }
  return (
    <ul className="flex flex-col gap-2" data-testid="patient-switcher">
      {patientLinks.map((l) => (
        <li key={l.linkId}>
          <button
            type="button"
            onClick={() => selectLink(l)}
            className="w-full rounded-lg border border-zinc-200 bg-white p-4 text-left hover:border-zinc-400"
          >
            <span className="font-medium">{l.counterpart.displayName}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** One-shot "link ended" banner (FR-FE-006b). */
export function LinkEndedBanner() {
  const banner = usePatientContextStore((s) => s.endedLinkBanner);
  const clearBanner = usePatientContextStore((s) => s.clearBanner);
  if (!banner) return null;
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
      data-testid="link-ended-banner"
    >
      A care link has ended — access to that patient was removed.{" "}
      <button type="button" className="underline" onClick={clearBanner}>
        Dismiss
      </button>
    </div>
  );
}

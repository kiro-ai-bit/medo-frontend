"use client";

import { usePatientContextStore } from "@lib/state/client/patientContextStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
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

/**
 * Compact caregiver patient switcher mounted in the app shell (FR-FE-005):
 * renders only for Caregiver sessions with ≥1 linked patient; switching or
 * clearing updates the patient context every patient-scoped screen reads.
 */
export function PatientContextBar() {
  const role = useSessionStore((s) => s.me?.role);
  const links = useCareLinks();
  const selectedLinkId = usePatientContextStore((s) => s.selectedLinkId);
  const selectLink = usePatientContextStore((s) => s.selectLink);
  const clearSelection = usePatientContextStore((s) => s.clearSelection);

  if (role !== "Caregiver") return null;
  const patientLinks = (links.data ?? []).filter(
    (l) => l.direction === "as-caregiver",
  );
  if (patientLinks.length === 0) return null;

  return (
    <div
      className="border-b border-zinc-200 bg-white/60 px-4 py-2"
      data-testid="patient-context-bar"
    >
      <label className="flex items-center gap-2 text-xs text-zinc-500">
        Patient
        <select
          className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm text-zinc-900"
          value={selectedLinkId ?? ""}
          onChange={(e) => {
            const link = patientLinks.find((l) => l.linkId === e.target.value);
            if (link) selectLink(link);
            else clearSelection();
          }}
        >
          <option value="">Select patient…</option>
          {patientLinks.map((l) => (
            <option key={l.linkId} value={l.linkId}>
              {l.counterpart.displayName}
            </option>
          ))}
        </select>
      </label>
    </div>
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

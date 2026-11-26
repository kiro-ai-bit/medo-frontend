import type { LinkListItem } from "@kiro-ai-bit/contracts";

/**
 * Actor attribution display (LLD §8.14 / FR-FE-103):
 * actorId == session.sub → "marked by you"; actorId matching a link counterpart
 * → named by that counterpart's role (as-patient link ⇒ counterpart is a
 * caregiver; as-caregiver link ⇒ counterpart is the patient); otherwise →
 * generic "marked by caregiver". Null actorId → no label.
 */
export function actorLabel(
  actorId: string | null,
  sessionUserId: string | null,
  links: LinkListItem[],
): string | null {
  if (!actorId) return null;
  if (sessionUserId && actorId === sessionUserId) return "marked by you";
  const link = links.find((l) => l.counterpart.userId === actorId);
  if (link) {
    const name = link.counterpart.displayName;
    return link.direction === "as-patient"
      ? `marked by caregiver (${name})`
      : `marked by patient (${name})`;
  }
  return "marked by caregiver";
}

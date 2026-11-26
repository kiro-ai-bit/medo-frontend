/** LD-FE-13 push deep-link map — pure, unit-tested. */

export interface DeepLinkInput {
  /** `data.url` from the payload (LD-NOT-18 `/today?dose={id}`), if present. */
  url?: string;
  /** Fallback category when url is absent/invalid. */
  kind?: "dose" | "care" | "refill" | "system";
}

const FALLBACK: Record<NonNullable<DeepLinkInput["kind"]>, string> = {
  dose: "/today",
  care: "/care-links",
  refill: "/medicines",
  system: "/notifications",
};

/** Only same-origin absolute paths are honored — anything else falls back. */
function safePath(url: string | undefined): string | null {
  if (!url) return null;
  if (!url.startsWith("/") || url.startsWith("//")) return null;
  return url;
}

/**
 * notificationclick / feed-row target resolution:
 * data.url wins → kind fallback map → `/today` for unknown.
 */
export function resolveDeepLink(input: DeepLinkInput): string {
  const direct = safePath(input.url);
  if (direct) return direct;
  if (input.kind && input.kind in FALLBACK) return FALLBACK[input.kind];
  return "/today";
}

/** In-app feed row href — feed DTOs carry `type`, not a url (FR-FE-078). */
export function feedItemHref(type: "care_link" | "refill" | "system"): string {
  if (type === "care_link") return "/care-links";
  if (type === "refill") return "/medicines";
  return "/notifications";
}

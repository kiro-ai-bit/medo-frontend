const KEY = "medo:pendingInvite";

/**
 * Invite-token handoff (LLD §6.10): the `/invite/[token]` destination must
 * survive the signup → verify-email → login detour, including the email link
 * opening in a new tab — so it is kept in localStorage, not the URL or
 * sessionStorage. Consumed once on post-login redirect; cleared on terminal
 * invite states.
 */
function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function stashPendingInvite(token: string): void {
  storage()?.setItem(KEY, token);
}

export function peekPendingInvite(): string | null {
  return storage()?.getItem(KEY) ?? null;
}

export function consumePendingInvite(): string | null {
  const s = storage();
  const token = s?.getItem(KEY) ?? null;
  s?.removeItem(KEY);
  return token;
}

export function clearPendingInvite(): void {
  storage()?.removeItem(KEY);
}

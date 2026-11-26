import type { MeDto } from "@kiro-ai-bit/contracts";
import { identityClient } from "@lib/api/identity";
import {
  useSessionStore,
  type SessionTokens,
} from "@lib/state/client/sessionStore";
import { purgeClientState } from "./purge";

/**
 * 401 handler (LD-FE-03 / FR-FE-003): apiFetch single-flights concurrent calls
 * onto this handler; failure purges client state and returns false.
 */
export async function handleUnauthorized(): Promise<boolean> {
  try {
    const res = await identityClient.refresh();
    useSessionStore.getState().setTokens({
      userId: res.userId,
      accessToken: res.accessToken,
      expiresAt: res.expiresAt,
    });
    return true;
  } catch {
    await purgeClientState("expired");
    return false;
  }
}

/** Boot/hydrate path: refresh → /v1/me → session store. Returns false when anonymous. */
export async function bootSession(): Promise<boolean> {
  try {
    const res = await identityClient.refresh();
    const tokens: SessionTokens = {
      userId: res.userId,
      accessToken: res.accessToken,
      expiresAt: res.expiresAt,
    };
    useSessionStore.getState().setTokens(tokens);
    const me = await identityClient.getMe();
    useSessionStore.getState().setMe(me);
    return true;
  } catch {
    useSessionStore.getState().clear();
    return false;
  }
}

/** Post-login hydration: tokens first (getMe needs Bearer), then profile. */
export async function establishSession(
  tokens: SessionTokens,
): Promise<MeDto | null> {
  useSessionStore.getState().setTokens(tokens);
  try {
    const me = await identityClient.getMe();
    useSessionStore.getState().setMe(me);
    return me;
  } catch {
    return null;
  }
}

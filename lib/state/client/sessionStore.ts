import type { MeDto } from "@kiro-ai-bit/contracts";
import { create } from "zustand";

export type SessionStatus = "booting" | "anonymous" | "authenticated";
export type SessionNotice = "expired" | "deleted" | "password-reset" | null;

export interface SessionTokens {
  userId: string;
  accessToken: string;
  expiresAt: string;
}

interface SessionState {
  status: SessionStatus;
  userId: string | null;
  accessToken: string | null;
  expiresAt: string | null;
  me: MeDto | null;
  notice: SessionNotice;
  hydrate: (tokens: SessionTokens, me: MeDto) => void;
  setTokens: (tokens: SessionTokens) => void;
  setMe: (me: MeDto) => void;
  setNotice: (notice: SessionNotice) => void;
  clear: (notice?: SessionNotice) => void;
}

export const useSessionStore = create<SessionState>()((set) => ({
  status: "booting",
  userId: null,
  accessToken: null,
  expiresAt: null,
  me: null,
  notice: null,
  hydrate: (tokens, me) =>
    set({
      status: "authenticated",
      userId: tokens.userId,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
      me,
      notice: null,
    }),
  setTokens: (tokens) =>
    set({
      status: "authenticated",
      userId: tokens.userId,
      accessToken: tokens.accessToken,
      expiresAt: tokens.expiresAt,
    }),
  setMe: (me) => set({ me }),
  setNotice: (notice) => set({ notice }),
  clear: (notice = null) =>
    set({
      status: "anonymous",
      userId: null,
      accessToken: null,
      expiresAt: null,
      me: null,
      notice,
    }),
}));

export function sessionTokens(): SessionTokens | null {
  const s = useSessionStore.getState();
  if (!s.userId || !s.accessToken || !s.expiresAt) return null;
  return {
    userId: s.userId,
    accessToken: s.accessToken,
    expiresAt: s.expiresAt,
  };
}

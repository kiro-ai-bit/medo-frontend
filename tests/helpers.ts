import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { useGamificationStore } from "@lib/state/client/gamificationStore";
import { clearPendingInvite } from "@lib/state/client/inviteHandoff";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { queryClient } from "@lib/state/query/queryClient";
import { setUnauthorizedHandler } from "@lib/api/http/apiFetch";

export function resetStores(): void {
  useSessionStore.setState({
    status: "anonymous",
    userId: null,
    accessToken: null,
    expiresAt: null,
    me: null,
    notice: null,
  });
  useConnectivityStore.setState({ status: "online", pendingSyncCount: 0 });
  useGamificationStore.getState().reset();
  clearPendingInvite();
  queryClient.clear();
  setUnauthorizedHandler(null);
}

export function jsonResponse(
  status: number,
  body?: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

export function errorEnvelope(
  code: string,
  message = "err",
  details?: Record<string, unknown>,
) {
  return {
    error: {
      code,
      message,
      requestId: "req-1",
      ...(details ? { details } : {}),
    },
  };
}

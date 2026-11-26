import type { z } from "zod";
import { env } from "@lib/config/env";
import { useConnectivityStore } from "@lib/state/client/connectivityStore";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { contractParseError, networkError, normalizeApiError } from "./errors";

export interface ApiRequest {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  body?: unknown;
  /** Public/auth routes skip Bearer attach and the 401 interceptor. */
  isAuthRoute?: boolean;
  /** e.g. 'include' for the refresh cookie on /v1/auth/refresh + login/logout. */
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
  /** Internal: set by the interceptor for the single retry. */
  _retried?: boolean;
}

export type UnauthorizedHandler = () => Promise<boolean>;
export type ForbiddenHandler = () => Promise<void> | void;

let unauthorizedHandler: UnauthorizedHandler | null = null;
let unauthorizedInFlight: Promise<boolean> | null = null;
let forbiddenHandler: ForbiddenHandler | null = null;

export function setForbiddenHandler(handler: ForbiddenHandler | null): void {
  forbiddenHandler = handler;
}

export function setUnauthorizedHandler(
  handler: UnauthorizedHandler | null,
): void {
  unauthorizedHandler = handler;
}

/** Exactly one refresh attempt shared by all concurrent 401s (INV-FE-5). */
function runUnauthorizedHandler(): Promise<boolean> {
  if (!unauthorizedInFlight) {
    unauthorizedInFlight = Promise.resolve()
      .then(() => unauthorizedHandler?.() ?? false)
      .finally(() => {
        unauthorizedInFlight = null;
      });
  }
  return unauthorizedInFlight;
}

export async function apiFetch<T>(
  req: ApiRequest,
  schema?: z.ZodType<T>,
): Promise<T> {
  const headers: Record<string, string> = { ...req.headers };
  if (req.body !== undefined) headers["content-type"] = "application/json";
  const token = useSessionStore.getState().accessToken;
  if (token && !req.isAuthRoute) headers["authorization"] = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${env.NEXT_PUBLIC_API_BASE_URL}${req.path}`, {
      method: req.method,
      headers,
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      credentials: req.credentials ?? "same-origin",
    });
  } catch {
    useConnectivityStore.getState().engage();
    throw networkError();
  }

  // Any HTTP response proves the server is reachable; only a successful (2xx)
  // response clears degraded mode (LLD §8.1 / INV-FE-6).
  if (response.ok) {
    useConnectivityStore.getState().clear();
  }

  if (
    response.status === 401 &&
    !req.isAuthRoute &&
    !req._retried &&
    unauthorizedHandler
  ) {
    const refreshed = await runUnauthorizedHandler();
    if (refreshed) {
      return apiFetch<T>({ ...req, _retried: true }, schema);
    }
    throw normalizeApiError(
      401,
      await safeJson(response),
      response.headers.get("retry-after"),
    );
  }

  if (!response.ok) {
    if (response.status === 403 && !req.isAuthRoute && forbiddenHandler) {
      await forbiddenHandler();
    }
    throw normalizeApiError(
      response.status,
      await safeJson(response),
      response.headers.get("retry-after"),
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const body: unknown = await response.json().catch(() => undefined);
  if (schema === undefined) {
    return body as T;
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    throw contractParseError(response.status, parsed.error);
  }
  return parsed.data;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

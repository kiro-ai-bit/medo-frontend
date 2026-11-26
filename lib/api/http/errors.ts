import { errorEnvelopeSchema } from "@kiro-ai-bit/contracts";
import { z } from "zod";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly requestId: string | null;
  readonly retryAfterSeconds: number | null;
  readonly details: Record<string, unknown> | undefined;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    requestId?: string | null;
    retryAfterSeconds?: number | null;
    details?: Record<string, unknown>;
  }) {
    super(init.message);
    this.name = "ApiError";
    this.status = init.status;
    this.code = init.code;
    this.requestId = init.requestId ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
    this.details = init.details;
  }
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

const errorBodySchema = errorEnvelopeSchema;

export function normalizeApiError(
  status: number,
  body: unknown,
  retryAfterHeader: string | null,
): ApiError {
  const retryAfterSeconds = parseRetryAfter(retryAfterHeader);
  const parsed = errorBodySchema.safeParse(body);
  if (parsed.success) {
    const { code, message, requestId, details } = parsed.data.error;
    return new ApiError({
      status,
      code,
      message,
      requestId,
      retryAfterSeconds: retryAfterSeconds ?? retryAfterFromDetails(details),
      details,
    });
  }
  return new ApiError({
    status,
    code: "INTERNAL",
    message: `Request failed with status ${status}`,
    retryAfterSeconds,
  });
}

function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number.parseInt(header, 10);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds : null;
}

function retryAfterFromDetails(
  details: Record<string, unknown> | undefined,
): number | null {
  const v = details?.["retryAfterSeconds"] ?? details?.["retryAfter"];
  return typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
}

export function networkError(): ApiError {
  return new ApiError({
    status: 0,
    code: "NETWORK_ERROR",
    message: "Network request failed",
  });
}

export function contractParseError(
  status: number,
  error: z.ZodError,
): ApiError {
  return new ApiError({
    status,
    code: "INVALID_RESPONSE",
    message: `Response failed contract validation: ${error.issues[0]?.message ?? "unknown"}`,
    details: {
      issues: error.issues
        .slice(0, 5)
        .map((i) => ({ path: i.path.join("."), message: i.message })),
    },
  });
}

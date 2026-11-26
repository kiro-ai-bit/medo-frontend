import { z } from "zod";

const envSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.url(),
  NEXT_PUBLIC_APP_ENV: z.enum(["development", "production"]),
  NEXT_PUBLIC_SENTRY_DSN: z.string().default(""),
});

export type Env = z.infer<typeof envSchema>;

function readEnv() {
  return {
    NEXT_PUBLIC_API_BASE_URL:
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      (process.env.NODE_ENV === "test" ? "http://api.test" : undefined),
    NEXT_PUBLIC_APP_ENV:
      process.env.NEXT_PUBLIC_APP_ENV ??
      (process.env.NODE_ENV === "test" ? "development" : undefined),
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
  };
}

let cached: Env | null = null;

/** Lazy fail-fast parse — module import must never throw during SSR/prerender. */
export function getEnv(): Env {
  if (!cached) cached = envSchema.parse(readEnv());
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get: (_target, prop: keyof Env) => getEnv()[prop],
});

import { QueryClient } from "@tanstack/react-query";
import { ApiError, isApiError } from "@lib/api/http/errors";

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60_000,
        refetchIntervalInBackground: false,
        retry: (failureCount, error) => {
          if (
            isApiError(error) &&
            error.status >= 400 &&
            error.status < 500 &&
            error.status !== 429
          ) {
            return false;
          }
          return failureCount < 2;
        },
      },
      mutations: { retry: 0 },
    },
  });
}

export const queryClient = makeQueryClient();

export function isRateLimited(error: unknown): error is ApiError {
  return isApiError(error) && error.status === 429;
}

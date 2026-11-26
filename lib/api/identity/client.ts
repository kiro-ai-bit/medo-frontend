import {
  ForgotPasswordRequestSchema,
  ForgotPasswordResponseSchema,
  LoginRequestSchema,
  LoginResponseSchema,
  MeDtoSchema,
  PatchMeRequestSchema,
  PatchMeResponseSchema,
  RefreshResponseSchema,
  ResendVerificationRequestSchema,
  ResendVerificationResponseSchema,
  ResetPasswordRequestSchema,
  SignupRequestSchema,
  SignupResponseSchema,
  VerifyEmailRequestSchema,
  type ForgotPasswordRequest,
  type ForgotPasswordResponse,
  type LoginRequest,
  type LoginResponse,
  type MeDto,
  type PatchMeRequest,
  type PatchMeResponse,
  type RefreshResponse,
  type ResendVerificationRequest,
  type ResendVerificationResponse,
  type ResetPasswordRequest,
  type SignupRequest,
  type SignupResponse,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";

const AUTH = { isAuthRoute: true } as const;
const COOKIE = { credentials: "include" } as const;

export const identityClient = {
  signup(input: SignupRequest): Promise<SignupResponse> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/auth/signup",
        body: SignupRequestSchema.parse(input),
        ...AUTH,
      },
      SignupResponseSchema,
    );
  },

  login(input: LoginRequest): Promise<LoginResponse> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/auth/login",
        body: LoginRequestSchema.parse(input),
        ...AUTH,
        ...COOKIE,
      },
      LoginResponseSchema,
    );
  },

  refresh(): Promise<RefreshResponse> {
    return apiFetch(
      { method: "POST", path: "/v1/auth/refresh", ...AUTH, ...COOKIE },
      RefreshResponseSchema,
    );
  },

  logout(): Promise<void> {
    return apiFetch({ method: "POST", path: "/v1/auth/logout", ...COOKIE });
  },

  logoutAll(): Promise<void> {
    return apiFetch({ method: "POST", path: "/v1/auth/logout-all", ...COOKIE });
  },

  forgotPassword(
    input: ForgotPasswordRequest,
  ): Promise<ForgotPasswordResponse> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/auth/forgot-password",
        body: ForgotPasswordRequestSchema.parse(input),
        ...AUTH,
      },
      ForgotPasswordResponseSchema,
    );
  },

  resetPassword(input: ResetPasswordRequest): Promise<void> {
    return apiFetch({
      method: "POST",
      path: "/v1/auth/reset-password",
      body: ResetPasswordRequestSchema.parse(input),
      ...AUTH,
    });
  },

  verifyEmail(token: string): Promise<void> {
    return apiFetch({
      method: "POST",
      path: "/v1/auth/verify-email",
      body: VerifyEmailRequestSchema.parse({ token }),
      ...AUTH,
    });
  },

  resendVerification(
    input: ResendVerificationRequest,
  ): Promise<ResendVerificationResponse> {
    return apiFetch(
      {
        method: "POST",
        path: "/v1/auth/resend-verification",
        body: ResendVerificationRequestSchema.parse(input),
        ...AUTH,
      },
      ResendVerificationResponseSchema,
    );
  },

  getMe(): Promise<MeDto> {
    return apiFetch({ method: "GET", path: "/v1/me" }, MeDtoSchema);
  },

  patchMe(input: PatchMeRequest): Promise<PatchMeResponse> {
    return apiFetch(
      {
        method: "PATCH",
        path: "/v1/me",
        body: PatchMeRequestSchema.parse(input),
      },
      PatchMeResponseSchema,
    );
  },

  deleteMe(): Promise<void> {
    return apiFetch({ method: "DELETE", path: "/v1/me", ...COOKIE });
  },
};

export type IdentityClient = typeof identityClient;

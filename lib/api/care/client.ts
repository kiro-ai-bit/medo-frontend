import {
  AcceptInviteResponseSchema,
  CancelInviteResponseSchema,
  CreateInviteRequestSchema,
  CreateInviteResponseSchema,
  DeclineInviteResponseSchema,
  EndLinkResponseSchema,
  InviteListResponseSchema,
  InvitePreviewDtoSchema,
  LinkListResponseSchema,
  ResendInviteResponseSchema,
  type AcceptInviteResponse,
  type CancelInviteResponse,
  type CreateInviteRequest,
  type CreateInviteResponse,
  type DeclineInviteResponse,
  type EndLinkResponse,
  type InviteListItem,
  type InvitePreviewDto,
  type LinkListItem,
  type ResendInviteResponse,
} from "@kiro-ai-bit/contracts";
import { apiFetch } from "../http/apiFetch";

export const careClient = {
  async listLinks(): Promise<LinkListItem[]> {
    const res = await apiFetch(
      { method: "GET", path: "/v1/care/links" },
      LinkListResponseSchema,
    );
    return res.links;
  },

  async listInvites(): Promise<InviteListItem[]> {
    const res = await apiFetch(
      { method: "GET", path: "/v1/care/invites" },
      InviteListResponseSchema,
    );
    return res.invites;
  },

  async createInvite(
    input: CreateInviteRequest,
  ): Promise<CreateInviteResponse> {
    const body = CreateInviteRequestSchema.parse(input);
    return apiFetch(
      { method: "POST", path: "/v1/care/links/invites", body },
      CreateInviteResponseSchema,
    );
  },

  async getInvitePreview(token: string): Promise<InvitePreviewDto> {
    return apiFetch(
      { method: "GET", path: `/v1/care/invites/${token}`, isAuthRoute: true },
      InvitePreviewDtoSchema,
    );
  },

  async acceptInvite(token: string): Promise<AcceptInviteResponse> {
    return apiFetch(
      { method: "POST", path: `/v1/care/invites/${token}/accept` },
      AcceptInviteResponseSchema,
    );
  },

  async declineInvite(token: string): Promise<DeclineInviteResponse> {
    return apiFetch(
      { method: "POST", path: `/v1/care/invites/${token}/decline` },
      DeclineInviteResponseSchema,
    );
  },

  async resendInvite(inviteId: string): Promise<ResendInviteResponse> {
    return apiFetch(
      { method: "POST", path: `/v1/care/invites/${inviteId}/resend` },
      ResendInviteResponseSchema,
    );
  },

  async cancelInvite(inviteId: string): Promise<CancelInviteResponse> {
    return apiFetch(
      { method: "POST", path: `/v1/care/invites/${inviteId}/cancel` },
      CancelInviteResponseSchema,
    );
  },

  async endLink(linkId: string): Promise<EndLinkResponse> {
    return apiFetch(
      { method: "POST", path: `/v1/care/links/${linkId}/end` },
      EndLinkResponseSchema,
    );
  },
};

export type CareClient = typeof careClient;

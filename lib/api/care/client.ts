import {
  LinkListResponseSchema,
  type LinkListItem,
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
};

export type CareClient = typeof careClient;

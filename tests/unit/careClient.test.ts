import { beforeEach, describe, expect, it, vi } from "vitest";
import { careClient } from "@lib/api/care";
import { jsonResponse, resetStores } from "../helpers";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const INVITE_ID = "11111111-1111-4111-8111-111111111111";
const LINK_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "tok_abc123";

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
});

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return {
    url,
    init,
    body: init.body ? JSON.parse(init.body as string) : undefined,
  };
}

describe("careClient", () => {
  it("listLinks GETs /v1/care/links and returns links", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        links: [
          {
            linkId: LINK_ID,
            direction: "as-patient",
            counterpart: {
              userId: "33333333-3333-4333-8333-333333333333",
              displayName: "Caregiver A",
            },
            createdAt: "2026-11-26T00:00:00.000Z",
          },
        ],
      }),
    );
    const res = await careClient.listLinks();
    expect(res).toHaveLength(1);
    expect(res[0]!.linkId).toBe(LINK_ID);
    expect(lastCall().url).toBe("http://api.test/v1/care/links");
  });

  it("listInvites GETs /v1/care/invites", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        invites: [
          {
            inviteId: INVITE_ID,
            direction: "sent",
            counterpartyEmail: "c@c.co",
            expiresAt: "2026-12-03T00:00:00.000Z",
            createdAt: "2026-11-26T00:00:00.000Z",
          },
        ],
      }),
    );
    const res = await careClient.listInvites();
    expect(res).toHaveLength(1);
    expect(res[0]!.direction).toBe("sent");
    expect(lastCall().url).toBe("http://api.test/v1/care/invites");
  });

  it("createInvite POSTs caregiverEmail to /v1/care/links/invites", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        inviteId: INVITE_ID,
        caregiverEmail: "c@c.co",
        expiresAt: "2026-12-03T00:00:00.000Z",
        status: "pending",
      }),
    );
    const res = await careClient.createInvite({ caregiverEmail: "c@c.co" });
    expect(res.status).toBe("pending");
    const c = lastCall();
    expect(c.url).toBe("http://api.test/v1/care/links/invites");
    expect(c.init.method).toBe("POST");
    expect(c.body).toEqual({ caregiverEmail: "c@c.co" });
  });

  it("getInvitePreview GETs the public token route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        patientDisplayName: "Patient A",
        expiresAt: "2026-12-03T00:00:00.000Z",
      }),
    );
    const res = await careClient.getInvitePreview(TOKEN);
    expect(res.patientDisplayName).toBe("Patient A");
    expect(lastCall().url).toBe(`http://api.test/v1/care/invites/${TOKEN}`);
  });

  it("acceptInvite POSTs to the token accept route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(201, {
        linkId: LINK_ID,
        patientId: "44444444-4444-4444-8444-444444444444",
        caregiverId: "55555555-5555-4555-8555-555555555555",
        createdAt: "2026-11-26T00:00:00.000Z",
      }),
    );
    const res = await careClient.acceptInvite(TOKEN);
    expect(res.linkId).toBe(LINK_ID);
    const c = lastCall();
    expect(c.url).toBe(`http://api.test/v1/care/invites/${TOKEN}/accept`);
    expect(c.init.method).toBe("POST");
  });

  it("declineInvite POSTs to the token decline route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        inviteId: INVITE_ID,
        status: "declined",
      }),
    );
    const res = await careClient.declineInvite(TOKEN);
    expect(res.status).toBe("declined");
    expect(lastCall().url).toBe(
      `http://api.test/v1/care/invites/${TOKEN}/decline`,
    );
  });

  it("resendInvite POSTs to the invite id resend route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        inviteId: INVITE_ID,
        expiresAt: "2026-12-03T00:00:00.000Z",
      }),
    );
    const res = await careClient.resendInvite(INVITE_ID);
    expect(res.inviteId).toBe(INVITE_ID);
    const c = lastCall();
    expect(c.url).toBe(`http://api.test/v1/care/invites/${INVITE_ID}/resend`);
    expect(c.init.method).toBe("POST");
  });

  it("cancelInvite POSTs to the invite id cancel route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        inviteId: INVITE_ID,
        status: "cancelled",
      }),
    );
    const res = await careClient.cancelInvite(INVITE_ID);
    expect(res.status).toBe("cancelled");
    expect(lastCall().url).toBe(
      `http://api.test/v1/care/invites/${INVITE_ID}/cancel`,
    );
  });

  it("endLink POSTs to the link end route", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        linkId: LINK_ID,
        status: "ended",
        endedAt: "2026-11-26T00:00:00.000Z",
      }),
    );
    const res = await careClient.endLink(LINK_ID);
    expect(res.status).toBe("ended");
    const c = lastCall();
    expect(c.url).toBe(`http://api.test/v1/care/links/${LINK_ID}/end`);
    expect(c.init.method).toBe("POST");
  });
});

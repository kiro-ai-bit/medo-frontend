import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "@lib/state/query/queryClient";
import { useSessionStore } from "@lib/state/client/sessionStore";
import { resetStores, jsonResponse, errorEnvelope } from "../helpers";
import { LoginScreen } from "@features/auth/screens/LoginScreen";
import { SessionGuard, PublicOnly } from "@features/auth/guards";
import {
  peekPendingInvite,
  stashPendingInvite,
} from "@lib/state/client/inviteHandoff";

const replace = vi.fn();
const push = vi.fn();
let search = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace, push, prefetch: vi.fn() }),
  usePathname: () => "/today",
  useSearchParams: () => search,
}));

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const ME = {
  displayName: "Pat",
  timezone: "Asia/Karachi",
  role: "Patient" as const,
  email: "a@b.com",
  emailVerified: true,
};
const LOGIN_OK = {
  userId: "11111111-1111-4111-8111-111111111111",
  accessToken: "at-1",
  expiresAt: "2026-11-26T12:00:00.000Z",
};

function renderWithClient(ui: React.ReactElement) {
  return render(
    <QueryClientProvider client={makeQueryClient()}>{ui}</QueryClientProvider>,
  );
}

beforeEach(() => {
  resetStores();
  fetchMock.mockReset();
  replace.mockReset();
  push.mockReset();
  search = new URLSearchParams();
});

describe("LoginScreen", () => {
  it("successful login hydrates session and redirects to next", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, LOGIN_OK)) // login
      .mockResolvedValueOnce(jsonResponse(200, ME)); // getMe
    search = new URLSearchParams("next=/today");
    renderWithClient(<LoginScreen />);

    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/today"));
    const s = useSessionStore.getState();
    expect(s.status).toBe("authenticated");
    expect(s.accessToken).toBe("at-1");
    expect(s.me?.email).toBe("a@b.com");
  });

  it("resumes a stashed care invite when no next param", async () => {
    stashPendingInvite("invite_tok_1");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, LOGIN_OK))
      .mockResolvedValueOnce(jsonResponse(200, ME));
    renderWithClient(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/invite/invite_tok_1"),
    );
    expect(peekPendingInvite()).toBeNull();
  });

  it("explicit next wins over a stashed invite", async () => {
    stashPendingInvite("invite_tok_1");
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, LOGIN_OK))
      .mockResolvedValueOnce(jsonResponse(200, ME));
    search = new URLSearchParams("next=/today");
    renderWithClient(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/today"));
  });

  it("shows server error on bad credentials", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, errorEnvelope("UNAUTHORIZED", "Invalid credentials")),
    );
    renderWithClient(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "wrongpass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "Invalid credentials",
    );
    expect(useSessionStore.getState().status).toBe("anonymous");
  });

  it("shows cooldown countdown on 429", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(429, errorEnvelope("RATE_LIMITED", "slow down"), {
        "retry-after": "90",
      }),
    );
    renderWithClient(<LoginScreen />);
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "a@b.com" },
    });
    fireEvent.change(screen.getByLabelText("Password"), {
      target: { value: "password123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText(/try again in 2 min/i)).toBeTruthy();
  });
});

describe("guards", () => {
  it("PublicOnly redirects authenticated users away", () => {
    useSessionStore.setState({ status: "authenticated", me: ME });
    renderWithClient(
      <PublicOnly>
        <div>public</div>
      </PublicOnly>,
    );
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("SessionGuard redirects anonymous to login with next param", () => {
    renderWithClient(
      <SessionGuard>
        <div>secret</div>
      </SessionGuard>,
    );
    expect(replace).toHaveBeenCalledWith("/login?next=%2Ftoday");
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("SessionGuard renders children for verified session", () => {
    useSessionStore.setState({ status: "authenticated", me: ME });
    renderWithClient(
      <SessionGuard>
        <div>secret</div>
      </SessionGuard>,
    );
    expect(screen.getByText("secret")).toBeTruthy();
  });

  it("SessionGuard shows interstitial for unverified email", () => {
    useSessionStore.setState({
      status: "authenticated",
      me: { ...ME, emailVerified: false },
    });
    renderWithClient(
      <SessionGuard>
        <div>secret</div>
      </SessionGuard>,
    );
    expect(screen.getByText("Verify your email")).toBeTruthy();
    expect(screen.queryByText("secret")).toBeNull();
  });

  it("SessionGuard shows no-access for wrong role", () => {
    useSessionStore.setState({
      status: "authenticated",
      me: { ...ME, role: "Caregiver" },
    });
    renderWithClient(
      <SessionGuard allowedRoles={["Patient"]}>
        <div>secret</div>
      </SessionGuard>,
    );
    expect(screen.getByText("No access")).toBeTruthy();
  });
});

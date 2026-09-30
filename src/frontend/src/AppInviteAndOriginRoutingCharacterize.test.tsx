import "@testing-library/jest-dom/vitest";
import {
  type FamilyInvitationPreview,
  InvitationStatus,
  InvitationType,
  type PersonProfile,
  type ProfileClaim,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { saveInviteToken, saveOriginatingView } from "./lib/originatingView";

// ---------------------------------------------------------------------------
// Characterization baseline for the App-level routing that the upcoming change
// must NOT disturb.
//
// The upcoming change intentionally alters the App.tsx LIFECYCLE around the
// saved invite origin (today it clears the saved origin unconditionally on
// mount; the new lifecycle keeps it until it is actually restored), what a
// malformed invite path renders, and whether the raw token is removed from the
// browser URL. None of those are frozen here.
//
// What this file protects is the EXISTING App-level routing contract the change
// must leave intact:
//
//   A. A canonical `/invite/<raw-token>` path mounts the invite view (the
//      Phase 1C-2 invitation redemption flow), not Home.
//   B. A persisted invite token resumes the invite view after authentication,
//      so a signed-out visitor who started sign-in from an invite link is
//      returned to the invitation.
//   C. A saved `{ view: "add-myself" }` originating view is restored after
//      authentication — the Add Myself flow the requirement names explicitly.
//   D. A saved `{ view: "profile", profileId }` originating view restores the
//      profile view for that exact person (not the default person), which the
//      ClaimButton / Add Myself auto-submit effects depend on.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract; it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  getAuthenticated,
  setRedemptionState,
  setPreview,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let redemptionState: unknown = {
    __kind__: "InvalidToken",
    InvalidToken: null,
  };
  let preview: unknown = { __kind__: "err", err: "InvalidToken" };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async validateFamilyInvitationToken(_rawToken: string): Promise<unknown> {
      return preview;
    },
    async getInvitationRedemptionState(_rawToken: string): Promise<unknown> {
      return { __kind__: "ok", ok: redemptionState };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      redemptionState = { __kind__: "InvalidToken", InvalidToken: null };
      preview = { __kind__: "err", err: "InvalidToken" };
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    getAuthenticated: () => isAuthenticated,
    setRedemptionState: (state: unknown) => {
      redemptionState = state;
    },
    setPreview: (value: unknown) => {
      preview = value;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(OWNER) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
  // jsdom keeps the URL across tests; reset to the default route so a previous
  // test's invite path cannot leak into the next render.
  window.history.replaceState({}, "", "/");
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function makePreview(
  overrides: Partial<FamilyInvitationPreview> = {},
): FamilyInvitationPreview {
  return {
    invitationId: 1n,
    familyId: "norwood",
    familyDisplayName: "Norwood",
    targetPersonId: "clayton",
    targetDisplayName: "Clayton Norwood",
    invitationType: InvitationType.FamilyMember,
    status: InvitationStatus.Pending,
    expiresAt: 1_800_000_000_000_000_000n,
    ...overrides,
  };
}

describe("App invite routing is unchanged (characterization)", () => {
  it("mounts the invite view for a canonical /invite/<token> path", async () => {
    window.history.replaceState({}, "", "/invite/tok-abc");
    setPreview({ __kind__: "ok", ok: makePreview() });

    renderApp();

    // The invite surface renders (not Home), showing the safe signed-out
    // preview and the sign-in gate.
    expect(await screen.findByTestId("invite.page")).toBeInTheDocument();
    expect(
      await screen.findByText(/You’re invited to Norwood/),
    ).toBeInTheDocument();
    expect(screen.getByTestId("invite.signin_gate")).toBeInTheDocument();
  });

  it("resumes the invite view from a persisted token after authentication", async () => {
    // A signed-out visitor started sign-in from an invite link, so the raw
    // token was persisted through the short-lived session mechanism.
    saveInviteToken("tok-resume");
    setAuthenticated(true);
    setRedemptionState({ __kind__: "Valid", Valid: makePreview() });

    renderApp();

    // The app returns to the invitation and offers the accept affordance.
    expect(await screen.findByTestId("invite.page")).toBeInTheDocument();
    expect(
      await screen.findByTestId("invite.accept_button"),
    ).toBeInTheDocument();
  });
});

describe("App originating-view restore is unchanged (characterization)", () => {
  it("restores the Add Myself view from a saved origin after authentication", async () => {
    saveOriginatingView({ view: "add-myself" });
    setAuthenticated(true);

    renderApp();

    // The Add Myself flow is restored, not Home.
    expect(
      await screen.findByTestId("add_myself.name_step"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Myself to This Family")).toBeInTheDocument();
  });

  it("restores the profile view for the saved profileId after authentication", async () => {
    // A profile origin carries the exact person id the user was viewing.
    saveOriginatingView({ view: "profile", profileId: "clayton" });
    setAuthenticated(true);

    renderApp();

    // The profile view for the saved person renders (not the default person).
    expect(
      await screen.findByTestId("profile.back_button"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Clayton Norwood" }),
    ).toBeInTheDocument();
  });
});

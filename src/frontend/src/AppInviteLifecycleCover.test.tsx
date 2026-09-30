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
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  loadInviteToken,
  saveInviteToken,
  saveOriginatingView,
} from "./lib/originatingView";

// ---------------------------------------------------------------------------
// Cover for the accepted App.tsx invite-origin lifecycle change.
//
// The accepted change:
//
//   1. App mount alone never clears the saved invite origin. A signed-out
//      visitor who started sign-in from an invite link keeps the pending
//      invitation until authentication resumes it.
//   2. The saved origin is cleared only after an authenticated restore has
//      actually been applied (or is determined unrestorable).
//   3. Any pathname beginning with the invite route that fails canonical
//      parsing renders the Invite Redemption invalid-link state and never falls
//      through to Home.
//   4. On invitation consumption or abandonment the session-stored raw token is
//      cleared and the raw token is removed from the browser URL via
//      history.replaceState.
//   5. Existing Add Myself / profile originating-view behavior is unchanged.
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
    async declineFamilyInvitation(_rawToken: string): Promise<unknown> {
      return { __kind__: "ok", ok: null };
    },
    async acceptFamilyInvitation(_rawToken: string): Promise<unknown> {
      return { __kind__: "ok", ok: null };
    },
    async getMyMembershipForFamily(_familyId: string): Promise<unknown> {
      return { __kind__: "ok", ok: null };
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

describe("saved invite origin survives mount and auth initialization (cover)", () => {
  it("does not clear the saved invite origin on a signed-out mount", async () => {
    saveInviteToken("tok-pending");
    setAuthenticated(false);

    renderApp();

    // The invite view renders from the persisted token...
    expect(await screen.findByTestId("invite.page")).toBeInTheDocument();
    // ...and the saved origin is still there for the post-auth resume.
    expect(loadInviteToken()).toBe("tok-pending");
  });

  it("keeps the saved invite origin available when authentication completes", async () => {
    saveInviteToken("tok-resume");
    setAuthenticated(true);
    setRedemptionState({ __kind__: "Valid", Valid: makePreview() });

    renderApp();

    // The invitation resumes and offers the accept affordance.
    expect(
      await screen.findByTestId("invite.accept_button"),
    ).toBeInTheDocument();
  });

  it("clears the saved origin only after the authenticated restore is applied", async () => {
    saveOriginatingView({ view: "add-myself" });
    setAuthenticated(true);

    renderApp();

    // The Add Myself flow is restored...
    expect(
      await screen.findByTestId("add_myself.name_step"),
    ).toBeInTheDocument();
    // ...and only then is the saved origin cleared.
    await waitFor(() =>
      expect(sessionStorage.getItem("app.originatingView.v1")).toBeNull(),
    );
  });
});

describe("malformed invite paths render the invalid-link state (cover)", () => {
  for (const pathname of [
    "/invite",
    "/invite/",
    "/invite/tok-abc/extra",
    "/invite/%E0%A4%A",
  ]) {
    it(`renders the invite invalid-link state for ${pathname} and never Home`, async () => {
      window.history.replaceState({}, "", pathname);

      renderApp();

      // The invite surface renders its invalid-link state, not Home.
      expect(
        await screen.findByTestId("invite.invalid_state"),
      ).toBeInTheDocument();
      // Home's navigation is absent.
      expect(
        screen.queryByRole("navigation", { name: "Family history sections" }),
      ).toBeNull();
    });
  }

  it("still mounts the invite view for a canonical /invite/<token> path", async () => {
    window.history.replaceState({}, "", "/invite/tok-abc");
    setPreview({ __kind__: "ok", ok: makePreview() });

    renderApp();

    expect(await screen.findByTestId("invite.page")).toBeInTheDocument();
    // The signed-out preview resolves and the sign-in gate renders.
    expect(await screen.findByTestId("invite.signin_gate")).toBeInTheDocument();
  });
});

describe("consumption clears the token from session storage and the URL (cover)", () => {
  it("clears the session token and replaces the URL on decline", async () => {
    window.history.replaceState({}, "", "/invite/tok-consume");
    saveInviteToken("tok-consume");
    setAuthenticated(true);
    setRedemptionState({ __kind__: "Valid", Valid: makePreview() });

    renderApp();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.decline_button"));

    // The app returns Home only after consumption runs...
    expect(
      await screen.findByRole("navigation", {
        name: "Family history sections",
      }),
    ).toBeInTheDocument();
    // ...the raw token is gone from session storage...
    expect(loadInviteToken()).toBeNull();
    // ...and from the browser URL.
    expect(window.location.pathname).toBe("/");
  });

  it("clears the session token and replaces the URL when the user leaves a terminal state", async () => {
    window.history.replaceState({}, "", "/invite/tok-terminal");
    saveInviteToken("tok-terminal");
    setAuthenticated(true);
    setRedemptionState({ __kind__: "AlreadyAccepted", AlreadyAccepted: null });

    renderApp();

    expect(await screen.findByTestId("invite.page")).toBeInTheDocument();
    expect(
      await screen.findByTestId("invite.already_accepted_state"),
    ).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("invite.continue_button"));

    // The app returns Home only after consumption runs...
    expect(
      await screen.findByRole("navigation", {
        name: "Family history sections",
      }),
    ).toBeInTheDocument();
    // ...the raw token is gone from session storage...
    expect(loadInviteToken()).toBeNull();
    // ...and from the browser URL.
    expect(window.location.pathname).toBe("/");
  });
});

describe("existing Add Myself / profile originating-view behavior is unchanged (cover)", () => {
  it("restores the Add Myself view from a saved origin after authentication", async () => {
    saveOriginatingView({ view: "add-myself" });
    setAuthenticated(true);

    renderApp();

    expect(
      await screen.findByTestId("add_myself.name_step"),
    ).toBeInTheDocument();
    expect(screen.getByText("Add Myself to This Family")).toBeInTheDocument();
  });

  it("restores the profile view for the saved profileId after authentication", async () => {
    saveOriginatingView({ view: "profile", profileId: "clayton" });
    setAuthenticated(true);

    renderApp();

    expect(
      await screen.findByTestId("profile.back_button"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("heading", { name: "Clayton Norwood" }),
    ).toBeInTheDocument();
  });
});

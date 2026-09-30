import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
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
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// ---------------------------------------------------------------------------
// Characterization baseline for the ADJACENT working behavior that the
// membership-confirmation UI change must NOT disturb.
//
// The requested change adds a confirmation request card for an eligible Active
// family member and an applicant-safe status card for a Pending member inside
// the existing limited onboarding state. Those surfaces do not exist yet, so
// this file deliberately does NOT characterize them.
//
// What it protects is the existing behavior the acceptance criteria name as
// unchanged, at the App level where the new confirmation surface will be wired:
//
//   A. The default route renders the full Norwood home page — brand, the
//      "Family history sections" nav, and the hero — and never a blank screen,
//      for both a signed-out visitor and a signed-in caller.
//   B. A signed-in caller whose own profile claim is still Pending (Unclaimed)
//      is NOT an approved family member: the approved-member-only Message Board
//      nav link is absent, and the family graph stays behind the "Family only"
//      gate. A confirmation surface must not accidentally grant a Pending
//      member normal family navigation.
//   C. An approved (Claimed) member still sees the Message Board link and the
//      full Explore Family graph — the positive control for B.
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
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  setMyProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let myProfile: PersonProfile | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async isCallerSteward(): Promise<boolean> {
      return false;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
    async listConfirmedRelationships(): Promise<unknown[]> {
      return [];
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      myProfile = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    setMyProfile: (profile: PersonProfile | null) => {
      myProfile = profile;
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
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
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
  // test's path cannot leak into the next render.
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

function makeProfile(overrides: Partial<PersonProfile> = {}): PersonProfile {
  return {
    familyId: "norwood",
    personId: "clayton",
    name: "Clayton Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
    ...overrides,
  };
}

describe("default route renders the Norwood home page, never a blank screen (characterization)", () => {
  it("renders the brand, hero, and nav for a signed-out visitor", () => {
    renderApp();

    // The default route is Home: the brand wordmark, the hero logo, and the
    // Home nav section are all present.
    expect(screen.getByText("Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toBeInTheDocument();
    const nav = screen.getByRole("navigation", {
      name: "Family history sections",
    });
    expect(within(nav).getAllByRole("button")).toHaveLength(8);
  });

  it("renders the brand, hero, and nav for a signed-in caller", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    setMyProfile(makeProfile({ claimStatus: ClaimStatus.Claimed }));

    renderApp();

    // The signed-in default route still renders Home, not a blank screen.
    expect(screen.getByText("Norwood")).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Family history sections" }),
    ).toBeInTheDocument();
    // The authenticated controls resolve alongside the public nav.
    expect(
      await screen.findByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
  });
});

describe("a Pending member does not receive normal family navigation (characterization)", () => {
  it("hides the approved-member Message Board link for a Pending (Unclaimed) caller", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    // The caller's own profile claim is still Pending (Unclaimed), so they are
    // not an approved family member.
    setMyProfile(makeProfile({ claimStatus: ClaimStatus.Unclaimed }));

    renderApp();

    // The navbar resolves (the profile control appears)...
    await screen.findByRole("button", { name: "Sign out" });
    // ...but the approved-member-only Message Board link is absent.
    expect(
      screen.queryByRole("button", { name: "Message Board" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the family graph behind the Family only gate for a Pending caller", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    setMyProfile(makeProfile({ claimStatus: ClaimStatus.Unclaimed }));
    const user = userEvent.setup();

    renderApp();

    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );

    // The family graph is private to approved members; a Pending caller sees
    // the no-access state instead.
    expect(screen.getByTestId("family_access.no_access")).toBeInTheDocument();
    expect(screen.getByText("Family only")).toBeInTheDocument();
  });
});

describe("an approved member still receives normal family navigation (characterization)", () => {
  it("shows the Message Board link and the full Explore Family graph for a Claimed caller", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    setMyProfile(
      makeProfile({
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(OWNER),
      }),
    );
    const user = userEvent.setup();

    renderApp();

    // The approved member sees the Message Board nav link.
    expect(
      await screen.findByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();

    // And the family graph renders (not the no-access gate).
    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );
    expect(screen.queryByTestId("family_access.no_access")).toBeNull();
    expect(screen.getByText("Julia “Julie” Norwood")).toBeInTheDocument();
  });
});

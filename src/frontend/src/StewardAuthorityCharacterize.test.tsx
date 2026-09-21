import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  type RelationshipRequest,
  type Report,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { FamilyStewardHubPage } from "./pages/FamilyStewardHubPage";

// ---------------------------------------------------------------------------
// Characterization baseline for the Family Steward authority change.
//
// The change replaces the generic platform-admin check (isCallerAdmin) with a
// canonical "is the caller an active Norwood Family Steward?" check, and adds a
// one-time "Claim Family Steward" action. The MECHANISM of the gate is exactly
// what changes, so this file deliberately does NOT freeze which backend method
// the frontend calls.
//
// What it protects is the observable authorization outcome that must survive
// the repoint, plus the adjacent features the change must not break:
//
//   1. An unauthenticated caller sees no "Family Steward" navigation entry.
//   2. A signed-in non-Steward sees no "Family Steward" navigation entry, and a
//      direct render of the Steward hub shows the unauthorized state.
//   3. A signed-in Steward sees the "Family Steward" navigation entry and the
//      hub renders its options.
//   4. Add Myself remains available to a signed-in non-Steward (the onboarding
//      path is unchanged by the authority change).
//   5. An approved claimed member still sees the Message Board entry and the
//      "Add Family" label (approved-family access is unchanged).
//
// The actor mock exposes BOTH `isCallerAdmin` and `isSteward`, driven by one
// flag, so the same assertions hold before the repoint (gate reads
// isCallerAdmin) and after it (gate reads the canonical Steward check). This is
// component/integration coverage over a typed local actor mock; it does not
// exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD_ACCOUNT = "ryjl3-tyaaa-aaaaa-aaaba-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setSteward,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  setMyProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isSteward = false;
  let currentPrincipal = "aaaaa-aa";
  let myProfile: PersonProfile | null = null;

  const mockActor = {
    // The legacy platform-admin check and the canonical Steward check both
    // report the same authority flag, so the assertions below are independent
    // of which one the production gate consults.
    async isCallerAdmin(): Promise<boolean> {
      return isSteward;
    },
    // The canonical Steward authority check the production gate now consults.
    async isCallerSteward(): Promise<boolean> {
      return isSteward;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async isSteward(): Promise<boolean> {
      return isSteward;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    // Steward hub data sources. Empty is the correct empty-state read.
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listPendingArchiveItems() {
      return [];
    },
    async getReviewQueue() {
      return {
        pending: 0n,
        needsResearch: 0n,
        conflicting: 0n,
      };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isSteward = false;
      currentPrincipal = "aaaaa-aa";
      myProfile = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setSteward: (v: boolean) => {
      isSteward = v;
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
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

function renderStewardHub() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <FamilyStewardHubPage
        onBack={() => {}}
        onOpenReview={() => {}}
        onOpenPendingContributions={() => {}}
        onOpenGovernance={() => {}}
        onOpenResearchIntake={() => {}}
        onOpenHiddenPosts={() => {}}
      />
    </QueryClientProvider>,
  );
}

function claimedProfile(): PersonProfile {
  return {
    familyId: "norwood",
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
    preferredName: "Waxx Minty",
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
}

const STEWARD_LABEL = "Family Steward";

describe("Family Steward authority characterization", () => {
  it("hides the Family Steward navigation entry from an unauthenticated caller", () => {
    setAuthenticated(false);
    setSteward(false);
    renderApp();

    expect(
      screen.queryByRole("button", { name: STEWARD_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("hides the Family Steward navigation entry from a signed-in non-Steward", () => {
    setAuthenticated(true);
    setSteward(false);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    expect(
      screen.queryByRole("button", { name: STEWARD_LABEL }),
    ).not.toBeInTheDocument();
  });

  it("shows the Family Steward navigation entry to a signed-in Steward", async () => {
    setAuthenticated(true);
    setSteward(true);
    setCurrentPrincipal(STEWARD_ACCOUNT);
    renderApp();

    expect(
      await screen.findByRole("button", { name: STEWARD_LABEL }),
    ).toBeInTheDocument();
  });

  it("renders the Steward hub unauthorized state for a signed-in non-Steward", async () => {
    setAuthenticated(true);
    setSteward(false);
    setCurrentPrincipal(ACCOUNT);
    renderStewardHub();

    expect(
      await screen.findByTestId("steward_hub.unauthorized_state"),
    ).toBeInTheDocument();
    expect(screen.queryByTestId("steward_hub.grid")).not.toBeInTheDocument();
  });

  it("renders the Steward hub options for a signed-in Steward", async () => {
    setAuthenticated(true);
    setSteward(true);
    setCurrentPrincipal(STEWARD_ACCOUNT);
    renderStewardHub();

    expect(await screen.findByTestId("steward_hub.grid")).toBeInTheDocument();
    expect(
      screen.queryByTestId("steward_hub.unauthorized_state"),
    ).not.toBeInTheDocument();
  });

  it("keeps Add Myself available to a signed-in non-Steward", async () => {
    setAuthenticated(true);
    setSteward(false);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    expect(
      await screen.findByRole("button", { name: "Add Myself" }),
    ).toBeInTheDocument();
  });

  it("keeps approved-family access (Message Board and Add Family) for a claimed member", async () => {
    setMyProfile(claimedProfile());
    setAuthenticated(true);
    setSteward(false);
    setCurrentPrincipal(ACCOUNT);
    renderApp();

    expect(
      await screen.findByRole("button", { name: "Add Family" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: STEWARD_LABEL }),
    ).not.toBeInTheDocument();
  });
});

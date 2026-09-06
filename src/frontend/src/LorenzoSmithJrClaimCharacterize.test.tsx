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

// Characterization baseline for the canonical Lorenzo Smith Jr. claim flow.
// The build reconciles the canonical `lorenzoSmithJr` personId across the
// backend profile, the frontend graph, the claim flow, My Profile, and
// PersonCard routing. These tests freeze the working behavior that must NOT
// change:
//
//  1. The profile page for the canonical Lorenzo Smith Jr. record shows PENDING
//     CLAIM status when the signed-in user has a pending claim on it, and hides
//     the UNCLAIMED badge and the 'This is Me' claim action.
//  2. "My Profile" opens the canonical Person Profile being claimed when the
//     signed-in account has a pending claim on it.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam. The mock records which backend methods
// the flows invoke so the tests can assert observable behavior (a pending claim
// surfaces PENDING CLAIM on the profile page, and getMyProfile resolves the
// canonical profile being claimed for the "My Profile" view).
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  seedClaim,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      // Mirrors the real backend's getMyProfile: a profile with a pending claim
      // by the caller is returned as the caller's own profile.
      for (const claim of claims) {
        if (
          claim.requestingUserId.toString() === currentPrincipal &&
          claim.status === "Pending"
        ) {
          const profile = profiles[claim.personId];
          if (profile) return profile;
        }
      }
      return null;
    },
    async getMyProfileClaim(personId: string): Promise<ProfileClaim | null> {
      return (
        claims.find(
          (c) =>
            c.personId === personId &&
            c.requestingUserId.toString() === currentPrincipal,
        ) ?? null
      );
    },
    async getMyRelationshipRequests(): Promise<never[]> {
      return [];
    },
    async listConfirmedRelationships(): Promise<never[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      claims = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    seedClaim: (claim: ProfileClaim) => {
      claims = [...claims, claim];
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

function seedLivingUnclaimed(personId: string, name: string): PersonProfile {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  return profile;
}

function seedPendingClaim(personId: string, account: string) {
  seedClaim({
    id: 1n,
    personId,
    requestingUserId: Principal.fromText(account),
    status: "Pending",
    submittedDate: 1_700_000_000_000_000_000n,
  });
}

describe("Canonical Lorenzo Smith Jr. profile shows PENDING CLAIM while a claim is pending", () => {
  it("shows 'Profile claim pending' and hides UNCLAIMED and 'This is Me' for the canonical profile", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The canonical Lorenzo Smith Jr. profile exists in the backend and the
    // signed-in account has a pending claim on it.
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedPendingClaim("lorenzoSmithJr", ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    // Navigate to the canonical Lorenzo Smith Jr. profile via Add Myself's
    // "This is Me" on the existing match (the graph-only node resolves from the
    // backend by personId).
    await user.click(screen.getByRole("button", { name: "Add Myself" }));
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Lorenzo Smith Jr",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // The canonical profile page renders.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );

    // PENDING CLAIM status is shown for the signed-in user's pending claim:
    // the "Pending claim" badge plus the Family Steward review message.
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Pending claim"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "Your claim to this profile is awaiting Family Steward review.",
      ),
    ).toBeInTheDocument();

    // The UNCLAIMED badge and the 'This is Me' claim action are hidden.
    expect(
      within(claimSection).queryByText("Unclaimed"),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });
});

describe("My Profile opens the canonical Person Profile being claimed", () => {
  it("opens the canonical Lorenzo Smith Jr. profile when the account has a pending claim on it", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The canonical Lorenzo Smith Jr. profile exists and the signed-in account
    // has a pending claim on it, so getMyProfile resolves it as the caller's
    // own profile.
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedPendingClaim("lorenzoSmithJr", ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    // Open "My Profile" from the navbar.
    await user.click(screen.getByTestId("layout.my_profile_link"));

    // My Profile opens the canonical Person Profile being claimed.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Pending claim"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "Your claim to this profile is awaiting Family Steward review.",
      ),
    ).toBeInTheDocument();
  });
});

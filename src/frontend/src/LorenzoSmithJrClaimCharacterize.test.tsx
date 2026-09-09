import "@testing-library/jest-dom/vitest";
import {
  ClaimError,
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
//  1. The profile page for the canonical Lorenzo Smith Jr. record shows CLAIMED
//     status when the signed-in user is the restored owner, and hides the
//     UNCLAIMED badge, the 'This is Me' claim action, and the 'Pending claim'
//     badge (no re-claim required).
//  2. "My Profile" opens the canonical Person Profile owned by the caller when
//     the signed-in account owns it.
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
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      // Mirrors the real backend's getMyProfile: a profile claimed by the
      // caller is returned as the caller's own profile.
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      return owned ?? null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      // The restored owner has no pending claim; the profile is already CLAIMED.
      return null;
    },
    async requestProfileClaim(
      personId: string,
    ): Promise<
      { __kind__: "ok"; ok: ProfileClaim } | { __kind__: "err"; err: string }
    > {
      // The canonical profile is already CLAIMED by the signed-in account, so
      // the backend correctly refuses to create a duplicate claim and reports
      // AlreadyClaimed. The frontend routes to My Profile (the owned profile)
      // instead of creating another claim.
      const profile = profiles[personId];
      if (profile?.claimStatus === ClaimStatus.Claimed) {
        return { __kind__: "err", err: ClaimError.AlreadyClaimed };
      }
      return { __kind__: "err", err: "ProfileNotFound" };
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

function seedClaimedProfile(personId: string, name: string): PersonProfile {
  const profile: PersonProfile = {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
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

describe("Canonical Lorenzo Smith Jr. profile shows CLAIMED for the restored owner", () => {
  it("shows 'Claimed' with the owner edit entry and hides UNCLAIMED and 'This is Me' for the canonical profile", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The canonical Lorenzo Smith Jr. profile exists in the backend and is
    // already CLAIMED by the signed-in account (the restored approved claim).
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.");
    const user = userEvent.setup();
    renderApp();

    // Navigate to the canonical Lorenzo Smith Jr. profile via Add Myself's
    // "This is Me" on the existing match. The profile is already CLAIMED by the
    // signed-in account, so the backend reports AlreadyClaimed and the corrected
    // claim flow routes to My Profile (the owned canonical profile) instead of
    // creating a duplicate claim.
    await user.click(screen.getByRole("button", { name: "Add Myself" }));
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Lorenzo Smith Jr",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // The canonical profile page renders (via My Profile routing).
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );

    // CLAIMED status is shown for the restored owner: the "Claimed" badge plus
    // the owner edit entry. The user is not asked to claim again.
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Claimed"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByRole("button", { name: "Edit My Profile" }),
    ).toBeInTheDocument();

    // The UNCLAIMED badge, the 'This is Me' claim action, and the 'Pending
    // claim' badge are all hidden.
    expect(
      within(claimSection).queryByText("Unclaimed"),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByText("Pending claim"),
    ).not.toBeInTheDocument();
  });
});

describe("My Profile opens the canonical Person Profile owned by the caller", () => {
  it("opens the canonical Lorenzo Smith Jr. profile when the account owns it", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The canonical Lorenzo Smith Jr. profile exists and is CLAIMED by the
    // signed-in account, so getMyProfile resolves it as the caller's own
    // profile.
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.");
    const user = userEvent.setup();
    renderApp();

    // Open "My Profile" from the navbar.
    await user.click(screen.getByTestId("layout.my_profile_link"));

    // My Profile opens the canonical Person Profile owned by the caller.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Claimed"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "You own this profile. You can edit your personal details.",
      ),
    ).toBeInTheDocument();
    expect(
      within(claimSection).queryByText("Pending claim"),
    ).not.toBeInTheDocument();
  });
});

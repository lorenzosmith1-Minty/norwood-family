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
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the profile-claim navigation and sign-out
// behavior that the upcoming "This is Me" claim-persistence change must NOT
// break.
//
// The build fixes the claim flow so a signed-in user's "This is Me" persists a
// PENDING claim durably and only navigates to the profile after the backend
// confirms persistence. That is the behavior being changed, so it is NOT frozen
// here. What IS frozen is the adjacent working behavior the change must leave
// intact:
//
//  1. Sign-out hides the account/private controls (account identity, My
//     Profile, Sign out) while keeping the public family content (Explore
//     Family, Heritage Branch, Family Archive, Add Myself, Notifications)
//     visible, and shows Sign in. (The admin/steward controls are gated by the
//     async useIsAdmin query, so their sign-out reset is not asserted here.)
//  2. "My Profile" routes by claim state: an approved (claimed) profile opens
//     the owned profile, a pending claim opens the same profile in its pending
//     state, and no claim routes to the Add Myself flow.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam whose `clear` actually signs the caller
// out (so the sign-out journey can be observed end to end).
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  getAuthenticated,
  setCurrentPrincipal,
  getCurrentPrincipal,
  seedProfile,
  seedClaim,
  setMyProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let myProfile: PersonProfile | null = null;

  const principal = () => Principal.fromText(currentPrincipal);

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
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
    async requestProfileClaim(
      personId: string,
    ): Promise<
      { __kind__: "ok"; ok: ProfileClaim } | { __kind__: "err"; err: string }
    > {
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      const claim: ProfileClaim = {
        id: 1n,
        personId,
        requestingUserId: principal(),
        status: "Pending",
        submittedDate: 1_700_000_000_000_000_000n,
      };
      claims = [claim];
      return { __kind__: "ok", ok: claim };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      claims = [];
      myProfile = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    getAuthenticated: () => isAuthenticated,
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    seedClaim: (claim: ProfileClaim) => {
      claims = [claim];
    },
    setMyProfile: (profile: PersonProfile | null) => {
      myProfile = profile;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => {
    // A stateful auth seam: the initial authenticated state comes from the
    // hoisted flag (set by the test before render), and `clear` actually signs
    // the caller out by flipping local React state, so the sign-out journey
    // re-renders the navbar exactly as the real provider does.
    const [isAuth, setIsAuth] = useState(getAuthenticated());
    return {
      isAuthenticated: isAuth,
      login: () => {},
      clear: () => setIsAuth(false),
      identity: isAuth
        ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
        : null,
      isInitializing: false,
      isLoggingIn: false,
      isLoginError: false,
      loginError: null,
    };
  },
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

const PUBLIC_NAV = [
  "Explore Family",
  "Heritage Branch",
  "Family Archive",
  "Add Myself",
  "Notifications",
];

// The account/private controls that must hide on sign-out. The admin/steward
// controls are gated by the async useIsAdmin query (cached in the QueryClient),
// so their sign-out reset is not asserted here.
const PRIVATE_CONTROLS = [
  "layout.account_identity",
  "layout.my_profile_link",
  "layout.sign_out_button",
];

describe("Sign-out hides account/steward/private controls while keeping public family content", () => {
  it("hides account and private controls on sign-out but keeps the public nav", async () => {
    // A signed-in caller sees the account identity, My Profile, and Sign out.
    setAuthenticated(true);
    setCurrentPrincipal(STEWARD);
    const user = userEvent.setup();
    renderApp();

    for (const ocid of PRIVATE_CONTROLS) {
      expect(await screen.findByTestId(ocid)).toBeInTheDocument();
    }
    for (const label of PUBLIC_NAV) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole("button", { name: "Sign in" }),
    ).not.toBeInTheDocument();

    // Sign out.
    await user.click(screen.getByTestId("layout.sign_out_button"));

    // The account/private controls are hidden.
    for (const ocid of PRIVATE_CONTROLS) {
      expect(screen.queryByTestId(ocid)).not.toBeInTheDocument();
    }
    // Sign in is shown.
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    // The public family content remains.
    for (const label of PUBLIC_NAV) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});

describe("My Profile routes by claim state", () => {
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

  it("opens the owned profile when the account has an approved (claimed) profile", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    seedClaimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr.");
    setMyProfile({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Claimed,
      claimedByUserId: Principal.fromText(ACCOUNT),
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId("layout.my_profile_link"));

    // My Profile opens the owned canonical profile in its Claimed state.
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
  });

  it("opens the same profile in its pending state when the account has a pending claim", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    seedProfile({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    // The account has a pending claim on the canonical profile, so getMyProfile
    // resolves it as the caller's own pending profile.
    seedClaim({
      id: 1n,
      personId: "lorenzoSmithJr",
      requestingUserId: Principal.fromText(ACCOUNT),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    setMyProfile({
      personId: "lorenzoSmithJr",
      name: "Lorenzo Smith Jr.",
      livingStatus: LivingStatus.Living,
      claimStatus: ClaimStatus.Unclaimed,
      claimedByUserId: undefined,
      preferredName: undefined,
      story: undefined,
      occupation: undefined,
      birthInfo: undefined,
      timeline: undefined,
      privacySettings: undefined,
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId("layout.my_profile_link"));

    // My Profile opens the same canonical profile showing the pending claim.
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

  it("routes to Add Myself when the account has no connected profile", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // No profile is connected.
    setMyProfile(null);
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByTestId("layout.my_profile_link"));

    // With no claim/profile, My Profile routes to the Add Myself flow.
    expect(
      await screen.findByTestId("add_myself.name_input"),
    ).toBeInTheDocument();
  });
});

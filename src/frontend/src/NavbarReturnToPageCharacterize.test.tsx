import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the return-to-page behavior after sign-in that
// the authenticated-navbar hydration change must NOT break.
//
// The upcoming build changes the navbar so that while account/profile/claim/
// steward state is still loading it shows a neutral loading/skeleton state
// instead of rendering permission-dependent navigation from incomplete state.
// That is the behavior being changed, so the DURING-hydration flash (Add Myself
// showing for an approved owner, Message Board / Family Steward disappearing)
// is deliberately NOT frozen here.
//
// What IS frozen is the return-to-page journey that must survive the change:
//
//  1. A signed-out caller on the Family History hub who starts a sign-in has
//     the originating view persisted, and once sign-in completes the app
//     returns to Family History (not Home).
//  2. After that sign-in completes, the authenticated navbar renders the
//     resolved controls for the caller's claim state (Add Family for an
//     approved owner, Message Board for an approved member) alongside the
//     public nav links.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam. getMyProfile resolves the profile owned
// by the signed-in caller, exactly as the real backend does for an
// approved/claimed profile. The sign-in completion is simulated by flipping the
// authenticated flag and remounting the app, matching the full-page auth
// redirect that the real provider performs.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  getAuthenticated,
  setCurrentPrincipal,
  getCurrentPrincipal,
  seedProfile,
  setMyProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let myProfile: PersonProfile | null = null;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      myProfile = null;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    getAuthenticated: () => isAuthenticated,
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
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

function seedClaimedWaxxMinty(): PersonProfile {
  const profile: PersonProfile = {
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
    preferredName: "Waxx Minty",
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  setMyProfile(profile);
  return profile;
}

const PUBLIC_NAV = [
  "Explore Family",
  "Heritage Branch",
  "Family Archive",
  "Family History",
  "Notifications",
];

describe("Return-to-page after sign-in preserves the originating view", () => {
  it("returns to Family History after sign-in completes, with the resolved authenticated navbar", async () => {
    // The caller owns an approved/claimed profile, so once signed in the
    // resolved navbar shows Add Family and Message Board.
    seedClaimedWaxxMinty();
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    // A signed-out caller opens the Family History hub.
    await user.click(
      await screen.findByRole("button", { name: "Family History" }),
    );
    expect(
      await screen.findByRole("heading", { name: "Family History" }),
    ).toBeInTheDocument();

    // Starting a sign-in persists the originating view (family-history).
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(
      JSON.parse(sessionStorage.getItem("app.originatingView.v1") ?? "{}"),
    ).toEqual({ view: "family-history" });

    // Sign-in completes: the auth redirect remounts the app as authenticated.
    setAuthenticated(true);
    cleanup();
    renderApp();

    // The app returns to Family History (not Home) with the resolved
    // authenticated navbar for the approved owner.
    expect(
      await screen.findByRole("heading", { name: "Family History" }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "Add Family" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add Myself" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Sign out" }),
    ).toBeInTheDocument();
    for (const label of PUBLIC_NAV) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });
});

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
import { ClaimButton } from "./components/ClaimButton";
import { AddMyselfPage } from "./pages/AddMyselfPage";

// Characterization baseline for the account-identity and Add Myself behavior
// that the Google/Apple sign-in change must NOT break.
//
// The change replaces Internet Identity with "Continue with Google" / "Continue
// with Apple" (II 2.0 OpenID one-click). Two invariants must survive that swap:
//
//  1. The Add Myself flow's name-search and possible-matches steps are usable
//     WITHOUT signing in first. Today the search/matches steps never consult
//     authentication state — only the final "create my profile" step gates on
//     sign-in. The requirement keeps the flow fully usable without auth up
//     front, so this baseline freezes the search/matches-are-auth-free contract.
//
//  2. Account identity is the caller's ICP Principal (the stable internal
//     account/user ID), NOT an email or a Google/Apple provider identifier.
//     A profile claim records `requestingUserId` as that principal, and a claim
//     is NEVER auto-approved — it stays Pending until a Family Steward reviews
//     it. The Google/Apple accounts are authentication methods for the same
//     stable account, never the family member's identity in the graph.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// A distinct, valid ICP principal standing in for the signed-in account. The
// account ID is this principal — never an email address or provider handle.
const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It implements
// the methods the Add Myself flow and the claim flow call, and records claims
// keyed by the caller's principal (the stable account ID).
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getCurrentPrincipal,
  getAuthenticated,
  seedProfile,
  getClaims,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let nextClaimId = 1n;

  const principal = () => Principal.fromText(currentPrincipal);

  const mockActor = {
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
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
      if (profile.livingStatus === LivingStatus.Deceased)
        return { __kind__: "err", err: "DeceasedProfile" };
      if (profile.claimStatus === ClaimStatus.Claimed)
        return { __kind__: "err", err: "AlreadyClaimed" };
      const claim: ProfileClaim = {
        id: nextClaimId++,
        personId,
        requestingUserId: principal(),
        status: "Pending",
        submittedDate: 1_700_000_000_000_000_000n,
      };
      claims = [...claims, claim];
      return { __kind__: "ok", ok: claim };
    },
    async searchPossibleMatches(
      name: string,
    ): Promise<{ name: string; personId: string; parents: string[] }[]> {
      const term = name.toLowerCase();
      return Object.values(profiles)
        .filter((p) => p.name.toLowerCase().includes(term))
        .map((p) => ({ name: p.name, personId: p.personId, parents: [] }));
    },
    async createMyself(
      name: string,
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      const personId = currentPrincipal;
      const profile: PersonProfile = {
        personId,
        name,
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: principal(),
        preferredName: undefined,
        story: undefined,
        occupation: undefined,
        birthInfo: undefined,
        timeline: undefined,
        privacySettings: undefined,
      };
      profiles = { ...profiles, [personId]: profile };
      return { __kind__: "ok", ok: profile };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      claims = [];
      nextClaimId = 1n;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getCurrentPrincipal: () => currentPrincipal,
    getAuthenticated: () => isAuthenticated,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    getClaims: () => claims,
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// authentication state. The real useActor/useInternetIdentity depend on an
// InternetIdentityProvider, which is not needed for a deterministic test.
vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  // The Add Myself flow persists its entered state to sessionStorage so a
  // full-page auth redirect (Google / Apple one-click sign-in) restores the
  // exact flow. Clear it between tests so each test starts at the name step.
  sessionStorage.clear();
});

function renderPage(node: React.ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>,
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

describe("Add Myself search and matches are usable without signing in", () => {
  it("lets an unauthenticated user search by name and see possible matches", async () => {
    // No sign-in: the default auth state is unauthenticated. The real shared
    // profiles record contains "Clayton Norwood", so the local match builder
    // finds it without any backend override.
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    // Step 1: enter a name and search — no sign-in is required.
    await user.type(screen.getByTestId("add_myself.name_input"), "Clayton");
    await user.click(screen.getByTestId("add_myself.search_button"));

    // Step 2: the possible-matches step renders without any auth gate. The
    // step indicator and the section heading both read "Possible matches".
    expect(await screen.findByText("Clayton Norwood")).toBeInTheDocument();
    expect(screen.getAllByText("Possible matches").length).toBeGreaterThan(0);
  });

  it("shows the no-match empty state to an unauthenticated user", async () => {
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    // A name that matches no seeded profile, so the empty state is reached.
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Zephyr Quixote",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));

    // The empty state (which offers to create a profile) is reachable without
    // sign-in; the search/matches steps never consult authentication state.
    expect(
      await screen.findByText(/No one named “Zephyr Quixote” found/),
    ).toBeInTheDocument();
  });
});

describe("Account identity is the caller's principal, never an email", () => {
  it("records a profile claim against the caller's principal (stable account ID)", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const profile = seedLivingUnclaimed("clayton", "Clayton Norwood");
    const user = userEvent.setup();
    renderPage(<ClaimButton personId="clayton" profile={profile} />);

    // A signed-in user clicks "This is Me" on the profile.
    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // The claim is recorded against the caller's principal — the stable
    // account ID — never an email or a Google/Apple provider identifier.
    const claims = getClaims();
    expect(claims).toHaveLength(1);
    expect(claims[0].personId).toBe("clayton");
    expect(claims[0].requestingUserId.toString()).toBe(ACCOUNT);
  });

  it("never auto-approves a claim: it stays Pending until a steward reviews it", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const profile = seedLivingUnclaimed("clayton", "Clayton Norwood");
    const user = userEvent.setup();
    renderPage(<ClaimButton personId="clayton" profile={profile} />);

    await user.click(screen.getByRole("button", { name: "This is Me" }));

    // Submitting a claim must not grant ownership: the claim is Pending and
    // the profile remains unclaimed until a Family Steward approves.
    const claims = getClaims();
    expect(claims[0].status).toBe("Pending");
    expect(claims[0].reviewedBy).toBeUndefined();
    const stored = await mockActor.getPersonProfile("clayton");
    expect(stored?.claimStatus).toBe(ClaimStatus.Unclaimed);
    expect(stored?.claimedByUserId).toBeUndefined();
  });
});

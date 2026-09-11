import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  RelationshipType,
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
import { ClaimButton } from "./components/ClaimButton";
import { AddMyselfPage } from "./pages/AddMyselfPage";

// Cover for the ownership/identity build. The characterization baselines froze
// the navbar structure (NavbarCharacterize) and the Add Myself match-card
// structure (AddMyselfMatchCardCharacterize). This cover asserts the NEW
// accepted behavior:
//
//  1. Searching "Lorenzo Smith Jr" in Add Myself finds the existing Lorenzo
//     Smith Jr. record (the original child of Lorenzo Smith Sr.) via the shared
//     family graph, not an empty result.
//  2. "This is Me" on the existing Lorenzo Smith Jr. profile creates a pending
//     Profile Claim and does NOT create a duplicate Person Profile.
//  3. The navbar never renders the raw auth/account ID as the visible name: a
//     linked approved account shows the Person Profile display name, a pending
//     profile shows its display name, and no profile shows 'My Account'.
//  4. A valid personId (lorenzoSmithJr, a graph-only node with no static
//     profile record) resolves to its profile instead of an empty/missing page.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// A distinct, valid ICP principal standing in for the signed-in account. The
// account ID is this principal — never an email or provider identifier.
const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam. The mock records which backend methods
// the flows invoked so the tests can assert observable behavior (a pending
// claim is created, no duplicate profile is created, the navbar resolves the
// display name from getMyProfile).
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  getCreatedProfiles,
  getClaims,
  seedProfile,
  setMyProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let myProfile: PersonProfile | null = null;
  let nextClaimId = 1n;
  const createdProfiles: string[] = [];

  const principal = () => Principal.fromText(currentPrincipal);

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
      _name: string,
    ): Promise<{ name: string; personId: string; parents: string[] }[]> {
      // The real backend search is not available in this test; the local match
      // builder (buildLocalMatches) queries the shared profiles record and
      // family graph, which is the authoritative data source under test.
      return [];
    },
    async createMyself(
      name: string,
    ): Promise<
      { __kind__: "ok"; ok: PersonProfile } | { __kind__: "err"; err: string }
    > {
      createdProfiles.push(name);
      return { __kind__: "err", err: "NotSignedIn" };
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      claims = [];
      myProfile = null;
      nextClaimId = 1n;
      createdProfiles.length = 0;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    getCreatedProfiles: () => createdProfiles,
    getClaims: () => claims,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    setMyProfile: (profile: PersonProfile | null) => {
      myProfile = profile;
    },
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// Internet Identity state. The real useActor/useInternetIdentity depend on an
// InternetIdentityProvider, which is not needed for a deterministic test.
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

describe("Add Myself search finds the existing Lorenzo Smith Jr. record", () => {
  it("finds Lorenzo Smith Jr. (child of Lorenzo Smith Sr.) via the shared family graph, not an empty result", async () => {
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    // Search for the original Lorenzo Smith Jr. — a graph-only node with no
    // static profile record, but part of the authoritative shared family graph
    // as the child of Lorenzo Smith Sr.
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Lorenzo Smith Jr",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));

    // The match card shows the existing record's canonical display name and its
    // parent. The graph-only node resolves through the shared resolveDisplayName
    // resolver, so it surfaces the canonical "Lorenzo Smith Jr." (exact
    // capitalization and spacing) rather than leaking the raw id.
    expect(await screen.findByText("Lorenzo Smith Jr.")).toBeInTheDocument();
    expect(screen.getByText("Child of Lorenzo Smith Sr.")).toBeInTheDocument();

    // The empty "create my profile" state is NOT shown — a strong existing
    // match is surfaced instead of offering immediate creation of a duplicate.
    expect(
      screen.queryByTestId("add_myself.empty_state"),
    ).not.toBeInTheDocument();
  });

  it("offers 'This is Me' and 'None of these are me' on the Lorenzo Smith Jr. match card", async () => {
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Lorenzo Smith Jr",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));

    expect(await screen.findByText("Lorenzo Smith Jr.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "This is Me" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "None of these are me" }),
    ).toBeInTheDocument();
  });
});

describe("This is Me on the existing Lorenzo Smith Jr. profile does not create a duplicate", () => {
  it("creates a pending Profile Claim and never calls createMyself", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The original Lorenzo Smith Jr. profile (child of Lorenzo Smith Sr.) is an
    // unclaimed living profile in the backend.
    const profile = seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    const user = userEvent.setup();
    renderPage(<ClaimButton personId="lorenzoSmithJr" profile={profile} />);

    // The signed-in user sees the "This is Me" action.
    await user.click(screen.getByTestId("claim_button.this_is_me"));

    // A pending claim is created for the EXISTING profile — no duplicate
    // Person Profile is created via createMyself.
    await vi.waitFor(() => {
      expect(getClaims()).toHaveLength(1);
    });
    const claim = getClaims()[0];
    expect(claim.personId).toBe("lorenzoSmithJr");
    expect(claim.requestingUserId.toString()).toBe(ACCOUNT);
    expect(claim.status).toBe("Pending");
    expect(getCreatedProfiles()).toEqual([]);
  });
});

describe("Navbar never renders the raw account ID as the visible name", () => {
  it("shows the linked Person Profile display name, not the raw account ID", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The account is linked to the approved Lorenzo Smith Jr. profile.
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
    renderApp();

    // Wait for the query to resolve and the display name to render (the
    // profile button exists immediately, but the profile loads async). The
    // single profile button is labeled with the canonical display name.
    const identity = await screen.findByTestId("layout.my_profile_link");
    expect(
      await within(identity).findByText("Lorenzo Smith Jr."),
    ).toBeInTheDocument();
    // The raw account ID is never surfaced as the visible name.
    expect(within(identity).queryByText(ACCOUNT)).not.toBeInTheDocument();
  });

  it("shows the pending profile's display name, not the raw account ID", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The account has a pending (unclaimed) profile awaiting steward review.
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
    renderApp();

    const identity = await screen.findByTestId("layout.my_profile_link");
    expect(
      await within(identity).findByText("Lorenzo Smith Jr."),
    ).toBeInTheDocument();
    expect(within(identity).queryByText(ACCOUNT)).not.toBeInTheDocument();
  });

  it("shows 'My Profile' when no Person Profile is connected, never the raw account ID", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // No profile is connected yet.
    setMyProfile(null);
    renderApp();

    const identity = await screen.findByTestId("layout.my_profile_link");
    expect(within(identity).getByText("My Profile")).toBeInTheDocument();
    expect(within(identity).queryByText(ACCOUNT)).not.toBeInTheDocument();
  });
});

describe("A valid personId resolves to its profile, never an empty page", () => {
  it("opens the Lorenzo Smith Jr. profile (a graph-only node) from Add Myself 'This is Me'", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The original Lorenzo Smith Jr. profile exists in the backend.
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    const user = userEvent.setup();
    renderApp();

    // Navigate to Add Myself and search for Lorenzo Smith Jr.
    await user.click(screen.getByRole("button", { name: "Add Myself" }));
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Lorenzo Smith Jr",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));

    // Select "This is Me" on the existing match — routes to the profile.
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // The profile resolves by personId to the correct Person Profile — no
    // empty/missing profile page for a valid personId.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
  });
});

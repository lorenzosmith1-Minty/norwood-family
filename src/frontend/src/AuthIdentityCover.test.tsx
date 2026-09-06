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
import { ClaimButton } from "./components/ClaimButton";
import { LoginSurface } from "./components/LoginSurface";
import { AddMyselfPage } from "./pages/AddMyselfPage";

// Cover for the Google/Apple sign-in change. The characterization baseline
// (AuthIdentityCharacterize.test.tsx) froze the auth-free Add Myself search and
// the "account identity is the caller's principal, never an email" invariant.
// This cover asserts the NEW accepted behavior:
//
//  1. The login surface shows exactly two primary options — "Continue with
//     Google" and "Continue with Apple" — and no email/passwordless-email
//     option.
//  2. Selecting Google routes to login({ provider: 'google' }) and Apple to
//     login({ provider: 'apple' }) (II 2.0 OpenID one-click).
//  3. Add Myself final submission shows "Save your place in the family" and
//     "Sign in securely to create your Norwood profile and send this family
//     connection for confirmation." with Google/Apple; after sign-in the flow
//     returns to the exact state, preserves entered info, and creates the
//     profile plus pending relationship request without restarting.
//  4. "This is Me" on an existing profile offers Google/Apple; after sign-in
//     the claim is submitted for that exact profile and stays pending.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// A distinct, valid ICP principal standing in for the signed-in account. The
// account ID is this principal — never an email or provider identifier.
const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam. The mock records which provider each
// login call used and which backend methods the flows invoked, so the tests
// can assert the observable routing and submission behavior.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  getLoginCalls,
  recordLogin,
  actorResult,
  getCreatedProfiles,
  getProposedRelationships,
  getClaims,
  seedProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let nextClaimId = 1n;
  let nextProfileId = 0n;
  const loginCalls: string[] = [];
  const createdProfiles: string[] = [];
  const proposedRelationships: {
    fromPersonId: string;
    toPersonId: string;
    relationshipType: RelationshipType;
  }[] = [];

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
      createdProfiles.push(name);
      const personId = `new-${nextProfileId++}`;
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
    async proposeRelationship(
      fromPersonId: string,
      toPersonId: string,
      relationshipType: RelationshipType,
    ): Promise<
      { __kind__: "ok"; ok: { id: bigint } } | { __kind__: "err"; err: string }
    > {
      proposedRelationships.push({
        fromPersonId,
        toPersonId,
        relationshipType,
      });
      return { __kind__: "ok", ok: { id: 1n } };
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
      nextProfileId = 0n;
      loginCalls.length = 0;
      createdProfiles.length = 0;
      proposedRelationships.length = 0;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    getLoginCalls: () => loginCalls,
    recordLogin: (provider: string) => {
      loginCalls.push(provider);
    },
    actorResult: { actor: mockActor, isFetching: false },
    getCreatedProfiles: () => createdProfiles,
    getProposedRelationships: () => proposedRelationships,
    getClaims: () => claims,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
  };
});

// Replace the provider seam with the in-memory actor and a controllable
// Internet Identity state. The real useActor/useInternetIdentity depend on an
// InternetIdentityProvider, which is not needed for a deterministic test.
vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => actorResult,
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: (options?: { provider?: string }) => {
      recordLogin(options?.provider ?? "unknown");
    },
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

describe("Login surface shows exactly two primary options and routes to the right provider", () => {
  it("renders Continue with Google and Continue with Apple and no email option", () => {
    renderPage(<LoginSurface />);

    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeInTheDocument();

    // No email / passwordless-email option is offered.
    expect(
      screen.queryByRole("button", { name: /continue with email/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /email/i }),
    ).not.toBeInTheDocument();
  });

  it("routes Continue with Google to login({ provider: 'google' })", async () => {
    const user = userEvent.setup();
    renderPage(<LoginSurface />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Google" }),
    );

    expect(getLoginCalls()).toEqual(["google"]);
  });

  it("routes Continue with Apple to login({ provider: 'apple' })", async () => {
    const user = userEvent.setup();
    renderPage(<LoginSurface />);

    await user.click(
      screen.getByRole("button", { name: "Continue with Apple" }),
    );

    expect(getLoginCalls()).toEqual(["apple"]);
  });
});

describe("Add Myself final submission gates on sign-in and resumes without restart", () => {
  // Drives the Add Myself flow to the connect step with a connecting family
  // member and relationship chosen, then clicks "Save your place in the
  // family". Returns the user-event instance for further interaction.
  async function reachFinalSubmit(user: ReturnType<typeof userEvent.setup>) {
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    // Step 1: search a name with no match so we reach the connect step.
    await user.type(
      screen.getByTestId("add_myself.name_input"),
      "Zephyr Quixote",
    );
    await user.click(screen.getByTestId("add_myself.search_button"));
    await user.click(screen.getByTestId("add_myself.create_button"));

    // Step 3 (connect): choose an existing family member and a relationship.
    await user.click(screen.getByTestId("add_myself.person.0"));
    await user.click(
      screen.getByTestId(`add_myself.relationship.${RelationshipType.Child}`),
    );

    // Final submission: unauthenticated, so the sign-in panel appears.
    await user.click(screen.getByTestId("add_myself.save_button"));
  }

  it("shows the save-your-place sign-in panel with Google/Apple and the exact copy", async () => {
    const user = userEvent.setup();
    await reachFinalSubmit(user);

    const panel = screen.getByTestId("add_myself.signin_panel");
    expect(panel).toBeInTheDocument();
    expect(
      within(panel).getByRole("heading", {
        name: "Save your place in the family",
      }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByText(
        "Sign in securely to create your Norwood profile and send this family connection for confirmation.",
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      within(panel).getByRole("button", { name: "Continue with Apple" }),
    ).toBeInTheDocument();
  });

  it("after Google sign-in returns to the exact state and creates profile + pending request", async () => {
    const user = userEvent.setup();
    await reachFinalSubmit(user);

    // Start the Google sign-in from the Add Myself panel.
    await user.click(screen.getByTestId("add_myself.signin_google_button"));
    expect(getLoginCalls()).toEqual(["google"]);

    // Simulate the auth redirect completing: the user is now signed in and the
    // app remounts the flow. The persisted draft restores the exact state and
    // the pending-submit flag triggers the auto-submit effect.
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    cleanup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    // The flow resumes at the connect step with the entered info preserved and
    // auto-submits: the profile is created and the relationship request is
    // proposed, without the user restarting.
    await vi.waitFor(() => {
      expect(getCreatedProfiles()).toEqual(["Zephyr Quixote"]);
    });
    await vi.waitFor(() => {
      expect(getProposedRelationships()).toHaveLength(1);
    });
    const proposed = getProposedRelationships()[0];
    expect(proposed.relationshipType).toBe(RelationshipType.Child);

    // The success state confirms the place in the family is saved.
    expect(
      await screen.findByTestId("add_myself.success_state"),
    ).toBeInTheDocument();
  });
});

describe("This is Me on an existing profile offers Google/Apple and submits a pending claim", () => {
  it("offers Google/Apple to an unauthenticated user and submits the claim after sign-in", async () => {
    setAuthenticated(false);
    const profile = seedLivingUnclaimed("clayton", "Clayton Norwood");
    const user = userEvent.setup();
    renderPage(<ClaimButton personId="clayton" profile={profile} />);

    // The claim action offers the two consumer sign-in options.
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeInTheDocument();

    // Start the Apple sign-in from the claim action.
    await user.click(screen.getByTestId("claim_button.apple_button"));
    expect(getLoginCalls()).toEqual(["apple"]);

    // Simulate the auth redirect completing: the user is signed in and the app
    // remounts the profile. The pending-claim flag auto-submits the claim for
    // this exact profile.
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    cleanup();
    renderPage(<ClaimButton personId="clayton" profile={profile} />);

    await vi.waitFor(() => {
      expect(getClaims()).toHaveLength(1);
    });
    const claim = getClaims()[0];
    expect(claim.personId).toBe("clayton");
    expect(claim.requestingUserId.toString()).toBe(ACCOUNT);
    // Claims are never auto-approved: the claim stays Pending and the profile
    // remains unclaimed until a Family Steward reviews it.
    expect(claim.status).toBe("Pending");
    const stored = await mockActor.getPersonProfile("clayton");
    expect(stored?.claimStatus).toBe(ClaimStatus.Unclaimed);
    expect(stored?.claimedByUserId).toBeUndefined();
  });
});

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
import { FamilyStewardReviewPage } from "./pages/FamilyStewardReviewPage";

// Cover for the "This is Me" claim-persistence fix and the active navigation
// state. The build changed the claim flow so a signed-in user's "This is Me"
// persists a PENDING claim durably and only navigates to the profile after the
// backend confirms persistence. These tests assert the corrected behavior:
//
//  1. Add Myself "This is Me" submits a claim and only navigates after the
//     backend confirms persistence, handling ok / AlreadyClaimed / AlreadyPending.
//  2. A write failure shows the exact error and does NOT redirect.
//  3. The canonical profile shows PENDING CLAIM and hides This is Me / UNCLAIMED
//     once a pending claim exists.
//  4. The Family Steward queue shows the pending claim with Approve/Reject, and
//     approving updates the claim to APPROVED and persists ownership.
//  5. Each navigation button shows an obvious active state (aria-current) on the
//     current section.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = "ryjl3-tyaaa-aaaaa-aaaba-cai";
const CLAIMANT = "r7inp-6aaaa-aaaaa-aaabq-cai";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It records which
// backend methods the flows invoke so the tests can assert observable behavior
// (a pending claim surfaces PENDING CLAIM on the profile page, and the claim
// flow only navigates after the backend confirms persistence).
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setAdmin,
  getAuthenticated,
  setCurrentPrincipal,
  getCurrentPrincipal,
  seedProfile,
  seedClaim,
  setRequestClaimResult,
  setRequestClaimThrows,
  getRequestClaimCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let claims: ProfileClaim[] = [];
  let nextClaimId = 1n;
  // Controllable result for requestProfileClaim. When null, the mock derives a
  // sensible default from the seeded profile state.
  let requestClaimResult:
    | { __kind__: "ok"; ok: ProfileClaim }
    | { __kind__: "err"; err: string }
    | null = null;
  let requestClaimThrows = false;
  let requestClaimCalls = 0;

  const principal = () => Principal.fromText(currentPrincipal);

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      // Mirrors the real backend's getMyProfile: a profile claimed by the
      // caller, or a profile with a pending claim by the caller, is returned as
      // the caller's own profile.
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      if (owned) return owned;
      const pending = claims.find(
        (c) => c.requestingUserId.toString() === currentPrincipal,
      );
      if (pending) return profiles[pending.personId] ?? null;
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
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [...claims];
    },
    async requestProfileClaim(
      personId: string,
    ): Promise<
      { __kind__: "ok"; ok: ProfileClaim } | { __kind__: "err"; err: string }
    > {
      requestClaimCalls += 1;
      if (requestClaimThrows) throw new Error("network down");
      if (requestClaimResult) return requestClaimResult;
      const profile = profiles[personId];
      if (!profile) return { __kind__: "err", err: "ProfileNotFound" };
      if (profile.claimStatus === ClaimStatus.Claimed)
        return { __kind__: "err", err: ClaimError.AlreadyClaimed };
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
    async approveProfileClaim(claimId: bigint): Promise<ProfileClaim | null> {
      const claim = claims.find(
        (c) => c.id === claimId && c.status === "Pending",
      );
      if (!claim) return null;
      const updated: ProfileClaim = {
        ...claim,
        status: "Approved",
        reviewedBy: principal(),
        reviewedDate: 1_700_000_000_000_000_000n,
      };
      claims = claims.map((c) => (c.id === claimId ? updated : c));
      const profile = profiles[claim.personId];
      if (profile) {
        profiles = {
          ...profiles,
          [claim.personId]: {
            ...profile,
            claimStatus: ClaimStatus.Claimed,
            claimedByUserId: claim.requestingUserId,
          },
        };
      }
      return updated;
    },
    async searchPossibleMatches(): Promise<
      { name: string; personId: string; parents: string[] }[]
    > {
      return [];
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
      nextClaimId = 1n;
      requestClaimResult = null;
      requestClaimThrows = false;
      requestClaimCalls = 0;
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
      claims = [...claims, claim];
    },
    setRequestClaimResult: (
      result:
        | { __kind__: "ok"; ok: ProfileClaim }
        | { __kind__: "err"; err: string }
        | null,
    ) => {
      requestClaimResult = result;
    },
    setRequestClaimThrows: (v: boolean) => {
      requestClaimThrows = v;
    },
    getRequestClaimCalls: () => requestClaimCalls,
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

/** Drives Add Myself to the matches step for a given name. */
async function searchAddMyself(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.click(screen.getByRole("button", { name: "Add Myself" }));
  await user.type(screen.getByTestId("add_myself.name_input"), name);
  await user.click(screen.getByTestId("add_myself.search_button"));
}

describe("Add Myself 'This is Me' submits a claim and only navigates after backend confirmation", () => {
  it("navigates to the profile only after the backend confirms the pending claim was persisted (ok)", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    await searchAddMyself(user, "Lorenzo Smith Jr");
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // The backend confirmed the pending claim, so the flow navigates to the
    // canonical profile.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    // Exactly one claim write was made.
    expect(getRequestClaimCalls()).toBe(1);
  });

  it("routes to My Profile when the backend reports AlreadyClaimed, without creating a duplicate claim", async () => {
    // The profile is already CLAIMED by the signed-in account.
    seedProfile({
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
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    await searchAddMyself(user, "Lorenzo Smith Jr");
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // AlreadyClaimed routes to My Profile (the owned canonical profile).
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    expect(
      await within(claimSection).findByText("Claimed"),
    ).toBeInTheDocument();
    // No duplicate claim was created.
    expect(getRequestClaimCalls()).toBe(1);
  });

  it("treats AlreadyPending as a successful reuse and navigates to the canonical profile", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The backend reports a pending claim already exists for this account+person.
    setRequestClaimResult({
      __kind__: "err",
      err: ClaimError.AlreadyPending,
    });
    const user = userEvent.setup();
    renderApp();

    await searchAddMyself(user, "Lorenzo Smith Jr");
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // AlreadyPending is treated as a successful reuse: navigate to the canonical
    // profile (which renders the PENDING CLAIM state), not a write-failure.
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    expect(
      screen.queryByTestId("add_myself.claim_error_state"),
    ).not.toBeInTheDocument();
  });
});

describe("A claim write failure shows the exact error and does not redirect", () => {
  it("keeps the user on the Add Myself screen with the error when the backend write throws", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    setRequestClaimThrows(true);
    const user = userEvent.setup();
    renderApp();

    await searchAddMyself(user, "Lorenzo Smith Jr");
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // The user stays on the Add Myself screen with a visible error.
    expect(
      await screen.findByTestId("add_myself.claim_error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't submit your profile claim. Please try again.",
      ),
    ).toBeInTheDocument();
    // No redirect to the profile happened.
    expect(
      screen.queryByRole("heading", { level: 1, name: "Lorenzo Smith Jr." }),
    ).not.toBeInTheDocument();
  });

  it("keeps the user on the Add Myself screen with the error on an unexpected backend error", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    setRequestClaimResult({ __kind__: "err", err: "ProfileNotFound" });
    const user = userEvent.setup();
    renderApp();

    await searchAddMyself(user, "Lorenzo Smith Jr");
    await user.click(
      (await screen.findAllByRole("button", { name: "This is Me" }))[0],
    );

    // The user stays on the Add Myself screen with a visible error.
    expect(
      await screen.findByTestId("add_myself.claim_error_state"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "We couldn't submit your profile claim. Please try again.",
      ),
    ).toBeInTheDocument();
  });
});

describe("The canonical profile shows PENDING CLAIM and hides This is Me / UNCLAIMED", () => {
  it("shows PENDING CLAIM and hides This is Me and UNCLAIMED once a pending claim exists", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim({
      id: 1n,
      personId: "lorenzoSmithJr",
      requestingUserId: Principal.fromText(ACCOUNT),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    // Open the canonical profile via My Profile routing: the account has a
    // pending claim, so My Profile routes to the same canonical profile in its
    // pending state.
    await user.click(screen.getByTestId("layout.my_profile_link"));

    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
      "Lorenzo Smith Jr.",
    );
    const claimSection = screen.getByTestId("profile.claim_section");
    // PENDING CLAIM is shown.
    expect(
      await within(claimSection).findByText("Pending claim"),
    ).toBeInTheDocument();
    expect(
      within(claimSection).getByText(
        "Your claim to this profile is awaiting Family Steward review.",
      ),
    ).toBeInTheDocument();
    // This is Me and UNCLAIMED are hidden.
    expect(
      within(claimSection).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
    expect(
      within(claimSection).queryByText("Unclaimed"),
    ).not.toBeInTheDocument();
  });
});

describe("Family Steward queue shows the pending claim and approval persists ownership", () => {
  it("shows the pending claim with Approve/Reject and approving updates it to APPROVED and persists ownership", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim({
      id: 1n,
      personId: "lorenzoSmithJr",
      requestingUserId: Principal.fromText(CLAIMANT),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    setAuthenticated(true);
    setCurrentPrincipal(STEWARD);
    setAdmin(true);
    const user = userEvent.setup();
    // Render the Family Steward review page directly (the navbar steward link
    // is gated on the async admin query, which is out of scope here).
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <FamilyStewardReviewPage onBack={() => {}} />
      </QueryClientProvider>,
    );

    // The pending claim is shown with Approve/Reject.
    expect(await screen.findByText("Profile Claims (1)")).toBeInTheDocument();
    expect(screen.getByText("Lorenzo Smith Jr.")).toBeInTheDocument();
    expect(
      screen.getByTestId("steward_review.claim_approve_button.1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("steward_review.claim_reject_button.1"),
    ).toBeInTheDocument();

    // Approve the claim.
    await user.click(
      screen.getByTestId("steward_review.claim_approve_button.1"),
    );

    // The claim leaves the pending list.
    expect(
      await screen.findByText("Nothing awaiting review"),
    ).toBeInTheDocument();
    // The claim is now APPROVED and ownership is persisted on the profile.
    const approved = (await mockActor.listProfileClaims()).find(
      (c) => c.id === 1n,
    );
    expect(approved?.status).toBe("Approved");
    const profile = await mockActor.getPersonProfile("lorenzoSmithJr");
    expect(profile?.claimStatus).toBe(ClaimStatus.Claimed);
    expect(profile?.claimedByUserId?.toString()).toBe(CLAIMANT);
  });
});

describe("Each navigation button shows an obvious active state on the current section", () => {
  it("sets aria-current on the active nav button for the current section", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderApp();

    // Start on Home: no nav section is active.
    expect(screen.getByTestId("layout.explore_link")).not.toHaveAttribute(
      "aria-current",
    );

    // Navigate to Explore Family.
    await user.click(screen.getByTestId("layout.explore_link"));
    expect(await screen.findByTestId("layout.explore_link")).toHaveAttribute(
      "aria-current",
      "page",
    );

    // Navigate to Heritage Branch.
    await user.click(screen.getByTestId("layout.branch_link"));
    expect(await screen.findByTestId("layout.branch_link")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("layout.explore_link")).not.toHaveAttribute(
      "aria-current",
    );

    // Navigate to Add Myself.
    await user.click(screen.getByTestId("layout.add_myself_link"));
    expect(await screen.findByTestId("layout.add_myself_link")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByTestId("layout.branch_link")).not.toHaveAttribute(
      "aria-current",
    );
  });
});

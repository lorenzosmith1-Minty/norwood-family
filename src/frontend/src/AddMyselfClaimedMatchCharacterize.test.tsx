import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  ProfileClaimStatus,
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
import { AddMyselfPage } from "./pages/AddMyselfPage";

// Cover for the Add Myself possible-match card claim-state behavior.
//
// Each possible-match card reflects whether the matched person profile already
// has an approved owner/claim (not just the caller's own claim). An
// already-claimed match shows a non-interactive "Already claimed" state instead
// of an active "This is Me" action, so a second claim can never be started from
// that card.
//
// This file began as the characterization baseline for the surrounding working
// behavior and now also asserts the intentional change. It covers:
//
//  1. An UNCLAIMED possible match still shows an active "This is Me" action and
//     the claim flow can be started (sign-in panel when signed out; a
//     requestProfileClaim write when signed in).
//  2. An already-claimed match stays visible but shows a non-interactive
//     "Already claimed" state and NO active "This is Me" action.
//  3. A second claim cannot be started from an already-claimed card (no
//     requestProfileClaim write).
//  4. "None of these are me" remains available and works on every match card,
//     including a card whose profile is already claimed by another owner.
//  5. No owner principal, account identity, or email is rendered for a claimed
//     match.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const CALLER = "2vxsx-fae";
const OTHER_OWNER = "r7inp-6aaaa-aaaaa-aaabq-cai";

// ---------------------------------------------------------------------------
// A typed in-memory actor standing in for the real backend. It exposes the two
// ownership seams the match card consumes: the caller's own claim
// (getMyProfileClaim) and the person profile record (getPersonProfile), which
// carries claimStatus / claimedByUserId for ANY owner. Recording the
// requestProfileClaim calls lets the tests assert the claim flow is startable
// for an unclaimed match.
// ---------------------------------------------------------------------------
const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  getRequestClaimCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let requestClaimCalls = 0;

  const mockActor = {
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      // The caller has no claim of their own on any match in these tests; the
      // profile record is the source of truth for another owner's claim.
      return null;
    },
    async requestProfileClaim(
      personId: string,
    ): Promise<
      { __kind__: "ok"; ok: ProfileClaim } | { __kind__: "err"; err: string }
    > {
      requestClaimCalls += 1;
      const claim: ProfileClaim = {
        id: 1n,
        personId,
        requestingUserId: Principal.fromText(currentPrincipal),
        status: ProfileClaimStatus.Pending,
        submittedDate: 1_700_000_000_000_000_000n,
      };
      return { __kind__: "ok", ok: claim };
    },
    async searchPossibleMatches(): Promise<
      { name: string; personId: string; parents: string[] }[]
    > {
      // The local match builder (buildLocalMatches) queries the shared profiles
      // record / family graph, which is the authoritative data source here.
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      requestClaimCalls = 0;
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

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />
    </QueryClientProvider>,
  );
}

function profile(
  personId: string,
  name: string,
  claimStatus: ClaimStatus,
  claimedByUserId?: string,
): PersonProfile {
  return {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus,
    claimedByUserId: claimedByUserId
      ? Principal.fromText(claimedByUserId)
      : undefined,
    preferredName: undefined,
    story: undefined,
    occupation: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
}

/** Drives the Add Myself flow to the matches step for a given name. */
async function searchFor(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(screen.getByTestId("add_myself.name_input"), name);
  await user.click(screen.getByTestId("add_myself.search_button"));
}

/**
 * Returns the match card whose displayed name is exactly `name`. A search can
 * surface several matches (e.g. "Clayton" also matches "Thomas Clayton"), so
 * every assertion is scoped to the one card under test rather than the whole
 * list.
 */
async function matchCardFor(name: string): Promise<HTMLElement> {
  const nameNode = await screen.findByText(name, {
    selector: ".match-card-name",
  });
  const card = nameNode.closest(".match-card");
  if (!card) throw new Error(`No match card found for ${name}`);
  return card as HTMLElement;
}

describe("Add Myself unclaimed match keeps an active 'This is Me' claim flow", () => {
  it("shows an active 'This is Me' action for an unclaimed match and opens the claim sign-in panel when signed out", async () => {
    // The matched profile exists and is UNCLAIMED (no approved owner).
    seedProfile(profile("clayton", "Clayton Norwood", ClaimStatus.Unclaimed));
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");

    // The match card is visible with the person's name and parents.
    const card = await matchCardFor("Clayton Norwood");
    expect(
      within(card).getByText(
        "Child of Isaiah Norwood and Julia “Julie” Norwood",
      ),
    ).toBeInTheDocument();

    // The unclaimed match still offers an active "This is Me" action.
    const thisIsMe = within(card).getByRole("button", { name: "This is Me" });
    expect(thisIsMe).toBeEnabled();

    // Starting the claim while signed out opens the claim sign-in panel, so the
    // claim flow can be started.
    await user.click(thisIsMe);
    expect(
      await screen.findByTestId("add_myself.claim_signin_panel"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Google" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Continue with Apple" }),
    ).toBeInTheDocument();
  });

  it("submits a claim for an unclaimed match when the caller is signed in", async () => {
    seedProfile(profile("clayton", "Clayton Norwood", ClaimStatus.Unclaimed));
    setAuthenticated(true);
    setCurrentPrincipal(CALLER);
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");
    const card = await matchCardFor("Clayton Norwood");
    await user.click(within(card).getByRole("button", { name: "This is Me" }));

    // The claim flow started: exactly one requestProfileClaim write was made.
    expect(getRequestClaimCalls()).toBe(1);
  });
});

describe("Add Myself already-claimed match shows a non-interactive 'Already claimed' state", () => {
  it("shows 'Already claimed' and no active 'This is Me' action for a match whose profile has an approved owner", async () => {
    // The matched profile has an approved owner who is NOT the caller.
    seedProfile(
      profile("clayton", "Clayton Norwood", ClaimStatus.Claimed, OTHER_OWNER),
    );
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");
    const card = await matchCardFor("Clayton Norwood");

    // The non-interactive "Already claimed" state is shown.
    expect(within(card).getByText("Already claimed")).toBeInTheDocument();
    // No active "This is Me" claim action is offered on the card.
    expect(
      within(card).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });

  it("cannot start a second claim from an already-claimed match", async () => {
    seedProfile(
      profile("clayton", "Clayton Norwood", ClaimStatus.Claimed, OTHER_OWNER),
    );
    setAuthenticated(true);
    setCurrentPrincipal(CALLER);
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");
    const card = await matchCardFor("Clayton Norwood");

    // There is no claim control to activate, so no requestProfileClaim write is
    // ever issued for the already-claimed profile.
    expect(
      within(card).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
    expect(getRequestClaimCalls()).toBe(0);
  });

  it("shows 'Already claimed' for a match the signed-in caller already owns", async () => {
    // The profile is claimed by the signed-in caller themselves.
    seedProfile(
      profile("clayton", "Clayton Norwood", ClaimStatus.Claimed, CALLER),
    );
    setAuthenticated(true);
    setCurrentPrincipal(CALLER);
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");
    const card = await matchCardFor("Clayton Norwood");

    expect(within(card).getByText("Already claimed")).toBeInTheDocument();
    expect(
      within(card).queryByRole("button", { name: "This is Me" }),
    ).not.toBeInTheDocument();
  });
});

describe("Add Myself 'None of these are me' works on every match card", () => {
  it("keeps 'None of these are me' available and working on an unclaimed match", async () => {
    seedProfile(profile("clayton", "Clayton Norwood", ClaimStatus.Unclaimed));
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");
    const card = await matchCardFor("Clayton Norwood");
    await user.click(
      within(card).getByRole("button", { name: "None of these are me" }),
    );

    // The flow advances to the connect step.
    expect(
      await screen.findByTestId("add_myself.connect_step"),
    ).toBeInTheDocument();
  });

  it("keeps 'None of these are me' available and working on a match already claimed by another owner", async () => {
    // The matched profile has an approved owner who is NOT the caller.
    seedProfile(
      profile("clayton", "Clayton Norwood", ClaimStatus.Claimed, OTHER_OWNER),
    );
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");

    // The already-claimed match remains visible in the possible-matches list.
    const card = await matchCardFor("Clayton Norwood");

    // "None of these are me" is still offered on the already-claimed card and
    // still works.
    await user.click(
      within(card).getByRole("button", { name: "None of these are me" }),
    );
    expect(
      await screen.findByTestId("add_myself.connect_step"),
    ).toBeInTheDocument();
  });
});

describe("Add Myself claimed match does not leak owner identity", () => {
  it("renders no owner principal, account identity, or email for a claimed match", async () => {
    seedProfile(
      profile("clayton", "Clayton Norwood", ClaimStatus.Claimed, OTHER_OWNER),
    );
    const user = userEvent.setup();
    renderPage();

    await searchFor(user, "Clayton");
    const card = await matchCardFor("Clayton Norwood");

    // The owner's principal must never be rendered as text.
    expect(within(card).queryByText(OTHER_OWNER)).not.toBeInTheDocument();
    // No email-like or account-identity text is rendered anywhere on the card.
    expect(within(card).queryByText(/@/)).not.toBeInTheDocument();
    expect(within(card).queryByText(/principal/i)).not.toBeInTheDocument();
  });
});

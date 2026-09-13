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
import { ClaimButton } from "./components/ClaimButton";
import { AddMyselfPage } from "./pages/AddMyselfPage";

// Cover for the stale-claim fix. An APPROVED ownership record for the current
// user must override any stale pending-claim UI, so an approved account never
// shows CLAIM PENDING. These tests assert the accepted behavior:
//
//  1. Add Myself MatchCard: an Approved claim by the current user renders as
//     "Already claimed" (owned), never "Claim pending".
//  2. Add Myself MatchCard: a genuinely Pending claim by the current user on an
//     unclaimed profile still shows "Claim pending".
//  3. ClaimButton: an Approved claim by the current user renders as owned
//     ("You own this profile"), never "Claim pending".
//  4. ClaimButton: a genuinely Pending claim by the current user still shows
//     "Claim pending".
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend. It records the
// caller's own claim on a profile (getMyProfileClaim) so the MatchCard and
// ClaimButton can be driven into the owned vs pending states.
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
    async searchPossibleMatches(): Promise<
      { name: string; personId: string; parents: string[] }[]
    > {
      // The real backend search is not available here; the local match builder
      // (buildLocalMatches) queries the shared profiles record and family graph,
      // which is the authoritative data source under test.
      return [];
    },
    async requestProfileClaim(): Promise<
      { __kind__: "ok"; ok: ProfileClaim } | { __kind__: "err"; err: string }
    > {
      return { __kind__: "err", err: "AlreadyClaimed" };
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

function claimFor(
  personId: string,
  status: "Pending" | "Approved",
): ProfileClaim {
  return {
    id: 1n,
    personId,
    requestingUserId: Principal.fromText(ACCOUNT),
    status,
    submittedDate: 1_700_000_000_000_000_000n,
  };
}

/** Drives Add Myself to the matches step for a given name. */
async function searchAddMyself(
  user: ReturnType<typeof userEvent.setup>,
  name: string,
) {
  await user.type(screen.getByTestId("add_myself.name_input"), name);
  await user.click(screen.getByTestId("add_myself.search_button"));
}

describe("Add Myself MatchCard: an Approved claim by the current user renders as owned, never 'Claim pending'", () => {
  it("shows 'Already claimed' for an Approved claim by the current user", async () => {
    // The canonical Lorenzo Smith Jr. profile is unclaimed in the backend, but
    // the current user holds an APPROVED ownership record for it (the stale
    // pending-claim UI must not override this).
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim(claimFor("lorenzoSmithJr", "Approved"));
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    await searchAddMyself(user, "Lorenzo Smith Jr");

    // The match card renders the owned state, never a pending claim.
    expect(
      await screen.findByTestId("add_myself.this_is_me.owned.0"),
    ).toBeInTheDocument();
    expect(screen.getByText("Already claimed")).toBeInTheDocument();
    expect(
      screen.queryByTestId("add_myself.this_is_me.pending.0"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Claim pending")).not.toBeInTheDocument();
  });

  it("still shows 'Claim pending' for a genuinely Pending claim by the current user on an unclaimed profile", async () => {
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim(claimFor("lorenzoSmithJr", "Pending"));
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    const user = userEvent.setup();
    renderPage(<AddMyselfPage onBack={() => {}} onOpenProfile={() => {}} />);

    await searchAddMyself(user, "Lorenzo Smith Jr");

    // A genuinely pending claim still shows the pending state.
    expect(
      await screen.findByTestId("add_myself.this_is_me.pending.0"),
    ).toBeInTheDocument();
    expect(screen.getByText("Claim pending")).toBeInTheDocument();
    expect(
      screen.queryByTestId("add_myself.this_is_me.owned.0"),
    ).not.toBeInTheDocument();
  });
});

describe("ClaimButton: an Approved claim by the current user renders as owned, never 'Claim pending'", () => {
  it("shows 'You own this profile' for an Approved claim by the current user", async () => {
    const profile = seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim(claimFor("lorenzoSmithJr", "Approved"));
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    renderPage(<ClaimButton personId="lorenzoSmithJr" profile={profile} />);

    // The owned state is shown, never a pending claim.
    expect(await screen.findByTestId("claim_button.owned")).toBeInTheDocument();
    expect(screen.getByText("You own this profile")).toBeInTheDocument();
    expect(
      screen.queryByTestId("claim_button.pending"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Claim pending")).not.toBeInTheDocument();
  });

  it("still shows 'Claim pending' for a genuinely Pending claim by the current user", async () => {
    const profile = seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim(claimFor("lorenzoSmithJr", "Pending"));
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    renderPage(<ClaimButton personId="lorenzoSmithJr" profile={profile} />);

    // A genuinely pending claim still shows the pending state.
    expect(
      await screen.findByTestId("claim_button.pending"),
    ).toBeInTheDocument();
    expect(screen.getByText("Claim pending")).toBeInTheDocument();
    expect(screen.queryByTestId("claim_button.owned")).not.toBeInTheDocument();
  });
});

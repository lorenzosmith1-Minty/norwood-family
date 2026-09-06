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
import { FAMILY_GRAPH } from "./types/family";

// Characterization baseline for the Lorenzo Smith Jr. canonical-record build.
// The build will reconcile the canonical `lorenzoSmithJr` personId across the
// backend profile, the frontend graph, the claim flow, My Profile, and PersonCard
// routing. These tests freeze the working behavior that must NOT change:
//
//  1. The canonical Lorenzo Smith Jr. record exists in the shared graph as the
//     child of Lorenzo Smith Sr. (exactly one child).
//  2. Explore Family renders the confirmed family graph regardless of the
//     signed-in account's claim or approval state — Lorenzo Smith Jr. still
//     appears as Lorenzo Smith Sr.'s child card even while a claim is pending.
//
// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// ---------------------------------------------------------------------------
// A stateful in-memory actor standing in for the real backend, plus a
// controllable Internet Identity seam. The mock records which backend methods
// the flows invoke so the tests can assert observable behavior (the canonical
// profile resolves by personId, a pending claim is visible, the graph renders
// regardless of claim state).
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

async function openExploreFamily(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
}

async function navigateToLorenzoSmithSr(
  user: ReturnType<typeof userEvent.setup>,
) {
  // Julia -> Clayton -> Lula Mae -> Lorenzo Smith Sr.
  await user.click(
    screen.getByRole("button", { name: /Clayton Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lula Mae Norwood Child/ }),
  );
  await user.click(
    screen.getByRole("button", { name: /Lorenzo Smith Sr\. Child/ }),
  );
}

describe("FAMILY_GRAPH canonical Lorenzo Smith Jr. record", () => {
  it("records Lorenzo Smith Jr. as the single child of Lorenzo Smith Sr.", () => {
    expect(FAMILY_GRAPH.lorenzoSmithSr).toBeDefined();
    expect(FAMILY_GRAPH.lorenzoSmithSr.children).toEqual(["lorenzoSmithJr"]);
    expect(FAMILY_GRAPH.lorenzoSmithJr).toBeDefined();
    expect(FAMILY_GRAPH.lorenzoSmithJr.father).toBe("lorenzoSmithSr");
  });
});

describe("Explore Family renders the confirmed graph regardless of claim state", () => {
  it("renders Lorenzo Smith Jr. as Lorenzo Smith Sr.'s child card when not signed in", async () => {
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    const childrenZone = screen.getByTestId("explore.zone.children");
    // Exactly one child card renders in the Children zone. The card's name is
    // intentionally NOT asserted here: the upcoming build replaces the raw
    // graph id fallback ('lorenzoSmithJr') with the canonical display name, so
    // freezing the current leaky name would lock in the bug being fixed.
    expect(
      within(childrenZone).getAllByRole("button", { name: / Child$/ }),
    ).toHaveLength(1);
  });

  it("still renders Lorenzo Smith Jr. as the child card while the signed-in account has a pending claim", async () => {
    setAuthenticated(true);
    setCurrentPrincipal(ACCOUNT);
    // The canonical Lorenzo Smith Jr. profile exists in the backend and the
    // signed-in account has a pending claim on it.
    seedLivingUnclaimed("lorenzoSmithJr", "Lorenzo Smith Jr.");
    seedClaim({
      id: 1n,
      personId: "lorenzoSmithJr",
      requestingUserId: Principal.fromText(ACCOUNT),
      status: "Pending",
      submittedDate: 1_700_000_000_000_000_000n,
    });
    const user = userEvent.setup();
    renderApp();
    await openExploreFamily(user);
    await navigateToLorenzoSmithSr(user);

    // The confirmed family graph still renders regardless of the claim state.
    const childrenZone = screen.getByTestId("explore.zone.children");
    // Exactly one child card renders; the name is not asserted because the
    // upcoming build replaces the raw graph id fallback with the canonical
    // display name (the leaky name is the bug being fixed, not a baseline).
    expect(
      within(childrenZone).getAllByRole("button", { name: / Child$/ }),
    ).toHaveLength(1);
  });
});

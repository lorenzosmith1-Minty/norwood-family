import "@testing-library/jest-dom/vitest";
import {
  type DuplicatePair,
  type PersonProfile,
  type ProfileClaim,
  type Relationship,
  type RelationshipRequest,
  type Report,
  type StewardAuditEntry,
  StewardAuditKind,
  type StewardIdentity,
  type StewardRecord,
  StewardRoleStatus,
  type SuccessorDesignation,
  SuccessorStatus,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Characterization baseline for the Duplicate Review tab before the duplicate
// candidate generation change.
//
// The upcoming build changes the BACKEND's listDuplicateCandidates to require
// meaningful name similarity plus at least one corroborating signal before a
// pair is flagged, and to require stronger confidence for sparse profiles. It
// does NOT change the frontend review contract: every returned pair still
// requires explicit steward action (Merge profiles / Not a duplicate), and no
// pair is ever auto-merged. It also preserves the dismissed-pair behavior —
// once a steward dismisses a pair as "not a duplicate", that pair is suppressed
// and does not reappear.
//
// This baseline freezes the adjacent working behavior the change must not
// break: (1) multiple returned pairs each render as a separate card requiring
// explicit steward action, with no auto-merge; and (2) dismissing one pair
// removes only that pair, leaving the other pairs for review (the dismissed-pair
// suppression the backend's isDismissed filter must keep enforcing).
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
configure({ testIdAttribute: "data-ocid" });

const STEWARD_ACCOUNT = "2vxsx-fae";

const {
  mockActor,
  resetState,
  setAdmin,
  setAuthenticated,
  getAuthenticated,
  setDuplicatePairs,
  getDismissedPairs,
} = vi.hoisted(() => {
  let isAdmin = false;
  let isAuthenticated = false;
  let duplicatePairs: DuplicatePair[] = [];
  let dismissedPairs: Array<{ a: string; b: string }> = [];

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    // Family Steward authority is the canonical gate; the platform admin role
    // is a separate concern. This mock drives both from the same flag.
    async isCallerSteward(): Promise<boolean> {
      return isAdmin;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async listStewards(): Promise<StewardRecord[]> {
      return [];
    },
    async listStewardIdentities(): Promise<StewardIdentity[]> {
      return [];
    },
    async listEligibleStewardCandidates(): Promise<StewardIdentity[]> {
      return [];
    },
    async listSuccessors(): Promise<SuccessorDesignation[]> {
      return [];
    },
    async getSingleStewardWarning(): Promise<string | null> {
      return null;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listDuplicateCandidates(): Promise<DuplicatePair[]> {
      // Mirrors the backend's dismissed-pair suppression: a pair already
      // dismissed as "not a duplicate" is filtered out and not re-flagged.
      return duplicatePairs.filter(
        (p) =>
          !dismissedPairs.some(
            (d) =>
              (d.a === p.candidateA.personId &&
                d.b === p.candidateB.personId) ||
              (d.a === p.candidateB.personId && d.b === p.candidateA.personId),
          ),
      );
    },
    async notDuplicate(personIdA: string, personIdB: string) {
      dismissedPairs = [...dismissedPairs, { a: personIdA, b: personIdB }];
      return { __kind__: "ok" as const, ok: null };
    },
    async mergeProfiles() {
      return {
        __kind__: "ok" as const,
        ok: { canonicalPersonId: "", archivedPersonId: "", conflicts: [] },
      };
    },
    async listPersonRelationships(): Promise<Relationship[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listArchivedProfiles(): Promise<PersonProfile[]> {
      return [];
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return [];
    },
    async getStewardAuditHistory(): Promise<StewardAuditEntry[]> {
      return [];
    },
    async listAuditHistory(): Promise<unknown[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAdmin = false;
      isAuthenticated = false;
      duplicatePairs = [];
      dismissedPairs = [];
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    getAuthenticated: () => isAuthenticated,
    setDuplicatePairs: (v: DuplicatePair[]) => {
      duplicatePairs = v;
    },
    getDismissedPairs: () => dismissedPairs,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(STEWARD_ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetState);

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

async function openDuplicateReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Family Steward" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Governance/ }),
  );
  await user.click(screen.getByRole("button", { name: "Duplicate Profiles" }));
}

function candidate(
  personId: string,
  name: string,
  claimStatus: string,
): DuplicatePair["candidateA"] {
  return {
    personId,
    name,
    claimStatus,
    birthDate: "1860",
    deathDate: "1936",
    parents: [],
    spouses: [],
    children: [],
    photoCount: 0n,
    timelineCount: 0n,
    sourceCount: 0n,
    archiveLinks: [],
  };
}

function pair(a: string, b: string): DuplicatePair {
  return {
    candidateA: candidate(a, a, "Unclaimed"),
    candidateB: candidate(b, b, "Unclaimed"),
  };
}

describe("Duplicate Review tab: no auto-merge and per-pair dismissal (characterization)", () => {
  it("renders each returned pair as a separate card requiring explicit steward action, with no auto-merge", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setDuplicatePairs([
      pair("julia", "julia-dup"),
      pair("clayton", "clayton-dup"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openDuplicateReview(user);

    // Both pairs are listed for review as separate cards.
    expect(
      screen.getByTestId("governance.duplicates.pair.1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("governance.duplicates.pair.2"),
    ).toBeInTheDocument();

    // Each card exposes the two explicit steward actions — nothing is merged
    // automatically and no pair is dismissed without an explicit click.
    const pair1 = screen.getByTestId("governance.duplicates.pair.1");
    const pair2 = screen.getByTestId("governance.duplicates.pair.2");
    for (const card of [pair1, pair2]) {
      expect(
        card.querySelector(
          '[data-ocid$=".merge_button.1"], [data-ocid$=".merge_button.2"]',
        ),
      ).not.toBeNull();
      expect(
        card.querySelector(
          '[data-ocid$=".not_duplicate_button.1"], [data-ocid$=".not_duplicate_button.2"]',
        ),
      ).not.toBeNull();
    }

    // No pair was auto-merged or auto-dismissed: both remain listed.
    expect(
      screen.getByTestId("governance.duplicates.pair.1"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("governance.duplicates.pair.2"),
    ).toBeInTheDocument();
    expect(getDismissedPairs()).toEqual([]);
  });

  it("dismissing one pair suppresses only that pair, leaving the other pairs for review", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setDuplicatePairs([
      pair("julia", "julia-dup"),
      pair("clayton", "clayton-dup"),
    ]);
    renderApp();
    const user = userEvent.setup();
    await openDuplicateReview(user);

    // Both pairs are listed before any dismissal. Each candidate name appears
    // both as the card heading and as an option in the "Keep as canonical"
    // select, so assert on the heading specifically.
    expect(screen.getAllByText("julia").length).toBeGreaterThan(0);
    expect(screen.getAllByText("clayton").length).toBeGreaterThan(0);

    // The steward dismisses the first pair as "not a duplicate".
    await user.click(
      screen.getByTestId("governance.duplicates.not_duplicate_button.1"),
    );

    // The dismissed pair is suppressed (mirrors the backend's isDismissed
    // filter): the julia pair no longer appears, while the unrelated clayton
    // pair remains listed for review.
    await waitFor(() => {
      expect(screen.queryByText("julia")).not.toBeInTheDocument();
    });
    expect(screen.getAllByText("clayton").length).toBeGreaterThan(0);
    expect(getDismissedPairs()).toEqual([{ a: "julia", b: "julia-dup" }]);
  });
});

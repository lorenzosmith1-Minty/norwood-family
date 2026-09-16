import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  type RelationshipRequest,
  type Report,
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
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

// Characterization baseline for the Conflict Review page's loading and empty
// states, before the error-state change.
//
// The upcoming build changes ResearchConflictReviewPage so that, on a query
// error, it shows an error state with a Retry button instead of the empty
// state, and adds a consistency guard comparing getReviewQueue() counts against
// the conflict list. This baseline deliberately does NOT assert the current
// error-masking behavior (showing the empty state on a failed query) — that is
// the bug the change intentionally fixes.
//
// Instead it freezes the adjacent working behavior the change must not break:
//  1. While the conflict-list query is pending, the page shows its loading
//     skeleton (research_conflict.loading_state), not the empty state.
//  2. When the query succeeds with zero conflicts, the page shows the empty
//     state (research_conflict.empty_state, "No conflicts to review").
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const _STEWARD = Principal.fromText(ACCOUNT);

// A deferred promise lets the test hold the conflict-list query in its pending
// (isLoading) state so the loading skeleton is observable before it resolves.
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const {
  mockActor,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setSources,
  setConflicts,
  setReviewQueue,
  holdConflictsPending,
  failConflicts,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let conflicts: ConflictReviewItem[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  // When set, the conflict-list lookup stays pending until the deferred is
  // resolved, letting the test observe the loading skeleton.
  let pendingConflicts: ReturnType<
    typeof deferred<ConflictReviewItem[]>
  > | null = null;
  // When set, the conflict-list lookup rejects, letting the test observe the
  // error state (isError) instead of the empty state.
  let failConflicts = false;

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      return myProfile;
    },
    async getPersonProfile(_personId: string): Promise<PersonProfile | null> {
      return null;
    },
    async getMyProfileClaim(_personId: string): Promise<ProfileClaim | null> {
      return null;
    },
    async listProfileClaims(): Promise<ProfileClaim[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return [];
    },
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
    async listSources(): Promise<SourceRecord[]> {
      return sources;
    },
    async getSource(id: bigint): Promise<SourceRecord | null> {
      return sources.find((s) => s.id === id) ?? null;
    },
    async listFindings(): Promise<unknown[]> {
      return [];
    },
    async getFinding(): Promise<unknown> {
      return null;
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
      if (failConflicts) throw new Error("Conflict list failed to load");
      if (pendingConflicts) return pendingConflicts.promise;
      return conflicts;
    },
    async listConflictsForPerson(
      personId: string,
    ): Promise<ConflictReviewItem[]> {
      return conflicts.filter(
        (c) =>
          c.personId === personId &&
          (c.status === ReviewStatus.Conflicting ||
            c.status === ReviewStatus.NeedsResearch),
      );
    },
    async getResearchAuditLog(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    holdConflictsPending: () => {
      pendingConflicts = deferred<ConflictReviewItem[]>();
      return pendingConflicts;
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      conflicts = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      pendingConflicts = null;
      failConflicts = false;
    },
    getAuthenticated: () => isAuthenticated,
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    setSources: (v: SourceRecord[]) => {
      sources = v;
    },
    setConflicts: (v: ConflictReviewItem[]) => {
      conflicts = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    holdConflictsPending: () => {
      pendingConflicts = deferred<ConflictReviewItem[]>();
      return pendingConflicts;
    },
    failConflicts: (v: boolean) => {
      failConflicts = v;
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
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
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
  render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
  return queryClient;
}

function claimedProfile(personId: string, name: string): PersonProfile {
  return {
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  };
}

async function openConflictReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.open_conflict_review"));
  await screen.findByRole("heading", { name: "Conflict Review" });
}

describe("Conflict Review loading and empty states (characterization)", () => {
  it("shows the loading skeleton while the conflict-list query is pending, not the empty state", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([]);
    setConflicts([]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    // Hold the conflict-list query pending so the loading skeleton is
    // observable before the empty state would render.
    holdConflictsPending();
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // While the query is pending, the page shows the loading skeleton and must
    // NOT show the empty state.
    expect(
      screen.getByTestId("research_conflict.loading_state"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_conflict.empty_state"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No conflicts to review"),
    ).not.toBeInTheDocument();
  });

  it("shows the empty state when the conflict-list query succeeds with zero conflicts", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([]);
    setConflicts([]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // A successful query with no conflicts shows the empty state. This is the
    // behavior the error-state change must preserve for the genuine empty case.
    const empty = await screen.findByTestId("research_conflict.empty_state");
    expect(
      within(empty).getByText("No conflicts to review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_conflict.loading_state"),
    ).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Cover for the Conflict Review error-state and consistency-guard change.
//
// The build makes ResearchConflictReviewPage handle isLoading/isError/error/
// refetch: on a query error it shows 'Conflict Review could not be loaded' with
// a Retry button, never the empty state. It also adds a consistency guard that
// compares getReviewQueue() conflicting+needsResearch counts against the
// conflict list and auto-refetches once when the queue reports unresolved
// conflicts but the list came back empty.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------
describe("Conflict Review error state and consistency guard (cover)", () => {
  it("shows the error state with a Retry button on a query error, never the empty state", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([]);
    setConflicts([]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    // Make the conflict-list query reject so the page enters its error state.
    failConflicts(true);
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // The error state shows the message and a Retry button, and must NOT show
    // the empty state ('No conflicts to review') that previously masked errors.
    const error = await screen.findByTestId("research_conflict.error_state");
    expect(
      within(error).getByText("Conflict Review could not be loaded"),
    ).toBeInTheDocument();
    expect(
      within(error).getByRole("button", { name: /Retry/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_conflict.empty_state"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No conflicts to review"),
    ).not.toBeInTheDocument();
  });

  it("shows the out-of-sync state instead of the empty state when the queue reports unresolved conflicts but the list is empty", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([]);
    setConflicts([]);
    // The review queue reports one unresolved conflict, but the conflict list
    // came back empty — the consistency guard must not show the empty state.
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // The guard auto-refetches once; after the refetch the list is still empty,
    // so the page shows the out-of-sync state, never the empty state.
    const sync = await screen.findByTestId("research_conflict.sync_state");
    expect(
      within(sync).getByText("Conflicts are out of sync"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_conflict.empty_state"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No conflicts to review"),
    ).not.toBeInTheDocument();
  });
});

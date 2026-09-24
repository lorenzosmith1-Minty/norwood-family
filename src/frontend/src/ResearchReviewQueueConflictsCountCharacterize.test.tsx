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
  type ResearchAuditEntry,
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

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Conflict Review change: the
// Review Queue Conflicts count and the default-family conflict read path.
//
// The requested change makes the Review Queue Conflict count family-filtered
// and moves the conflict endpoints onto explicit familyId scoping. The
// DEFAULT-family (Norwood) behavior must not change: the Conflicts tab count and
// the "Conflicts (N)" section title are derived from the legacy
// `listConflictReviewItems()` result, and the default family keeps routing
// through the legacy no-argument conflict endpoints.
//
// This file freezes the adjacent working behavior the change must not break:
//
//   1. The Review Queue Conflicts tab count equals the number of conflicts the
//      legacy `listConflictReviewItems()` returns, and the section title reports
//      the same number.
//   2. The default-family Review Queue reads conflicts through the legacy
//      `listConflictReviewItems()` endpoint (no familyId argument), not a
//      `*ForFamily` variant.
//   3. The Conflicts tab count reflects the status filter, so a filtered view
//      reports the filtered count.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding one is exactly the change under way.
// What it freezes is that the DEFAULT-family read the page makes today keeps
// its current shape and count.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = Principal.fromText(ACCOUNT);

const {
  mockActor,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setSources,
  setConflicts,
  getListConflictsCalls,
  getListConflictsForFamilyCalls,
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
  // Records the exact argument shapes the page passes to the conflict read
  // endpoints, so the default-family consumer contract is asserted, not just
  // the rendered count.
  let listConflictsCalls: unknown[][] = [];
  let listConflictsForFamilyCalls: unknown[][] = [];

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
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      listConflictsCalls = [...listConflictsCalls, args];
      return conflicts;
    },
    // The canonical family-scoped variant must NOT be reached for the default
    // family; it is recorded so a regression that routes Norwood through it is
    // visible.
    async listConflictReviewItemsForFamily(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      listConflictsForFamilyCalls = [...listConflictsForFamilyCalls, args];
      return conflicts;
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
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
      listConflictsCalls = [];
      listConflictsForFamilyCalls = [];
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
    getListConflictsCalls: () => listConflictsCalls,
    getListConflictsForFamilyCalls: () => listConflictsForFamilyCalls,
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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
    familyId: "norwood",
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  };
}

function sourceRecord(id: bigint, title: string): SourceRecord {
  return {
    familyId: "norwood",
    id,
    title,
    sourceType: SourceType.CensusCitation,
    description: "1900 census, Norwood household",
    contributor: STEWARD,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function conflictItem(
  id: bigint,
  status: ReviewStatus = ReviewStatus.Conflicting,
): ConflictReviewItem {
  return {
    id,
    findingId: id,
    field: "Birth date",
    canonicalValue: "1899",
    proposedValue: "1898",
    status,
    evidenceLabel: EvidenceLabel.Conflicting,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 1n,
    familyId: "norwood",
  };
}

async function openReviewQueue(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.open_review_queue"));
  await screen.findByRole("heading", { name: "Review Queue" });
}

function stewardSetup() {
  setAuthenticated(true);
  setAdmin(true);
  setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
  setSources([sourceRecord(1n, "1900 census")]);
}

describe("Review Queue Conflicts count: default-family legacy read (characterization)", () => {
  it("counts the conflicts the legacy listConflictReviewItems() returns on the Conflicts tab", async () => {
    stewardSetup();
    setConflicts([
      conflictItem(1n, ReviewStatus.Conflicting),
      conflictItem(2n, ReviewStatus.NeedsResearch),
      conflictItem(3n, ReviewStatus.Approved),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The Conflicts tab count equals the number of conflicts the legacy
    // endpoint returned (3), independent of status.
    const conflictsTab = screen.getByTestId("research_queue.tab.conflicts");
    expect(within(conflictsTab).getByText("3")).toBeInTheDocument();

    // The section title reports the same count.
    await user.click(conflictsTab);
    expect(screen.getByText("Conflicts (3)")).toBeInTheDocument();
  });

  it("reads conflicts through the legacy listConflictReviewItems() endpoint with no familyId for the default family", async () => {
    stewardSetup();
    setConflicts([conflictItem(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The default family routes through the legacy no-argument endpoint. The
    // page may read the list more than once (mount + refetch), so every
    // recorded call must be the legacy no-argument shape.
    const calls = getListConflictsCalls();
    expect(calls.length).toBeGreaterThan(0);
    for (const args of calls) {
      expect(args).toEqual([]);
    }
    // The canonical family-scoped variant is never reached for Norwood.
    expect(getListConflictsForFamilyCalls()).toEqual([]);
  });

  it("reports the filtered count when a status filter narrows the Conflicts tab", async () => {
    stewardSetup();
    setConflicts([
      conflictItem(1n, ReviewStatus.Conflicting),
      conflictItem(2n, ReviewStatus.NeedsResearch),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.conflicts"));

    // Unfiltered: both conflicts are counted in the section title.
    expect(screen.getByText("Conflicts (2)")).toBeInTheDocument();

    // Filter to Needs Research: the section title reports only the one matching
    // conflict, while the tab count stays the unfiltered total (2).
    await user.click(
      screen.getByTestId("research_queue.status_filter.NeedsResearch"),
    );
    expect(screen.getByText("Conflicts (1)")).toBeInTheDocument();
    const conflictsTab = screen.getByTestId("research_queue.tab.conflicts");
    expect(within(conflictsTab).getByText("2")).toBeInTheDocument();
  });
});

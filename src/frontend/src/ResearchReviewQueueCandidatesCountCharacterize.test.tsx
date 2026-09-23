import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type NewPersonCandidate,
  type PersonProfile,
  type ProfileClaim,
  type RelationshipProposal,
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
// Characterization baseline for the family-scoped New Person Candidate change:
// the Review Queue Candidates count and the default-family candidate read path.
//
// The requested change makes the Review Queue Candidates count family-scoped
// and moves the candidate endpoints onto explicit familyId scoping. The
// DEFAULT-family (Norwood) behavior must not change: the Candidates tab count
// and the "New Person Candidates (N)" section title are derived from the legacy
// `listNewPersonCandidates()` result, and the default family keeps routing
// through the legacy no-argument candidate endpoint.
//
// This file freezes the adjacent working behavior the change must not break:
//
//   1. The Review Queue Candidates tab count equals the number of candidates the
//      legacy `listNewPersonCandidates()` returns, and the section title reports
//      the same number.
//   2. The default-family Review Queue reads candidates through the legacy
//      `listNewPersonCandidates()` endpoint (no familyId argument), not a
//      `*ForFamily` variant.
//   3. The Candidates tab count reflects the status filter, so a filtered view
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
  setCandidates,
  getListNewPersonCandidatesCalls,
  getListNewPersonCandidatesForFamilyCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let candidates: NewPersonCandidate[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  // Records the exact argument shapes the page passes to the candidate read
  // endpoints, so the default-family consumer contract is asserted, not just
  // the rendered count.
  let listNewPersonCandidatesCalls: unknown[][] = [];
  let listNewPersonCandidatesForFamilyCalls: unknown[][] = [];

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
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      listNewPersonCandidatesCalls = [...listNewPersonCandidatesCalls, []];
      return candidates;
    },
    // The canonical family-scoped variant must NOT be reached for the default
    // family; it is recorded so a regression that routes Norwood through it is
    // visible.
    async listNewPersonCandidatesForFamily(
      ...args: unknown[]
    ): Promise<NewPersonCandidate[]> {
      listNewPersonCandidatesForFamilyCalls = [
        ...listNewPersonCandidatesForFamilyCalls,
        args,
      ];
      return candidates;
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      candidates = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      listNewPersonCandidatesCalls = [];
      listNewPersonCandidatesForFamilyCalls = [];
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
    setCandidates: (v: NewPersonCandidate[]) => {
      candidates = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    getListNewPersonCandidatesCalls: () => listNewPersonCandidatesCalls,
    getListNewPersonCandidatesForFamilyCalls: () =>
      listNewPersonCandidatesForFamilyCalls,
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

function candidate(
  id: bigint,
  name: string,
  status: ReviewStatus,
): NewPersonCandidate {
  return {
    familyId: "norwood",
    id,
    name,
    details: "A previously unrecorded family member.",
    sourceId: 1n,
    status,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
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

describe("Review Queue Candidates count: default-family legacy read (characterization)", () => {
  it("counts the candidates the legacy listNewPersonCandidates() returns on the Candidates tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([
      candidate(1n, "Pending Norwood", ReviewStatus.Pending),
      candidate(2n, "Approved Norwood", ReviewStatus.Approved),
      candidate(3n, "Rejected Norwood", ReviewStatus.Rejected),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The Candidates tab count equals the number of candidates the legacy
    // endpoint returned (3), independent of status.
    const candidatesTab = screen.getByTestId("research_queue.tab.candidates");
    expect(within(candidatesTab).getByText("3")).toBeInTheDocument();

    // The section title reports the same count.
    await user.click(candidatesTab);
    expect(screen.getByText("New Person Candidates (3)")).toBeInTheDocument();
  });

  it("reads candidates through the legacy listNewPersonCandidates() endpoint with no familyId for the default family", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Pending Norwood", ReviewStatus.Pending)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The default family routes through the legacy no-argument endpoint.
    expect(getListNewPersonCandidatesCalls()).toEqual([[]]);
    // The canonical family-scoped variant is never reached for Norwood.
    expect(getListNewPersonCandidatesForFamilyCalls()).toEqual([]);
  });

  it("reports the filtered count when a status filter narrows the Candidates tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([
      candidate(1n, "Pending Norwood", ReviewStatus.Pending),
      candidate(2n, "Needs research Norwood", ReviewStatus.NeedsResearch),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.candidates"));

    // Unfiltered: both candidates are counted in the section title.
    expect(screen.getByText("New Person Candidates (2)")).toBeInTheDocument();

    // Filter to Needs Research: the section title reports only the one matching
    // candidate, while the tab count stays the unfiltered total (2).
    await user.click(
      screen.getByTestId("research_queue.status_filter.NeedsResearch"),
    );
    expect(screen.getByText("New Person Candidates (1)")).toBeInTheDocument();
    const candidatesTab = screen.getByTestId("research_queue.tab.candidates");
    expect(within(candidatesTab).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Needs research Norwood")).toBeInTheDocument();
    expect(screen.queryByText("Pending Norwood")).not.toBeInTheDocument();
  });
});

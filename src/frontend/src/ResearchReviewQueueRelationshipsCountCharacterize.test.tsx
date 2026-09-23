import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
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
// Characterization baseline for the family-scoped Relationship Proposal
// review change (Tenancy 1C-B2-B3-A2).
//
// The requested change moves the proposal approve/reject actions onto the
// family-scoped endpoints (with the active family from the centralized
// FamilyContext) and makes the Review Queue Relationships portion and count
// family-filtered. The DEFAULT-family (Norwood) behavior must NOT change: the
// Review Queue Relationships tab count and the "Relationship Proposals (N)"
// section title are derived from the legacy `listRelationshipProposals()`
// result, the default family keeps routing through the legacy no-argument
// proposal endpoints, and the default-family approve/reject journey keeps
// calling the legacy single-argument methods.
//
// This file freezes the adjacent working behavior the change must not break:
//
//   1. The Review Queue Relationships tab count equals the number of proposals
//      the legacy `listRelationshipProposals()` returns, and the section title
//      reports the same number.
//   2. The default-family Review Queue reads proposals through the legacy
//      `listRelationshipProposals()` endpoint (no familyId argument), not a
//      `*ForFamily` variant.
//   3. The default-family approve/reject journey calls the legacy
//      `approveRelationshipProposal(id)` / `rejectRelationshipProposal(id)`
//      with the id and no familyId, and transitions the proposal's status.
//   4. The Relationships tab count reflects the status filter, so a filtered
//      view reports the filtered count.
//
// It deliberately does NOT freeze the non-default-family branch — routing to
// `*ForFamily` with an explicit familyId is exactly the behavior being added —
// nor the backend queue's Relationships section, which is the other half of the
// change.
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
  setProposals,
  getListProposalsCalls,
  getListProposalsForFamilyCalls,
  getApproveCalls,
  getRejectCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let proposals: RelationshipProposal[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  // Records the exact argument shapes the page passes to the proposal read and
  // review endpoints, so the default-family consumer contract is asserted, not
  // just the rendered count.
  let listProposalsCalls: unknown[][] = [];
  let listProposalsForFamilyCalls: unknown[][] = [];
  let approveCalls: unknown[][] = [];
  let rejectCalls: unknown[][] = [];

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
    async listFindings(): Promise<unknown[]> {
      return [];
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async listRelationshipProposals(
      ...args: unknown[]
    ): Promise<RelationshipProposal[]> {
      listProposalsCalls = [...listProposalsCalls, args];
      return proposals;
    },
    // The canonical family-scoped variant must NOT be reached for the default
    // family; it is recorded so a regression that routes Norwood through it is
    // visible.
    async listRelationshipProposalsForFamily(
      ...args: unknown[]
    ): Promise<RelationshipProposal[]> {
      listProposalsForFamilyCalls = [...listProposalsForFamilyCalls, args];
      return proposals;
    },
    async approveRelationshipProposal(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      approveCalls = [...approveCalls, args];
      const id = args[0] as bigint;
      const found = proposals.find((p) => p.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: ReviewStatus.Approved } : p,
      );
      return proposals.find((p) => p.id === id) ?? null;
    },
    async rejectRelationshipProposal(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      rejectCalls = [...rejectCalls, args];
      const id = args[0] as bigint;
      const found = proposals.find((p) => p.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: ReviewStatus.Rejected } : p,
      );
      return proposals.find((p) => p.id === id) ?? null;
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      proposals = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      listProposalsCalls = [];
      listProposalsForFamilyCalls = [];
      approveCalls = [];
      rejectCalls = [];
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
    setProposals: (v: RelationshipProposal[]) => {
      proposals = v;
    },
    getListProposalsCalls: () => listProposalsCalls,
    getListProposalsForFamilyCalls: () => listProposalsForFamilyCalls,
    getApproveCalls: () => approveCalls,
    getRejectCalls: () => rejectCalls,
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

function proposal(
  id: bigint,
  status: ReviewStatus = ReviewStatus.Pending,
): RelationshipProposal {
  return {
    familyId: "norwood",
    id,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
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

function stewardSetup() {
  setAuthenticated(true);
  setAdmin(true);
  setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
  setSources([sourceRecord(1n, "1900 census")]);
}

describe("Review Queue Relationships count: default-family legacy read (characterization)", () => {
  it("counts the proposals the legacy listRelationshipProposals() returns on the Relationships tab", async () => {
    stewardSetup();
    setProposals([
      proposal(1n, ReviewStatus.Pending),
      proposal(2n, ReviewStatus.Approved),
      proposal(3n, ReviewStatus.Rejected),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The Relationships tab count equals the number of proposals the legacy
    // endpoint returned (3), independent of status.
    const relationshipsTab = screen.getByTestId(
      "research_queue.tab.relationships",
    );
    expect(within(relationshipsTab).getByText("3")).toBeInTheDocument();

    // The section title reports the same count.
    await user.click(relationshipsTab);
    expect(screen.getByText("Relationship Proposals (3)")).toBeInTheDocument();
  });

  it("reads proposals through the legacy listRelationshipProposals() endpoint with no familyId for the default family", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The default family routes through the legacy no-argument endpoint.
    expect(getListProposalsCalls()).toEqual([[]]);
    // The canonical family-scoped variant is never reached for Norwood.
    expect(getListProposalsForFamilyCalls()).toEqual([]);
  });

  it("reports the filtered count when a status filter narrows the Relationships tab", async () => {
    stewardSetup();
    setProposals([
      proposal(1n, ReviewStatus.Pending),
      proposal(2n, ReviewStatus.NeedsResearch),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    // Unfiltered: both proposals are counted in the section title.
    expect(screen.getByText("Relationship Proposals (2)")).toBeInTheDocument();

    // Filter to Needs Research: the section title reports only the one matching
    // proposal, while the tab count stays the unfiltered total (2).
    await user.click(
      screen.getByTestId("research_queue.status_filter.NeedsResearch"),
    );
    expect(screen.getByText("Relationship Proposals (1)")).toBeInTheDocument();
    const relationshipsTab = screen.getByTestId(
      "research_queue.tab.relationships",
    );
    expect(within(relationshipsTab).getByText("2")).toBeInTheDocument();
  });
});

describe("Relationship Proposal review actions: default-family legacy call shape (characterization)", () => {
  it("approves a PENDING proposal through the legacy approveRelationshipProposal(id) with no familyId", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    await user.click(
      await screen.findByTestId("research_queue.relationship.0.approve_button"),
    );

    // The default-family call keeps the exact legacy single-argument shape: the
    // id and no familyId inserted anywhere.
    await vi.waitFor(() => {
      expect(getApproveCalls()).toEqual([[1n]]);
    });
    const proposals = await mockActor.listRelationshipProposals();
    expect(proposals[0].status).toBe(ReviewStatus.Approved);
  });

  it("rejects a PENDING proposal through the legacy rejectRelationshipProposal(id) with no familyId", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    await user.click(
      await screen.findByTestId("research_queue.relationship.0.reject_button"),
    );

    await vi.waitFor(() => {
      expect(getRejectCalls()).toEqual([[1n]]);
    });
    const proposals = await mockActor.listRelationshipProposals();
    expect(proposals[0].status).toBe(ReviewStatus.Rejected);
  });
});

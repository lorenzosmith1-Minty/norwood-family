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
import { FamilyProvider } from "@/context/FamilyContext";
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
import { ResearchReviewQueuePage } from "./pages/ResearchReviewQueuePage";

// ---------------------------------------------------------------------------
// Cover for the family-scoped Relationship Proposal review change
// (Tenancy 1C-B2-B3-A2), non-default-family branch.
//
// The change moves the proposal approve/reject actions onto the family-scoped
// endpoints (with the active family from the centralized FamilyContext) and
// makes the Review Queue Relationships portion and count family-filtered. This
// suite asserts the frontend consumer contract for a NON-default family:
//
//   1. The Review Queue Relationships tab count and section title are derived
//      from the family-scoped `listRelationshipProposalsForFamily(familyId)`
//      result, so only that family's proposals are counted.
//   2. The queue badge counts come from `getReviewQueueForFamily(familyId)`.
//   3. Approving a PENDING proposal calls
//      `approveRelationshipProposalForFamily(familyId, id)` — the familyId is
//      the first positional argument — and never the legacy single-argument
//      `approveRelationshipProposal(id)`.
//   4. Rejecting a PENDING proposal calls
//      `rejectRelationshipProposalForFamily(familyId, id)` and never the legacy
//      `rejectRelationshipProposal(id)`.
//
// The page is rendered directly inside `FamilyProvider familyId={FAMILY_A}`
// (the app shell only mounts the default family), so the non-default branch is
// exercised end-to-end through the real page component and hooks.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";
const STEWARD = Principal.fromText(ACCOUNT);
const FAMILY_A = "test-family-a";

const {
  mockActor,
  resetState,
  getAuthenticated,
  setAuthenticated,
  setAdmin,
  setMyProfile,
  setSources,
  setProposals,
  setReviewQueue,
  getListProposalsCalls,
  getListProposalsForFamilyCalls,
  getQueueCalls,
  getQueueForFamilyCalls,
  getApproveCalls,
  getApproveForFamilyCalls,
  getRejectCalls,
  getRejectForFamilyCalls,
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
  // Records the exact argument shapes the page passes to the proposal read,
  // queue read, and review endpoints, so the non-default-family consumer
  // contract is asserted, not just the rendered count.
  let listProposalsCalls: unknown[][] = [];
  let listProposalsForFamilyCalls: unknown[][] = [];
  let queueCalls: unknown[][] = [];
  let queueForFamilyCalls: unknown[][] = [];
  let approveCalls: unknown[][] = [];
  let approveForFamilyCalls: unknown[][] = [];
  let rejectCalls: unknown[][] = [];
  let rejectForFamilyCalls: unknown[][] = [];

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
    // The legacy no-argument endpoints must NOT be reached for a non-default
    // family; they are recorded so a regression that falls back to them is
    // visible.
    async getReviewQueue(...args: unknown[]): Promise<ReviewQueue> {
      queueCalls = [...queueCalls, args];
      return reviewQueue;
    },
    async getReviewQueueForFamily(...args: unknown[]): Promise<ReviewQueue> {
      queueForFamilyCalls = [...queueForFamilyCalls, args];
      return reviewQueue;
    },
    async listRelationshipProposals(
      ...args: unknown[]
    ): Promise<RelationshipProposal[]> {
      listProposalsCalls = [...listProposalsCalls, args];
      return proposals;
    },
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
      return null;
    },
    async approveRelationshipProposalForFamily(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      approveForFamilyCalls = [...approveForFamilyCalls, args];
      const id = args[1] as bigint;
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
      return null;
    },
    async rejectRelationshipProposalForFamily(
      ...args: unknown[]
    ): Promise<RelationshipProposal | null> {
      rejectForFamilyCalls = [...rejectForFamilyCalls, args];
      const id = args[1] as bigint;
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
      queueCalls = [];
      queueForFamilyCalls = [];
      approveCalls = [];
      approveForFamilyCalls = [];
      rejectCalls = [];
      rejectForFamilyCalls = [];
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
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    getListProposalsCalls: () => listProposalsCalls,
    getListProposalsForFamilyCalls: () => listProposalsForFamilyCalls,
    getQueueCalls: () => queueCalls,
    getQueueForFamilyCalls: () => queueForFamilyCalls,
    getApproveCalls: () => approveCalls,
    getApproveForFamilyCalls: () => approveForFamilyCalls,
    getRejectCalls: () => rejectCalls,
    getRejectForFamilyCalls: () => rejectForFamilyCalls,
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

function renderQueuePage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>
        <ResearchReviewQueuePage onBack={() => {}} />
      </FamilyProvider>
    </QueryClientProvider>,
  );
  return queryClient;
}

function claimedProfile(personId: string, name: string): PersonProfile {
  return {
    familyId: FAMILY_A,
    personId,
    name,
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  };
}

function sourceRecord(id: bigint, title: string): SourceRecord {
  return {
    familyId: FAMILY_A,
    id,
    title,
    sourceType: SourceType.CensusCitation,
    description: "1900 census, Family A household",
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
    familyId: FAMILY_A,
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

function stewardSetup() {
  setAuthenticated(true);
  setAdmin(true);
  setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
  setSources([sourceRecord(1n, "1900 census")]);
}

async function openRelationshipsTab(user: ReturnType<typeof userEvent.setup>) {
  await screen.findByRole("heading", { name: "Review Queue" });
  await user.click(screen.getByTestId("research_queue.tab.relationships"));
}

describe("Review Queue Relationships count: non-default family is family-filtered (cover)", () => {
  it("counts only the proposals listRelationshipProposalsForFamily(familyId) returns", async () => {
    stewardSetup();
    setProposals([
      proposal(1n, ReviewStatus.Pending),
      proposal(2n, ReviewStatus.Approved),
    ]);
    const user = userEvent.setup();
    renderQueuePage();
    await openRelationshipsTab(user);

    // The Relationships tab count equals the number of proposals the
    // family-scoped endpoint returned (2), independent of status.
    const relationshipsTab = screen.getByTestId(
      "research_queue.tab.relationships",
    );
    expect(within(relationshipsTab).getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Relationship Proposals (2)")).toBeInTheDocument();
  });

  it("reads proposals through listRelationshipProposalsForFamily(familyId) and never the legacy endpoint", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderQueuePage();
    await openRelationshipsTab(user);

    // The non-default family routes through the family-scoped endpoint with the
    // active familyId as the sole argument.
    expect(getListProposalsForFamilyCalls()).toEqual([[FAMILY_A]]);
    // The legacy no-argument endpoint is never reached.
    expect(getListProposalsCalls()).toEqual([]);
  });

  it("reads the queue badge counts through getReviewQueueForFamily(familyId)", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderQueuePage();
    await openRelationshipsTab(user);

    expect(getQueueForFamilyCalls()).toEqual([[FAMILY_A]]);
    expect(getQueueCalls()).toEqual([]);
  });
});

describe("Relationship Proposal review actions: non-default family routes to *ForFamily (cover)", () => {
  it("approves a PENDING proposal through approveRelationshipProposalForFamily(familyId, id)", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderQueuePage();
    await openRelationshipsTab(user);

    await user.click(
      await screen.findByTestId("research_queue.relationship.0.approve_button"),
    );

    // The familyId is the first positional argument, followed by the proposal
    // id; the legacy single-argument endpoint is never reached.
    await vi.waitFor(() => {
      expect(getApproveForFamilyCalls()).toEqual([[FAMILY_A, 1n]]);
    });
    expect(getApproveCalls()).toEqual([]);
    const proposals =
      await mockActor.listRelationshipProposalsForFamily(FAMILY_A);
    expect(proposals[0].status).toBe(ReviewStatus.Approved);
  });

  it("rejects a PENDING proposal through rejectRelationshipProposalForFamily(familyId, id)", async () => {
    stewardSetup();
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderQueuePage();
    await openRelationshipsTab(user);

    await user.click(
      await screen.findByTestId("research_queue.relationship.0.reject_button"),
    );

    await vi.waitFor(() => {
      expect(getRejectForFamilyCalls()).toEqual([[FAMILY_A, 1n]]);
    });
    expect(getRejectCalls()).toEqual([]);
    const proposals =
      await mockActor.listRelationshipProposalsForFamily(FAMILY_A);
    expect(proposals[0].status).toBe(ReviewStatus.Rejected);
  });
});

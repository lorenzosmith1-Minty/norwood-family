import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type NewPersonCandidate,
  type PersonProfile,
  type RelationshipProposal,
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

// Cover for the Research Review Actions + Review Queue Badge change.
//
// The build adds Approve/Reject/Needs Research action buttons to the New Person
// Candidate and Relationship Proposal cards in the Review Queue (previously
// display-only), and a numeric badge on the Research Intake -> Review Queue
// button that aggregates unresolved Sources, Findings, Candidates, and
// Relationships (hidden at zero).
//
// This file covers the new observable behavior:
//  1. A PENDING candidate card shows Approve/Reject/Needs Research buttons, and
//     each action calls the corresponding backend method and transitions the
//     candidate's status.
//  2. A PENDING relationship proposal card shows Approve/Reject/Needs Research
//     buttons, and each action calls the corresponding backend method and
//     transitions the proposal's status.
//  3. The Review Queue button shows a numeric badge derived from the canonical
//     review queue pending count, and hides it at zero.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
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
  setProposals,
  setReviewQueue,
  getApprovedCandidateIds,
  getRejectedCandidateIds,
  getNeedsResearchCandidateIds,
  getApprovedProposalIds,
  getRejectedProposalIds,
  getNeedsResearchProposalIds,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let candidates: NewPersonCandidate[] = [];
  let proposals: RelationshipProposal[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  let approvedCandidateIds: bigint[] = [];
  let rejectedCandidateIds: bigint[] = [];
  let needsResearchCandidateIds: bigint[] = [];
  let approvedProposalIds: bigint[] = [];
  let rejectedProposalIds: bigint[] = [];
  let needsResearchProposalIds: bigint[] = [];

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
    async getMyProfileClaim(_personId: string): Promise<unknown> {
      return null;
    },
    async listProfileClaims(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listReports(): Promise<unknown[]> {
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
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      return candidates;
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return proposals;
    },
    async getResearchAuditLog(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async approveNewPersonCandidate(
      id: bigint,
    ): Promise<NewPersonCandidate | null> {
      const found = candidates.find((c) => c.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      candidates = candidates.map((c) =>
        c.id === id ? { ...c, status: ReviewStatus.Approved } : c,
      );
      approvedCandidateIds = [...approvedCandidateIds, id];
      return candidates.find((c) => c.id === id) ?? null;
    },
    async rejectNewPersonCandidate(
      id: bigint,
    ): Promise<NewPersonCandidate | null> {
      const found = candidates.find((c) => c.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      candidates = candidates.map((c) =>
        c.id === id ? { ...c, status: ReviewStatus.Rejected } : c,
      );
      rejectedCandidateIds = [...rejectedCandidateIds, id];
      return candidates.find((c) => c.id === id) ?? null;
    },
    async needsResearchNewPersonCandidate(
      id: bigint,
    ): Promise<NewPersonCandidate | null> {
      const found = candidates.find((c) => c.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      candidates = candidates.map((c) =>
        c.id === id ? { ...c, status: ReviewStatus.NeedsResearch } : c,
      );
      needsResearchCandidateIds = [...needsResearchCandidateIds, id];
      return candidates.find((c) => c.id === id) ?? null;
    },
    async approveRelationshipProposal(
      id: bigint,
    ): Promise<RelationshipProposal | null> {
      const found = proposals.find((p) => p.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: ReviewStatus.Approved } : p,
      );
      approvedProposalIds = [...approvedProposalIds, id];
      return proposals.find((p) => p.id === id) ?? null;
    },
    async rejectRelationshipProposal(
      id: bigint,
    ): Promise<RelationshipProposal | null> {
      const found = proposals.find((p) => p.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: ReviewStatus.Rejected } : p,
      );
      rejectedProposalIds = [...rejectedProposalIds, id];
      return proposals.find((p) => p.id === id) ?? null;
    },
    async needsResearchRelationshipProposal(
      id: bigint,
    ): Promise<RelationshipProposal | null> {
      const found = proposals.find((p) => p.id === id);
      if (!found || found.status !== ReviewStatus.Pending) return null;
      proposals = proposals.map((p) =>
        p.id === id ? { ...p, status: ReviewStatus.NeedsResearch } : p,
      );
      needsResearchProposalIds = [...needsResearchProposalIds, id];
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
      candidates = [];
      proposals = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      approvedCandidateIds = [];
      rejectedCandidateIds = [];
      needsResearchCandidateIds = [];
      approvedProposalIds = [];
      rejectedProposalIds = [];
      needsResearchProposalIds = [];
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
    setProposals: (v: RelationshipProposal[]) => {
      proposals = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    getApprovedCandidateIds: () => approvedCandidateIds,
    getRejectedCandidateIds: () => rejectedCandidateIds,
    getNeedsResearchCandidateIds: () => needsResearchCandidateIds,
    getApprovedProposalIds: () => approvedProposalIds,
    getRejectedProposalIds: () => rejectedProposalIds,
    getNeedsResearchProposalIds: () => needsResearchProposalIds,
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
    livingStatus: "Living" as PersonProfile["livingStatus"],
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

function candidate(id: bigint, name: string): NewPersonCandidate {
  return {
    id,
    name,
    details: "A previously unrecorded family member.",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
  };
}

function proposal(id: bigint): RelationshipProposal {
  return {
    id,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId: 1n,
    status: ReviewStatus.Pending,
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

describe("New Person Candidate review actions", () => {
  it("shows Approve/Reject/Needs Research buttons on a PENDING candidate card", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.candidates"));

    const card = await screen.findByTestId("research_queue.candidate.0");
    expect(
      within(card).getByTestId("research_queue.candidate.0.approve_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("research_queue.candidate.0.reject_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId(
        "research_queue.candidate.0.needs_research_button",
      ),
    ).toBeInTheDocument();
  });

  it("approves a PENDING candidate, calling approveNewPersonCandidate and marking it Approved", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.candidates"));

    await user.click(
      await screen.findByTestId("research_queue.candidate.0.approve_button"),
    );

    expect(getApprovedCandidateIds()).toEqual([1n]);
    const candidates = await mockActor.listNewPersonCandidates();
    expect(candidates[0].status).toBe(ReviewStatus.Approved);
  });

  it("rejects a PENDING candidate, calling rejectNewPersonCandidate and marking it Rejected", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.candidates"));

    await user.click(
      await screen.findByTestId("research_queue.candidate.0.reject_button"),
    );

    expect(getRejectedCandidateIds()).toEqual([1n]);
    const candidates = await mockActor.listNewPersonCandidates();
    expect(candidates[0].status).toBe(ReviewStatus.Rejected);
  });

  it("marks a PENDING candidate as Needs Research, preserving it with status NEEDS_RESEARCH", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.candidates"));

    await user.click(
      await screen.findByTestId(
        "research_queue.candidate.0.needs_research_button",
      ),
    );

    expect(getNeedsResearchCandidateIds()).toEqual([1n]);
    const candidates = await mockActor.listNewPersonCandidates();
    expect(candidates[0].status).toBe(ReviewStatus.NeedsResearch);
    expect(candidates[0].details).toBe(
      "A previously unrecorded family member.",
    );
  });
});

describe("Relationship Proposal review actions", () => {
  it("shows Approve/Reject/Needs Research buttons on a PENDING proposal card", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    const card = await screen.findByTestId("research_queue.relationship.0");
    expect(
      within(card).getByTestId("research_queue.relationship.0.approve_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId("research_queue.relationship.0.reject_button"),
    ).toBeInTheDocument();
    expect(
      within(card).getByTestId(
        "research_queue.relationship.0.needs_research_button",
      ),
    ).toBeInTheDocument();
  });

  it("approves a PENDING proposal, calling approveRelationshipProposal and marking it Approved", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    await user.click(
      await screen.findByTestId("research_queue.relationship.0.approve_button"),
    );

    expect(getApprovedProposalIds()).toEqual([1n]);
    const proposals = await mockActor.listRelationshipProposals();
    expect(proposals[0].status).toBe(ReviewStatus.Approved);
  });

  it("rejects a PENDING proposal, calling rejectRelationshipProposal and marking it Rejected", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    await user.click(
      await screen.findByTestId("research_queue.relationship.0.reject_button"),
    );

    expect(getRejectedProposalIds()).toEqual([1n]);
    const proposals = await mockActor.listRelationshipProposals();
    expect(proposals[0].status).toBe(ReviewStatus.Rejected);
  });

  it("marks a PENDING proposal as Needs Research, preserving it with status NEEDS_RESEARCH", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    await user.click(
      await screen.findByTestId(
        "research_queue.relationship.0.needs_research_button",
      ),
    );

    expect(getNeedsResearchProposalIds()).toEqual([1n]);
    const proposals = await mockActor.listRelationshipProposals();
    expect(proposals[0].status).toBe(ReviewStatus.NeedsResearch);
    expect(proposals[0].relationshipType).toBe("Father");
  });
});

describe("Review Queue button badge", () => {
  it("shows a numeric badge on the Review Queue button when pending items exist", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setReviewQueue({
      pending: 4n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    const button = screen.getByTestId("research_intake.open_review_queue");
    const badge = within(button).getByTestId(
      "research_intake.review_queue_badge",
    );
    expect(badge).toHaveTextContent("4");
  });

  it("hides the Review Queue badge when there are no pending items", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
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
    await openResearchIntake(user);

    const button = screen.getByTestId("research_intake.open_review_queue");
    expect(
      within(button).queryByTestId("research_intake.review_queue_badge"),
    ).not.toBeInTheDocument();
  });
});

async function openResearchIntake(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
}

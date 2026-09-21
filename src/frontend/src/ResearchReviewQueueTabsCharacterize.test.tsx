import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  LivingStatus,
  type NewPersonCandidate,
  type PersonProfile,
  type ProfileClaim,
  type ProposedFinding,
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

// Characterization baseline for the Research Review Queue and the Family
// Steward hub's Research Intake count, protecting the behavior that must
// survive the upcoming research-intake review change.
//
// The upcoming build intentionally changes three things: pending Research
// Intake records (Sources, Proposed Findings, New Person Candidates,
// Relationship Proposals, Conflict Review items) will enter the review queue,
// research will contribute to the Family Steward action badge, and research
// notifications will be created. This baseline deliberately does NOT assert any
// of those new behaviors. Instead it freezes the adjacent working behavior the
// change must not break:
//
//  1. The Review Queue's existing tabs (Findings, Candidates, Relationships,
//     Audit) each render their content — the change adds a Sources tab but must
//     not disturb these.
//  2. A finding card renders its evidence label, finding type, status pill,
//     source chip, submitted-by, and the routing label for an approved finding.
//  3. The Family Steward hub's Research Intake option shows a count badge
//     derived from the canonical review queue (pending + needs-research).
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
  setFindings,
  setCandidates,
  setProposals,
  setAudit,
  setReviewQueue,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let candidates: NewPersonCandidate[] = [];
  let proposals: RelationshipProposal[] = [];
  let audit: ResearchAuditEntry[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  let pendingClaims: ProfileClaim[] = [];
  let pendingRequests: RelationshipRequest[] = [];
  let pendingReports: Report[] = [];
  let pendingArchive: unknown[] = [];

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
      return pendingClaims;
    },
    async listRelationshipRequests(): Promise<RelationshipRequest[]> {
      return pendingRequests;
    },
    async listReports(): Promise<Report[]> {
      return pendingReports;
    },
    async listPendingArchiveItems(): Promise<unknown[]> {
      return pendingArchive;
    },
    async listNotifications(): Promise<unknown[]> {
      return [];
    },
    async listSources(): Promise<SourceRecord[]> {
      return sources;
    },
    async listFindings(): Promise<ProposedFinding[]> {
      return findings;
    },
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      return candidates;
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return proposals;
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return audit;
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
      findings = [];
      candidates = [];
      proposals = [];
      audit = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      pendingClaims = [];
      pendingRequests = [];
      pendingReports = [];
      pendingArchive = [];
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
    setFindings: (v: ProposedFinding[]) => {
      findings = v;
    },
    setCandidates: (v: NewPersonCandidate[]) => {
      candidates = v;
    },
    setProposals: (v: RelationshipProposal[]) => {
      proposals = v;
    },
    setAudit: (v: ResearchAuditEntry[]) => {
      audit = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    setPendingClaims: (v: ProfileClaim[]) => {
      pendingClaims = v;
    },
    setPendingRequests: (v: RelationshipRequest[]) => {
      pendingRequests = v;
    },
    setPendingReports: (v: Report[]) => {
      pendingReports = v;
    },
    setPendingArchive: (v: unknown[]) => {
      pendingArchive = v;
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

function pendingFinding(id: bigint, title: string): ProposedFinding {
  return {
    id,
    title,
    evidenceLabel: EvidenceLabel.Documented,
    findingType: FindingType.PersonFact,
    content: {
      __kind__: "PersonFact",
      PersonFact: {
        field: "Birth date",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId: 1n,
    personId: "julia",
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function approvedFinding(id: bigint, title: string): ProposedFinding {
  return {
    id,
    title,
    evidenceLabel: EvidenceLabel.Documented,
    findingType: FindingType.PersonFact,
    content: {
      __kind__: "PersonFact",
      PersonFact: {
        field: "Birth date",
        value: "12 March 1898",
        personId: "julia",
      },
    },
    sourceId: 1n,
    personId: "julia",
    status: ReviewStatus.Approved,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
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

function auditEntry(id: bigint): ResearchAuditEntry {
  return {
    id,
    action: "approve_finding",
    findingId: 1n,
    actorId: STEWARD,
    summary: "Approved finding #1",
    timestamp: 1_700_000_000_000_000_000n,
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

describe("Research Review Queue: existing tabs survive", () => {
  it("renders the Findings, Candidates, Relationships, and Audit tabs", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    setProposals([proposal(1n)]);
    setAudit([auditEntry(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // All four existing tabs are present with their counts.
    const tabs = screen.getByTestId("research_queue.tabs");
    expect(
      within(tabs).getByRole("button", { name: /Findings/ }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole("button", { name: /Candidates/ }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole("button", { name: /Relationships/ }),
    ).toBeInTheDocument();
    expect(
      within(tabs).getByRole("button", { name: /Audit/ }),
    ).toBeInTheDocument();
  });

  it("renders a New Person Candidate in the Candidates tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.candidates"));
    expect(await screen.findByText("Unknown Norwood")).toBeInTheDocument();
    expect(screen.getByText("New person candidate")).toBeInTheDocument();
    expect(
      screen.getByText("A previously unrecorded family member."),
    ).toBeInTheDocument();
  });

  it("renders a Relationship Proposal in the Relationships tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.relationships"));
    expect(
      await screen.findByText("Relationship proposal"),
    ).toBeInTheDocument();
    expect(screen.getByText("Father")).toBeInTheDocument();
  });

  it("renders an audit entry in the Audit tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setAudit([auditEntry(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.audit"));
    expect(await screen.findByText("approve_finding")).toBeInTheDocument();
    expect(screen.getByText("Approved finding #1")).toBeInTheDocument();
  });
});

describe("Research Review Queue: finding card rendering", () => {
  it("shows evidence label, finding type, status pill, source chip, and submitted-by", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    const card = screen.getByTestId("research_queue.finding.0");
    expect(
      within(card).getByText("Birth date of Julia Norwood"),
    ).toBeInTheDocument();
    // Evidence label and finding type (rendered with the human label).
    expect(within(card).getByText("Documented")).toBeInTheDocument();
    expect(within(card).getByText("Person fact")).toBeInTheDocument();
    // Status pill.
    expect(within(card).getByText("Pending")).toBeInTheDocument();
    // Source chip resolves the linked source title.
    expect(within(card).getByText("1900 census")).toBeInTheDocument();
    // Submitted-by principal is shortened.
    expect(within(card).getByText(/Submitted by/)).toBeInTheDocument();
    // The finding content summary is shown.
    expect(
      within(card).getByText("Birth date: 12 March 1898"),
    ).toBeInTheDocument();
  });

  it("shows the routing label for an approved finding instead of approve/reject actions", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([approvedFinding(1n, "Birth date of Julia Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    const card = screen.getByTestId("research_queue.finding.0");
    // An approved PersonFact finding routes to the Profile.
    expect(within(card).getByText("Routed to")).toBeInTheDocument();
    expect(within(card).getByText("Profile")).toBeInTheDocument();
    // No approve/reject actions remain for an approved finding.
    expect(
      within(card).queryByTestId("research_queue.finding.0.approve_button"),
    ).not.toBeInTheDocument();
    expect(
      within(card).queryByTestId("research_queue.finding.0.reject_button"),
    ).not.toBeInTheDocument();
  });
});

describe("Family Steward hub: Research Intake count badge", () => {
  it("shows a count badge on the Research Intake option derived from pending + needs-research", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setReviewQueue({
      pending: 2n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 1n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();

    await user.click(
      await screen.findByRole("button", { name: /Family Steward/ }),
    );

    const option = screen.getByTestId("steward_hub.research_intake_option");
    const badge = within(option).getByTestId("steward_hub.count_badge");
    // pending (2) + needs-research (1) = 3.
    expect(badge).toHaveTextContent("3");
    expect(badge).toHaveAttribute("aria-label", "3 pending");
  });

  it("hides the Research Intake count badge when there is no pending or needs-research work", async () => {
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

    await user.click(
      await screen.findByRole("button", { name: /Family Steward/ }),
    );

    const option = screen.getByTestId("steward_hub.research_intake_option");
    expect(
      within(option).queryByTestId("steward_hub.count_badge"),
    ).not.toBeInTheDocument();
  });
});

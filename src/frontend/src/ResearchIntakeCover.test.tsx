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
  ReportStatus,
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

// Cover for the Historical Research Intake feature:
//
//  1. Research Intake is reachable from the Family Steward hub.
//  2. A steward can record a Source (with an optional Archive link) and a
//     Proposed Finding carrying one evidence label (Documented) linked to that
//     source and matched to a canonical Person.
//  3. The Review Queue shows pending/approved/conflicting badges and lets a
//     steward approve a pending finding (routing it) or reject it.
//  4. A conflicting finding surfaces in Conflict Review with the canonical and
//     proposed values side by side, and resolving is an explicit audited action.
//  5. Non-stewards are gated out of the Research Intake workspace.
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
  setConflicts,
  setReviewQueue,
  getCreatedSources,
  getCreatedFindings,
  getApprovedFindingIds,
  getRejectedFindingIds,
  getResolvedConflictIds,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let candidates: NewPersonCandidate[] = [];
  let proposals: RelationshipProposal[] = [];
  let conflicts: {
    id: bigint;
    findingId: bigint;
    field: string;
    canonicalValue: string;
    proposedValue: string;
    status: ReviewStatus;
  }[] = [];
  let audit: ResearchAuditEntry[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
  };
  let createdSources: Array<{
    title: string;
    sourceType: SourceType;
    description: string;
    archiveItemId: bigint | null;
  }> = [];
  let createdFindings: Array<{
    title: string;
    evidenceLabel: EvidenceLabel;
    findingType: FindingType;
    content: FindingContent;
    sourceId: bigint;
    personId: string | null;
    newPersonCandidateId: bigint | null;
  }> = [];
  let approvedFindingIds: bigint[] = [];
  let rejectedFindingIds: bigint[] = [];
  let resolvedConflictIds: bigint[] = [];
  let nextSourceId = 1n;
  let nextFindingId = 1n;

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
    async createSource(
      title: string,
      sourceType: SourceType,
      description: string,
      archiveItemId: bigint | null,
    ): Promise<
      { __kind__: "ok"; ok: SourceRecord } | { __kind__: "err"; err: unknown }
    > {
      const record: SourceRecord = {
        id: nextSourceId++,
        title,
        sourceType,
        description,
        archiveItemId: archiveItemId ?? undefined,
        contributor: STEWARD,
        status: ReviewStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      };
      sources = [...sources, record];
      createdSources = [
        ...createdSources,
        { title, sourceType, description, archiveItemId },
      ];
      return { __kind__: "ok", ok: record };
    },
    async listFindings(): Promise<ProposedFinding[]> {
      return findings;
    },
    async getFinding(id: bigint): Promise<ProposedFinding | null> {
      return findings.find((f) => f.id === id) ?? null;
    },
    async createFinding(
      title: string,
      evidenceLabel: EvidenceLabel,
      findingType: FindingType,
      content: FindingContent,
      sourceId: bigint,
      personId: string | null,
      newPersonCandidateId: bigint | null,
    ): Promise<
      | { __kind__: "ok"; ok: ProposedFinding }
      | { __kind__: "err"; err: unknown }
    > {
      const record: ProposedFinding = {
        id: nextFindingId++,
        title,
        evidenceLabel,
        findingType,
        content,
        sourceId,
        personId: personId ?? undefined,
        newPersonCandidateId: newPersonCandidateId ?? undefined,
        status: ReviewStatus.Pending,
        submittedBy: STEWARD,
        submittedAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      };
      findings = [...findings, record];
      createdFindings = [
        ...createdFindings,
        {
          title,
          evidenceLabel,
          findingType,
          content,
          sourceId,
          personId,
          newPersonCandidateId,
        },
      ];
      return { __kind__: "ok", ok: record };
    },
    async approveFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.Approved } : f,
      );
      approvedFindingIds = [...approvedFindingIds, id];
      return findings.find((f) => f.id === id) ?? null;
    },
    async rejectFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.Rejected } : f,
      );
      rejectedFindingIds = [...rejectedFindingIds, id];
      return findings.find((f) => f.id === id) ?? null;
    },
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      return candidates;
    },
    async createNewPersonCandidate(
      name: string,
      details: string,
      sourceId: bigint,
    ): Promise<
      | { __kind__: "ok"; ok: NewPersonCandidate }
      | { __kind__: "err"; err: unknown }
    > {
      const record: NewPersonCandidate = {
        id: 1n,
        name,
        details,
        sourceId,
        status: ReviewStatus.Pending,
        submittedBy: STEWARD,
        submittedAt: 1_700_000_000_000_000_000n,
      };
      candidates = [...candidates, record];
      return { __kind__: "ok", ok: record };
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return proposals;
    },
    async createRelationshipProposal(
      fromPersonId: string,
      toPersonId: string,
      relationshipType: string,
      sourceId: bigint,
    ): Promise<
      | { __kind__: "ok"; ok: RelationshipProposal }
      | { __kind__: "err"; err: unknown }
    > {
      const record: RelationshipProposal = {
        id: 1n,
        fromPersonId,
        toPersonId,
        relationshipType,
        sourceId,
        status: ReviewStatus.Pending,
        submittedBy: STEWARD,
        submittedAt: 1_700_000_000_000_000_000n,
      };
      proposals = [...proposals, record];
      return { __kind__: "ok", ok: record };
    },
    async listConflictReviewItems(): Promise<typeof conflicts> {
      return conflicts;
    },
    async resolveConflict(
      id: bigint,
    ): Promise<(typeof conflicts)[number] | null> {
      const found = conflicts.find((c) => c.id === id);
      if (!found) return null;
      conflicts = conflicts.map((c) =>
        c.id === id ? { ...c, status: ReviewStatus.Approved } : c,
      );
      resolvedConflictIds = [...resolvedConflictIds, id];
      return conflicts.find((c) => c.id === id) ?? null;
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return audit;
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
      conflicts = [];
      audit = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
      };
      createdSources = [];
      createdFindings = [];
      approvedFindingIds = [];
      rejectedFindingIds = [];
      resolvedConflictIds = [];
      nextSourceId = 1n;
      nextFindingId = 1n;
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
    setConflicts: (v: typeof conflicts) => {
      conflicts = v;
    },
    setAudit: (v: ResearchAuditEntry[]) => {
      audit = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    getCreatedSources: () => createdSources,
    getCreatedFindings: () => createdFindings,
    getApprovedFindingIds: () => approvedFindingIds,
    getRejectedFindingIds: () => rejectedFindingIds,
    getResolvedConflictIds: () => resolvedConflictIds,
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

async function openResearchIntake(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
}

describe("Research Intake: steward gating and access", () => {
  it("is reachable from the Family Steward hub for a steward", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    const user = userEvent.setup();
    renderApp();

    await openResearchIntake(user);
    expect(
      screen.getByRole("heading", { name: "Research Intake" }),
    ).toBeInTheDocument();
    // The four intake sections are presented as tabs.
    for (const tab of [
      "Sources",
      "Proposed Findings",
      "New Person Candidates",
      "Relationship Proposals",
    ]) {
      expect(screen.getByRole("tab", { name: tab })).toBeInTheDocument();
    }
  });

  it("gates the workspace from a non-steward", async () => {
    setAuthenticated(true);
    setAdmin(false);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    renderApp();

    // A non-steward never sees the Family Steward entry point.
    expect(
      screen.queryByRole("button", { name: /Family Steward/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("research_intake.unauthorized_state"),
    ).not.toBeInTheDocument();
  });
});

describe("Research Intake: record a source", () => {
  it("records a source with an optional archive link", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.type(
      screen.getByTestId("research.source.title_input"),
      "1900 census, Norwood household",
    );
    await user.selectOptions(
      screen.getByTestId("research.source.type_select"),
      SourceType.CensusCitation,
    );
    await user.type(
      screen.getByTestId("research.source.description_input"),
      "Census record listing the Norwood family.",
    );
    await user.type(
      screen.getByTestId("research.source.archive_link_input"),
      "12",
    );
    await user.click(screen.getByTestId("research.source.submit_button"));

    const created = getCreatedSources();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "1900 census, Norwood household",
      sourceType: SourceType.CensusCitation,
      description: "Census record listing the Norwood family.",
      archiveItemId: 12n,
    });
  });
});

describe("Research Intake: propose a finding with an evidence label", () => {
  it("creates a Documented Person-fact finding linked to a source and a canonical person", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    // Switch to the Proposed Findings tab.
    await user.click(screen.getByRole("tab", { name: "Proposed Findings" }));

    await user.type(
      screen.getByTestId("research.finding.title_input"),
      "Birth date of Julia Norwood",
    );
    await user.selectOptions(
      screen.getByTestId("research.finding.evidence_select"),
      "Documented",
    );
    await user.selectOptions(
      screen.getByTestId("research.finding.type_select"),
      "PersonFact",
    );
    await user.selectOptions(
      screen.getByTestId("research.finding.source_select"),
      "1",
    );
    await user.type(
      screen.getByTestId("research.finding.content.field_input"),
      "Birth date",
    );
    await user.type(
      screen.getByTestId("research.finding.content.value_input"),
      "12 March 1898",
    );
    await user.selectOptions(
      screen.getByTestId("research.finding.person_select"),
      "julia",
    );
    await user.click(screen.getByTestId("research.finding.submit_button"));

    const created = getCreatedFindings();
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "Birth date of Julia Norwood",
      evidenceLabel: "Documented",
      findingType: "PersonFact",
      sourceId: 1n,
      personId: "julia",
      newPersonCandidateId: null,
    });
    expect(created[0].content).toEqual({
      __kind__: "PersonFact",
      PersonFact: {
        field: "Birth date",
        value: "12 March 1898",
        personId: "julia",
      },
    });
  });
});

describe("Research Intake: review queue with badges", () => {
  it("shows pending/approved/conflicting badges and approves a pending finding", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    // Open the Review Queue from the Research Intake header.
    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });

    // The badge summary row reflects the canonical review queue counts.
    const badges = screen.getByTestId("research_queue.badges");
    expect(within(badges).getByText("Pending")).toBeInTheDocument();
    expect(within(badges).getByText("Approved")).toBeInTheDocument();
    expect(within(badges).getByText("Conflicting")).toBeInTheDocument();

    // The pending finding is listed with its evidence label and source.
    expect(screen.getByText("Birth date of Julia Norwood")).toBeInTheDocument();
    expect(screen.getByText("Documented")).toBeInTheDocument();

    // Approving routes the finding (records the approval action).
    await user.click(
      screen.getByTestId("research_queue.finding.0.approve_button"),
    );
    expect(getApprovedFindingIds()).toEqual([1n]);
  });

  it("rejects a pending finding", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });

    await user.click(
      screen.getByTestId("research_queue.finding.0.reject_button"),
    );
    expect(getRejectedFindingIds()).toEqual([1n]);
  });
});

describe("Research Intake: conflict review", () => {
  it("shows canonical and proposed values side by side and resolves explicitly", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    setConflicts([
      {
        id: 1n,
        findingId: 1n,
        field: "Birth date",
        canonicalValue: "1899",
        proposedValue: "1898",
        status: ReviewStatus.Conflicting,
      },
    ]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    // The conflicting finding shows both the canonical and proposed values.
    expect(screen.getByText("Canonical record")).toBeInTheDocument();
    expect(screen.getByText("1899")).toBeInTheDocument();
    expect(screen.getByText("Proposed finding")).toBeInTheDocument();
    expect(screen.getByText("1898")).toBeInTheDocument();

    // Resolving is an explicit, confirmed action.
    await user.click(screen.getByTestId("research_conflict.resolve_button.1"));
    await user.click(screen.getByTestId("research_conflict.confirm_button.1"));
    expect(getResolvedConflictIds()).toEqual([1n]);
  });
});

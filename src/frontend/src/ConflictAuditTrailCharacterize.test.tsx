import "@testing-library/jest-dom/vitest";
import {
  AuditActionType,
  type AuditEntry,
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
  type ProposedFinding,
  type RelationshipRequest,
  type Report,
  type ResearchAuditEntry,
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
  type StewardAuditEntry,
  StewardAuditKind,
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

// Characterization baseline for the conflict-resolution audit trail and the
// steward workload badge.
//
// The upcoming build intentionally changes two things:
//  1. Conflict-resolution actions (Keep Existing, Replace Existing, Preserve
//     Both/Unresolved, Needs Research) will be surfaced in Family Steward →
//     Audit History (the governance `listAuditHistory` view). Today they only
//     appear in the Research Review Queue's Audit tab via `getResearchAuditLog`.
//  2. The Review Queue will gain status filtering for Needs Research items.
//
// This baseline deliberately does NOT assert the current audit-history-surfacing
// behavior (that is the behavior being intentionally changed). Instead it
// freezes the adjacent working behavior the change must not break:
//
//  1. The Research Review Queue's Audit tab still renders conflict-resolution
//     audit entries (action "ConflictResolved" with its summary) from
//     `getResearchAuditLog` — the existing research audit trail that must
//     survive even after the change adds a new governance surfacing.
//  2. The governance Audit History tab still renders existing governance audit
//     entries (e.g. StewardPromoted) — the change adds conflict entries to this
//     view but must not disturb the rendering of the governance entries already
//     there.
//  3. The Review Queue's existing tabs (Findings, Candidates, Relationships,
//     Audit) still render — the status-filtering change must not break them.
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
  setResearchAudit,
  setGovernanceAudit,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let conflicts: ConflictReviewItem[] = [];
  let researchAudit: ResearchAuditEntry[] = [];
  let governanceAudit: AuditEntry[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };

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
    async listFindings(): Promise<ProposedFinding[]> {
      return findings;
    },
    async getFinding(id: bigint): Promise<ProposedFinding | null> {
      return findings.find((f) => f.id === id) ?? null;
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
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
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return researchAudit;
    },
    async listAuditHistory(): Promise<AuditEntry[]> {
      return governanceAudit;
    },
    async getStewardAuditHistory(): Promise<StewardAuditEntry[]> {
      // The merged Family Steward Audit History surfaces each governance audit
      // entry as a #Governance StewardAuditEntry. The AuditHistoryTab consumes
      // this merged view (the conflict-resolution entries come from the
      // research audit log, which this governance-focused mock does not model).
      return governanceAudit.map((e) => ({
        id: e.id,
        kind: StewardAuditKind.Governance,
        actionType: e.actionType,
        actorAccountId: e.actorAccountId,
        timestamp: e.timestamp,
        summary: e.summary,
        affectedPersonIds: e.affectedPersonIds,
      }));
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
      conflicts = [];
      researchAudit = [];
      governanceAudit = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
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
    setConflicts: (v: ConflictReviewItem[]) => {
      conflicts = v;
    },
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    setResearchAudit: (v: ResearchAuditEntry[]) => {
      researchAudit = v;
    },
    setGovernanceAudit: (v: AuditEntry[]) => {
      governanceAudit = v;
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

function needsResearchFinding(id: bigint, title: string): ProposedFinding {
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
    status: ReviewStatus.NeedsResearch,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function conflictItem(
  id: bigint,
  findingId: bigint,
  overrides: Partial<ConflictReviewItem> = {},
): ConflictReviewItem {
  return {
    id,
    findingId,
    field: "Birth date",
    canonicalValue: "1899",
    proposedValue: "1898",
    status: ReviewStatus.Conflicting,
    evidenceLabel: EvidenceLabel.Documented,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 1n,
    ...overrides,
  };
}

function researchConflictAuditEntry(id: bigint): ResearchAuditEntry {
  return {
    id,
    action: "ConflictResolved",
    findingId: 1n,
    actorId: STEWARD,
    summary: "Conflict Review item #1 resolved (Keep Existing)",
    timestamp: 1_700_000_000_000_000_000n,
  };
}

function governanceAuditEntry(
  id: bigint,
  actionType: AuditActionType,
  summary: string,
): AuditEntry {
  return {
    id,
    actionType,
    summary,
    affectedPersonIds: ["julia"],
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: STEWARD,
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

async function openReviewQueue(user: ReturnType<typeof userEvent.setup>) {
  await openResearchIntake(user);
  await user.click(screen.getByTestId("research_intake.open_review_queue"));
  await screen.findByRole("heading", { name: "Review Queue" });
}

async function openGovernanceAudit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Governance/ }),
  );
  await screen.findByRole("heading", { name: "Steward Controls" });
  await user.click(screen.getByRole("button", { name: "Audit History" }));
}

describe("Conflict-resolution audit trail (characterization)", () => {
  it("still renders a conflict-resolution action in the Research Review Queue Audit tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([needsResearchFinding(1n, "Birth date of Julia Norwood")]);
    setConflicts([conflictItem(1n, 1n)]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    // The research audit log records the conflict-resolution action — the
    // existing surfacing that must survive the change.
    setResearchAudit([researchConflictAuditEntry(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.audit"));

    // The conflict-resolution action appears in the Research Review Queue's
    // Audit tab with its action and summary.
    expect(await screen.findByText("ConflictResolved")).toBeInTheDocument();
    expect(
      screen.getByText("Conflict Review item #1 resolved (Keep Existing)"),
    ).toBeInTheDocument();
  });

  it("still renders existing governance audit entries in Family Steward → Audit History", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    // A governance audit entry (StewardPromoted) — the change adds conflict
    // entries to this view but must not disturb the existing governance ones.
    setGovernanceAudit([
      governanceAuditEntry(
        1n,
        AuditActionType.StewardPromoted,
        "Promoted julia",
      ),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openGovernanceAudit(user);

    // The existing governance audit entry still renders with its label and
    // summary.
    expect(await screen.findByText("Steward promoted")).toBeInTheDocument();
    expect(screen.getByText("Promoted julia")).toBeInTheDocument();
    expect(
      screen.getByText(/Visible to Family Stewards only\./),
    ).toBeInTheDocument();
  });

  it("keeps the Review Queue tabs (Findings, Candidates, Relationships, Audit) rendering", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([needsResearchFinding(1n, "Birth date of Julia Norwood")]);
    setConflicts([conflictItem(1n, 1n)]);
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
    await openReviewQueue(user);

    // The status-filtering change must not break the existing tabs.
    const tabs = screen.getByTestId("research_queue.tabs");
    for (const name of ["Findings", "Candidates", "Relationships", "Audit"]) {
      expect(
        within(tabs).getByRole("button", { name: new RegExp(name) }),
      ).toBeInTheDocument();
    }
  });
});

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
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
  type StewardAuditEntry,
  StewardAuditKind,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// Cover for the merged Family Steward Audit History.
//
// The build intentionally changes the governance Audit History tab to consume
// `getStewardAuditHistory()` — a merged, chronologically-sorted view of
// governance audit entries AND conflict-resolution actions (no duplicates).
// This suite asserts the frontend consumer contract for that merged view:
//
//  1. A conflict-resolution entry renders its action label, kind pill, and the
//     conflict details (field, existing/proposed value, resolution, steward
//     notes, source references) in the Family Steward → Audit History tab.
//  2. Governance entries and conflict-resolution entries render together in the
//     same merged list (the change's core purpose).
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister's merge logic (see coverageLimits).
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
  setStewardAudit,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let conflicts: ConflictReviewItem[] = [];
  let stewardAudit: StewardAuditEntry[] = [];
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
    async getResearchAuditLog(): Promise<unknown[]> {
      return [];
    },
    async listAuditHistory(): Promise<AuditEntry[]> {
      return [];
    },
    async getStewardAuditHistory(): Promise<StewardAuditEntry[]> {
      // The merged view the AuditHistoryTab consumes: governance entries and
      // conflict-resolution entries together.
      return stewardAudit;
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
      stewardAudit = [];
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
    setStewardAudit: (v: StewardAuditEntry[]) => {
      stewardAudit = v;
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

function conflictAuditEntry(
  id: bigint,
  overrides: Partial<StewardAuditEntry> = {},
): StewardAuditEntry {
  return {
    id,
    kind: StewardAuditKind.ConflictResolution,
    actionType: "ConflictResolved",
    resolution: "KeepExisting",
    field: "Birth date",
    existingValue: "1899",
    proposedValue: "1898",
    stewardNotes: "Census record is authoritative.",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 2n,
    affectedPersonIds: ["julia"],
    timestamp: 1_700_000_000_000_000_000n,
    actorAccountId: STEWARD,
    summary: "Resolved conflict on Birth date",
    ...overrides,
  };
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

describe("Family Steward Audit History (merged)", () => {
  it("renders a conflict-resolution entry with its action, kind, and conflict details", async () => {
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
    setStewardAudit([conflictAuditEntry(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openGovernanceAudit(user);

    // The conflict-resolution action label and kind pill render. "Keep
    // Existing" appears both as the action label and as the resolution detail.
    expect(
      (await screen.findAllByText("Keep Existing")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Conflict resolution")).toBeInTheDocument();
    // The conflict details render: field, existing/proposed values, resolution,
    // steward notes, and source references.
    expect(screen.getByText("Birth date")).toBeInTheDocument();
    expect(screen.getByText("1899")).toBeInTheDocument();
    expect(screen.getByText("1898")).toBeInTheDocument();
    expect(
      screen.getByText(/Steward notes: Census record is authoritative\./),
    ).toBeInTheDocument();
    expect(screen.getByText(/Existing #1 · Proposed #2/)).toBeInTheDocument();
  });

  it("renders governance and conflict-resolution entries together in the merged list", async () => {
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
    // A governance entry and a conflict-resolution entry in the same merged
    // view — the change's core purpose.
    setStewardAudit([
      {
        ...governanceAuditEntry(
          1n,
          AuditActionType.StewardPromoted,
          "Promoted julia",
        ),
        kind: StewardAuditKind.Governance,
        actionType: AuditActionType.StewardPromoted,
        affectedPersonIds: ["julia"],
      },
      conflictAuditEntry(2n),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openGovernanceAudit(user);

    // Both the governance entry and the conflict-resolution entry render in
    // the same Audit History list.
    expect(await screen.findByText("Steward promoted")).toBeInTheDocument();
    expect(screen.getByText("Promoted julia")).toBeInTheDocument();
    expect(screen.getAllByText("Keep Existing").length).toBeGreaterThanOrEqual(
      2,
    );
    expect(screen.getByText("Governance")).toBeInTheDocument();
    expect(screen.getByText("Conflict resolution")).toBeInTheDocument();
  });
});

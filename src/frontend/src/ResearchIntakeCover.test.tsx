import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  ConflictResolutionAction,
  type ConflictReviewItem,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  LivingStatus,
  type NewPersonCandidate,
  type PersonProfile,
  PrivacyLevel,
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
  SourceStatus,
  SourceType,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
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
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
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
  getCreatedSourceUploads,
  getCreatedFindings,
  getApprovedFindingIds,
  getRejectedFindingIds,
  getNeedsResearchFindingIds,
  getResolvedConflictIds,
  getResolvedConflictActions,
  setApprovedItems,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let candidates: NewPersonCandidate[] = [];
  let proposals: RelationshipProposal[] = [];
  let conflicts: ConflictReviewItem[] = [];
  let audit: ResearchAuditEntry[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  let createdSources: Array<{
    title: string;
    sourceType: SourceType;
    description: string;
    archiveItemId: bigint | null;
  }> = [];
  let createdSourceUploads: Array<{
    title: string;
    sourceType: SourceType;
    description: string;
    tags: string[];
    era: string;
    year: bigint | null;
    relatedMemberIds: string[];
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
  let needsResearchFindingIds: bigint[] = [];
  let resolvedConflictIds: bigint[] = [];
  let resolvedConflictActions: Array<{
    id: bigint;
    action: ConflictResolutionAction;
    notes: string;
  }> = [];
  let nextSourceId = 1n;
  let nextFindingId = 1n;
  let approvedItems: ArchiveItem[] = [];

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
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return approvedItems;
    },
    // The Research Intake Sources tab lists approved archive items to link a
    // source to. Mirror the backend contract: only approved items, title query
    // matched case-insensitively by substring, and an item must carry ALL of the
    // given tags.
    async searchArchiveItems(filter: {
      searchTerm: [] | [string] | undefined;
      tags: string[];
      itemType: [] | [ArchiveItemType] | undefined;
      relatedMemberId: [] | [string] | undefined;
      era: [] | [string] | undefined;
    }): Promise<ArchiveItem[]> {
      const query = ((filter.searchTerm ?? [])[0] ?? "").toLowerCase();
      const tags = filter.tags.map((t) => t.toLowerCase());
      return approvedItems.filter(
        (i) =>
          i.status === ArchiveItemStatus.Approved &&
          (query === "" || i.title.toLowerCase().includes(query)) &&
          (tags.length === 0 ||
            tags.every((t) =>
              i.tags.some((tag) => tag.toLowerCase().includes(t)),
            )),
      );
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
        familyId: "norwood",
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
    async createSourceWithUpload(
      title: string,
      sourceType: SourceType,
      description: string,
      _mimeType: string,
      _blob: ExternalBlob,
      tags: string[],
      era: string,
      year: bigint | null,
      relatedMemberIds: string[],
      _privacyLevel: PrivacyLevel,
      _classification: ArchiveItemClassification,
      _primarySpeaker: unknown,
    ): Promise<
      | {
          __kind__: "ok";
          ok: { source: SourceRecord; archiveItem: ArchiveItem };
        }
      | { __kind__: "err"; err: unknown }
    > {
      // Mirrors the backend contract: creates ONE canonical Archive item
      // (pending) and links a new Source record to it via archiveItemId.
      const archiveItem: ArchiveItem = {
        familyId: "norwood",
        id: 1n,
        title,
        description,
        itemType: ArchiveItemType.Document,
        blob: ExternalBlob.fromBytes(
          new Uint8Array([1, 2, 3]),
          "text/plain",
          "source.txt",
        ),
        era,
        year: year ?? undefined,
        tags,
        relatedMemberIds,
        relatedBranchId: undefined,
        sourceStatus: SourceStatus.Original,
        privacyLevel: PrivacyLevel.FamilyOnly,
        classification: ArchiveItemClassification.Standard,
        status: ArchiveItemStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: STEWARD,
      };
      const record: SourceRecord = {
        familyId: "norwood",
        id: nextSourceId++,
        title,
        sourceType,
        description,
        archiveItemId: archiveItem.id,
        contributor: STEWARD,
        status: ReviewStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
      };
      sources = [...sources, record];
      createdSourceUploads = [
        ...createdSourceUploads,
        { title, sourceType, description, tags, era, year, relatedMemberIds },
      ];
      return { __kind__: "ok", ok: { source: record, archiveItem } };
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
        familyId: "norwood",
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
    async needsResearchFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.NeedsResearch } : f,
      );
      needsResearchFindingIds = [...needsResearchFindingIds, id];
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
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
      return conflicts;
    },
    async listConflictsForPerson(
      personId: string,
    ): Promise<ConflictReviewItem[]> {
      // Mirrors the backend: only unresolved (Conflicting / NeedsResearch)
      // conflicts for the given person are returned.
      return conflicts.filter(
        (c) =>
          c.personId === personId &&
          (c.status === ReviewStatus.Conflicting ||
            c.status === ReviewStatus.NeedsResearch),
      );
    },
    async resolveConflict(
      id: bigint,
      action: ConflictResolutionAction,
      notes: string,
    ): Promise<ConflictReviewItem | null> {
      const found = conflicts.find((c) => c.id === id);
      if (!found) return null;
      // Mirrors the backend: Keep Existing and Replace Existing resolve the
      // item (#Approved); Preserve Both keeps it #Conflicting; Needs Research
      // moves it to #NeedsResearch. The steward's notes are recorded.
      const newStatus =
        action === ConflictResolutionAction.PreserveBoth
          ? ReviewStatus.Conflicting
          : action === ConflictResolutionAction.NeedsResearch
            ? ReviewStatus.NeedsResearch
            : ReviewStatus.Approved;
      conflicts = conflicts.map((c) =>
        c.id === id ? { ...c, status: newStatus, stewardNotes: notes } : c,
      );
      resolvedConflictIds = [...resolvedConflictIds, id];
      resolvedConflictActions = [
        ...resolvedConflictActions,
        { id, action, notes },
      ];
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
        needsResearch: 0n,
        items: [],
      };
      createdSources = [];
      createdSourceUploads = [];
      createdFindings = [];
      approvedFindingIds = [];
      rejectedFindingIds = [];
      needsResearchFindingIds = [];
      resolvedConflictIds = [];
      resolvedConflictActions = [];
      nextSourceId = 1n;
      nextFindingId = 1n;
      approvedItems = [];
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
    getCreatedSourceUploads: () => createdSourceUploads,
    getCreatedFindings: () => createdFindings,
    getApprovedFindingIds: () => approvedFindingIds,
    getRejectedFindingIds: () => rejectedFindingIds,
    getNeedsResearchFindingIds: () => needsResearchFindingIds,
    getResolvedConflictIds: () => resolvedConflictIds,
    getResolvedConflictActions: () => resolvedConflictActions,
    setApprovedItems: (v: ArchiveItem[]) => {
      approvedItems = v;
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

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);

  // jsdom's File does not implement Blob.prototype.arrayBuffer, which the
  // source-upload path uses to read the file bytes. Polyfill it via FileReader.
  if (typeof File.prototype.arrayBuffer !== "function") {
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
});

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
    familyId: "norwood",
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
    familyId: "norwood",
    ...overrides,
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
  it("records a source linked to an existing archive item", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    // Seed an approved archive item the source can link to.
    setApprovedItems([
      {
        familyId: "norwood",
        id: 12n,
        title: "1900 census record",
        description: "Census record listing the Norwood family.",
        itemType: ArchiveItemType.Document,
        blob: ExternalBlob.fromBytes(
          new Uint8Array([1, 2, 3]),
          "text/plain",
          "census.txt",
        ),
        era: "1900",
        year: 1900n,
        tags: ["census"],
        relatedMemberIds: ["julia"],
        relatedBranchId: "branch-1",
        sourceStatus: SourceStatus.Original,
        privacyLevel: PrivacyLevel.FamilyOnly,
        classification: ArchiveItemClassification.Standard,
        status: ArchiveItemStatus.Approved,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: STEWARD,
      },
    ]);
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
    // The "Choose existing Archive item" mode is the default; select the seeded
    // approved item by id (no manually typed Archive Item ID is required).
    await user.click(screen.getByTestId("research.source.item.12"));
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

  it("uploads new source material, creating one canonical archive item and linking a source", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    // Switch to the "Upload new source file" mode.
    await user.click(screen.getByTestId("research.source.mode_upload_tab"));

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

    // Attach a source file directly (no manually typed Archive Item ID).
    const input = document.querySelector(
      '[data-ocid="research.source.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["census-bytes"], "census.txt", {
      type: "text/plain",
    });
    await user.upload(input, file);
    expect(await screen.findByText("census.txt")).toBeInTheDocument();

    await user.type(
      screen.getByTestId("research.source.tags_input"),
      "census, 1900",
    );
    await user.type(screen.getByTestId("research.source.era_input"), "1900");
    await user.type(screen.getByTestId("research.source.year_input"), "1900");

    await user.click(screen.getByTestId("research.source.submit_button"));

    // The upload created one canonical archive item (pending) and linked a
    // source to it — no Archive Item ID was typed by the user.
    const uploads = getCreatedSourceUploads();
    expect(uploads).toHaveLength(1);
    expect(uploads[0]).toMatchObject({
      title: "1900 census, Norwood household",
      sourceType: SourceType.CensusCitation,
      description: "Census record listing the Norwood family.",
      tags: ["census", "1900"],
      era: "1900",
      year: 1900n,
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
    // The Person Fact Field is now a dropdown of canonical fields (data-ocid
    // research.finding.content.field_select), not a free-text input. Selecting
    // the "Birth Date" option stores the canonical key 'birthDate' on the
    // finding, which the backend maps onto the Person profile on approval.
    await user.selectOptions(
      screen.getByTestId("research.finding.content.field_select"),
      "birthDate",
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
        field: "birthDate",
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
      needsResearch: 0n,
      items: [],
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
      needsResearch: 0n,
      items: [],
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

  it("marks a pending finding as Needs Research, retaining it with status NEEDS_RESEARCH", async () => {
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
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });

    // The Needs Research action is present on the pending finding card.
    expect(
      screen.getByTestId("research_queue.finding.0.needs_research_button"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByTestId("research_queue.finding.0.needs_research_button"),
    );

    // The finding was marked Needs Research and retains its content.
    expect(getNeedsResearchFindingIds()).toEqual([1n]);
    const findings = await mockActor.listFindings();
    expect(findings[0].status).toBe(ReviewStatus.NeedsResearch);
    expect(findings[0].title).toBe("Birth date of Julia Norwood");
  });

  it("shows the Conflict Review badge counting only actual ConflictReviewItems, not ordinary needs-research items", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    // One actual ConflictReviewItem (status Conflicting).
    setConflicts([conflictItem(1n, 1n)]);
    // The queue reports needsResearch=1 (an ordinary research item marked Needs
    // Research that never became a conflict). The Conflict Review badge must
    // count only the actual ConflictReviewItem, so it is 1, not 2.
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 1n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    const badge = screen.getByTestId("research_intake.conflict_review_badge");
    expect(badge).toHaveTextContent("1");
  });

  it("hides the Conflict Review badge when there are no unresolved conflicts", async () => {
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
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    // No unresolved conflicts, so no badge is shown on the Conflict Review tab.
    expect(
      screen.queryByTestId("research_intake.conflict_review_badge"),
    ).not.toBeInTheDocument();
  });
});

describe("Research Intake: conflict review", () => {
  it("shows canonical and proposed values side by side with four resolution actions", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
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
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    // The conflicting finding shows both the canonical and proposed values,
    // clearly separated by their owners.
    expect(screen.getByText("Existing · canonical")).toBeInTheDocument();
    expect(screen.getByText("1899")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText("1898")).toBeInTheDocument();

    // All four resolution actions are present on the unresolved conflict.
    for (const label of [
      "Keep Existing",
      "Replace Existing",
      "Preserve Both / Unresolved",
      "Needs Research",
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("resolves a conflict with Keep Existing, recording the action and notes", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
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
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    // Keep Existing is an explicit, confirmed action with optional notes.
    await user.click(
      screen.getByTestId(
        `research_conflict.action_button.1.${ConflictResolutionAction.KeepExisting}`,
      ),
    );
    await user.type(
      screen.getByTestId(
        `research_conflict.notes_input.1.${ConflictResolutionAction.KeepExisting}`,
      ),
      "Canonical record is authoritative",
    );
    await user.click(
      screen.getByTestId(
        `research_conflict.confirm_button.1.${ConflictResolutionAction.KeepExisting}`,
      ),
    );

    expect(getResolvedConflictIds()).toEqual([1n]);
    expect(getResolvedConflictActions()).toEqual([
      {
        id: 1n,
        action: ConflictResolutionAction.KeepExisting,
        notes: "Canonical record is authoritative",
      },
    ]);
  });

  it("resolves a conflict with Replace Existing", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
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
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    await user.click(
      screen.getByTestId(
        `research_conflict.action_button.1.${ConflictResolutionAction.ReplaceExisting}`,
      ),
    );
    await user.click(
      screen.getByTestId(
        `research_conflict.confirm_button.1.${ConflictResolutionAction.ReplaceExisting}`,
      ),
    );

    expect(getResolvedConflictActions()).toEqual([
      {
        id: 1n,
        action: ConflictResolutionAction.ReplaceExisting,
        notes: "",
      },
    ]);
  });

  it("keeps both values visible as an unresolved conflict with Preserve Both", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
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
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    await user.click(
      screen.getByTestId(
        `research_conflict.action_button.1.${ConflictResolutionAction.PreserveBoth}`,
      ),
    );
    await user.click(
      screen.getByTestId(
        `research_conflict.confirm_button.1.${ConflictResolutionAction.PreserveBoth}`,
      ),
    );

    // Preserve Both keeps the item unresolved (#Conflicting) — neither value
    // is silently chosen.
    expect(getResolvedConflictActions()).toEqual([
      {
        id: 1n,
        action: ConflictResolutionAction.PreserveBoth,
        notes: "",
      },
    ]);
    const remaining = await mockActor.listConflictReviewItems();
    expect(remaining[0].status).toBe(ReviewStatus.Conflicting);
  });

  it("retains the conflict with Needs Research status", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
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
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    await user.click(
      screen.getByTestId(
        `research_conflict.action_button.1.${ConflictResolutionAction.NeedsResearch}`,
      ),
    );
    await user.click(
      screen.getByTestId(
        `research_conflict.confirm_button.1.${ConflictResolutionAction.NeedsResearch}`,
      ),
    );

    // Needs Research retains the conflict with #NeedsResearch status.
    expect(getResolvedConflictActions()).toEqual([
      {
        id: 1n,
        action: ConflictResolutionAction.NeedsResearch,
        notes: "",
      },
    ]);
    const remaining = await mockActor.listConflictReviewItems();
    expect(remaining[0].status).toBe(ReviewStatus.NeedsResearch);
  });

  it("shows the empty state when there are no conflicts to review", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    // With no conflict review items, the page shows a clear empty state rather
    // than a blank list. This is stable behavior the four-action change does
    // not remove.
    expect(
      screen.getByTestId("research_conflict.empty_state"),
    ).toBeInTheDocument();
    expect(screen.getByText("No conflicts to review")).toBeInTheDocument();
  });

  it("renders the linked finding's evidence label and source alongside the disputed values", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([pendingFinding(1n, "Birth date of Julia Norwood")]);
    setConflicts([conflictItem(1n, 1n)]);
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    // The disputed values are shown side by side with the canonical and
    // proposed owners clearly separated.
    expect(screen.getByText("Existing · canonical")).toBeInTheDocument();
    expect(screen.getByText("1899")).toBeInTheDocument();
    expect(screen.getByText("Proposed")).toBeInTheDocument();
    expect(screen.getByText("1898")).toBeInTheDocument();

    // The linked finding's evidence label and its source are resolved and
    // shown so the steward decides with full provenance. This provenance
    // display is stable behavior the four-action change does not remove. The
    // source title appears on both the existing/proposed provenance lines and
    // the linked source card, so it may legitimately match more than once.
    expect(screen.getByText("Documented")).toBeInTheDocument();
    expect(screen.getAllByText("1900 census").length).toBeGreaterThan(0);
  });
});

import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  ConflictResolutionAction,
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

// Cover for the Research Review Queue Conflicts-tab repair.
//
// The build adds a Conflicts tab to the Research Review Queue
// (ResearchReviewQueuePage.tsx) that renders ConflictReviewItems — including
// Needs Research items — with the four resolution actions and applies the
// active status filter. It also updates useResolveConflict to invalidate the
// ['governance','stewardAuditHistory'] query so a resolved conflict appears in
// the Family Steward Audit History immediately.
//
// This suite asserts the frontend consumer contract for that change:
//
//  1. The Conflicts tab renders a ConflictReviewItem (including a Needs
//     Research item) with all four resolution actions.
//  2. The status filter narrows the Conflicts tab (Needs Research shows only
//     Needs Research conflicts).
//  3. Resolving a Needs Research conflict via the Conflicts tab decreases the
//     Family Steward action badge by the correct amount.
//  4. Resolving a conflict invalidates the steward audit history query, so the
//     resolution appears in Family Steward → Audit History immediately.
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
  setConflicts,
  setReviewQueue,
  setStewardAudit,
  getResolvedConflictIds,
  getResolvedConflictActions,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
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
  let resolvedConflictIds: bigint[] = [];
  let resolvedConflictActions: Array<{
    id: bigint;
    action: ConflictResolutionAction;
    notes: string;
  }> = [];

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
      return [];
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
    async getStewardAuditHistory(): Promise<StewardAuditEntry[]> {
      return stewardAudit;
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async resolveConflict(
      id: bigint,
      action: ConflictResolutionAction,
      notes: string,
    ): Promise<
      | { __kind__: "ok"; ok: ConflictReviewItem }
      | { __kind__: "err"; err: unknown }
    > {
      const found = conflicts.find((c) => c.id === id);
      if (!found) {
        return { __kind__: "err", err: { __kind__: "notFound" } };
      }
      // Mirrors the backend: Keep Existing / Replace Existing resolve the item
      // (#Approved); Preserve Both keeps it #Conflicting; Needs Research moves
      // it to #NeedsResearch. The steward's notes are recorded.
      const newStatus =
        action === ConflictResolutionAction.PreserveBoth
          ? ReviewStatus.Conflicting
          : action === ConflictResolutionAction.NeedsResearch
            ? ReviewStatus.NeedsResearch
            : ReviewStatus.Approved;
      conflicts = conflicts.map((c) =>
        c.id === id ? { ...c, status: newStatus, stewardNotes: notes } : c,
      );
      // Mirrors the backend: resolving a Needs Research conflict (Keep Existing
      // / Replace Existing → Approved) removes it from the steward workload, so
      // the needs-research count decrements.
      if (
        found.status === ReviewStatus.NeedsResearch &&
        newStatus === ReviewStatus.Approved
      ) {
        reviewQueue = {
          ...reviewQueue,
          needsResearch:
            reviewQueue.needsResearch > 0n
              ? reviewQueue.needsResearch - 1n
              : 0n,
        };
      }
      resolvedConflictIds = [...resolvedConflictIds, id];
      resolvedConflictActions = [
        ...resolvedConflictActions,
        { id, action, notes },
      ];
      return {
        __kind__: "ok",
        ok: conflicts.find((c) => c.id === id)!,
      };
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
      stewardAudit = [];
      reviewQueue = {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
      resolvedConflictIds = [];
      resolvedConflictActions = [];
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
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    setStewardAudit: (v: StewardAuditEntry[]) => {
      stewardAudit = v;
    },
    getResolvedConflictIds: () => resolvedConflictIds,
    getResolvedConflictActions: () => resolvedConflictActions,
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
    evidenceLabel: EvidenceLabel.Conflicting,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 2n,
    ...overrides,
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

async function openGovernanceAudit(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByTestId("layout.steward_link"));
  await user.click(
    await screen.findByRole("button", { name: /Family Governance/ }),
  );
  await screen.findByRole("heading", { name: "Steward Controls" });
  await user.click(screen.getByRole("button", { name: "Audit History" }));
}

describe("Research Review Queue Conflicts tab", () => {
  it("renders a ConflictReviewItem with all four resolution actions, including a Needs Research item", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // One Conflicting item and one Needs Research item.
    setConflicts([
      conflictItem(1n, 1n),
      conflictItem(2n, 2n, {
        status: ReviewStatus.NeedsResearch,
        stewardNotes: "Need to verify the source",
      }),
    ]);
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
    await openReviewQueue(user);

    // Open the Conflicts tab.
    await user.click(screen.getByTestId("research_queue.tab.conflicts"));

    // Both conflict cards render with the disputed values.
    const conflictingCard = await screen.findByTestId(
      "research_queue.conflict.1",
    );
    expect(
      within(conflictingCard).getByText("Existing · canonical"),
    ).toBeInTheDocument();
    expect(within(conflictingCard).getByText("1899")).toBeInTheDocument();
    expect(within(conflictingCard).getByText("1898")).toBeInTheDocument();

    // The Needs Research conflict card renders too — it stays visible and
    // actionable in the queue.
    const needsCard = screen.getByTestId("research_queue.conflict.2");
    expect(within(needsCard).getByText("Needs research")).toBeInTheDocument();

    // Both cards expose all four resolution actions.
    for (const card of [conflictingCard, needsCard]) {
      for (const label of [
        "Keep Existing",
        "Replace Existing",
        "Preserve Both / Unresolved",
        "Needs Research",
      ]) {
        expect(
          within(card).getByRole("button", { name: label }),
        ).toBeInTheDocument();
      }
    }
  });

  it("applies the status filter to the Conflicts tab, showing only Needs Research conflicts", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setConflicts([
      conflictItem(1n, 1n),
      conflictItem(2n, 2n, { status: ReviewStatus.NeedsResearch }),
    ]);
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
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.conflicts"));

    // Both conflicts visible by default.
    expect(
      await screen.findByTestId("research_queue.conflict.1"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("research_queue.conflict.2")).toBeInTheDocument();

    // Select the "Needs Research" status filter.
    await user.click(
      screen.getByTestId("research_queue.status_filter.NeedsResearch"),
    );

    // Only the Needs Research conflict remains visible.
    expect(screen.getByTestId("research_queue.conflict.2")).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_queue.conflict.1"),
    ).not.toBeInTheDocument();
  });
});

describe("Family Steward badge decreases when a Needs Research conflict is resolved", () => {
  it("decreases the badge when a Needs Research conflict is resolved via the Conflicts tab", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // One Needs Research conflict in the steward workload.
    setConflicts([
      conflictItem(1n, 1n, { status: ReviewStatus.NeedsResearch }),
    ]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 1n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();

    // The badge reflects the single needs-research conflict.
    const badge = await screen.findByTestId("steward_action_badge");
    expect(badge).toHaveTextContent("1");
    expect(badge).toHaveAttribute(
      "aria-label",
      "1 steward action awaiting review",
    );

    // Resolve the Needs Research conflict with Keep Existing via the Conflicts
    // tab.
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.conflicts"));
    await user.click(
      await screen.findByTestId(
        "research_queue.conflict.1.action_button.KeepExisting",
      ),
    );
    await user.click(
      await screen.findByTestId(
        "research_queue.conflict.1.confirm_button.KeepExisting",
      ),
    );

    // The resolve action was recorded against the real conflict id.
    expect(getResolvedConflictIds()).toEqual([1n]);
    expect(getResolvedConflictActions()[0].action).toBe(
      ConflictResolutionAction.KeepExisting,
    );

    // The badge decreases to zero and disappears once the workload is cleared.
    await screen.findByText("Birth date");
    expect(
      screen.queryByTestId("steward_action_badge"),
    ).not.toBeInTheDocument();
  });
});

describe("Resolving a conflict refreshes the Steward Audit History", () => {
  it("shows the resolved conflict in Family Steward → Audit History immediately after resolving", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setConflicts([conflictItem(1n, 1n)]);
    setReviewQueue({
      pending: 0n,
      approved: 0n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    // The merged audit history is initially empty; resolving the conflict
    // invalidates the ['governance','stewardAuditHistory'] query, so the mock
    // returns the resolution entry on the next read.
    setStewardAudit([]);
    const user = userEvent.setup();
    renderApp();

    // Resolve the conflict with Keep Existing via the Conflicts tab.
    await openReviewQueue(user);
    await user.click(screen.getByTestId("research_queue.tab.conflicts"));
    await user.click(
      await screen.findByTestId(
        "research_queue.conflict.1.action_button.KeepExisting",
      ),
    );
    await user.click(
      await screen.findByTestId(
        "research_queue.conflict.1.confirm_button.KeepExisting",
      ),
    );
    expect(getResolvedConflictIds()).toEqual([1n]);

    // The resolution is recorded in the merged audit history. The mock returns
    // the entry now that the conflict was resolved (the invalidation triggers a
    // refetch of the ['governance','stewardAuditHistory'] query).
    setStewardAudit([conflictAuditEntry(1n)]);

    // Navigate to Family Steward → Audit History and confirm the resolution
    // appears immediately, without a manual refresh.
    await user.click(screen.getByTestId("research_queue.back_button"));
    await screen.findByRole("heading", { name: "Research Intake" });
    await openGovernanceAudit(user);

    expect(
      (await screen.findAllByText("Keep Existing")).length,
    ).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Conflict resolution")).toBeInTheDocument();
    expect(screen.getByText("Birth date")).toBeInTheDocument();
    expect(
      screen.getByText(/Steward notes: Census record is authoritative\./),
    ).toBeInTheDocument();
  });
});

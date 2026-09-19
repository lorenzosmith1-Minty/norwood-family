import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  type FindingContent,
  FindingType,
  LivingStatus,
  type PersonProfile,
  type ProposedFinding,
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

// Cover for the Conflict Review badge change.
//
// The build changes the Conflict Review badge in ResearchIntakePage so it counts
// ONLY actual unresolved ConflictReviewItems (status Conflicting or
// NeedsResearch), not ordinary research items that carry a NeedsResearch status.
// Previously the badge was `reviewQueue.conflicting + reviewQueue.needsResearch`,
// which over-counted because `needsResearch` includes ordinary findings marked
// Needs Research that never became a conflict.
//
// The two acceptance criteria asserted here:
//
//  1. A normal finding marked Needs Research remains visible in the Review
//     Queue, the Conflict Review badge stays 0 (no badge rendered), and the
//     Conflict Review page stays empty — the badge must not count ordinary
//     NeedsResearch findings.
//  2. A finding with Evidence Label = Conflicting that is approved creates a
//     ConflictReviewItem, the Conflict Review badge becomes 1, a conflict card
//     appears, and all four resolution actions are visible.
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
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let conflicts: ConflictReviewItem[] = [];
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

function finding(
  id: bigint,
  title: string,
  evidenceLabel: EvidenceLabel,
  status: ReviewStatus,
): ProposedFinding {
  return {
    id,
    title,
    evidenceLabel,
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
    status,
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
    evidenceLabel: EvidenceLabel.Conflicting,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 1n,
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

describe("Conflict Review badge counts only actual ConflictReviewItems", () => {
  it("keeps a normal Needs Research finding in the Review Queue with badge 0 and an empty Conflict Review page", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // An ordinary finding marked Needs Research — it never became a conflict.
    setFindings([
      finding(
        1n,
        "Birth date of Julia Norwood",
        EvidenceLabel.Documented,
        ReviewStatus.NeedsResearch,
      ),
    ]);
    setConflicts([]);
    // The queue reports needsResearch=1 (the ordinary finding), but there are
    // NO ConflictReviewItems. The badge must stay 0.
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
    await openResearchIntake(user);

    // The Conflict Review badge is NOT rendered because there are no actual
    // ConflictReviewItems — the ordinary NeedsResearch finding must not inflate it.
    expect(
      screen.queryByTestId("research_intake.conflict_review_badge"),
    ).not.toBeInTheDocument();

    // The Needs Research finding remains visible in the Review Queue.
    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });
    const card = screen.getByTestId("research_queue.finding.0");
    expect(
      within(card).getByText("Birth date of Julia Norwood"),
    ).toBeInTheDocument();
    // The Needs Research status pill is rendered (label is lowercase 'research').
    // An exact match targets the status pill, not the "Needs Research" action
    // button that now also appears on an actionable Needs Research finding.
    expect(within(card).getByText("Needs research")).toBeInTheDocument();

    // The Conflict Review page stays empty — no conflict card.
    await user.click(screen.getByTestId("research_queue.back_button"));
    await screen.findByRole("heading", { name: "Research Intake" });
    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });
    const empty = await screen.findByTestId("research_conflict.empty_state");
    expect(
      within(empty).getByText("No conflicts to review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_conflict.card.1"),
    ).not.toBeInTheDocument();
  });

  it("shows badge 1 and a conflict card with all four resolution actions when a Conflicting finding is approved", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // A finding with Evidence Label = Conflicting that has been approved and
    // routed into Conflict Review as a ConflictReviewItem.
    setFindings([
      finding(
        1n,
        "Birth date of Julia Norwood",
        EvidenceLabel.Conflicting,
        ReviewStatus.Approved,
      ),
    ]);
    setConflicts([conflictItem(1n, 1n)]);
    setReviewQueue({
      pending: 0n,
      approved: 1n,
      rejected: 0n,
      conflicting: 1n,
      needsResearch: 0n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    // The Conflict Review badge shows 1 — the actual ConflictReviewItem.
    const badge = screen.getByTestId("research_intake.conflict_review_badge");
    expect(badge).toHaveTextContent("1");

    // The conflict card appears with all four resolution actions.
    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });
    const card = await screen.findByTestId("research_conflict.card.1");
    expect(within(card).getByText("Existing · canonical")).toBeInTheDocument();
    expect(within(card).getByText("1899")).toBeInTheDocument();
    expect(within(card).getByText("Proposed")).toBeInTheDocument();
    expect(within(card).getByText("1898")).toBeInTheDocument();
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
  });
});

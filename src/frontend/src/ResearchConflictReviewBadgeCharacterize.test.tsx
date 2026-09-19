import "@testing-library/jest-dom/vitest";
import {
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

// Characterization baseline for the Conflict Review badge change.
//
// The upcoming build changes the Conflict Review badge computation in
// ResearchIntakePage so it counts only actual unresolved ConflictReviewItems
// (status Conflicting or NeedsResearch), not ordinary research items that carry
// a NeedsResearch status. Today the badge is `reviewQueue.conflicting +
// reviewQueue.needsResearch`, which over-counts because `needsResearch` also
// includes ordinary findings marked Needs Research that never became a conflict.
//
// This baseline deliberately does NOT assert the current over-counting behavior
// (that is the bug the change intentionally fixes). Instead it freezes the
// adjacent working behavior the change must not break:
//
//  1. A normal finding marked Needs Research remains visible in the Review
//     Queue's Findings tab with its Needs Research status pill — the badge fix
//     must not remove Needs Research findings from the Review Queue.
//  2. A ConflictReviewItem with status Conflicting renders a conflict card with
//     all four resolution actions on the Conflict Review page — the badge fix
//     must not disturb conflict-card rendering.
//  3. The Conflict Review page shows the empty state when there are no
//     ConflictReviewItems — the badge fix must not make the page show a card
//     when no conflict item exists.
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

async function openConflictReview(user: ReturnType<typeof userEvent.setup>) {
  await openResearchIntake(user);
  await user.click(screen.getByTestId("research_intake.open_conflict_review"));
  await screen.findByRole("heading", { name: "Conflict Review" });
}

describe("Conflict Review badge change: adjacent working behavior (characterization)", () => {
  it("keeps a normal finding marked Needs Research visible in the Review Queue", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // An ordinary finding marked Needs Research — it never became a conflict.
    setFindings([needsResearchFinding(1n, "Birth date of Julia Norwood")]);
    setConflicts([]);
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
    await openReviewQueue(user);

    // The Needs Research finding remains listed in the Findings tab with its
    // status pill. The badge fix must not remove it from the Review Queue.
    const card = screen.getByTestId("research_queue.finding.0");
    expect(
      within(card).getByText("Birth date of Julia Norwood"),
    ).toBeInTheDocument();
    // The Needs Research status pill is rendered (label is lowercase 'research').
    // An exact match targets the status pill, not the "Needs Research" action
    // button that now also appears on an actionable Needs Research finding.
    expect(within(card).getByText("Needs research")).toBeInTheDocument();
  });

  it("renders a conflict card with all four resolution actions for a Conflicting ConflictReviewItem", async () => {
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
    await openConflictReview(user);

    // The conflict card shows the disputed values side by side.
    const card = await screen.findByTestId("research_conflict.card.1");
    expect(within(card).getByText("Existing · canonical")).toBeInTheDocument();
    expect(within(card).getByText("1899")).toBeInTheDocument();
    expect(within(card).getByText("Proposed")).toBeInTheDocument();
    expect(within(card).getByText("1898")).toBeInTheDocument();

    // All four resolution actions are present on the unresolved conflict.
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

  it("shows the empty state on the Conflict Review page when there are no ConflictReviewItems", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // No ConflictReviewItem and a clean queue (no conflicting/needs-research
    // counts) — the genuine empty case the badge fix must preserve.
    setFindings([]);
    setConflicts([]);
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
    await openConflictReview(user);

    // With no conflict review items, the page shows the empty state rather than
    // a card. The badge fix must not make the page render a conflict card when
    // no conflict item exists.
    const empty = await screen.findByTestId("research_conflict.empty_state");
    expect(
      within(empty).getByText("No conflicts to review"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("research_conflict.card.1"),
    ).not.toBeInTheDocument();
  });
});

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

// Cover for the Conflict Review cache-refresh change.
//
// The build changes useApproveFinding() so that, after routing a finding into
// Conflict Review, its success handler additionally invalidates the
// ['research','conflicts'] query cache. The observable acceptance criterion:
// after approving a finding that routes to Conflict Review, the conflict card
// appears immediately without a manual refresh or sign-out.
//
// The mock actor mirrors the backend: approving a finding that conflicts with
// an existing canonical value creates a ConflictReviewItem. The test approves
// the finding in the Review Queue and then opens Conflict Review, asserting the
// newly routed conflict card is present — the data the ['research','conflicts']
// query feeds, refreshed by the new invalidation.
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
  setReviewQueue,
  getApprovedFindingIds,
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
  let approvedFindingIds: bigint[] = [];
  let conflictListCalls = 0;

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
    async listFindings(): Promise<ProposedFinding[]> {
      return findings;
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<ConflictReviewItem[]> {
      conflictListCalls += 1;
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
    async approveFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.Approved } : f,
      );
      approvedFindingIds = [...approvedFindingIds, id];
      // Mirrors the backend: approving a finding that conflicts with an
      // existing canonical value routes it into Conflict Review by creating a
      // ConflictReviewItem.
      if (found.content.__kind__ === "PersonFact") {
        const fact = found.content.PersonFact;
        conflicts = [
          ...conflicts,
          {
            id: 1n,
            findingId: id,
            field: fact.field,
            canonicalValue: "1899",
            proposedValue: fact.value,
            status: ReviewStatus.Conflicting,
            evidenceLabel: found.evidenceLabel,
            stewardNotes: "",
            personId: fact.personId,
            existingSourceId: found.sourceId,
            proposedSourceId: found.sourceId,
          },
        ];
      }
      return findings.find((f) => f.id === id) ?? null;
    },
    async rejectFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.Rejected } : f,
      );
      return findings.find((f) => f.id === id) ?? null;
    },
    async needsResearchFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.NeedsResearch } : f,
      );
      return findings.find((f) => f.id === id) ?? null;
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
      approvedFindingIds = [];
      conflictListCalls = 0;
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
    getApprovedFindingIds: () => approvedFindingIds,
    getConflictListCalls: () => conflictListCalls,
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

async function openResearchIntake(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
}

describe("Conflict Review cache refresh after approving a finding", () => {
  it("shows the newly routed conflict card immediately after approving a finding, without a manual refresh", async () => {
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

    // Open the Review Queue and approve the pending finding. The mock's
    // approveFinding mirrors the backend by routing it into Conflict Review
    // (creating a ConflictReviewItem).
    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });
    await user.click(
      screen.getByTestId("research_queue.finding.0.approve_button"),
    );
    expect(getApprovedFindingIds()).toEqual([1n]);

    // Navigate to Conflict Review. The new useApproveFinding invalidation
    // refreshes the ['research','conflicts'] cache, so the routed conflict card
    // appears immediately — no manual refresh or sign-out required.
    await user.click(screen.getByTestId("research_queue.back_button"));
    await screen.findByRole("heading", { name: "Research Intake" });
    await user.click(
      screen.getByTestId("research_intake.open_conflict_review"),
    );
    await screen.findByRole("heading", { name: "Conflict Review" });

    const card = await screen.findByTestId("research_conflict.card.1");
    expect(within(card).getByText("Birth date")).toBeInTheDocument();
    expect(within(card).getByText("Existing · canonical")).toBeInTheDocument();
    expect(within(card).getByText("1899")).toBeInTheDocument();
    expect(within(card).getByText("Proposed")).toBeInTheDocument();
    expect(within(card).getByText("12 March 1898")).toBeInTheDocument();
  });
});

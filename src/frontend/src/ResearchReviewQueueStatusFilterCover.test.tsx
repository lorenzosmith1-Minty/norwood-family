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

// Cover for the Research Review Queue workload-visibility change:
//
//  1. The Review Queue gains status filtering (All / Pending / Needs Research /
//     Conflicting / Resolved-Approved) that narrows the visible items on each
//     entity tab.
//  2. Needs Research items remain actionable — they still render Approve /
//     Reject / Needs Research actions.
//  3. The Family Steward action badge aggregates pending + needs-research +
//     conflicting, and decreases when a Needs Research item is resolved or
//     rejected.
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
  getRejectedFindingIds,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let reviewQueue: ReviewQueue = {
    pending: 0n,
    approved: 0n,
    rejected: 0n,
    conflicting: 0n,
    needsResearch: 0n,
    items: [],
  };
  let rejectedFindingIds: bigint[] = [];

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
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      return [];
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return [];
    },
    async approveFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.Approved } : f,
      );
      // A resolved Needs Research item leaves the steward workload.
      reviewQueue = {
        ...reviewQueue,
        needsResearch:
          reviewQueue.needsResearch > 0n ? reviewQueue.needsResearch - 1n : 0n,
        approved: reviewQueue.approved + 1n,
      };
      return findings.find((f) => f.id === id) ?? null;
    },
    async rejectFinding(id: bigint): Promise<ProposedFinding | null> {
      const found = findings.find((f) => f.id === id);
      if (!found) return null;
      findings = findings.map((f) =>
        f.id === id ? { ...f, status: ReviewStatus.Rejected } : f,
      );
      rejectedFindingIds = [...rejectedFindingIds, id];
      // A rejected Needs Research item leaves the steward workload.
      reviewQueue = {
        ...reviewQueue,
        needsResearch:
          reviewQueue.needsResearch > 0n ? reviewQueue.needsResearch - 1n : 0n,
        rejected: reviewQueue.rejected + 1n,
      };
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
      rejectedFindingIds = [];
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
    setReviewQueue: (v: ReviewQueue) => {
      reviewQueue = v;
    },
    getRejectedFindingIds: () => rejectedFindingIds,
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
  status: ReviewStatus,
): ProposedFinding {
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
    status,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
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

describe("Research Review Queue status filtering", () => {
  it("filters the Findings tab to Needs Research items when that filter is selected", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    // One pending finding and one needs-research finding.
    setFindings([
      finding(1n, "Pending birth date", ReviewStatus.Pending),
      finding(2n, "Needs research birth date", ReviewStatus.NeedsResearch),
    ]);
    setReviewQueue({
      pending: 1n,
      approved: 0n,
      rejected: 0n,
      conflicting: 0n,
      needsResearch: 1n,
      items: [],
    });
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    // The Findings tab shows both items by default.
    expect(await screen.findByText("Pending birth date")).toBeInTheDocument();
    expect(screen.getByText("Needs research birth date")).toBeInTheDocument();

    // Select the "Needs Research" status filter.
    await user.click(
      screen.getByTestId("research_queue.status_filter.NeedsResearch"),
    );

    // Only the needs-research finding remains visible.
    expect(screen.getByText("Needs research birth date")).toBeInTheDocument();
    expect(screen.queryByText("Pending birth date")).not.toBeInTheDocument();
  });

  it("keeps Needs Research findings actionable with Approve and Reject buttons", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([
      finding(1n, "Needs research birth date", ReviewStatus.NeedsResearch),
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
    await openReviewQueue(user);

    // The needs-research finding card renders the Approve / Reject / Needs
    // Research actions (it is actionable, not a dead-end state).
    const card = await screen.findByTestId("research_queue.finding.0");
    expect(
      within(card).getByRole("button", { name: /Approve/ }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Reject/ }),
    ).toBeInTheDocument();
    expect(
      within(card).getByRole("button", { name: /Needs Research/ }),
    ).toBeInTheDocument();
  });
});

describe("Family Steward action badge decreases on resolve/reject", () => {
  it("decreases the badge when a Needs Research finding is rejected", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setFindings([
      finding(1n, "Needs research birth date", ReviewStatus.NeedsResearch),
    ]);
    // One needs-research item in the steward workload.
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

    // The badge reflects the single needs-research item.
    const badge = await screen.findByTestId("steward_action_badge");
    expect(badge).toHaveTextContent("1");
    expect(badge).toHaveAttribute(
      "aria-label",
      "1 steward action awaiting review",
    );

    // Reject the needs-research finding.
    await openReviewQueue(user);
    await user.click(
      await screen.findByTestId("research_queue.finding.0.reject_button"),
    );

    expect(getRejectedFindingIds()).toEqual([1n]);
    // The badge decreases to zero and disappears once the workload is cleared.
    await screen.findByText("Needs research birth date");
    expect(
      screen.queryByTestId("steward_action_badge"),
    ).not.toBeInTheDocument();
  });
});

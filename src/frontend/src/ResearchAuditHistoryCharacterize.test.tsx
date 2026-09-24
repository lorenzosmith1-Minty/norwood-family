import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type ConflictReviewItem,
  type PersonProfile,
  type ProfileClaim,
  type ProposedFinding,
  type RelationshipRequest,
  type Report,
  type ResearchAuditEntry,
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
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

// Characterization baseline for the Research Review Queue's Audit tab, ahead of
// the family-scoping change to the Research audit log.
//
// The accepted change intentionally alters the audit read: `ResearchAuditEntry`
// gains a `familyId`, the canonical read becomes family-scoped, and the
// frontend Audit/History hook forks on the active family. This baseline
// deliberately does NOT freeze the current non-family-forked hook or the
// unfiltered single-family list.
//
// What it protects is the adjacent consumer behavior that must survive the
// change:
//
//   1. The Audit tab still renders each audit entry returned by the audit hook,
//      showing its action and summary.
//   2. The Audit tab count reflects the number of entries returned.
//   3. The empty state still renders when the audit hook returns no entries.
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
  setResearchAudit,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let findings: ProposedFinding[] = [];
  let conflicts: ConflictReviewItem[] = [];
  let researchAudit: ResearchAuditEntry[] = [];
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
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return researchAudit;
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
    livingStatus: "Living",
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(ACCOUNT),
  } as PersonProfile;
}

function auditEntry(
  id: bigint,
  action: string,
  summary: string,
): ResearchAuditEntry {
  return {
    id,
    action,
    findingId: 1n,
    actorId: STEWARD,
    summary,
    timestamp: 1_700_000_000_000_000_000n,
    familyId: "norwood",
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

describe("Research Review Queue Audit tab (characterization)", () => {
  it("renders each audit entry's action and summary from the audit hook", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setResearchAudit([
      auditEntry(1n, "SourceCreated", "Source '1900 census' created"),
      auditEntry(2n, "FindingApproved", "Finding 'Birth date' approved"),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.audit"));

    // Both entries render with their action and summary.
    expect(await screen.findByText("SourceCreated")).toBeInTheDocument();
    expect(
      screen.getByText("Source '1900 census' created"),
    ).toBeInTheDocument();
    expect(screen.getByText("FindingApproved")).toBeInTheDocument();
    expect(
      screen.getByText("Finding 'Birth date' approved"),
    ).toBeInTheDocument();

    // The Audit tab count reflects the number of entries returned.
    const tabs = screen.getByTestId("research_queue.tabs");
    expect(
      within(tabs).getByRole("button", { name: /Audit/ }),
    ).toHaveTextContent("2");
  });

  it("renders the empty state when the audit hook returns no entries", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setResearchAudit([]);
    const user = userEvent.setup();
    renderApp();
    await openReviewQueue(user);

    await user.click(screen.getByTestId("research_queue.tab.audit"));

    expect(
      await screen.findByTestId("research_queue.audit_empty"),
    ).toBeInTheDocument();
    expect(screen.getByText("No audit history yet")).toBeInTheDocument();
  });
});

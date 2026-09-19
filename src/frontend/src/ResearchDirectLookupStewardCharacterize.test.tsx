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
import { cleanup, configure, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// ---------------------------------------------------------------------------
// Characterization baseline for the Research Intake direct-object-lookup
// authorization change.
//
// The upcoming build restricts the direct object lookups `getSource` and
// `getFinding` to active Norwood Family Stewards. This file deliberately does
// NOT freeze the current permissive behavior (an anonymous or non-steward
// caller reading a source/finding by id) — that is exactly what the change
// removes.
//
// What it protects instead is the behavior that must survive the change: an
// active Steward can still read a research source and a proposed finding, and
// the steward-facing Conflict Review surface still resolves and renders the
// linked finding and both source records through those two lookups. The
// ConflictCard calls `useGetFinding(item.findingId)` and
// `useGetSource(item.existingSourceId)` / `useGetSource(item.proposedSourceId)`,
// so this is the frontend consumer seam for the two methods being restricted.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister, and it cannot prove the backend's per-caller authorization (see
// coverageLimits).
// ---------------------------------------------------------------------------
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
  getSourceCalls,
  getFindingCalls,
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
  // Records the exact ids the frontend passes to the two direct lookups, so the
  // consumer contract (argument shape) is asserted, not just the rendered text.
  let sourceCalls: bigint[] = [];
  let findingCalls: bigint[] = [];

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
      sourceCalls = [...sourceCalls, id];
      return sources.find((s) => s.id === id) ?? null;
    },
    async listFindings(): Promise<ProposedFinding[]> {
      return findings;
    },
    async getFinding(id: bigint): Promise<ProposedFinding | null> {
      findingCalls = [...findingCalls, id];
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
      sourceCalls = [];
      findingCalls = [];
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
    getSourceCalls: () => sourceCalls,
    getFindingCalls: () => findingCalls,
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

function sourceRecord(
  id: bigint,
  title: string,
  description: string,
): SourceRecord {
  return {
    id,
    title,
    sourceType: SourceType.CensusCitation,
    description,
    contributor: STEWARD,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function personFactFinding(
  id: bigint,
  field: string,
  value: string,
  personId: string,
): ProposedFinding {
  const content: FindingContent = {
    __kind__: "PersonFact",
    PersonFact: { field, value, personId },
  };
  return {
    id,
    title: `${field} of Julia Norwood`,
    evidenceLabel: EvidenceLabel.Documented,
    findingType: FindingType.PersonFact,
    content,
    sourceId: 1n,
    personId,
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
  };
}

function conflictItem(
  id: bigint,
  findingId: bigint,
  field: string,
  canonicalValue: string,
  proposedValue: string,
  existingSourceId: bigint,
  proposedSourceId: bigint,
): ConflictReviewItem {
  return {
    id,
    findingId,
    field,
    canonicalValue,
    proposedValue,
    status: ReviewStatus.Conflicting,
    evidenceLabel: EvidenceLabel.Documented,
    stewardNotes: "",
    personId: "julia",
    existingSourceId,
    proposedSourceId,
  };
}

async function openConflictReview(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.open_conflict_review"));
  await screen.findByRole("heading", { name: "Conflict Review" });
}

describe("Research Intake direct object lookups for an active Steward (characterization)", () => {
  it("renders the linked finding and both source records a steward reads by id", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    // Two distinct sources so the existing/proposed provenance is unambiguous.
    setSources([
      sourceRecord(1n, "1900 census, Norwood household", "Census record."),
      sourceRecord(2n, "Family bible, Norwood branch", "Bible record."),
    ]);
    setFindings([
      personFactFinding(1n, "birthplace", "Springfield, IL", "julia"),
    ]);
    setConflicts([
      conflictItem(
        1n,
        1n,
        "birthplace",
        "Chicago, IL",
        "Springfield, IL",
        1n,
        2n,
      ),
    ]);
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

    // The steward reads the proposed finding by id: its title and evidence
    // label render from getFinding's result.
    expect(
      await screen.findByText("birthplace of Julia Norwood"),
    ).toBeInTheDocument();
    expect(screen.getByText("Documented")).toBeInTheDocument();

    // The steward reads both linked sources by id: each source's title renders
    // from getSource's result, replacing the "Existing source" / "Proposed
    // source" fallbacks. Each title appears twice (provenance span + source
    // card), so assert presence rather than a single match.
    expect(
      (await screen.findAllByText("1900 census, Norwood household")).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Family bible, Norwood branch").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Existing source")).not.toBeInTheDocument();
    expect(screen.queryByText("Proposed source")).not.toBeInTheDocument();

    // The consumer contract: the frontend passes the conflict item's own ids to
    // the two lookups (findingId, existingSourceId, proposedSourceId).
    expect(getFindingCalls()).toContain(1n);
    expect(getSourceCalls()).toEqual(expect.arrayContaining([1n, 2n]));
  });

  it("keeps the steward's direct lookups working when a linked source is absent", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    // Only the existing source exists; the proposed source id resolves to null.
    setSources([
      sourceRecord(1n, "1900 census, Norwood household", "Census record."),
    ]);
    setFindings([
      personFactFinding(1n, "birthplace", "Springfield, IL", "julia"),
    ]);
    setConflicts([
      conflictItem(
        1n,
        1n,
        "birthplace",
        "Chicago, IL",
        "Springfield, IL",
        1n,
        99n,
      ),
    ]);
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

    // The resolved source renders its title; the unresolved one falls back to
    // the placeholder without breaking the card.
    expect(
      await screen.findByText("1900 census, Norwood household"),
    ).toBeInTheDocument();
    expect(screen.getByText("Proposed source")).toBeInTheDocument();
    expect(screen.getByText("birthplace of Julia Norwood")).toBeInTheDocument();
  });
});

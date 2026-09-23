import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  type NewPersonCandidate,
  type PersonProfile,
  type ProfileClaim,
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

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped New Person Candidate change:
// the Research Intake "New Person Candidates" tab journey for the DEFAULT
// (Norwood) family.
//
// The requested change makes the candidate hooks family-aware: the default
// family keeps routing through the legacy no-argument candidate endpoints, while
// a non-default family routes to the canonical `*ForFamily` variants. The
// DEFAULT-family candidate workflow must keep working unchanged.
//
// The sibling characterization files freeze the candidate hook call shapes
// (ResearchCandidateLegacyCallShapeCharacterize.test.tsx) and the Review Queue
// Candidates count (ResearchReviewQueueCandidatesCountCharacterize.test.tsx).
// This file freezes the remaining default-family surface the change touches: the
// Research Intake Candidates tab itself, driven through the real page.
//
//   1. The Candidates tab renders the candidates the legacy
//      `listNewPersonCandidates()` returns, with name, details, and status.
//   2. The empty state renders when there are no candidates.
//   3. Submitting the "Add candidate" form calls the legacy
//      `createNewPersonCandidate(name, details, sourceId)` endpoint with no
//      familyId, and the created candidate appears in the list.
//   4. The default family never reaches a `*ForFamily` candidate endpoint.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding one is exactly the change under way.
// What it freezes is that the DEFAULT-family journey the page drives today keeps
// its current shape and behavior.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
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
  setCandidates,
  getCreateNewPersonCandidateCalls,
  getListNewPersonCandidatesCalls,
  getListNewPersonCandidatesForFamilyCalls,
  getCreateNewPersonCandidateForFamilyCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let candidates: NewPersonCandidate[] = [];
  let nextCandidateId = 1n;
  // Records the exact argument shapes the page passes to the candidate
  // endpoints, so the default-family consumer contract is asserted, not just
  // the rendered result.
  let createNewPersonCandidateCalls: unknown[][] = [];
  let listNewPersonCandidatesCalls: unknown[][] = [];
  let listNewPersonCandidatesForFamilyCalls: unknown[][] = [];
  let createNewPersonCandidateForFamilyCalls: unknown[][] = [];

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
    async listFindings(): Promise<unknown[]> {
      return [];
    },
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      listNewPersonCandidatesCalls = [...listNewPersonCandidatesCalls, []];
      return candidates;
    },
    async createNewPersonCandidate(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: NewPersonCandidate }
      | { __kind__: "err"; err: unknown }
    > {
      createNewPersonCandidateCalls = [...createNewPersonCandidateCalls, args];
      const [name, details, sourceId] = args as [string, string, bigint];
      const record: NewPersonCandidate = {
        familyId: "norwood",
        id: nextCandidateId,
        name,
        details,
        sourceId,
        status: ReviewStatus.Pending,
        submittedBy: STEWARD,
        submittedAt: 1_700_000_000_000_000_000n,
      };
      nextCandidateId += 1n;
      candidates = [...candidates, record];
      return { __kind__: "ok", ok: record };
    },
    // The canonical family-scoped variants must NOT be reached for the default
    // family; they are recorded so a regression that routes Norwood through them
    // is visible.
    async listNewPersonCandidatesForFamily(
      ...args: unknown[]
    ): Promise<NewPersonCandidate[]> {
      listNewPersonCandidatesForFamilyCalls = [
        ...listNewPersonCandidatesForFamilyCalls,
        args,
      ];
      return candidates;
    },
    async createNewPersonCandidateForFamily(
      ...args: unknown[]
    ): Promise<
      | { __kind__: "ok"; ok: NewPersonCandidate }
      | { __kind__: "err"; err: unknown }
    > {
      createNewPersonCandidateForFamilyCalls = [
        ...createNewPersonCandidateForFamilyCalls,
        args,
      ];
      return { __kind__: "err", err: { notAuthorized: null } };
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
    },
    async getResearchAuditLog(): Promise<ResearchAuditEntry[]> {
      return [];
    },
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      candidates = [];
      nextCandidateId = 1n;
      createNewPersonCandidateCalls = [];
      listNewPersonCandidatesCalls = [];
      listNewPersonCandidatesForFamilyCalls = [];
      createNewPersonCandidateForFamilyCalls = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    getAuthenticated: () => isAuthenticated,
    setMyProfile: (p: PersonProfile | null) => {
      myProfile = p;
    },
    setSources: (v: SourceRecord[]) => {
      sources = v;
    },
    setCandidates: (v: NewPersonCandidate[]) => {
      candidates = v;
    },
    getCreateNewPersonCandidateCalls: () => createNewPersonCandidateCalls,
    getListNewPersonCandidatesCalls: () => listNewPersonCandidatesCalls,
    getListNewPersonCandidatesForFamilyCalls: () =>
      listNewPersonCandidatesForFamilyCalls,
    getCreateNewPersonCandidateForFamilyCalls: () =>
      createNewPersonCandidateForFamilyCalls,
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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
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

function candidate(
  id: bigint,
  name: string,
  status: ReviewStatus,
): NewPersonCandidate {
  return {
    familyId: "norwood",
    id,
    name,
    details: "A previously unrecorded family member.",
    sourceId: 1n,
    status,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
  };
}

/** Opens Family Steward -> Research Intake and selects the Candidates tab. */
async function openCandidatesTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.tab.candidates"));
  await screen.findByText("Add a person candidate");
}

describe("Research Intake Candidates tab: default-family journey (characterization)", () => {
  it("renders the candidates the legacy listNewPersonCandidates() returns, with name, details, and status", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([
      candidate(1n, "Pending Norwood", ReviewStatus.Pending),
      candidate(2n, "Approved Norwood", ReviewStatus.Approved),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openCandidatesTab(user);

    // Both candidates render, each with its name, details, and status pill.
    const pendingCard = screen.getByTestId("research.candidates.item.1");
    expect(
      within(pendingCard).getByText("Pending Norwood"),
    ).toBeInTheDocument();
    expect(
      within(pendingCard).getByText("A previously unrecorded family member."),
    ).toBeInTheDocument();
    expect(within(pendingCard).getByText("Pending")).toBeInTheDocument();

    const approvedCard = screen.getByTestId("research.candidates.item.2");
    expect(
      within(approvedCard).getByText("Approved Norwood"),
    ).toBeInTheDocument();
    expect(within(approvedCard).getByText("Approved")).toBeInTheDocument();

    // The default family reads through the legacy no-argument endpoint.
    expect(getListNewPersonCandidatesCalls()).toEqual([[]]);
    expect(getListNewPersonCandidatesForFamilyCalls()).toEqual([]);
  });

  it("renders the empty state when there are no candidates", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([]);
    const user = userEvent.setup();
    renderApp();
    await openCandidatesTab(user);

    expect(screen.getByText("No candidates yet")).toBeInTheDocument();
    expect(
      screen.queryByTestId("research.candidates.item.1"),
    ).not.toBeInTheDocument();
  });

  it("creates a candidate through the form with the legacy createNewPersonCandidate(name, details, sourceId) call and lists it", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([]);
    const user = userEvent.setup();
    renderApp();
    await openCandidatesTab(user);

    await user.type(
      screen.getByTestId("research.candidate.name_input"),
      "Martha Norwood",
    );
    await user.type(
      screen.getByTestId("research.candidate.details_input"),
      "Named in the 1900 census.",
    );
    await user.selectOptions(
      screen.getByTestId("research.candidate.source_select"),
      "1",
    );
    await user.click(screen.getByTestId("research.candidate.submit_button"));

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere.
    await vi.waitFor(() =>
      expect(getCreateNewPersonCandidateCalls()).toEqual([
        ["Martha Norwood", "Named in the 1900 census.", 1n],
      ]),
    );
    // The canonical family-scoped variant is never reached for Norwood.
    expect(getCreateNewPersonCandidateForFamilyCalls()).toEqual([]);

    // The created candidate appears in the list.
    expect(await screen.findByText("Martha Norwood")).toBeInTheDocument();
    expect(screen.getByText("Named in the 1900 census.")).toBeInTheDocument();
  });
});

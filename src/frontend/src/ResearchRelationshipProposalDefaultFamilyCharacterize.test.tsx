import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import {
  ClaimStatus,
  LivingStatus,
  type PersonProfile,
  type RelationshipProposal,
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
// Characterization baseline for the family-scoped Relationship Proposal change
// (Tenancy 1C-B2-B3-A1): the DEFAULT-family (Norwood) proposal UI behavior.
//
// The requested change makes the proposal hooks family-aware: for a NON-default
// family they must route to the canonical `*ForFamily` endpoints with an
// explicit familyId. The DEFAULT family must keep behaving exactly as before —
// the legacy no-argument endpoints, the legacy React Query key, and the same
// list/create UI.
//
// The hook-level default-family call shapes and query keys are already frozen
// by ResearchRelationshipProposalLegacyCallShapeCharacterize.test.tsx. This file
// freezes the remaining DEFAULT-family UI surface the change must not disturb:
//
//   1. The Research Intake -> Relationship Proposals tab renders the empty state
//      when there are no proposals.
//   2. The tab renders each proposal's relationship type and status pill, in the
//      order the backend returned them.
//   3. Submitting the "Propose a relationship" form calls the legacy
//      `createRelationshipProposal(fromPersonId, toPersonId, relationshipType,
//      sourceId)` with no familyId argument, and the created proposal appears in
//      the list.
//
// It deliberately does NOT freeze the non-default-family branch — routing to
// `*ForFamily` is exactly the behavior being added.
//
// The backend is a typed local actor mock, so this is component/integration
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
  setProposals,
  getCreateCalls,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let proposals: RelationshipProposal[] = [];
  let nextProposalId = 1n;
  const createCalls: unknown[][] = [];

  const reviewQueue: ReviewQueue = {
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
    async getMyProfileClaim(): Promise<null> {
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
    async listApprovedArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async searchArchiveItems(): Promise<unknown[]> {
      return [];
    },
    async listSources(): Promise<SourceRecord[]> {
      return sources;
    },
    async listFindings(): Promise<unknown[]> {
      return [];
    },
    async listNewPersonCandidates(): Promise<unknown[]> {
      return [];
    },
    async listConflictReviewItems(): Promise<unknown[]> {
      return [];
    },
    async listConflictsForPerson(): Promise<unknown[]> {
      return [];
    },
    async getResearchAuditLog(): Promise<unknown[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return reviewQueue;
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
      // Record the exact positional arguments the UI passed. The default
      // family must not thread a familyId into this legacy call.
      createCalls.push([fromPersonId, toPersonId, relationshipType, sourceId]);
      const record: RelationshipProposal = {
        familyId: "norwood",
        id: nextProposalId++,
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
  };

  return {
    mockActor,
    resetState: () => {
      isAuthenticated = false;
      isAdmin = false;
      myProfile = null;
      sources = [];
      proposals = [];
      nextProposalId = 1n;
      createCalls.length = 0;
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
    setProposals: (v: RelationshipProposal[]) => {
      proposals = v;
    },
    getCreateCalls: () => createCalls,
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

function proposal(
  id: bigint,
  overrides: Partial<RelationshipProposal> = {},
): RelationshipProposal {
  return {
    familyId: "norwood",
    id,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

async function openRelationshipsTab(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: /Family Steward/ }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Research Intake/ }),
  );
  await screen.findByRole("heading", { name: "Research Intake" });
  await user.click(screen.getByTestId("research_intake.tab.relationships"));
}

function stewardSetup() {
  setAuthenticated(true);
  setAdmin(true);
  setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
}

describe("Research Intake Relationship Proposals tab: default-family empty state (characterization)", () => {
  it("shows the empty state when there are no proposals", async () => {
    stewardSetup();
    const user = userEvent.setup();
    renderApp();
    await openRelationshipsTab(user);

    expect(
      await screen.findByText("No relationship proposals yet"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Propose a relationship between two family members above.",
      ),
    ).toBeInTheDocument();
  });
});

describe("Research Intake Relationship Proposals tab: default-family list rendering (characterization)", () => {
  it("renders each proposal's relationship type and status pill in the returned order", async () => {
    stewardSetup();
    setProposals([
      proposal(1n, {
        fromPersonId: "clayton",
        toPersonId: "julia",
        relationshipType: "Father",
        status: ReviewStatus.Pending,
      }),
      proposal(2n, {
        fromPersonId: "erma",
        toPersonId: "hudson",
        relationshipType: "Spouse",
        status: ReviewStatus.Approved,
      }),
    ]);
    const user = userEvent.setup();
    renderApp();
    await openRelationshipsTab(user);

    const first = await screen.findByTestId("research.relationships.item.1");
    const second = await screen.findByTestId("research.relationships.item.2");

    // The relationship type and status label render on each card.
    expect(within(first).getByText("Father")).toBeInTheDocument();
    expect(within(first).getByText("Pending")).toBeInTheDocument();
    expect(within(second).getByText("Spouse")).toBeInTheDocument();
    expect(within(second).getByText("Approved")).toBeInTheDocument();

    // The list preserves the order the backend returned.
    const cards = screen.getAllByTestId(/^research\.relationships\.item\./);
    expect(cards.map((c) => c.getAttribute("data-ocid"))).toEqual([
      "research.relationships.item.1",
      "research.relationships.item.2",
    ]);
  });
});

describe("Research Intake Relationship Proposals tab: default-family create journey (characterization)", () => {
  it("submits through the legacy no-argument createRelationshipProposal and shows the new proposal", async () => {
    stewardSetup();
    setSources([sourceRecord(1n, "1900 census")]);
    const user = userEvent.setup();
    renderApp();
    await openRelationshipsTab(user);

    // The form starts empty and the submit button is disabled.
    const submit = screen.getByTestId("research.relationship.submit_button");
    expect(submit).toBeDisabled();

    await user.selectOptions(
      screen.getByTestId("research.relationship.from_select"),
      "clayton",
    );
    await user.selectOptions(
      screen.getByTestId("research.relationship.to_select"),
      "julia",
    );
    await user.type(
      screen.getByTestId("research.relationship.type_input"),
      "Father",
    );
    await user.selectOptions(
      screen.getByTestId("research.relationship.source_select"),
      "1",
    );
    await user.click(submit);

    // The default-family call keeps the exact legacy positional shape: no
    // familyId argument is inserted anywhere.
    await vi.waitFor(() => {
      expect(getCreateCalls()).toEqual([["clayton", "julia", "Father", 1n]]);
    });

    // The created proposal appears in the list.
    const card = await screen.findByTestId("research.relationships.item.1");
    expect(within(card).getByText("Father")).toBeInTheDocument();
    expect(within(card).getByText("Pending")).toBeInTheDocument();
  });
});

describe("Relationship Proposal frontend path: no hard-coded family name (characterization)", () => {
  // The active family must flow through the centralized FamilyContext module
  // (the one place the literal is allowed). A proposal source file that
  // hard-codes "norwood" would bypass the active-family seam and pin the
  // proposal UI to the default family regardless of context.
  const PROPOSAL_PATH_FILES = [
    "src/hooks/useResearchIntake.ts",
    "src/pages/ResearchIntakePage.tsx",
    "src/pages/ResearchReviewQueuePage.tsx",
  ];

  it("does not hard-code the family name in any proposal frontend source file", () => {
    for (const relative of PROPOSAL_PATH_FILES) {
      const source = readFileSync(`${process.cwd()}/${relative}`, "utf8");
      expect(
        source,
        `${relative} must not hard-code the family name`,
      ).not.toMatch(/["']norwood["']/);
    }
  });

  it("keeps the family-name literal in the centralized FamilyContext module", () => {
    const contextSource = readFileSync(
      `${process.cwd()}/src/context/FamilyContext.tsx`,
      "utf8",
    );
    expect(contextSource).toMatch(/DEFAULT_FAMILY_ID\s*=\s*["']norwood["']/);
  });
});

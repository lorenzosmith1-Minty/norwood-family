import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type NewPersonCandidate,
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

// Characterization baseline for the Research Review Actions + Review Queue
// Badge change.
//
// The upcoming build intentionally changes two things:
//  1. CandidateCard and RelationshipCard in the review queue gain
//     Approve/Reject/Needs Research action buttons (currently display-only).
//  2. The Research Intake -> Review Queue button gains a numeric badge
//     aggregating unresolved Sources, Findings, Candidates, and Relationships,
//     hidden at zero.
//
// This baseline deliberately does NOT assert either new behavior. Instead it
// freezes the adjacent working behavior the change must not break:
//
//  1. The Review Queue button is a real <button> named "Review Queue" that
//     navigates to the Review Queue page — the badge work modifies this exact
//     button, so protecting its role, name, and navigation catches a regression
//     (e.g. the badge turning it into a link, renaming it, or breaking its
//     onClick) before it ships.
//  2. A New Person Candidate card renders its name, "New person candidate"
//     label, and details — the action-button work adds buttons to this card but
//     must not disturb its content.
//  3. A Relationship Proposal card renders its relationship type and
//     "Relationship proposal" label — the action-button work adds buttons to
//     this card but must not disturb its content.
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
  setCandidates,
  setProposals,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
  let candidates: NewPersonCandidate[] = [];
  let proposals: RelationshipProposal[] = [];
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
    async listFindings(): Promise<unknown[]> {
      return [];
    },
    async listNewPersonCandidates(): Promise<NewPersonCandidate[]> {
      return candidates;
    },
    async listRelationshipProposals(): Promise<RelationshipProposal[]> {
      return proposals;
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
      candidates = [];
      proposals = [];
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
    setCandidates: (v: NewPersonCandidate[]) => {
      candidates = v;
    },
    setProposals: (v: RelationshipProposal[]) => {
      proposals = v;
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
    familyId: "norwood",
    personId,
    name,
    livingStatus: "Living" as PersonProfile["livingStatus"],
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

function candidate(id: bigint, name: string): NewPersonCandidate {
  return {
    id,
    name,
    details: "A previously unrecorded family member.",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
  };
}

function proposal(id: bigint): RelationshipProposal {
  return {
    id,
    fromPersonId: "clayton",
    toPersonId: "julia",
    relationshipType: "Father",
    sourceId: 1n,
    status: ReviewStatus.Pending,
    submittedBy: STEWARD,
    submittedAt: 1_700_000_000_000_000_000n,
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

describe("Review Queue button characterization (survives the badge change)", () => {
  it("is a real button named 'Review Queue' that opens the Review Queue page", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    const button = screen.getByTestId("research_intake.open_review_queue");
    // It is a button, not a link to a destination screen.
    expect(button.tagName).toBe("BUTTON");
    expect(button).not.toHaveAttribute("href");
    expect(button).toHaveTextContent("Review Queue");

    // Clicking it opens the Review Queue page.
    await user.click(button);
    await screen.findByRole("heading", { name: "Review Queue" });
  });
});

describe("Review Queue candidate/relationship card content characterization (survives the action-button change)", () => {
  it("renders a New Person Candidate card with its name, label, and details", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setCandidates([candidate(1n, "Unknown Norwood")]);
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });
    await user.click(screen.getByTestId("research_queue.tab.candidates"));

    const card = await screen.findByTestId("research_queue.candidate.0");
    expect(within(card).getByText("Unknown Norwood")).toBeInTheDocument();
    expect(within(card).getByText("New person candidate")).toBeInTheDocument();
    expect(
      within(card).getByText("A previously unrecorded family member."),
    ).toBeInTheDocument();
  });

  it("renders a Relationship Proposal card with its relationship type and label", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setProposals([proposal(1n)]);
    const user = userEvent.setup();
    renderApp();
    await openResearchIntake(user);

    await user.click(screen.getByTestId("research_intake.open_review_queue"));
    await screen.findByRole("heading", { name: "Review Queue" });
    await user.click(screen.getByTestId("research_queue.tab.relationships"));

    const card = await screen.findByTestId("research_queue.relationship.0");
    expect(within(card).getByText("Relationship proposal")).toBeInTheDocument();
    expect(within(card).getByText("Father")).toBeInTheDocument();
  });
});

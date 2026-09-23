import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  LivingStatus,
  type PersonProfile,
  type ProfileClaim,
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
import {
  type PersonProfile as PagePersonProfile,
  PersonProfilePage,
} from "./pages/PersonProfilePage";

// Characterization baseline for the Conflict Review cache-refresh change.
//
// The upcoming build changes useApproveFinding() so that, after routing a
// finding into Conflict Review, it additionally invalidates the
// ['research','conflicts'] and ['research','conflicts','person',personId] query
// caches. That makes the Conflict Review page and the person-profile conflict
// surfacing refresh immediately after an approval.
//
// This baseline deliberately does NOT assert the old cache-invalidation behavior
// (i.e. it does not assert that approving a finding fails to refresh those
// surfaces). Instead it freezes the adjacent working behavior the change must
// not break: the two query consumers the new invalidation targets must still
// render their data from those exact query keys.
//
//  1. The Conflict Review page renders a conflict card from the
//     ['research','conflicts'] query (useListConflictReviewItems) — the surface
//     the new invalidation refreshes.
//  2. The person profile surfaces an unresolved conflict from the
//     ['research','conflicts','person',personId] query
//     (useListConflictsForPerson) — the other surface the new invalidation
//     refreshes.
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
  setConflicts,
  setReviewQueue,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let isAdmin = false;
  let myProfile: PersonProfile | null = null;
  let sources: SourceRecord[] = [];
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
    async listFindings(): Promise<unknown[]> {
      return [];
    },
    async getFinding(): Promise<unknown> {
      return null;
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
      // Mirrors the backend: only unresolved (Conflicting / NeedsResearch)
      // conflicts for the given person are returned.
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

const juliaProfile: PagePersonProfile = {
  id: "julia",
  name: "Julia Norwood",
  role: "Family member",
  portrait: { src: "", alt: "Profile for Julia Norwood" },
  facts: [],
  story: "",
  family: { spouseName: "", spouseRole: "", childrenText: "" },
  timeline: [],
  sources: [],
};

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

describe("Conflict Review cache-refresh characterization (consumers of the invalidated query keys)", () => {
  it("renders a conflict card on the Conflict Review page from the ['research','conflicts'] query", async () => {
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
    const user = userEvent.setup();
    renderApp();
    await openConflictReview(user);

    // The conflict card renders the disputed field and both values side by
    // side — the data the ['research','conflicts'] query feeds. This is the
    // surface the new useApproveFinding invalidation refreshes, so its
    // rendering must survive.
    const card = await screen.findByTestId("research_conflict.card.1");
    expect(within(card).getByText("Birth date")).toBeInTheDocument();
    expect(within(card).getByText("Existing · canonical")).toBeInTheDocument();
    expect(within(card).getByText("1899")).toBeInTheDocument();
    expect(within(card).getByText("Proposed")).toBeInTheDocument();
    expect(within(card).getByText("1898")).toBeInTheDocument();
  });

  it("surfaces an unresolved conflict on the person profile from the ['research','conflicts','person',personId] query", async () => {
    setAuthenticated(true);
    setAdmin(true);
    setMyProfile(claimedProfile("lorenzoSmithJr", "Lorenzo Smith Jr."));
    setSources([sourceRecord(1n, "1900 census")]);
    setConflicts([conflictItem(1n, 1n, { personId: "julia" })]);

    // Render Julia's profile directly. The unresolved conflict is surfaced via
    // useListConflictsForPerson (['research','conflicts','person','julia']) —
    // the other surface the new useApproveFinding invalidation refreshes.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <PersonProfilePage
          person={juliaProfile}
          onBack={() => {}}
          profilePhoto={undefined}
          onProfilePhotoChange={() => {}}
          onOpenConflictReview={() => {}}
        />
      </QueryClientProvider>,
    );

    const section = await screen.findByRole("region", {
      name: "Unresolved conflicts",
    });
    expect(within(section).getByText("Birth date")).toBeInTheDocument();
    expect(within(section).getByText("1899")).toBeInTheDocument();
    expect(within(section).getByText("1898")).toBeInTheDocument();
  });
});

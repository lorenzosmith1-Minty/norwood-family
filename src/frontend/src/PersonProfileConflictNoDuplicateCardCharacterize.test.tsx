import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  type ConflictReviewItem,
  EvidenceLabel,
  LivingStatus,
  type Notification,
  type PersonProfile,
  type Photo,
  type ProfileClaim,
  ReviewStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  type PersonProfile as PagePersonProfile,
  PersonProfilePage,
} from "./pages/PersonProfilePage";

// Characterization baseline for the "render unresolved conflicts even when the
// canonical field has no existing fact card" change.
//
// The upcoming build will render an unresolved Person Fact conflict as a fact
// card with the Disputed indicator even when the canonical field has no
// existing fact card. This baseline deliberately does NOT assert that new
// behavior. Instead it freezes the adjacent working behavior the change must
// not break:
//
//  1. When a canonical fact card ALREADY exists for a conflicted field, exactly
//     one fact card is rendered (no duplicate card) and it shows the canonical
//     value with the Disputed indicator — the change must not render a second
//     card for the same field.
//  2. The disputed/proposed value is NOT written into the canonical fact value —
//     the fact card keeps showing the canonical value, never the proposed value.
//
// The backend is a typed in-memory actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
configure({ testIdAttribute: "data-ocid" });

const { mockActor, resetState, seedProfile, seedConflicts } = vi.hoisted(() => {
  let profiles: Record<string, PersonProfile> = {};
  let conflicts: ConflictReviewItem[] = [];

  const mockActor = {
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getProfilePhoto(): Promise<Photo | null> {
      return null;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfileClaim(): Promise<ProfileClaim | null> {
      return null;
    },
    async getMyRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
    },
    async canMessagePerson(): Promise<boolean> {
      return false;
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
  };

  return {
    mockActor,
    resetState: () => {
      profiles = {};
      conflicts = [];
    },
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    seedConflicts: (items: ConflictReviewItem[]) => {
      conflicts = items;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    identity: null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

const juliaProfile: PagePersonProfile = {
  id: "julia",
  name: "Julia Norwood",
  role: "Family member",
  portrait: { src: "", alt: "Profile for Julia Norwood" },
  facts: [
    { label: "Born", value: "approx. 1860" },
    { label: "Location", value: "Mississippi" },
  ],
  story: "",
  family: { spouseName: "", spouseRole: "", childrenText: "" },
  timeline: [],
  sources: [],
};

function seedCanonicalProfile() {
  seedProfile({
    personId: "julia",
    name: "Julia Norwood",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Unclaimed,
  });
}

function renderProfile(onOpenConflictReview?: () => void) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <PersonProfilePage
        person={juliaProfile}
        onBack={() => {}}
        profilePhoto={undefined}
        onProfilePhotoChange={() => {}}
        onOpenConflictReview={onOpenConflictReview}
      />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
});

beforeAll(() => {
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

describe("Person Profile conflict surfacing: no duplicate card when a canonical card exists (characterization)", () => {
  it("renders exactly one fact card for a conflicted field that already has a canonical card", async () => {
    seedCanonicalProfile();
    // The 'Born' fact maps to the canonical conflict field 'birthDate'. A
    // canonical fact card already exists, so the conflict must surface on that
    // single card — never a second, duplicate card.
    seedConflicts([
      {
        id: 1n,
        findingId: 1n,
        field: "birthDate",
        canonicalValue: "approx. 1860",
        proposedValue: "1861",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
      },
    ]);
    renderProfile();

    // Wait for the Disputed indicator to appear (the conflicts query resolves
    // asynchronously after the static fact text renders).
    const disputed = await screen.findByText("Disputed");
    const bornCard = disputed.closest("div");
    expect(bornCard).toBeInTheDocument();
    expect(within(bornCard!).getByText("Born")).toBeInTheDocument();

    // Exactly one 'Born' fact card is rendered — the conflict must not add a
    // second card for the same field.
    const bornLabels = screen.getAllByText("Born");
    expect(bornLabels).toHaveLength(1);
  });

  it("keeps the canonical value on the fact card and never writes the disputed value into canonical data", async () => {
    seedCanonicalProfile();
    seedConflicts([
      {
        id: 2n,
        findingId: 2n,
        field: "birthDate",
        canonicalValue: "approx. 1860",
        proposedValue: "1861",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
      },
    ]);
    renderProfile();

    const disputed = await screen.findByText("Disputed");
    const bornCard = disputed.closest("div");
    expect(bornCard).toBeInTheDocument();

    // The fact card shows the canonical value, not the proposed/disputed value.
    expect(within(bornCard!).getByText("approx. 1860")).toBeInTheDocument();
    // The disputed value is never written into the canonical fact value.
    expect(within(bornCard!).queryByText("1861")).not.toBeInTheDocument();
  });
});

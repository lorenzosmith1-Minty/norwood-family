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
import userEvent from "@testing-library/user-event";
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

// Cover for the "render unresolved Person Fact conflicts even when the
// canonical field has no existing fact card" change. When an unresolved
// (Conflicting / NeedsResearch) conflict's canonical field has NO fact card in
// person.facts, the profile renders its own disputed fact card (e.g.
// "Occupation / Welder — disputed") with the Disputed indicator and, for a
// steward, a link to Conflict Review. The disputed value is never written into
// canonical Person data, and no duplicate card is rendered when a canonical
// card already exists.
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

// This profile deliberately has NO 'Occupation' fact card, so an unresolved
// conflict on the canonical 'occupation' field has no existing card to surface
// on and must render its own disputed fact card.
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
    familyId: "norwood",
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

describe("Person Profile: unresolved conflict with no canonical fact card renders its own disputed card", () => {
  it("renders a disputed fact card for an unresolved conflict whose canonical field has no existing fact card", async () => {
    seedCanonicalProfile();
    // The 'occupation' field maps to the display label 'Occupation' via the
    // same mapping system, but juliaProfile has no Occupation fact card. The
    // conflict must render its own card showing the proposed value with a
    // '— disputed' suffix and the Disputed indicator.
    seedConflicts([
      {
        id: 1n,
        findingId: 1n,
        field: "occupation",
        canonicalValue: "",
        proposedValue: "Welder",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
        familyId: "norwood",
      },
    ]);
    renderProfile();

    // The new card shows the mapped display label and the proposed value with
    // the '— disputed' suffix.
    const occupationCard = (
      await screen.findByText("Welder — disputed")
    ).closest("div");
    expect(occupationCard).toBeInTheDocument();
    expect(within(occupationCard!).getByText("Occupation")).toBeInTheDocument();
    expect(within(occupationCard!).getByText("Disputed")).toBeInTheDocument();
  });

  it("routes the no-card disputed fact to Conflict Review when a steward opens it", async () => {
    seedCanonicalProfile();
    seedConflicts([
      {
        id: 2n,
        findingId: 2n,
        field: "occupation",
        canonicalValue: "",
        proposedValue: "Welder",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
        familyId: "norwood",
      },
    ]);
    const onOpenConflictReview = vi.fn();
    renderProfile(onOpenConflictReview);

    // The no-card disputed fact renders as a button (steward view) that routes
    // to Conflict Review when clicked.
    const disputedButton = await screen.findByRole("button", {
      name: /Disputed/,
    });
    await userEvent.click(disputedButton);
    expect(onOpenConflictReview).toHaveBeenCalledTimes(1);
  });

  it("does not write the disputed value into canonical Person data", async () => {
    seedCanonicalProfile();
    seedConflicts([
      {
        id: 3n,
        findingId: 3n,
        field: "occupation",
        canonicalValue: "",
        proposedValue: "Welder",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
        familyId: "norwood",
      },
    ]);
    renderProfile();

    // The canonical profile data is unchanged: juliaProfile still has no
    // Occupation fact, and the backend profile still has no occupation value.
    // The disputed value appears only on the rendered disputed card, never in
    // the canonical facts.
    await screen.findByText("Welder — disputed");
    const canonical = await mockActor.getPersonProfile("julia");
    expect(canonical).not.toBeNull();
    // The canonical profile carries no occupation value.
    expect((canonical as PersonProfile).occupation).toBeUndefined();
  });

  it("does not render a duplicate card when a canonical fact card already exists for the field", async () => {
    seedCanonicalProfile();
    // juliaProfile HAS a 'Born' fact card, which maps to the canonical field
    // 'birthDate'. The conflict must surface on that single existing card and
    // must NOT add a second card via the no-card branch.
    seedConflicts([
      {
        id: 4n,
        findingId: 4n,
        field: "birthDate",
        canonicalValue: "approx. 1860",
        proposedValue: "1861",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
        familyId: "norwood",
      },
    ]);
    renderProfile();

    // Wait for the Disputed indicator to appear (the conflicts query resolves
    // asynchronously after the static fact text renders).
    const disputed = await screen.findByText("Disputed");
    const bornCard = disputed.closest("div");
    expect(bornCard).toBeInTheDocument();
    // Exactly one 'Born' fact card is rendered — the no-card branch must not
    // add a second card for a field that already has a canonical card.
    const bornLabels = screen.getAllByText("Born");
    expect(bornLabels).toHaveLength(1);
    // The canonical value is preserved on the single card.
    expect(within(bornCard!).getByText("approx. 1860")).toBeInTheDocument();
  });
});

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

// Cover for the fact-level disputed indicator on the Person Profile. When a
// fact has an unresolved conflict (Conflicting / NeedsResearch), the fact card
// itself shows a subtle "Disputed" indicator. When the canonical value is blank
// but a proposed value exists, the fact displays only as disputed — e.g.
// 'Mississippi — disputed' — rather than showing an empty canonical value. A
// steward's disputed fact links/routes to Conflict Review via onOpenConflictReview.
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
    { label: "Husband", value: "Isaiah Norwood" },
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

describe("Fact-level disputed indicator on the Person Profile", () => {
  it("shows a fact as only disputed ('Mississippi — disputed') when the canonical value is blank and a proposed value exists", async () => {
    seedCanonicalProfile();
    // The 'Location' fact maps to the canonical conflict field 'currentLocation'.
    // The canonical value is blank and a proposed value exists, so the fact
    // displays only as disputed rather than showing an empty canonical value.
    seedConflicts([
      {
        id: 1n,
        findingId: 1n,
        field: "currentLocation",
        canonicalValue: "",
        proposedValue: "Mississippi",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
      },
    ]);
    renderProfile();

    // The Location fact card shows the proposed value with a '— disputed'
    // suffix, not an empty canonical value.
    const locationCard = (
      await screen.findByText("Mississippi — disputed")
    ).closest("div");
    expect(locationCard).toBeInTheDocument();
    expect(within(locationCard!).getByText("Location")).toBeInTheDocument();
    // The disputed indicator is present on the fact card.
    expect(within(locationCard!).getByText("Disputed")).toBeInTheDocument();
  });

  it("shows a subtle Disputed indicator on a fact with an unresolved conflict while keeping the canonical value", async () => {
    seedCanonicalProfile();
    // The 'Born' fact maps to the canonical conflict field 'birthDate'. The
    // canonical value is non-blank, so the fact keeps its canonical value and
    // gains a subtle Disputed indicator.
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

    // Wait for the Disputed indicator to appear (the conflicts query resolves
    // asynchronously after the static fact text renders).
    const disputed = await screen.findByText("Disputed");
    const bornCard = disputed.closest("div");
    expect(bornCard).toBeInTheDocument();
    expect(within(bornCard!).getByText("Born")).toBeInTheDocument();
    expect(within(bornCard!).getByText("approx. 1860")).toBeInTheDocument();
  });

  it("routes a disputed fact to Conflict Review when a steward opens it", async () => {
    seedCanonicalProfile();
    seedConflicts([
      {
        id: 3n,
        findingId: 3n,
        field: "currentLocation",
        canonicalValue: "",
        proposedValue: "Mississippi",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
      },
    ]);
    const onOpenConflictReview = vi.fn();
    renderProfile(onOpenConflictReview);

    // The disputed fact renders as a button (steward view) that routes to
    // Conflict Review when clicked.
    const disputedButton = await screen.findByRole("button", {
      name: /Disputed/,
    });
    await userEvent.click(disputedButton);
    expect(onOpenConflictReview).toHaveBeenCalledTimes(1);
  });

  it("does not mark a fact as disputed when it has no unresolved conflict", async () => {
    seedCanonicalProfile();
    // No conflicts for this person, so no fact card shows a Disputed indicator.
    renderProfile();

    // The Location fact renders its canonical value without a disputed suffix.
    expect(await screen.findByText("Mississippi")).toBeInTheDocument();
    expect(screen.queryByText("Disputed")).not.toBeInTheDocument();
    expect(screen.queryByText(/disputed/i)).not.toBeInTheDocument();
  });
});

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

// Cover for the Conflict Review surfacing on the person profile. When a
// proposed finding contradicts canonical data, the unresolved conflict
// (Conflicting / NeedsResearch) is surfaced on the person profile alongside
// the canonical values, with a link to Conflict Review for a steward. The
// profile page resolves these via useListConflictsForPerson -> actor
// .listConflictsForPerson, so this test renders PersonProfilePage directly
// with a typed actor mock that returns unresolved conflicts for the person.
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
  facts: [],
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

function renderProfile() {
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
        onOpenConflictReview={() => {}}
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

describe("Conflict Review surfacing on the person profile", () => {
  it("surfaces an unresolved conflicting value alongside the canonical record", async () => {
    seedCanonicalProfile();
    seedConflicts([
      {
        id: 1n,
        findingId: 1n,
        field: "Birth date",
        canonicalValue: "1899",
        proposedValue: "1898",
        status: ReviewStatus.Conflicting,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 1n,
        familyId: "norwood",
      },
    ]);
    renderProfile();

    // The unresolved conflict section appears with the disputed field and both
    // values clearly separated by owner.
    const section = await screen.findByRole("region", {
      name: "Unresolved conflicts",
    });
    expect(within(section).getByText("Birth date")).toBeInTheDocument();
    expect(within(section).getByText("Conflicting")).toBeInTheDocument();
    expect(
      within(section).getByText("Existing · canonical"),
    ).toBeInTheDocument();
    expect(within(section).getByText("1899")).toBeInTheDocument();
    expect(within(section).getByText("Proposed")).toBeInTheDocument();
    expect(within(section).getByText("1898")).toBeInTheDocument();
    // The evidence label is shown alongside the disputed values. It is
    // rendered as "Evidence: Documented" across two text nodes in one <p>, so
    // match on the element's full text content.
    expect(
      within(section).getByText(
        (_content, el) => el?.textContent === "Evidence: Documented",
      ),
    ).toBeInTheDocument();
    // A steward can jump to Conflict Review from the surfaced conflict.
    expect(
      within(section).getByRole("button", {
        name: "Review in Conflict Review",
      }),
    ).toBeInTheDocument();
  });

  it("surfaces a Needs Research conflict as unresolved on the profile", async () => {
    seedCanonicalProfile();
    seedConflicts([
      {
        id: 2n,
        findingId: 2n,
        field: "Birthplace",
        canonicalValue: "Chicago, IL",
        proposedValue: "New Orleans, LA",
        status: ReviewStatus.NeedsResearch,
        evidenceLabel: EvidenceLabel.Hypothesis,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 2n,
        familyId: "norwood",
      },
    ]);
    renderProfile();

    const section = await screen.findByRole("region", {
      name: "Unresolved conflicts",
    });
    expect(within(section).getByText("Birthplace")).toBeInTheDocument();
    expect(within(section).getByText("Needs research")).toBeInTheDocument();
    expect(within(section).getByText("Chicago, IL")).toBeInTheDocument();
    expect(within(section).getByText("New Orleans, LA")).toBeInTheDocument();
  });

  it("does not surface resolved conflicts on the profile", async () => {
    seedCanonicalProfile();
    // A resolved (Approved) conflict is never surfaced — listConflictsForPerson
    // only returns unresolved (Conflicting / NeedsResearch) items.
    seedConflicts([
      {
        id: 3n,
        findingId: 3n,
        field: "Birth date",
        canonicalValue: "1899",
        proposedValue: "1898",
        status: ReviewStatus.Approved,
        evidenceLabel: EvidenceLabel.Documented,
        stewardNotes: "",
        personId: "julia",
        existingSourceId: 1n,
        proposedSourceId: 1n,
        familyId: "norwood",
      },
    ]);
    renderProfile();

    expect(
      screen.queryByRole("region", { name: "Unresolved conflicts" }),
    ).not.toBeInTheDocument();
  });
});

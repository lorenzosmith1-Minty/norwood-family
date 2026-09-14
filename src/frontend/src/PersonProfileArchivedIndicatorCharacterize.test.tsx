import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  LivingStatus,
  type Notification,
  type OralHistorySpeaker,
  type PersonProfile,
  PrivacyLevel,
  SourceStatus,
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
import App from "./App";

// Characterization baseline for the Person Profile archived-state seam. The
// profile page determines `isArchived` from the backend archived list; this
// build will switch that seam from the steward-gated useListArchivedProfiles()
// to the non-gated useListArchivedProfileIds() so guests can open a profile
// without triggering a backend trap. These tests protect the observable
// behavior that must remain unchanged across that swap:
//
//  1. An authenticated user viewing an archived profile still sees the
//     "Archived profile" indicator (the isArchived determination is preserved).
//  2. A guest can open a profile and the Videos & Oral History section renders
//     (empty state, no add/record actions) without the archived query breaking
//     the page.
//
// The mock exposes BOTH listArchivedProfiles and listArchivedProfileIds so the
// assertions hold whichever hook the page ends up calling.

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
  setArchivedIds,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let items: ArchiveItem[] = [];
  let nextId = 0n;
  let archivedIds: string[] = [];

  const makeItem = (
    id: bigint,
    overrides: Partial<ArchiveItem> = {},
  ): ArchiveItem => ({
    id,
    title: "A family video",
    description: "A home video.",
    itemType: ArchiveItemType.Video,
    blob: ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "video/mp4",
      "clip.mp4",
    ),
    era: "1990s",
    year: 1995n,
    tags: ["home"],
    relatedMemberIds: ["julia"],
    relatedBranchId: "branch-1",
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    classification: ArchiveItemClassification.Standard,
    status: ArchiveItemStatus.Approved,
    createdAt: 1_700_000_000_000_000_000n,
    contributor: Principal.fromText("aaaaa-aa"),
    ...overrides,
  });

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return false;
    },
    async getPersonProfile(personId: string): Promise<PersonProfile | null> {
      return profiles[personId] ?? null;
    },
    async getMyProfile(): Promise<PersonProfile | null> {
      if (!isAuthenticated) return null;
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      if (owned) return owned;
      return {
        personId: "self",
        name: "Self Norwood",
        livingStatus: LivingStatus.Living,
        claimStatus: ClaimStatus.Claimed,
        claimedByUserId: Principal.fromText(currentPrincipal),
        preferredName: undefined,
        story: undefined,
        occupation: undefined,
        birthInfo: undefined,
        timeline: undefined,
        privacySettings: undefined,
      };
    },
    async getMyProfileClaim(): Promise<null> {
      return null;
    },
    async getProfilePhoto(): Promise<null> {
      return null;
    },
    async listPhotos(): Promise<unknown[]> {
      return [];
    },
    async getMyRelationshipRequests(): Promise<unknown[]> {
      return [];
    },
    async listNotifications(): Promise<Notification[]> {
      return [];
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return items.filter((i) => i.status === ArchiveItemStatus.Approved);
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return items.filter((i) => i.status === ArchiveItemStatus.Pending);
    },
    async submitArchiveItem(
      title: string,
      description: string,
      itemType: ArchiveItemType,
      blob: ExternalBlob,
      era: string,
      year: bigint | null,
      tags: string[],
      relatedMemberIds: string[],
      relatedBranchId: string | null,
      sourceStatus: SourceStatus,
      privacyLevel: PrivacyLevel,
      classification: ArchiveItemClassification,
      primarySpeaker: OralHistorySpeaker | null,
    ): Promise<ArchiveItem> {
      const item: ArchiveItem = {
        id: nextId++,
        title,
        description,
        itemType,
        blob,
        era,
        year: year ?? undefined,
        tags,
        relatedMemberIds,
        relatedBranchId: relatedBranchId ?? undefined,
        sourceStatus,
        privacyLevel,
        classification,
        primarySpeaker: primarySpeaker ?? undefined,
        status: ArchiveItemStatus.Pending,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: Principal.fromText(currentPrincipal),
      };
      items = [...items, item];
      return item;
    },
    // Both archived-list seams are exposed so the archived indicator renders
    // whichever hook the page calls.
    async listArchivedProfiles(): Promise<PersonProfile[]> {
      return archivedIds
        .map((id) => profiles[id])
        .filter((p): p is PersonProfile => Boolean(p));
    },
    async listArchivedProfileIds(): Promise<string[]> {
      return archivedIds;
    },
  };

  return {
    mockActor,
    makeItem,
    seedItems: (seeded: ArchiveItem[]) => {
      items = [...seeded];
    },
    resetState: () => {
      isAuthenticated = false;
      currentPrincipal = "aaaaa-aa";
      profiles = {};
      items = [];
      nextId = 0n;
      archivedIds = [];
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setCurrentPrincipal: (p: string) => {
      currentPrincipal = p;
    },
    getAuthenticated: () => isAuthenticated,
    getCurrentPrincipal: () => currentPrincipal,
    seedProfile: (profile: PersonProfile) => {
      profiles = { ...profiles, [profile.personId]: profile };
    },
    setArchivedIds: (ids: string[]) => {
      archivedIds = ids;
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
      ? { getPrincipal: () => Principal.fromText(getCurrentPrincipal()) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
    isLoginError: false,
    loginError: null,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetState();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a blob is constructed. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

/** Seeds Julia Norwood as a backend profile (the default Explore Family focus). */
function seedJuliaProfile() {
  const profile: PersonProfile = {
    personId: "julia",
    name: "Julia Norwood",
    livingStatus: LivingStatus.Deceased,
    claimStatus: ClaimStatus.Unclaimed,
    claimedByUserId: undefined,
    preferredName: undefined,
    firstName: undefined,
    middleName: undefined,
    lastName: undefined,
    suffix: undefined,
    nickname: undefined,
    birthDate: undefined,
    birthplace: undefined,
    currentLocation: undefined,
    occupation: undefined,
    shortBio: undefined,
    longerStory: undefined,
    story: undefined,
    birthInfo: undefined,
    timeline: undefined,
    privacySettings: undefined,
  };
  seedProfile(profile);
  return profile;
}

/** Opens Julia's profile via the Explore Family tree (works for guests too). */
async function openJuliaProfile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Explore the Family" }));
  await user.click(screen.getByRole("button", { name: "View Profile" }));
  await screen.findByRole("heading", { level: 1, name: /Julia.*Norwood/i });
}

describe("Person Profile archived-state seam", () => {
  it("shows the Archived profile indicator for an authenticated user when the person is archived", async () => {
    seedJuliaProfile();
    setArchivedIds(["julia"]);
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openJuliaProfile(user);

    // The archived indicator is driven by the archived-list seam.
    expect(
      screen.getByTestId("profile.archived_indicator"),
    ).toBeInTheDocument();
    expect(screen.getByText("Archived profile")).toBeInTheDocument();
  });

  it("does not show the Archived profile indicator for a non-archived person", async () => {
    seedJuliaProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openJuliaProfile(user);

    expect(
      screen.queryByTestId("profile.archived_indicator"),
    ).not.toBeInTheDocument();
  });

  it("gates a guest out of Explore Family with the no-access state", async () => {
    seedJuliaProfile();
    // Guest: not authenticated. Explore Family is private to approved family
    // members, so a guest sees the no-access state instead of the family graph.
    const user = userEvent.setup();
    renderApp();

    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );

    expect(screen.getByTestId("family_access.no_access")).toBeInTheDocument();
    expect(screen.getByText("Family only")).toBeInTheDocument();
  });
});

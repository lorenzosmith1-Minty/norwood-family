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

// Cover for the Person Profile add-media change. The build added Add Video /
// Record Oral History / Add Audio buttons to the Videos & Oral History section
// on Person Profiles (reusing the existing add-media flow), profile-person
// preselection as a Related Family Member and (for oral history) the Speaker,
// and guest gating so guests see no add/record actions. These tests cover the
// accepted behavior:
//
//  1. An authenticated user opening a Person Profile with no videos sees the
//     three buttons beneath the 'No videos or oral histories yet' message.
//  2. Guests see no add/record actions in the Videos & Oral History section.
//  3. Launching Record Oral History from Waxx Minty's profile preselects Waxx
//     Minty as both Speaker and Related Family Member with visible checkmarks,
//     and the speaker can be changed before saving.
//  4. A single approved media record appears on the profile's Videos section,
//     the Family Videos & Oral History page, and the Family Archive without
//     duplication (all three read the same underlying record).
//
// The existing VideoContributeMultiSelectCharacterize and VideosOralHistoryCover
// tests preserve the flow's multi-select / speaker-toggle behavior and the
// profile section's media listing; this file covers the new buttons and the
// profile-person preselection wiring.

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const OWNER = "rrkah-fqaaa-aaaaa-aaaaq-cai";

const {
  mockActor,
  makeItem,
  seedItems,
  resetState,
  setAuthenticated,
  setCurrentPrincipal,
  getAuthenticated,
  getCurrentPrincipal,
  seedProfile,
} = vi.hoisted(() => {
  let isAuthenticated = false;
  let currentPrincipal = "aaaaa-aa";
  let profiles: Record<string, PersonProfile> = {};
  let items: ArchiveItem[] = [];
  let nextId = 0n;

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
      const owned = Object.values(profiles).find(
        (p) => p.claimedByUserId?.toString() === currentPrincipal,
      );
      return owned ?? null;
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

  // jsdom's File does not implement Blob.prototype.arrayBuffer, which the
  // upload path uses to read the file bytes. Polyfill it via FileReader so the
  // workflow can be exercised end to end in the test environment.
  if (typeof File.prototype.arrayBuffer !== "function") {
    File.prototype.arrayBuffer = function arrayBuffer(): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }
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

/** Seeds Waxx Minty (lorenzoSmithJr) as the caller's claimed living profile. */
function seedWaxxMintyProfile() {
  const profile: PersonProfile = {
    personId: "lorenzoSmithJr",
    name: "Lorenzo Smith Jr.",
    livingStatus: LivingStatus.Living,
    claimStatus: ClaimStatus.Claimed,
    claimedByUserId: Principal.fromText(OWNER),
    preferredName: "Waxx Minty",
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

/** Opens Waxx Minty's profile via the navbar profile button. */
async function openWaxxProfile(user: ReturnType<typeof userEvent.setup>) {
  // The single profile button is labeled with the canonical display name
  // (Waxx Minty) and appears once hydration resolves.
  await user.click(await screen.findByRole("button", { name: "Waxx Minty" }));
  expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent(
    "Waxx Minty",
  );
}

/** Opens the Family Archive from the navbar. */
async function openFamilyArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Family Archive" }));
  await screen.findByRole("heading", { name: "Our Family Archive" });
}

/** Opens the Family Videos & Oral History page from the Family Archive. */
async function openVideosFromArchive(user: ReturnType<typeof userEvent.setup>) {
  await openFamilyArchive(user);
  await user.click(screen.getByTestId("archive.videos_entry_button"));
  await screen.findByRole("heading", {
    name: "Family Videos & Oral History",
  });
}

describe("Person Profile Videos & Oral History add-media actions", () => {
  it("shows Add Video, Record Oral History, and Add Audio beneath the empty-state message for an authenticated user", async () => {
    seedWaxxMintyProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openWaxxProfile(user);

    const section = screen.getByLabelText("Videos & Oral History");
    // The empty-state message is present (no media linked yet).
    expect(
      within(section).getByText("No videos or oral histories yet"),
    ).toBeInTheDocument();

    // All three add/record buttons appear beneath the empty state.
    expect(
      within(section).getByTestId("profile.videos.add_video_button"),
    ).toHaveTextContent("Add Video");
    expect(
      within(section).getByTestId("profile.videos.record_oral_history_button"),
    ).toHaveTextContent("Record Oral History");
    expect(
      within(section).getByTestId("profile.videos.add_audio_button"),
    ).toHaveTextContent("Add Audio");
  });

  it("hides all add/record actions for a guest", async () => {
    seedWaxxMintyProfile();
    // Guest: not authenticated.
    const user = userEvent.setup();
    renderApp();

    // A guest cannot reach "My Profile"; open Waxx Minty's profile via the
    // Explore Family tree instead (graph-only node resolves from the backend).
    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    await screen.findByRole("heading", { level: 1 });

    const section = screen.getByLabelText("Videos & Oral History");
    expect(
      within(section).getByText("No videos or oral histories yet"),
    ).toBeInTheDocument();
    // No add/record actions for guests.
    expect(
      within(section).queryByTestId("profile.videos.add_video_button"),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByTestId(
        "profile.videos.record_oral_history_button",
      ),
    ).not.toBeInTheDocument();
    expect(
      within(section).queryByTestId("profile.videos.add_audio_button"),
    ).not.toBeInTheDocument();
  });
});

describe("Record Oral History from Waxx Minty's profile preselects her", () => {
  it("preselects Waxx Minty as both Speaker and Related Family Member with checkmarks, and the speaker can be changed", async () => {
    seedWaxxMintyProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    const user = userEvent.setup();
    renderApp();

    await openWaxxProfile(user);

    // Launch Record Oral History from the profile's Videos section. The
    // "Record Oral History" action starts the flow on the oral-history-video
    // kind, whose heading is "Add oral history".
    await user.click(
      screen.getByTestId("profile.videos.record_oral_history_button"),
    );
    await screen.findByRole("heading", { name: "Add oral history" });

    // Waxx Minty is preselected as the Speaker with a visible checkmark.
    const speakerChip = screen.getByTestId(
      "video_contribute.form.speaker.lorenzoSmithJr",
    );
    expect(speakerChip).toHaveAttribute("aria-pressed", "true");
    expect(speakerChip).toHaveTextContent("Waxx Minty");

    // Waxx Minty is preselected as a Related Family Member with a checkmark.
    const memberChip = screen.getByTestId(
      "video_contribute.form.member.lorenzoSmithJr",
    );
    expect(memberChip).toHaveAttribute("aria-pressed", "true");
    expect(memberChip).toHaveTextContent("Waxx Minty");

    // The speaker can be changed before saving: tap Julia, the selection moves.
    await user.click(screen.getByTestId("video_contribute.form.speaker.julia"));
    expect(
      screen.getByTestId("video_contribute.form.speaker.julia"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("video_contribute.form.speaker.lorenzoSmithJr"),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

describe("A saved media record appears across surfaces without duplication", () => {
  it("shows one approved record on the profile, the Videos page, and the Family Archive", async () => {
    seedWaxxMintyProfile();
    setAuthenticated(true);
    setCurrentPrincipal(OWNER);
    // A single approved oral-history record linked to Waxx Minty.
    seedItems([
      makeItem(0n, {
        title: "Waxx's story",
        itemType: ArchiveItemType.Audio,
        classification: ArchiveItemClassification.OralHistory,
        primarySpeaker: { name: "Waxx Minty", personId: "lorenzoSmithJr" },
        relatedMemberIds: ["lorenzoSmithJr"],
      }),
    ]);

    const user = userEvent.setup();
    renderApp();

    // On the profile's Videos & Oral History section, the record appears once.
    await openWaxxProfile(user);
    const section = screen.getByLabelText("Videos & Oral History");
    expect(within(section).getByText("Waxx's story")).toBeInTheDocument();
    expect(within(section).getAllByText("Waxx's story")).toHaveLength(1);

    // On the Family Videos & Oral History page, the same record appears once.
    await openVideosFromArchive(user);
    expect(screen.getByText("Waxx's story")).toBeInTheDocument();
    expect(screen.getAllByText("Waxx's story")).toHaveLength(1);

    // On the Family Archive, the same record appears once.
    await openFamilyArchive(user);
    expect(screen.getByText("Waxx's story")).toBeInTheDocument();
    expect(screen.getAllByText("Waxx's story")).toHaveLength(1);
  });
});

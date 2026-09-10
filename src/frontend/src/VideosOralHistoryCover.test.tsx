import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  type OralHistorySpeaker,
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

// Cover for the Family Videos & Oral History build: the dedicated media library
// (reachable from Family Archive / Home / Person Profiles, never a top-level
// navbar pill), the add-media flow with a required speaker for Oral History and
// a hidden speaker for non-Oral-History media, the media detail view with
// embedded video/audio players, and the Person Profile Videos & Oral History
// section. The characterized Norwood multi-select and navigation invariants are
// preserved by the existing characterize tests; this file covers the new media
// behavior.

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const {
  mockActor,
  makeItem,
  seedItems,
  resetArchive,
  setAuthenticated,
  getAuthenticated,
} = vi.hoisted(() => {
  let items: ArchiveItem[] = [];
  let nextId = 0n;
  let isAuthenticated = false;

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
        contributor: Principal.fromText("aaaaa-aa"),
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
    resetArchive: () => {
      items = [];
      nextId = 0n;
      isAuthenticated = false;
    },
    setAuthenticated: (value: boolean) => {
      isAuthenticated = value;
    },
    getAuthenticated: () => isAuthenticated,
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetArchive();
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

/** Opens the Family Videos & Oral History page from the home page. */
async function openVideosFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Family Videos & Oral History" }),
  );
  await screen.findByRole("heading", {
    name: "Family Videos & Oral History",
  });
}

/** Opens the Family Archive, then the Videos page from its entry card. */
async function openVideosFromArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Family Archive" }));
  await screen.findByRole("heading", { name: "Our Family Archive" });
  await user.click(screen.getByTestId("archive.videos_entry_button"));
  await screen.findByRole("heading", {
    name: "Family Videos & Oral History",
  });
}

describe("Family Videos & Oral History page", () => {
  it("is reachable from the Family Archive, not as a top-level navbar pill", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVideosFromArchive(user);

    // The page is a dedicated view reached from Family Archive.
    expect(
      screen.getByRole("heading", { name: "Family Videos & Oral History" }),
    ).toBeInTheDocument();

    // It is NOT a permanent top-level navbar pill.
    const header = screen
      .getByTestId("layout.explore_link")
      .closest("header") as HTMLElement;
    expect(
      within(header).queryByRole("button", { name: /Family Videos/i }),
    ).not.toBeInTheDocument();
  });

  it("is reachable from the Home page feature button", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);
    expect(
      screen.getByRole("heading", { name: "Family Videos & Oral History" }),
    ).toBeInTheDocument();
  });

  it("lists approved media of all three kinds with a speaker filter", async () => {
    seedItems([
      makeItem(0n, {
        title: "Family reunion video",
        itemType: ArchiveItemType.Video,
        classification: ArchiveItemClassification.Standard,
      }),
      makeItem(1n, {
        title: "Grandma's story",
        itemType: ArchiveItemType.Video,
        classification: ArchiveItemClassification.OralHistory,
        primarySpeaker: { name: "Julia Norwood", personId: "julia" },
      }),
      makeItem(2n, {
        title: "Grandpa's voice",
        itemType: ArchiveItemType.Audio,
        classification: ArchiveItemClassification.OralHistory,
        primarySpeaker: { name: "Clayton Norwood", personId: "clayton" },
      }),
    ]);

    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    expect(await screen.findByText("Family reunion video")).toBeInTheDocument();
    expect(await screen.findByText("Grandma's story")).toBeInTheDocument();
    expect(await screen.findByText("Grandpa's voice")).toBeInTheDocument();

    // The speaker filter narrows to oral-history items with a primary speaker.
    await user.click(screen.getByTestId("videos.filter.speaker"));
    expect(screen.queryByText("Family reunion video")).not.toBeInTheDocument();
    expect(screen.getByText("Grandma's story")).toBeInTheDocument();
    expect(screen.getByText("Grandpa's voice")).toBeInTheDocument();
  });

  it("shows an empty state when no media exists yet", async () => {
    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    expect(
      screen.getByRole("heading", { name: "No videos or oral histories yet" }),
    ).toBeInTheDocument();
  });
});

describe("Add-media flow", () => {
  it("requires a primary speaker for an oral-history item", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    await user.click(screen.getByTestId("videos.add_button"));
    await screen.findByRole("heading", { name: "What would you like to add?" });

    // Choose the audio-only oral history kind.
    await user.click(screen.getByTestId("video_contribute.kind.card.3"));
    await screen.findByRole("heading", { name: "Add audio" });

    // The speaker field is shown for oral history.
    expect(screen.getByText("Who is speaking?")).toBeInTheDocument();

    // Upload a file and fill the title, but leave the speaker unset.
    const input = document.querySelector(
      '[data-ocid="video_contribute.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["fake-audio-bytes"], "story.mp3", {
      type: "audio/mpeg",
    });
    await user.upload(input, file);
    await user.type(
      screen.getByTestId("video_contribute.form.title_input"),
      "Grandma's story",
    );
    await user.click(screen.getByTestId("video_contribute.form.submit_button"));

    // Submission is blocked until a speaker is chosen.
    expect(
      await screen.findByText(
        "Please choose who is speaking before submitting.",
      ),
    ).toBeInTheDocument();
    expect(await mockActor.listPendingArchiveItems()).toEqual([]);
  });

  it("submits an oral-history item with the chosen speaker", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    await user.click(screen.getByTestId("videos.add_button"));
    await screen.findByRole("heading", { name: "What would you like to add?" });
    await user.click(screen.getByTestId("video_contribute.kind.card.3"));
    await screen.findByRole("heading", { name: "Add audio" });

    const input = document.querySelector(
      '[data-ocid="video_contribute.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["fake-audio-bytes"], "story.mp3", {
      type: "audio/mpeg",
    });
    await user.upload(input, file);
    await user.type(
      screen.getByTestId("video_contribute.form.title_input"),
      "Grandma's story",
    );
    // Choose Julia as the primary speaker.
    await user.click(screen.getByTestId("video_contribute.form.speaker.julia"));
    await user.click(screen.getByTestId("video_contribute.form.submit_button"));

    expect(
      await screen.findByRole("heading", {
        name: "Media submitted for review",
      }),
    ).toBeInTheDocument();
    // The confirmation body explains the pending-review state.
    expect(
      screen.getByText(
        "Your media has been saved and is awaiting Family Steward approval. It will appear on linked profiles and in the Family Archive after approval.",
      ),
    ).toBeInTheDocument();
    // The confirmation offers the two accepted actions.
    expect(
      screen.getByRole("button", { name: "View Pending Contributions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Back to Videos & Oral History" }),
    ).toBeInTheDocument();

    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "Grandma's story",
      itemType: ArchiveItemType.Audio,
      classification: ArchiveItemClassification.OralHistory,
      primarySpeaker: { name: "Julia “Julie” Norwood", personId: "julia" },
    });
  });

  it("hides the speaker field for a non-oral-history uploaded video", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    await user.click(screen.getByTestId("videos.add_button"));
    await screen.findByRole("heading", { name: "What would you like to add?" });
    await user.click(screen.getByTestId("video_contribute.kind.card.1"));
    await screen.findByRole("heading", { name: "Add video" });

    // The speaker field is hidden for a plain uploaded video.
    expect(screen.queryByText("Who is speaking?")).not.toBeInTheDocument();
  });
});

describe("Media detail view", () => {
  it("embeds a video player for a video item", async () => {
    seedItems([
      makeItem(0n, {
        title: "Family reunion video",
        itemType: ArchiveItemType.Video,
        classification: ArchiveItemClassification.Standard,
      }),
    ]);

    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    await user.click(
      await screen.findByRole("button", { name: /Family reunion video/ }),
    );
    await screen.findByRole("heading", { name: "Family reunion video" });

    const player = document.querySelector(
      '[data-ocid="video_detail.player"]',
    ) as HTMLElement;
    // jsdom gives <video> no implicit ARIA role, so query by tag name.
    expect(player.querySelector("video")).toBeInTheDocument();
  });

  it("embeds an audio player for an audio-only oral history item", async () => {
    seedItems([
      makeItem(0n, {
        title: "Grandpa's voice",
        itemType: ArchiveItemType.Audio,
        classification: ArchiveItemClassification.OralHistory,
        primarySpeaker: { name: "Clayton Norwood", personId: "clayton" },
      }),
    ]);

    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    await user.click(
      await screen.findByRole("button", { name: /Grandpa's voice/ }),
    );
    await screen.findByRole("heading", { name: "Grandpa's voice" });

    const player = document.querySelector(
      '[data-ocid="video_detail.player"]',
    ) as HTMLElement;
    // jsdom gives <audio> no implicit ARIA role, so query by tag name.
    expect(player.querySelector("audio")).toBeInTheDocument();
    // The speaker is shown for an oral-history item (in the speaker card and
    // the meta row).
    expect(screen.getAllByText("Clayton Norwood").length).toBeGreaterThan(0);
  });
});

describe("Person Profile Videos & Oral History section", () => {
  it("lists media linked to the person and opens the canonical detail view", async () => {
    seedItems([
      makeItem(0n, {
        title: "Grandma's story",
        itemType: ArchiveItemType.Video,
        classification: ArchiveItemClassification.OralHistory,
        primarySpeaker: { name: "Julia Norwood", personId: "julia" },
        relatedMemberIds: ["julia"],
      }),
      // A media item not linked to Julia should not appear in her section.
      makeItem(1n, {
        title: "Clayton's video",
        itemType: ArchiveItemType.Video,
        classification: ArchiveItemClassification.Standard,
        relatedMemberIds: ["clayton"],
      }),
    ]);

    const user = userEvent.setup();
    renderApp();

    // Open Julia's profile (the default Explore Family focus) via the tree.
    await user.click(
      screen.getByRole("button", { name: "Explore the Family" }),
    );
    await user.click(screen.getByRole("button", { name: "View Profile" }));
    // Julia's profile name is "Julia “Julie” Norwood".
    await screen.findByRole("heading", { level: 1, name: /Julia.*Norwood/i });

    const section = screen.getByLabelText("Videos & Oral History");
    expect(within(section).getByText("Grandma's story")).toBeInTheDocument();
    expect(
      within(section).queryByText("Clayton's video"),
    ).not.toBeInTheDocument();

    // Opening the linked media routes to the canonical detail view.
    await user.click(
      within(section).getByRole("button", { name: /Grandma's story/ }),
    );
    await screen.findByRole("heading", { name: "Grandma's story" });
    expect(
      document.querySelector('[data-ocid="video_detail.player"]'),
    ).toBeInTheDocument();
  });
});

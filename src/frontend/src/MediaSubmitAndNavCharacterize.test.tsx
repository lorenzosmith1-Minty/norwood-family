import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  type ArchiveItemClassification,
  ArchiveItemStatus,
  type ArchiveItemType,
  type OralHistorySpeaker,
  type PrivacyLevel,
  type SourceStatus,
} from "@/backend";
import type { ExternalBlob } from "@caffeineai/object-storage";
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

// Characterization baseline for the Family Videos & Oral History submission flow
// and the top navigation bar, ahead of the media-confirmation and Family Recipes
// build.
//
// The upcoming build changes the media submission CONFIRMATION screen (heading,
// body, and the two actions) and adds a new Family Recipes feature. This baseline
// freezes the behavior that must NOT change:
//
//  1. Submitting media still creates a single Pending archive item through the
//     canonical submit path — the confirmation screen's wording is changing, but
//     the submit -> pending behavior must survive.
//  2. The top navigation bar has NO permanent "Family Recipes" pill. The Family
//     Recipes page must be reachable from Home / Family Archive / Person
//     Profiles, never as a new permanent global navbar pill.
//
// It deliberately does NOT assert the current confirmation heading/body/actions
// ("Media submitted", "Add another media item", "Back to Videos") — those are
// exactly what the request changes.

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const { mockActor, resetArchive, setAuthenticated, getAuthenticated } =
  vi.hoisted(() => {
    let items: ArchiveItem[] = [];
    let nextId = 0n;
    let isAuthenticated = false;

    const mockActor = {
      async isCallerAdmin(): Promise<boolean> {
        return false;
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
      async listPendingArchiveItems(): Promise<ArchiveItem[]> {
        return items.filter((i) => i.status === ArchiveItemStatus.Pending);
      },
      async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
        return items.filter((i) => i.status === ArchiveItemStatus.Approved);
      },
    };

    return {
      mockActor,
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

/** Opens the video contribute flow and selects the audio-only oral history kind. */
async function openOralHistoryForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Family Videos & Oral History" }),
  );
  await screen.findByRole("heading", {
    name: "Family Videos & Oral History",
  });
  await user.click(screen.getByTestId("videos.add_button"));
  await screen.findByRole("heading", { name: "What would you like to add?" });
  await user.click(screen.getByTestId("video_contribute.kind.card.3"));
  await screen.findByRole("heading", { name: "Add audio" });
}

describe("Media submission creates a single Pending item", () => {
  it("submits an oral-history item into the pending list", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openOralHistoryForm(user);

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
    await user.click(screen.getByTestId("video_contribute.form.speaker.julia"));
    await user.click(screen.getByTestId("video_contribute.form.submit_button"));

    // The submit path lands the item in the pending list as a single record.
    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "Grandma's story",
      status: ArchiveItemStatus.Pending,
    });
  });

  it("submits a plain uploaded video without a speaker into the pending list", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openVideosFromHome(user);

    await user.click(screen.getByTestId("videos.add_button"));
    await screen.findByRole("heading", { name: "What would you like to add?" });
    await user.click(screen.getByTestId("video_contribute.kind.card.1"));
    await screen.findByRole("heading", { name: "Add video" });

    const input = document.querySelector(
      '[data-ocid="video_contribute.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["fake-video-bytes"], "clip.mp4", {
      type: "video/mp4",
    });
    await user.upload(input, file);
    await user.type(
      screen.getByTestId("video_contribute.form.title_input"),
      "Family reunion",
    );
    await user.click(screen.getByTestId("video_contribute.form.submit_button"));

    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "Family reunion",
      status: ArchiveItemStatus.Pending,
    });
  });
});

describe("Top navigation bar has no permanent Family Recipes pill", () => {
  it("does not render a Family Recipes pill in the header", async () => {
    renderApp();

    // The header is the first <header> in the document (the hero is a separate
    // <header> further down the Home page).
    const header = document.querySelectorAll("header")[0] as HTMLElement;
    expect(
      within(header).queryByRole("button", { name: /Family Recipes/i }),
    ).not.toBeInTheDocument();
  });

  it("keeps the existing primary nav pills unchanged", async () => {
    renderApp();

    const header = document.querySelectorAll("header")[0] as HTMLElement;
    for (const label of [
      "Explore Family",
      "Heritage Branch",
      "Family Archive",
      "Family Stories",
      "Family Mysteries",
      "Travel Through Time",
      "Add Myself",
      "Notifications",
    ]) {
      expect(
        within(header).getByRole("button", { name: label }),
      ).toBeInTheDocument();
    }
  });
});

/** Opens the Family Videos & Oral History page from the home page. */
async function openVideosFromHome(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    screen.getByRole("button", { name: "Family Videos & Oral History" }),
  );
  await screen.findByRole("heading", {
    name: "Family Videos & Oral History",
  });
}

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
import { cleanup, configure, render, screen } from "@testing-library/react";
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

// Characterization baseline for the Family Videos & Oral History add-media flow
// (VideoContributePage). The upcoming build adds a way to launch this flow from
// a Person Profile with the profile person preselected as a Related Family
// Member and as the Speaker. That change must NOT disturb the existing
// multi-select and speaker-toggle behavior of the flow itself:
//
//   * Related family members remain a multi-select: tapping a chip shows an
//     immediate checkmark, multiple members stay selected, and a second tap
//     deselects only that member.
//   * The oral-history Speaker is a single-select that can be changed before
//     saving (tapping a different speaker moves the selection).
//
// These are the exact seams the preselection work will touch, so freezing them
// here lets a regression in the toggle behavior surface after the change.

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

describe("Video contribute flow: related family members multi-select", () => {
  it("shows an immediate checkmark on a member chip when tapped", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openOralHistoryForm(user);

    const julia = screen.getByTestId("video_contribute.form.member.julia");
    expect(julia).toHaveAttribute("aria-pressed", "false");

    await user.click(julia);
    expect(julia).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps multiple members selected at the same time", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openOralHistoryForm(user);

    await user.click(screen.getByTestId("video_contribute.form.member.julia"));
    await user.click(
      screen.getByTestId("video_contribute.form.member.clayton"),
    );
    await user.click(screen.getByTestId("video_contribute.form.member.isaiah"));

    expect(
      screen.getByTestId("video_contribute.form.member.julia"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("video_contribute.form.member.clayton"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("video_contribute.form.member.isaiah"),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByTestId("video_contribute.form.member.erma"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("deselects a member on a second tap, leaving others selected", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openOralHistoryForm(user);

    await user.click(screen.getByTestId("video_contribute.form.member.julia"));
    await user.click(
      screen.getByTestId("video_contribute.form.member.clayton"),
    );
    await user.click(screen.getByTestId("video_contribute.form.member.julia"));

    expect(
      screen.getByTestId("video_contribute.form.member.julia"),
    ).toHaveAttribute("aria-pressed", "false");
    expect(
      screen.getByTestId("video_contribute.form.member.clayton"),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Video contribute flow: oral-history speaker single-select", () => {
  it("starts with no speaker selected and requires one before submitting", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openOralHistoryForm(user);

    // No speaker is preselected by default in the standalone flow.
    expect(
      screen.getByTestId("video_contribute.form.speaker.julia"),
    ).toHaveAttribute("aria-pressed", "false");

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

    expect(
      await screen.findByText(
        "Please choose who is speaking before submitting.",
      ),
    ).toBeInTheDocument();
    expect(await mockActor.listPendingArchiveItems()).toEqual([]);
  });

  it("moves the speaker selection when a different speaker is tapped", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();
    await openOralHistoryForm(user);

    // Select Julia as the speaker, then change it to Clayton.
    await user.click(screen.getByTestId("video_contribute.form.speaker.julia"));
    expect(
      screen.getByTestId("video_contribute.form.speaker.julia"),
    ).toHaveAttribute("aria-pressed", "true");

    await user.click(
      screen.getByTestId("video_contribute.form.speaker.clayton"),
    );
    expect(
      screen.getByTestId("video_contribute.form.speaker.clayton"),
    ).toHaveAttribute("aria-pressed", "true");
    // The speaker is a single-select: Julia is no longer selected.
    expect(
      screen.getByTestId("video_contribute.form.speaker.julia"),
    ).toHaveAttribute("aria-pressed", "false");
  });
});

import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, within } from "@testing-library/react";
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

// A stateful in-memory actor standing in for the real backend so the Family
// Archive browsing screen and Archive Detail page can be exercised end to end
// without a canister. It implements the archive methods the app's hooks call.
const { mockActor, resetArchive, seedApproved, seedPending, seedRejected } =
  vi.hoisted(() => {
    let items: ArchiveItem[] = [];
    let nextId = 0n;

    const makeItem = (
      id: bigint,
      status: ArchiveItemStatus,
      overrides: Partial<ArchiveItem> = {},
    ): ArchiveItem => ({
      id,
      title: "A family letter",
      description: "A letter from 1924.",
      itemType: ArchiveItemType.Document,
      blob: ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "text/plain",
        "letter.txt",
      ),
      era: "1924",
      year: 1924n,
      tags: ["letters"],
      relatedMemberIds: ["julia"],
      relatedBranchId: "branch-1",
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      status,
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
    };

    return {
      mockActor,
      resetArchive: () => {
        items = [];
        nextId = 0n;
      },
      seedApproved: (overrides: Partial<ArchiveItem> = {}) => {
        const item = makeItem(nextId++, ArchiveItemStatus.Approved, overrides);
        items = [...items, item];
        return item;
      },
      seedPending: (overrides: Partial<ArchiveItem> = {}) => {
        const item = makeItem(nextId++, ArchiveItemStatus.Pending, overrides);
        items = [...items, item];
        return item;
      },
      seedRejected: (overrides: Partial<ArchiveItem> = {}) => {
        const item = makeItem(nextId++, ArchiveItemStatus.Rejected, overrides);
        items = [...items, item];
        return item;
      },
    };
  });

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: false,
    login: () => {},
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(() => {
  resetArchive();
  // Reset the URL so each test starts from a clean browsing state.
  window.history.replaceState(null, "", "/");
});

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
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

/** Opens the Family Archive browsing screen from the home page. */
async function openArchive(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Family Stories" }));
  await screen.findByRole("heading", { name: "Our Family Archive" });
}

describe("Family Archive browsing screen", () => {
  it("lists only approved items, newest first, and never pending or rejected ones", async () => {
    seedApproved({
      title: "Older photo",
      itemType: ArchiveItemType.Photo,
      createdAt: 1_700_000_000_000_000_000n,
    });
    seedApproved({
      title: "Newer story",
      itemType: ArchiveItemType.WrittenStoryNote,
      createdAt: 1_800_000_000_000_000_000n,
    });
    seedPending({ title: "Not yet approved" });
    seedRejected({ title: "Rejected item" });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    const list = screen.getByRole("list");
    const cards = within(list).getAllByRole("button");
    // Only the two approved items appear, newest first.
    expect(cards).toHaveLength(2);
    expect(within(cards[0]).getByText("Newer story")).toBeInTheDocument();
    expect(within(cards[1]).getByText("Older photo")).toBeInTheDocument();
    expect(screen.queryByText("Not yet approved")).not.toBeInTheDocument();
    expect(screen.queryByText("Rejected item")).not.toBeInTheDocument();
  });

  it("shows all nine type filter tabs", async () => {
    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    const tablist = screen.getByRole("tablist", { name: "Filter by type" });
    for (const label of [
      "All",
      "Photos",
      "Documents",
      "Audio",
      "Video",
      "Stories/Notes",
      "Research",
      "Work/Business",
      "Other",
    ]) {
      expect(
        within(tablist).getByRole("tab", { name: label }),
      ).toBeInTheDocument();
    }
  });

  it("filters the list by type tab", async () => {
    seedApproved({
      title: "A photo",
      itemType: ArchiveItemType.Photo,
    });
    seedApproved({
      title: "A document",
      itemType: ArchiveItemType.Document,
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("tab", { name: "Photos" }));

    expect(screen.getByText("A photo")).toBeInTheDocument();
    expect(screen.queryByText("A document")).not.toBeInTheDocument();
  });

  it("filters the list by family member", async () => {
    seedApproved({
      title: "Julia's letter",
      relatedMemberIds: ["julia"],
    });
    seedApproved({
      title: "Clayton's photo",
      relatedMemberIds: ["clayton"],
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.selectOptions(
      document.querySelector(
        '[data-ocid="archive.filter.member"]',
      ) as HTMLSelectElement,
      "clayton",
    );

    expect(screen.getByText("Clayton's photo")).toBeInTheDocument();
    expect(screen.queryByText("Julia's letter")).not.toBeInTheDocument();
  });

  it("filters the list by era/date range", async () => {
    seedApproved({
      title: "Old letter",
      era: "1924",
      year: 1924n,
    });
    seedApproved({
      title: "Modern photo",
      era: "2010",
      year: 2010n,
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.selectOptions(
      document.querySelector(
        '[data-ocid="archive.filter.era"]',
      ) as HTMLSelectElement,
      "1900s",
    );

    expect(screen.getByText("Old letter")).toBeInTheDocument();
    expect(screen.queryByText("Modern photo")).not.toBeInTheDocument();
  });

  it("combines type and member filters", async () => {
    seedApproved({
      title: "Julia's photo",
      itemType: ArchiveItemType.Photo,
      relatedMemberIds: ["julia"],
    });
    seedApproved({
      title: "Julia's document",
      itemType: ArchiveItemType.Document,
      relatedMemberIds: ["julia"],
    });
    seedApproved({
      title: "Clayton's photo",
      itemType: ArchiveItemType.Photo,
      relatedMemberIds: ["clayton"],
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("tab", { name: "Photos" }));
    await user.selectOptions(
      document.querySelector(
        '[data-ocid="archive.filter.member"]',
      ) as HTMLSelectElement,
      "julia",
    );

    expect(screen.getByText("Julia's photo")).toBeInTheDocument();
    expect(screen.queryByText("Julia's document")).not.toBeInTheDocument();
    expect(screen.queryByText("Clayton's photo")).not.toBeInTheDocument();
  });

  it("persists filter selections in the page URL", async () => {
    seedApproved({ title: "A photo", itemType: ArchiveItemType.Photo });
    seedApproved({ title: "A document", itemType: ArchiveItemType.Document });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("tab", { name: "Photos" }));
    await user.selectOptions(
      document.querySelector(
        '[data-ocid="archive.filter.member"]',
      ) as HTMLSelectElement,
      "julia",
    );

    const params = new URLSearchParams(window.location.search);
    expect(params.get("type")).toBe("Photo");
    expect(params.get("member")).toBe("julia");
  });

  it("restores filter selections from the URL on load", async () => {
    seedApproved({ title: "A photo", itemType: ArchiveItemType.Photo });
    seedApproved({ title: "A document", itemType: ArchiveItemType.Document });

    // Simulate a shared/refreshed URL carrying filter selections.
    window.history.replaceState(null, "", "/?type=Photo&member=julia");

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    // The Photo tab is active and the list is narrowed to photos.
    expect(
      screen.getByRole("tab", { name: "Photos" }).getAttribute("aria-selected"),
    ).toBe("true");
    expect(screen.getByText("A photo")).toBeInTheDocument();
    expect(screen.queryByText("A document")).not.toBeInTheDocument();
  });

  it("shows a clear message and reset action when no items match the filters", async () => {
    seedApproved({ title: "A photo", itemType: ArchiveItemType.Photo });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("tab", { name: "Audio" }));

    expect(
      screen.getByRole("heading", { name: "No items match these filters" }),
    ).toBeInTheDocument();

    // Reset restores the full list.
    await user.click(screen.getByRole("button", { name: "Clear filters" }));
    expect(screen.getByText("A photo")).toBeInTheDocument();
  });

  it("shows an empty state when the archive has no approved items", async () => {
    seedPending();
    seedRejected();

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    expect(
      screen.getByRole("heading", { name: "The archive is empty" }),
    ).toBeInTheDocument();
  });

  it("is reachable from the header navigation", async () => {
    const user = userEvent.setup();
    renderApp();

    await user.click(screen.getByRole("button", { name: "Family Archive" }));
    expect(
      await screen.findByRole("heading", { name: "Our Family Archive" }),
    ).toBeInTheDocument();
  });
});

describe("Archive Detail page", () => {
  it("opens from a card and shows description, tags, source status, contributor, and submission date", async () => {
    seedApproved({
      title: "Grandma's recipe",
      description: "Sunday dinner recipe.",
      itemType: ArchiveItemType.WrittenStoryNote,
      era: "circa 1950s",
      year: undefined,
      tags: ["recipes", "sunday"],
      relatedMemberIds: ["julia"],
      sourceStatus: SourceStatus.Transcribed,
      createdAt: 1_700_000_000_000_000_000n,
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("button", { name: /Grandma's recipe/ }));

    expect(
      await screen.findByRole("heading", { name: "Grandma's recipe" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Sunday dinner recipe.")).toBeInTheDocument();
    expect(screen.getByText("recipes")).toBeInTheDocument();
    expect(screen.getByText("sunday")).toBeInTheDocument();
    expect(screen.getByText("Transcribed")).toBeInTheDocument();
    expect(screen.getByText(/Contributed by/)).toBeInTheDocument();
    // Submission date is rendered from the createdAt timestamp.
    expect(screen.getByText(/2023/)).toBeInTheDocument();
  });

  it("shows related family members with links to their profiles", async () => {
    seedApproved({
      title: "A family letter",
      relatedMemberIds: ["julia", "clayton"],
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("button", { name: /A family letter/ }));

    const section = await screen.findByRole("heading", {
      name: "Related family members",
    });
    expect(section).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Julia/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Clayton/ })).toBeInTheDocument();
  });

  it("renders the original photo artifact as-is for a photo item", async () => {
    seedApproved({
      title: "Wedding portrait",
      itemType: ArchiveItemType.Photo,
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("button", { name: /Wedding portrait/ }));

    const artifact = document.querySelector(
      '[data-ocid="archive_detail.artifact"]',
    ) as HTMLElement;
    const img = within(artifact).getByRole("img", { name: "Wedding portrait" });
    expect(img).toBeInTheDocument();
    // The original artifact's direct URL is used, preserving the uploaded file.
    expect(img.getAttribute("src")).toBeTruthy();
  });

  it("renders a document view with an open-original link for a document item", async () => {
    seedApproved({
      title: "A family letter",
      itemType: ArchiveItemType.Document,
    });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("button", { name: /A family letter/ }));

    const openOriginal = await screen.findByRole("link", {
      name: "Open original",
    });
    expect(openOriginal).toHaveAttribute("href");
    expect(openOriginal).toHaveAttribute("target", "_blank");
  });

  it("navigates back to the browsing list from the detail page", async () => {
    seedApproved({ title: "A family letter" });

    const user = userEvent.setup();
    renderApp();
    await openArchive(user);

    await user.click(screen.getByRole("button", { name: /A family letter/ }));
    await screen.findByRole("heading", { name: "A family letter" });

    await user.click(screen.getByRole("button", { name: "Back to Archive" }));

    expect(
      await screen.findByRole("heading", { name: "Our Family Archive" }),
    ).toBeInTheDocument();
  });
});

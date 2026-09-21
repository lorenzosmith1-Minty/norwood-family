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

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

// Characterization baseline for the archive tag data contract that the upcoming
// tag search/filter feature will build on. The request adds tag search/filter
// to the Family Archive and requires that every Archive item's tags persist on
// the canonical item. These tests protect the working behavior that must remain
// unchanged: a signed-in member's submitted item carries its tags on the
// canonical record, appears exactly once in the archive (no duplication), and
// renders those tags on the detail page.
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
        _mimeType: string,
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
          familyId: "norwood",
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
      async approveArchiveItem(id: bigint): Promise<ArchiveItem | null> {
        const found = items.find((i) => i.id === id);
        if (!found || found.status !== ArchiveItemStatus.Pending) return null;
        const updated = { ...found, status: ArchiveItemStatus.Approved };
        items = items.map((i) => (i.id === id ? updated : i));
        return updated;
      },
      // The Family Archive browsing screen now runs title + tag search through
      // the backend searchArchiveItems query. Mirror the backend contract: only
      // approved items, title query matched case-insensitively by substring, and
      // an item must carry ALL of the given tags.
      async searchArchiveItems(filter: {
        searchTerm: [] | [string] | undefined;
        tags: string[];
        itemType: [] | [ArchiveItemType] | undefined;
        relatedMemberId: [] | [string] | undefined;
        era: [] | [string] | undefined;
      }): Promise<ArchiveItem[]> {
        const query = ((filter.searchTerm ?? [])[0] ?? "").toLowerCase();
        const tags = filter.tags.map((t) => t.toLowerCase());
        return items.filter(
          (i) =>
            i.status === ArchiveItemStatus.Approved &&
            (query === "" || i.title.toLowerCase().includes(query)) &&
            (tags.length === 0 ||
              tags.every((t) =>
                i.tags.some((tag) => tag.toLowerCase().includes(t)),
              )),
        );
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
beforeEach(resetArchive);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a file is uploaded. Provide a deterministic stand-in.
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

async function openAddToHistory(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add to Our History" }));
}

describe("Archive tag persistence: tags persist on the canonical item", () => {
  it("persists the submitted tags on the canonical item and appears exactly once", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openAddToHistory(user);
    await user.click(screen.getByText("Document"));

    const input = document.querySelector(
      '[data-ocid="archive.form.file_input"]',
    ) as HTMLInputElement;
    const file = new File(["fake-doc-bytes"], "letter.txt", {
      type: "text/plain",
    });
    await user.upload(input, file);
    expect(await screen.findByText("letter.txt")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Title"), "A family letter");
    await user.type(
      screen.getByLabelText("Description"),
      "A letter from 1924.",
    );
    await user.type(screen.getByLabelText("Tags"), "letters, 1924");

    await user.click(
      screen.getByRole("button", { name: "Submit for approval" }),
    );

    // The submitted item is pending and carries its tags on the canonical
    // record — the seam the tag search/filter feature will read from.
    const pending = await mockActor.listPendingArchiveItems();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      title: "A family letter",
      itemType: ArchiveItemType.Document,
      status: ArchiveItemStatus.Pending,
    });
    expect(pending[0].tags).toEqual(["letters", "1924"]);
  });

  it("renders the persisted tags on the archive detail page", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    // Seed an approved item carrying tags, then approve it so it appears in the
    // approved archive list.
    const submitted = await mockActor.submitArchiveItem(
      "Grandma's recipe",
      "Sunday dinner recipe.",
      ArchiveItemType.WrittenStoryNote,
      "text/plain",
      ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "text/plain",
        "recipe.txt",
      ),
      "circa 1950s",
      null,
      ["recipes", "sunday"],
      ["julia"],
      null,
      SourceStatus.Transcribed,
      PrivacyLevel.FamilyOnly,
      ArchiveItemClassification.Standard,
      null,
    );
    await mockActor.approveArchiveItem(submitted.id);

    await user.click(screen.getByRole("button", { name: "Family Archive" }));
    await screen.findByRole("heading", { name: "Our Family Archive" });

    await user.click(screen.getByRole("button", { name: /Grandma's recipe/ }));

    // The detail page renders the tags that persist on the canonical item.
    expect(
      await screen.findByRole("heading", { name: "Grandma's recipe" }),
    ).toBeInTheDocument();
    const tagsSection = screen.getByRole("heading", { name: "Tags" });
    const section = tagsSection.closest("section");
    expect(section).not.toBeNull();
    expect(
      within(section as HTMLElement).getByText("recipes"),
    ).toBeInTheDocument();
    expect(
      within(section as HTMLElement).getByText("sunday"),
    ).toBeInTheDocument();
  });
});

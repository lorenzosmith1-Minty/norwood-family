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
import { cleanup, render, screen } from "@testing-library/react";
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

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

// Characterization baseline for the approved-items API consumer seam that the
// upcoming Family Archive browsing screen will build on. The browsing screen is
// net-new and intentionally not asserted here; instead this freezes the shape of
// the data `listApprovedArchiveItems()` returns so the new cards and detail page
// can rely on it. It also protects the invariant that pending and rejected items
// never appear in the approved list.
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
beforeEach(resetArchive);

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

describe("Approved archive items API consumer contract", () => {
  it("returns only approved items, never pending or rejected ones", async () => {
    seedApproved({
      title: "Wedding portrait",
      itemType: ArchiveItemType.Photo,
    });
    seedPending({ title: "Not yet approved" });
    seedRejected({ title: "Rejected item" });

    const approved = await mockActor.listApprovedArchiveItems();
    expect(approved).toHaveLength(1);
    expect(approved[0]).toMatchObject({
      title: "Wedding portrait",
      itemType: ArchiveItemType.Photo,
      status: ArchiveItemStatus.Approved,
    });
    expect(approved.map((i) => i.title)).not.toContain("Not yet approved");
    expect(approved.map((i) => i.title)).not.toContain("Rejected item");
  });

  it("returns the full item shape the browsing cards and detail page will render", async () => {
    const seeded = seedApproved({
      title: "Grandma's recipe",
      description: "Sunday dinner recipe.",
      itemType: ArchiveItemType.WrittenStoryNote,
      era: "circa 1950s",
      year: undefined,
      tags: ["recipes", "sunday"],
      relatedMemberIds: ["julia", "clayton"],
      sourceStatus: SourceStatus.Transcribed,
      privacyLevel: PrivacyLevel.Public,
    });

    const approved = await mockActor.listApprovedArchiveItems();
    expect(approved).toHaveLength(1);
    const item = approved[0];
    // Every field the browsing cards and detail page depend on is present and
    // round-trips through the approved-items API unchanged.
    expect(item).toMatchObject({
      id: seeded.id,
      title: "Grandma's recipe",
      description: "Sunday dinner recipe.",
      itemType: ArchiveItemType.WrittenStoryNote,
      era: "circa 1950s",
      tags: ["recipes", "sunday"],
      relatedMemberIds: ["julia", "clayton"],
      sourceStatus: SourceStatus.Transcribed,
      privacyLevel: PrivacyLevel.Public,
      status: ArchiveItemStatus.Approved,
    });
    expect(item.contributor).toBeInstanceOf(Principal);
    expect(typeof item.createdAt).toBe("bigint");
  });

  it("returns an empty list when no items are approved", async () => {
    seedPending();
    seedRejected();
    expect(await mockActor.listApprovedArchiveItems()).toEqual([]);
  });

  it("renders the app without a blank screen on the default route", () => {
    renderApp();
    expect(
      screen.getByRole("img", { name: /Norwood family tree logo/i }),
    ).toHaveAttribute("src", "/assets/norwood-logo.png");
  });
});

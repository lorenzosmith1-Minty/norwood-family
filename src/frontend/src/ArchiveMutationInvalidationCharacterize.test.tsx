import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
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
  useApproveArchiveItem,
  useRejectArchiveItem,
  useSubmitArchiveItem,
} from "./hooks/useArchiveStorage";
import { useCreateBoardPostWithMedia } from "./hooks/useBoard";
import { useCreateSourceWithUpload } from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Characterization baseline for the Archive cache-invalidation family-scoping
// change.
//
// The requested change makes the Archive mutation hooks invalidate only the
// ACTIVE family's caches. Today `useArchiveStorage`, `useBoard`, and
// `useResearchIntake` invalidate BARE cross-family prefixes
// (`["archive","pending"]`, `["archive","approved"]`,
// `["archive","approved","media"]`, `["photos"]`, `["profilePhoto"]`), which
// also marks every other family's caches stale. That bare cross-family
// invalidation is the defect being fixed, so this file deliberately does NOT
// freeze the filter shape.
//
// What it freezes instead is the adjacent working behavior the change must
// preserve: with the DEFAULT (Norwood) family active, each Archive mutation
// still refreshes the default-family caches the read hooks register. It is
// asserted behaviorally — seed the exact key a read hook registers, run the
// mutation, observe that query is invalidated — so it holds whether the
// default-family filter stays a bare prefix or becomes an exact key.
//
// The exact default-family read keys frozen here are the ones the read hooks
// register today:
//   ["archive","pending",""]            (usePendingArchiveItems)
//   ["archive","approved",""]           (useApprovedArchiveItems)
//   ["archive","approved","media",""]   (useApprovedMediaItems)
//   ["photos", personId]                (usePhotos, default family)
//   ["profilePhoto", personId]          (useProfilePhoto, default family)
//   ["pendingContributionsCount",""]    (usePendingCount)
//   ["notifications"]                   (useListNotifications, default family)
//
// The non-default half of the new behavior (a Family A mutation must NOT
// invalidate Family B's caches) is the change under way and is not
// characterized here.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async submitArchiveItem(): Promise<ArchiveItem> {
      return makeArchiveItem();
    },
    async approveArchiveItem(): Promise<ArchiveItem | null> {
      return null;
    },
    async rejectArchiveItem(): Promise<ArchiveItem | null> {
      return null;
    },
    async createBoardPostWithMedia(): Promise<unknown> {
      return null;
    },
    async createSourceWithUpload(): Promise<unknown> {
      return null;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // The mock methods are stateless; nothing to reset between tests.
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetCalls);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when a blob is constructed. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function makeArchiveItem(overrides: Partial<ArchiveItem> = {}): ArchiveItem {
  return {
    familyId: DEFAULT_FAMILY_ID,
    id: 1n,
    title: "A family letter",
    description: "A letter from 1924.",
    itemType: ArchiveItemType.Document,
    blob: ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "application/pdf",
      "letter.pdf",
    ),
    mimeType: "application/pdf",
    filename: "letter.pdf",
    era: "1924",
    year: 1924n,
    tags: ["letters"],
    contributor: OWNER,
    relatedMemberIds: [],
    relatedBranchId: undefined,
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    status: ArchiveItemStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    classification: ArchiveItemClassification.Standard,
    primarySpeaker: undefined,
    ...overrides,
  };
}

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={DEFAULT_FAMILY_ID}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

/** The exact default-family read keys the Archive read hooks register. */
const DEFAULT_ARCHIVE_KEYS: unknown[][] = [
  ["archive", "pending", ""],
  ["archive", "approved", ""],
  ["archive", "approved", "media", ""],
];

const DEFAULT_PHOTO_KEYS: unknown[][] = [
  ["photos", "julia"],
  ["profilePhoto", "julia"],
];

const DEFAULT_PENDING_COUNT_KEY: unknown[] = ["pendingContributionsCount", ""];
const DEFAULT_NOTIFICATION_KEY: unknown[] = ["notifications"];

function seedKeys(queryClient: QueryClient, keys: unknown[][]) {
  for (const key of keys) {
    queryClient.setQueryData(key, []);
  }
}

function expectInvalidated(queryClient: QueryClient, keys: unknown[][]) {
  for (const key of keys) {
    expect(
      queryClient.getQueryState(key)?.isInvalidated,
      `expected ${JSON.stringify(key)} to be invalidated`,
    ).toBe(true);
  }
}

function renderMutation<T>(hook: () => T) {
  const queryClient = makeQueryClient();
  const rendered = renderHook(hook, { wrapper: wrapperFor(queryClient) });
  return { ...rendered, queryClient };
}

describe("useSubmitArchiveItem: default-family invalidation (characterization)", () => {
  it("refreshes the default pending/approved/media archive lists and the default pending count", async () => {
    const { result, queryClient } = renderMutation(() =>
      useSubmitArchiveItem(),
    );
    seedKeys(queryClient, DEFAULT_ARCHIVE_KEYS);
    queryClient.setQueryData(DEFAULT_PENDING_COUNT_KEY, 3);
    // A genuinely unrelated key the mutation does not touch, seeded so its
    // state exists. It must NOT be an Archive search/list key: the accepted
    // change routes Archive mutations through the family-aware helpers, and
    // `archiveSearchInvalidation(undefined)` matches the default-family search
    // key `["archive","search","",...]`, so seeding that key here would make
    // the non-vacuity guard assert the opposite of the accepted behavior.
    const untouchedKey = ["board", "posts", "all"];
    queryClient.setQueryData(untouchedKey, []);

    await result.current.mutateAsync({
      title: "A letter",
      description: "A letter from 1924.",
      itemType: ArchiveItemType.Document,
      mimeType: "application/pdf",
      blob: ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "application/pdf",
        "letter.pdf",
      ),
      filename: "letter.pdf",
      era: "1924",
      year: 1924n,
      tags: ["letters"],
      relatedMemberIds: [],
      relatedBranchId: null,
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
    });

    expectInvalidated(queryClient, DEFAULT_ARCHIVE_KEYS);
    expectInvalidated(queryClient, [DEFAULT_PENDING_COUNT_KEY]);
    // Non-vacuity guard: a key the mutation does not touch stays fresh, so the
    // assertions above are observing real invalidation rather than a default.
    expect(queryClient.getQueryState(untouchedKey)?.isInvalidated).toBe(false);
  });
});

describe("useApproveArchiveItem: default-family invalidation (characterization)", () => {
  it("refreshes the default archive lists, photo keys, pending count, and notifications", async () => {
    const { result, queryClient } = renderMutation(() =>
      useApproveArchiveItem(),
    );
    seedKeys(queryClient, DEFAULT_ARCHIVE_KEYS);
    seedKeys(queryClient, DEFAULT_PHOTO_KEYS);
    queryClient.setQueryData(DEFAULT_PENDING_COUNT_KEY, 3);
    queryClient.setQueryData(DEFAULT_NOTIFICATION_KEY, []);

    await result.current.mutateAsync(7n);

    expectInvalidated(queryClient, DEFAULT_ARCHIVE_KEYS);
    expectInvalidated(queryClient, DEFAULT_PHOTO_KEYS);
    expectInvalidated(queryClient, [DEFAULT_PENDING_COUNT_KEY]);
    expectInvalidated(queryClient, [DEFAULT_NOTIFICATION_KEY]);
  });
});

describe("useRejectArchiveItem: default-family invalidation (characterization)", () => {
  it("refreshes the default pending list, pending count, and notifications", async () => {
    const { result, queryClient } = renderMutation(() =>
      useRejectArchiveItem(),
    );
    seedKeys(queryClient, DEFAULT_ARCHIVE_KEYS);
    queryClient.setQueryData(DEFAULT_PENDING_COUNT_KEY, 3);
    queryClient.setQueryData(DEFAULT_NOTIFICATION_KEY, []);

    await result.current.mutateAsync(9n);

    expectInvalidated(queryClient, [["archive", "pending", ""]]);
    expectInvalidated(queryClient, [DEFAULT_PENDING_COUNT_KEY]);
    expectInvalidated(queryClient, [DEFAULT_NOTIFICATION_KEY]);
  });
});

describe("useCreateBoardPostWithMedia: default-family invalidation (characterization)", () => {
  it("refreshes the default pending/approved archive lists, pending count, and notifications", async () => {
    const { result, queryClient } = renderMutation(() =>
      useCreateBoardPostWithMedia(),
    );
    seedKeys(queryClient, DEFAULT_ARCHIVE_KEYS);
    queryClient.setQueryData(DEFAULT_PENDING_COUNT_KEY, 3);
    queryClient.setQueryData(DEFAULT_NOTIFICATION_KEY, []);

    await result.current.mutateAsync({
      postType: "General" as never,
      title: "A post",
      body: "A body.",
      relatedPersonIds: [],
      existingArchiveItemIds: [],
      newUploads: [],
      tags: [],
    });

    expectInvalidated(queryClient, [
      ["archive", "pending", ""],
      ["archive", "approved", ""],
    ]);
    expectInvalidated(queryClient, [DEFAULT_PENDING_COUNT_KEY]);
    expectInvalidated(queryClient, [DEFAULT_NOTIFICATION_KEY]);
  });
});

describe("useCreateSourceWithUpload: default-family invalidation (characterization)", () => {
  it("refreshes the default pending/approved archive lists, pending count, and notifications", async () => {
    const { result, queryClient } = renderMutation(() =>
      useCreateSourceWithUpload(),
    );
    seedKeys(queryClient, DEFAULT_ARCHIVE_KEYS);
    queryClient.setQueryData(DEFAULT_PENDING_COUNT_KEY, 3);
    queryClient.setQueryData(DEFAULT_NOTIFICATION_KEY, []);

    await result.current.mutateAsync({
      title: "A source",
      sourceType: "Document" as never,
      description: "A description.",
      mimeType: "application/pdf",
      blob: ExternalBlob.fromBytes(
        new Uint8Array([1, 2, 3]),
        "application/pdf",
        "source.pdf",
      ),
      filename: "source.pdf",
      tags: ["sources"],
      era: "1924",
      year: 1924n,
      relatedMemberIds: [],
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
    });

    expectInvalidated(queryClient, [
      ["archive", "pending", ""],
      ["archive", "approved", ""],
    ]);
    expectInvalidated(queryClient, [DEFAULT_PENDING_COUNT_KEY]);
    expectInvalidated(queryClient, [DEFAULT_NOTIFICATION_KEY]);
  });
});

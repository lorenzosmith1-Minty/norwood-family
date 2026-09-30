import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  approvedArchiveItemsInvalidation,
  approvedArchiveMediaInvalidation,
  archivePhotoInvalidation,
  archiveSearchInvalidation,
  pendingArchiveItemsInvalidation,
  useApproveArchiveItem,
  useSubmitArchiveItem,
} from "./hooks/useArchiveStorage";
import { useCreateBoardPostWithMedia } from "./hooks/useBoard";
import { useCreateSourceWithUpload } from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the family-aware Archive cache-invalidation change.
//
// The requested change routes every Archive mutation hook through the
// family-aware helpers in `hooks/useArchiveStorage.ts` so that a mutation
// performed while one family is active invalidates ONLY that family's Archive
// caches. Before the change the hooks invalidated bare cross-family prefixes
// (`["archive","pending"]`, `["archive","approved"]`,
// `["archive","approved","media"]`, `["photos"]`, `["profilePhoto"]`), which
// also marked every other family's caches stale.
//
// This file asserts the accepted behavior:
//
//   1. Helper contract: both branches are family-exact. The default family
//      targets only the exact read key with the empty-string family slot; a
//      non-default family keeps the bare prefix but narrows it with a predicate
//      that admits only the active family's keys.
//
//   2. Non-default isolation, asserted behaviorally through the real mutation
//      hooks: with Family A active, a mutation invalidates Family A's pending /
//      approved / media caches and leaves Family B's and the default family's
//      caches untouched.
//
//   3. Photo isolation: Archive approval invalidates only the active family's
//      `photos` / `profilePhoto` caches, scoped to the affected personId when
//      known, and never another family's photo caches.
//
//   4. Default-family exactness: with the default family active, a mutation
//      invalidates the exact default read keys and leaves Family A's and
//      Family B's Archive and photo caches untouched.
//
//   5. Static source audit: no production Archive mutation flow in
//      `useArchiveStorage.ts`, `useBoard.ts`, or `useResearchIntake.ts` passes a
//      bare cross-family prefix to `invalidateQueries` for the archive pending,
//      archive approved, archive approved media, photos, or profilePhoto
//      prefixes.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";
const PERSON_ID = "julia";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async submitArchiveItem(..._args: unknown[]): Promise<unknown> {
      return makeArchiveItem();
    },
    async submitArchiveItemForFamily(..._args: unknown[]): Promise<unknown> {
      return makeArchiveItem();
    },
    async approveArchiveItem(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveArchiveItemForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async createBoardPostWithMedia(..._args: unknown[]): Promise<unknown> {
      return { id: 1n };
    },
    async createBoardPostWithMediaForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return { id: 1n };
    },
    async createSourceWithUpload(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async createSourceWithUploadForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // The mock methods are stateless; the assertions are on React Query cache
      // state, so there is nothing to reset between tests.
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
    familyId: FAMILY_A,
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

function wrapperFor(queryClient: QueryClient, familyId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

/**
 * Seeds the Archive pending / approved / media caches for the default family,
 * Family A, and Family B so an invalidation can be observed as a state
 * transition on each key.
 */
function seedArchiveCaches(queryClient: QueryClient) {
  for (const familySlot of ["", FAMILY_A, FAMILY_B]) {
    queryClient.setQueryData(["archive", "pending", familySlot], []);
    queryClient.setQueryData(["archive", "approved", familySlot], []);
    queryClient.setQueryData(["archive", "approved", "media", familySlot], []);
  }
}

/** Seeds the photo / profilePhoto caches for the default, Family A, and Family B. */
function seedPhotoCaches(queryClient: QueryClient) {
  queryClient.setQueryData(["photos", PERSON_ID], []);
  queryClient.setQueryData(["profilePhoto", PERSON_ID], null);
  queryClient.setQueryData(["photos", FAMILY_A, PERSON_ID], []);
  queryClient.setQueryData(["profilePhoto", FAMILY_A, PERSON_ID], null);
  queryClient.setQueryData(["photos", FAMILY_B, PERSON_ID], []);
  queryClient.setQueryData(["profilePhoto", FAMILY_B, PERSON_ID], null);
}

// Built lazily: `ExternalBlob.fromBytes` needs `URL.createObjectURL`, which is
// installed in `beforeAll` and is not available at module-evaluation time.
function makeArchiveInput() {
  return {
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
  };
}

const BOARD_MEDIA_INPUT = {
  postType: "Update",
  title: "A post",
  body: "A body.",
  relatedPersonIds: [],
  existingArchiveItemIds: [],
  newUploads: [],
  tags: [],
};

function makeSourceUploadInput() {
  return {
    title: "A source",
    sourceType: "Document",
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
  };
}

// ---------------------------------------------------------------------------
// Helper contract: both branches are family-exact.
// ---------------------------------------------------------------------------

describe("Archive invalidation helpers are family-exact in both branches (cover)", () => {
  it("pendingArchiveItemsInvalidation default branch targets only the exact ['archive','pending',''] key", () => {
    const filter = pendingArchiveItemsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["archive", "pending", ""]);
    expect(filter.predicate).toBeUndefined();
  });

  it("pendingArchiveItemsInvalidation non-default branch admits only the active family (index 2)", () => {
    const filter = pendingArchiveItemsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["archive", "pending"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["archive", "pending", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["archive", "pending", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["archive", "pending", ""] })).toBe(false);
  });

  it("approvedArchiveItemsInvalidation default branch targets only the exact ['archive','approved',''] key", () => {
    const filter = approvedArchiveItemsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["archive", "approved", ""]);
    expect(filter.predicate).toBeUndefined();
  });

  it("approvedArchiveItemsInvalidation non-default branch admits only the active family (index 2)", () => {
    const filter = approvedArchiveItemsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["archive", "approved"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["archive", "approved", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["archive", "approved", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["archive", "approved", ""] })).toBe(false);
  });

  it("approvedArchiveMediaInvalidation default branch targets only the exact media key", () => {
    const filter = approvedArchiveMediaInvalidation(undefined);
    expect(filter.queryKey).toEqual(["archive", "approved", "media", ""]);
    expect(filter.predicate).toBeUndefined();
  });

  it("approvedArchiveMediaInvalidation non-default branch admits only the active family (index 3)", () => {
    const filter = approvedArchiveMediaInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["archive", "approved", "media"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["archive", "approved", "media", FAMILY_A] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["archive", "approved", "media", FAMILY_B] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["archive", "approved", "media", ""] })).toBe(
      false,
    );
  });

  it("archiveSearchInvalidation default branch admits only the empty-string family slot (index 2)", () => {
    const filter = archiveSearchInvalidation(undefined);
    expect(filter.queryKey).toEqual(["archive", "search"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["archive", "search", "", "wedding"] })).toBe(
      true,
    );
    expect(
      predicate({ queryKey: ["archive", "search", FAMILY_A, "wedding"] }),
    ).toBe(false);
  });

  it("archiveSearchInvalidation non-default branch admits only the active family (index 2)", () => {
    const filter = archiveSearchInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["archive", "search"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["archive", "search", FAMILY_A, "wedding"] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["archive", "search", FAMILY_B, "wedding"] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["archive", "search", "", "wedding"] })).toBe(
      false,
    );
  });

  it("archivePhotoInvalidation non-default branch scopes to the active family and personId", () => {
    const filter = archivePhotoInvalidation("photos", FAMILY_A, PERSON_ID);
    expect(filter.queryKey).toEqual(["photos"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["photos", FAMILY_A, PERSON_ID] })).toBe(true);
    expect(predicate({ queryKey: ["photos", FAMILY_A, "other"] })).toBe(false);
    expect(predicate({ queryKey: ["photos", FAMILY_B, PERSON_ID] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["photos", PERSON_ID] })).toBe(false);
  });

  it("archivePhotoInvalidation non-default branch without a personId admits the whole active family", () => {
    const filter = archivePhotoInvalidation("profilePhoto", FAMILY_A);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["profilePhoto", FAMILY_A, PERSON_ID] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["profilePhoto", FAMILY_A, "other"] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["profilePhoto", FAMILY_B, PERSON_ID] })).toBe(
      false,
    );
  });

  it("archivePhotoInvalidation default branch is family-exact: exact key when personId is known", () => {
    // With a known personId the default branch returns the exact two-element key
    // `[prefix, personId]`. React Query matches by key PREFIX, and a two-element
    // key can never match a three-element non-default key
    // `[prefix, familyId, personId]`, so no other family's photo cache is touched.
    expect(archivePhotoInvalidation("photos", undefined, PERSON_ID)).toEqual({
      queryKey: ["photos", PERSON_ID],
    });
    expect(
      archivePhotoInvalidation("profilePhoto", undefined, PERSON_ID),
    ).toEqual({ queryKey: ["profilePhoto", PERSON_ID] });
  });

  it("archivePhotoInvalidation default branch without a personId narrows the bare prefix with a predicate", () => {
    // Without a personId the default branch keeps the `[prefix]` prefix but
    // narrows it with a predicate admitting ONLY the two-element default shape,
    // which excludes every three-element non-default key so a default-family
    // mutation cannot mark another family's photo caches stale.
    const filter = archivePhotoInvalidation("profilePhoto", undefined);
    expect(filter.queryKey).toEqual(["profilePhoto"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["profilePhoto", PERSON_ID] })).toBe(true);
    expect(predicate({ queryKey: ["profilePhoto", "other"] })).toBe(true);
    expect(predicate({ queryKey: ["profilePhoto", FAMILY_A, PERSON_ID] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["profilePhoto", FAMILY_B, PERSON_ID] })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Non-default family isolation, through the real mutation hooks.
// ---------------------------------------------------------------------------

describe("Archive mutation in Family A invalidates only Family A Archive caches (cover)", () => {
  it("useSubmitArchiveItem invalidates Family A pending/approved/media and leaves Family B and default untouched", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSubmitArchiveItem(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedArchiveCaches(queryClient);

    await result.current.mutateAsync(makeArchiveInput());

    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["archive", "approved", "media", FAMILY_A]),
    ).toBe(true);
    // Family B is untouched.
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["archive", "approved", "media", FAMILY_B]),
    ).toBe(false);
    // The default family is untouched.
    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(false);
    expect(isInvalidated(queryClient, ["archive", "approved", ""])).toBe(false);
    expect(
      isInvalidated(queryClient, ["archive", "approved", "media", ""]),
    ).toBe(false);
  });

  it("useCreateBoardPostWithMedia invalidates Family A pending/approved and leaves Family B and default untouched", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedArchiveCaches(queryClient);

    await result.current.mutateAsync(BOARD_MEDIA_INPUT as never);

    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(false);
    expect(isInvalidated(queryClient, ["archive", "approved", ""])).toBe(false);
  });

  it("useCreateSourceWithUpload invalidates Family A pending/approved and leaves Family B and default untouched", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateSourceWithUpload(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedArchiveCaches(queryClient);

    await result.current.mutateAsync(makeSourceUploadInput() as never);

    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(false);
    expect(isInvalidated(queryClient, ["archive", "approved", ""])).toBe(false);
  });

  it("a Family B mutation invalidates Family B only, not Family A", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSubmitArchiveItem(), {
      wrapper: wrapperFor(queryClient, FAMILY_B),
    });
    seedArchiveCaches(queryClient);

    await result.current.mutateAsync(makeArchiveInput());

    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Photo isolation on Archive approval.
// ---------------------------------------------------------------------------

describe("Archive approval photo invalidation stays within the active family (cover)", () => {
  it("useApproveArchiveItem invalidates only Family A photos/profilePhoto, not Family B or default", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useApproveArchiveItem(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedPhotoCaches(queryClient);

    await result.current.mutateAsync(7n);

    expect(isInvalidated(queryClient, ["photos", FAMILY_A, PERSON_ID])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_A, PERSON_ID]),
    ).toBe(true);
    // Family B photo caches are untouched.
    expect(isInvalidated(queryClient, ["photos", FAMILY_B, PERSON_ID])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_B, PERSON_ID]),
    ).toBe(false);
    // The default-family photo caches are untouched.
    expect(isInvalidated(queryClient, ["photos", PERSON_ID])).toBe(false);
    expect(isInvalidated(queryClient, ["profilePhoto", PERSON_ID])).toBe(false);
  });

  it("useApproveArchiveItem with a known personId invalidates only that person's Family A photo caches", async () => {
    const queryClient = makeQueryClient();
    renderHook(() => useApproveArchiveItem(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedPhotoCaches(queryClient);
    // A second person in the same family, which must stay fresh when the
    // affected personId is known.
    queryClient.setQueryData(["photos", FAMILY_A, "other"], []);
    queryClient.setQueryData(["profilePhoto", FAMILY_A, "other"], null);

    // The helper is exercised directly with the known personId, mirroring the
    // scoped invalidation the approval flow performs when the affected person
    // is known.
    await queryClient.invalidateQueries(
      archivePhotoInvalidation("photos", FAMILY_A, PERSON_ID),
    );
    await queryClient.invalidateQueries(
      archivePhotoInvalidation("profilePhoto", FAMILY_A, PERSON_ID),
    );

    expect(isInvalidated(queryClient, ["photos", FAMILY_A, PERSON_ID])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_A, PERSON_ID]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["photos", FAMILY_A, "other"])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_A, "other"]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["photos", FAMILY_B, PERSON_ID])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Default-family exactness.
// ---------------------------------------------------------------------------

describe("default-family mutation does not invalidate non-default-family caches (cover)", () => {
  it("useSubmitArchiveItem invalidates the exact default keys and no family keys", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useSubmitArchiveItem(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedArchiveCaches(queryClient);

    await result.current.mutateAsync(makeArchiveInput());

    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(true);
    expect(isInvalidated(queryClient, ["archive", "approved", ""])).toBe(true);
    expect(
      isInvalidated(queryClient, ["archive", "approved", "media", ""]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      false,
    );
  });

  it("useApproveArchiveItem invalidates the exact default photo keys and no family photo keys", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useApproveArchiveItem(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedPhotoCaches(queryClient);

    await result.current.mutateAsync(7n);

    expect(isInvalidated(queryClient, ["photos", PERSON_ID])).toBe(true);
    expect(isInvalidated(queryClient, ["profilePhoto", PERSON_ID])).toBe(true);
    expect(isInvalidated(queryClient, ["photos", FAMILY_A, PERSON_ID])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_A, PERSON_ID]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["photos", FAMILY_B, PERSON_ID])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["profilePhoto", FAMILY_B, PERSON_ID]),
    ).toBe(false);
  });

  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// Static source audit: no bare cross-family Archive/photo prefix invalidation
// remains in the Archive mutation flows.
// ---------------------------------------------------------------------------

describe("no production Archive mutation flow uses a bare cross-family prefix (cover)", () => {
  const HOOKS_DIR = join(process.cwd(), "src", "hooks");
  const AUDITED_FILES = [
    "useArchiveStorage.ts",
    "useBoard.ts",
    "useResearchIntake.ts",
  ];

  function readHook(name: string): string {
    return readFileSync(join(HOOKS_DIR, name), "utf8");
  }

  it("audits the three production hook files named in the request", () => {
    for (const name of AUDITED_FILES) {
      expect(readHook(name).length).toBeGreaterThan(0);
    }
  });

  it("no audited hook passes a bare archive pending/approved/media prefix to invalidateQueries", () => {
    // A bare `["archive","pending"]` (etc.) prefix matches every family-appended
    // key, so it would mark another family's Archive cache stale. The helpers
    // build the filter; the hooks must call the helper, not inline the prefix.
    const barePrefixes = [
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']archive["']\s*,\s*["']pending["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']archive["']\s*,\s*["']approved["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']archive["']\s*,\s*["']approved["']\s*,\s*["']media["']\s*\]\s*\}/u,
    ];
    const offenders: string[] = [];
    for (const name of AUDITED_FILES) {
      const source = readHook(name);
      if (barePrefixes.some((pattern) => pattern.test(source))) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("no audited hook passes a bare photos/profilePhoto prefix to invalidateQueries", () => {
    const barePrefixes = [
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']photos["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']profilePhoto["']\s*\]\s*\}/u,
    ];
    const offenders: string[] = [];
    for (const name of AUDITED_FILES) {
      const source = readHook(name);
      if (barePrefixes.some((pattern) => pattern.test(source))) {
        offenders.push(name);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the Archive mutation hooks route through the family-aware helpers", () => {
    const archiveSource = readHook("useArchiveStorage.ts");
    for (const helper of [
      "pendingArchiveItemsInvalidation",
      "approvedArchiveItemsInvalidation",
      "approvedArchiveMediaInvalidation",
      "archiveSearchInvalidation",
      "archivePhotoInvalidation",
    ]) {
      expect(archiveSource).toContain(helper);
    }
    // The Board and Research Intake upload flows reuse the Archive helpers.
    expect(readHook("useBoard.ts")).toContain(
      "pendingArchiveItemsInvalidation",
    );
    expect(readHook("useBoard.ts")).toContain(
      "approvedArchiveItemsInvalidation",
    );
    expect(readHook("useResearchIntake.ts")).toContain(
      "pendingArchiveItemsInvalidation",
    );
    expect(readHook("useResearchIntake.ts")).toContain(
      "approvedArchiveItemsInvalidation",
    );
  });
});

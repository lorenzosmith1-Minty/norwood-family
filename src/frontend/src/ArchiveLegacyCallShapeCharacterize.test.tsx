import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
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
  useApprovedArchiveItems,
  useApprovedMediaItems,
  usePendingArchiveItems,
  useRejectArchiveItem,
  useSearchArchiveItems,
} from "./hooks/useArchiveStorage";
import { usePendingCount } from "./hooks/usePendingCount";

// ---------------------------------------------------------------------------
// Characterization baseline for the Archive familyId-scoping change.
//
// The requested change converts the Archive reads, submissions, and reviews
// from legacy single-family behavior to explicit familyId scoping. The legacy
// no-argument Archive endpoints — listPendingArchiveItems,
// listApprovedArchiveItems, searchArchiveItems, submitArchiveItem,
// approveArchiveItem, rejectArchiveItem, and getPendingContributionsCount —
// and their current default-family behavior are the baseline that must keep
// working, and the frontend Archive hooks currently call the no-argument
// legacy endpoints and must keep the default-family call shapes working.
//
// This file freezes the FRONTEND half of that contract: the exact argument
// shapes the Archive hooks pass to the legacy endpoints. A refactor that
// family-qualifies a public method signature, or that threads a familyId into
// a default-family call, fails here before it reaches a user.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding an explicit familyId parameter is
// exactly the change under way. What it freezes is that the DEFAULT-family
// call the hooks make today keeps its current shape: no familyId argument, and
// the same positional arguments in the same order.
//
// The submit path (useSubmitArchiveItem) is already frozen by
// FamilyMembershipGatingContractCharacterize.test.tsx, and the read-back shape
// of the ArchiveItem records (familyId = "norwood") by
// CoreRecordFamilyIdCharacterize.test.tsx, so this file covers the remaining
// read/search/review/count call shapes.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listPendingArchiveItems: unknown[][];
    listApprovedArchiveItems: unknown[][];
    searchArchiveItems: unknown[][];
    approveArchiveItem: unknown[][];
    rejectArchiveItem: unknown[][];
    getPendingContributionsCount: unknown[][];
  } = {
    listPendingArchiveItems: [],
    listApprovedArchiveItems: [],
    searchArchiveItems: [],
    approveArchiveItem: [],
    rejectArchiveItem: [],
    getPendingContributionsCount: [],
  };

  const mockActor = {
    async listPendingArchiveItems(...args: unknown[]): Promise<ArchiveItem[]> {
      calls.listPendingArchiveItems.push(args);
      return [];
    },
    async listApprovedArchiveItems(...args: unknown[]): Promise<ArchiveItem[]> {
      calls.listApprovedArchiveItems.push(args);
      return [];
    },
    async searchArchiveItems(...args: unknown[]): Promise<ArchiveItem[]> {
      calls.searchArchiveItems.push(args);
      return [];
    },
    async approveArchiveItem(...args: unknown[]): Promise<ArchiveItem | null> {
      calls.approveArchiveItem.push(args);
      return null;
    },
    async rejectArchiveItem(...args: unknown[]): Promise<ArchiveItem | null> {
      calls.rejectArchiveItem.push(args);
      return null;
    },
    async getPendingContributionsCount(...args: unknown[]): Promise<bigint> {
      calls.getPendingContributionsCount.push(args);
      return 0n;
    },
    async isCallerSteward(): Promise<boolean> {
      return true;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      calls.listPendingArchiveItems.length = 0;
      calls.listApprovedArchiveItems.length = 0;
      calls.searchArchiveItems.length = 0;
      calls.approveArchiveItem.length = 0;
      calls.rejectArchiveItem.length = 0;
      calls.getPendingContributionsCount.length = 0;
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

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

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
    familyId: "norwood",
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
    relatedMemberIds: ["julia"],
    relatedBranchId: "branch-1",
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    status: ArchiveItemStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    classification: ArchiveItemClassification.Standard,
    primarySpeaker: undefined,
    ...overrides,
  };
}

describe("Archive read hooks: legacy no-argument call shapes (characterization)", () => {
  it("usePendingArchiveItems calls listPendingArchiveItems() with no arguments", async () => {
    const { result } = renderHook(() => usePendingArchiveItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listPendingArchiveItems).toEqual([[]]);
  });

  it("useApprovedArchiveItems calls listApprovedArchiveItems() with no arguments", async () => {
    const { result } = renderHook(() => useApprovedArchiveItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedArchiveItems).toEqual([[]]);
  });

  it("useApprovedMediaItems calls listApprovedArchiveItems() with no arguments", async () => {
    const { result } = renderHook(() => useApprovedMediaItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedArchiveItems).toEqual([[]]);
  });

  it("useSearchArchiveItems calls searchArchiveItems(filter) with the filter and no familyId", async () => {
    const { result } = renderHook(
      () =>
        useSearchArchiveItems({
          query: "wedding",
          tags: ["letters"],
          itemType: ArchiveItemType.Photo,
          relatedMemberId: "julia",
          era: "1924",
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly one positional argument — the filter record — and no familyId.
    expect(calls.searchArchiveItems).toEqual([
      [
        {
          searchTerm: "wedding",
          tags: ["letters"],
          itemType: ArchiveItemType.Photo,
          relatedMemberId: "julia",
          era: "1924",
        },
      ],
    ]);
  });

  it("useSearchArchiveItems omits unset filter fields as undefined, still with no familyId", async () => {
    const { result } = renderHook(
      () =>
        useSearchArchiveItems({
          query: null,
          tags: [],
          itemType: null,
          relatedMemberId: null,
          era: null,
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.searchArchiveItems).toEqual([
      [
        {
          searchTerm: undefined,
          tags: [],
          itemType: undefined,
          relatedMemberId: undefined,
          era: undefined,
        },
      ],
    ]);
  });
});

describe("Archive review hooks: legacy single-argument call shapes (characterization)", () => {
  it("useApproveArchiveItem calls approveArchiveItem(id) with the id and no familyId", async () => {
    const approved = makeArchiveItem({
      id: 7n,
      status: ArchiveItemStatus.Approved,
    });
    mockActor.approveArchiveItem = vi.fn(async (...args: unknown[]) => {
      calls.approveArchiveItem.push(args);
      return approved;
    });

    const { result } = renderHook(() => useApproveArchiveItem(), { wrapper });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveArchiveItem).toEqual([[7n]]);
    expect(returned).toBe(approved);
  });

  it("useRejectArchiveItem calls rejectArchiveItem(id) with the id and no familyId", async () => {
    const rejected = makeArchiveItem({
      id: 9n,
      status: ArchiveItemStatus.Rejected,
    });
    mockActor.rejectArchiveItem = vi.fn(async (...args: unknown[]) => {
      calls.rejectArchiveItem.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectArchiveItem(), { wrapper });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectArchiveItem).toEqual([[9n]]);
    expect(returned).toBe(rejected);
  });
});

describe("Pending Contributions count hook: legacy no-argument call shape (characterization)", () => {
  it("usePendingCount calls getPendingContributionsCount() with no arguments", async () => {
    const { result } = renderHook(() => usePendingCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getPendingContributionsCount).toEqual([[]]);
    expect(result.current.data).toBe(0);
  });

  it("converts the backend bigint count to a number for the badge", async () => {
    mockActor.getPendingContributionsCount = vi.fn(async () => 3n);

    const { result } = renderHook(() => usePendingCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(3);
  });
});

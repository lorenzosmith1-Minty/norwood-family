import "@testing-library/jest-dom/vitest";
import {
  type ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
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
  usePendingArchiveItems,
  useRejectArchiveItem,
  useSearchArchiveItems,
  useSubmitArchiveItem,
} from "./hooks/useArchiveStorage";
import { usePendingCount } from "./hooks/usePendingCount";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B1 frontend half of the family-scoped Archive
// change: when a NON-default family is active, every Archive hook must route to
// the canonical `*ForFamily` endpoint with the explicit familyId, and the
// familyId must be part of the React Query key so caches never collide across
// families. When the default family is active the legacy no-argument call shape
// is preserved (frozen separately by
// ArchiveLegacyCallShapeCharacterize.test.tsx).
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listPendingArchiveItemsForFamily: unknown[][];
    listApprovedArchiveItemsForFamily: unknown[][];
    searchArchiveItemsForFamily: unknown[][];
    submitArchiveItemForFamily: unknown[][];
    approveArchiveItemForFamily: unknown[][];
    rejectArchiveItemForFamily: unknown[][];
    getPendingContributionsCountForFamily: unknown[][];
    isCallerSteward: unknown[][];
  } = {
    listPendingArchiveItemsForFamily: [],
    listApprovedArchiveItemsForFamily: [],
    searchArchiveItemsForFamily: [],
    submitArchiveItemForFamily: [],
    approveArchiveItemForFamily: [],
    rejectArchiveItemForFamily: [],
    getPendingContributionsCountForFamily: [],
    isCallerSteward: [],
  };

  const mockActor = {
    async listPendingArchiveItemsForFamily(
      ...args: unknown[]
    ): Promise<ArchiveItem[]> {
      calls.listPendingArchiveItemsForFamily.push(args);
      return [];
    },
    async listApprovedArchiveItemsForFamily(
      ...args: unknown[]
    ): Promise<ArchiveItem[]> {
      calls.listApprovedArchiveItemsForFamily.push(args);
      return [];
    },
    async searchArchiveItemsForFamily(
      ...args: unknown[]
    ): Promise<ArchiveItem[]> {
      calls.searchArchiveItemsForFamily.push(args);
      return [];
    },
    async submitArchiveItemForFamily(...args: unknown[]): Promise<ArchiveItem> {
      calls.submitArchiveItemForFamily.push(args);
      return makeArchiveItem();
    },
    async approveArchiveItemForFamily(
      ...args: unknown[]
    ): Promise<ArchiveItem | null> {
      calls.approveArchiveItemForFamily.push(args);
      return null;
    },
    async rejectArchiveItemForFamily(
      ...args: unknown[]
    ): Promise<ArchiveItem | null> {
      calls.rejectArchiveItemForFamily.push(args);
      return null;
    },
    async getPendingContributionsCountForFamily(
      ...args: unknown[]
    ): Promise<bigint> {
      calls.getPendingContributionsCountForFamily.push(args);
      return 0n;
    },
    async isCallerSteward(...args: unknown[]): Promise<boolean> {
      calls.isCallerSteward.push(args);
      return true;
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
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
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
    </QueryClientProvider>
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

describe("Archive read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("usePendingArchiveItems calls listPendingArchiveItemsForFamily(familyId)", async () => {
    const { result } = renderHook(() => usePendingArchiveItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingArchiveItemsForFamily).toEqual([[FAMILY_A]]);
  });

  it("useApprovedArchiveItems calls listApprovedArchiveItemsForFamily(familyId)", async () => {
    const { result } = renderHook(() => useApprovedArchiveItems(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedArchiveItemsForFamily).toEqual([[FAMILY_A]]);
  });

  it("useSearchArchiveItems calls searchArchiveItemsForFamily(familyId, filter)", async () => {
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
    expect(calls.searchArchiveItemsForFamily).toEqual([
      [
        FAMILY_A,
        {
          familyId: FAMILY_A,
          searchTerm: "wedding",
          tags: ["letters"],
          itemType: ArchiveItemType.Photo,
          relatedMemberId: "julia",
          era: "1924",
        },
      ],
    ]);
  });
});

describe("Archive write hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useSubmitArchiveItem calls submitArchiveItemForFamily(familyId, ...) with the familyId first", async () => {
    const { result } = renderHook(() => useSubmitArchiveItem(), { wrapper });

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

    expect(calls.submitArchiveItemForFamily).toHaveLength(1);
    const [args] = calls.submitArchiveItemForFamily;
    // The familyId is the first positional argument; the remaining 15 mirror
    // the legacy submit shape.
    expect(args[0]).toBe(FAMILY_A);
    expect(args).toHaveLength(16);
    expect(args[1]).toBe("A letter");
    expect(args[15]).toBe("letter.pdf");
  });

  it("useApproveArchiveItem calls approveArchiveItemForFamily(familyId, id)", async () => {
    const { result } = renderHook(() => useApproveArchiveItem(), { wrapper });

    await result.current.mutateAsync(7n);

    expect(calls.approveArchiveItemForFamily).toEqual([[FAMILY_A, 7n]]);
  });

  it("useRejectArchiveItem calls rejectArchiveItemForFamily(familyId, id)", async () => {
    const { result } = renderHook(() => useRejectArchiveItem(), { wrapper });

    await result.current.mutateAsync(9n);

    expect(calls.rejectArchiveItemForFamily).toEqual([[FAMILY_A, 9n]]);
  });
});

describe("Pending count hook: non-default family routes to *ForFamily (cover)", () => {
  it("usePendingCount calls getPendingContributionsCountForFamily(familyId)", async () => {
    const { result } = renderHook(() => usePendingCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getPendingContributionsCountForFamily).toEqual([[FAMILY_A]]);
    expect(result.current.data).toBe(0);
  });

  it("converts the backend bigint count to a number for the badge", async () => {
    mockActor.getPendingContributionsCountForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.getPendingContributionsCountForFamily.push(args);
        return 4n;
      },
    );

    const { result } = renderHook(() => usePendingCount(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(4);
  });
});

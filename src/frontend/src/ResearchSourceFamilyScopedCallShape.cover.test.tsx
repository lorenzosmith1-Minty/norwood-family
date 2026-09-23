import "@testing-library/jest-dom/vitest";
import {
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useApproveSource,
  useGetReviewQueue,
  useGetSource,
  useListSources,
  useNeedsResearchSource,
  useRejectSource,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B2 frontend half of the family-scoped Research
// Source change: when a NON-default family is active, every source hook must
// route to the canonical `*ForFamily` endpoint with the explicit familyId, and
// the familyId must be part of the React Query key so caches never collide
// across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by ResearchSourceLegacyCallShapeCharacterize.test.tsx; this file
// only asserts the non-default branch, so the two together pin both sides of
// the `familyScopedId === undefined` fork.
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
    listSourcesForFamily: unknown[][];
    getSourceForFamily: unknown[][];
    approveSourceForFamily: unknown[][];
    rejectSourceForFamily: unknown[][];
    needsResearchSourceForFamily: unknown[][];
    getReviewQueueForFamily: unknown[][];
    listSources: unknown[][];
    getSource: unknown[][];
    approveSource: unknown[][];
    rejectSource: unknown[][];
    needsResearchSource: unknown[][];
    getReviewQueue: unknown[][];
  } = {
    listSourcesForFamily: [],
    getSourceForFamily: [],
    approveSourceForFamily: [],
    rejectSourceForFamily: [],
    needsResearchSourceForFamily: [],
    getReviewQueueForFamily: [],
    listSources: [],
    getSource: [],
    approveSource: [],
    rejectSource: [],
    needsResearchSource: [],
    getReviewQueue: [],
  };

  const mockActor = {
    async listSourcesForFamily(...args: unknown[]): Promise<SourceRecord[]> {
      calls.listSourcesForFamily.push(args);
      return [];
    },
    async getSourceForFamily(...args: unknown[]): Promise<SourceRecord | null> {
      calls.getSourceForFamily.push(args);
      return null;
    },
    async approveSourceForFamily(
      ...args: unknown[]
    ): Promise<SourceRecord | null> {
      calls.approveSourceForFamily.push(args);
      return null;
    },
    async rejectSourceForFamily(
      ...args: unknown[]
    ): Promise<SourceRecord | null> {
      calls.rejectSourceForFamily.push(args);
      return null;
    },
    async needsResearchSourceForFamily(
      ...args: unknown[]
    ): Promise<SourceRecord | null> {
      calls.needsResearchSourceForFamily.push(args);
      return null;
    },
    async getReviewQueueForFamily(...args: unknown[]): Promise<ReviewQueue> {
      calls.getReviewQueueForFamily.push(args);
      return {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
    },
    // The legacy endpoints must NOT be reached for a non-default family; they
    // are recorded so a regression that falls back to them is visible.
    async listSources(...args: unknown[]): Promise<SourceRecord[]> {
      calls.listSources.push(args);
      return [];
    },
    async getSource(...args: unknown[]): Promise<SourceRecord | null> {
      calls.getSource.push(args);
      return null;
    },
    async approveSource(...args: unknown[]): Promise<SourceRecord | null> {
      calls.approveSource.push(args);
      return null;
    },
    async rejectSource(...args: unknown[]): Promise<SourceRecord | null> {
      calls.rejectSource.push(args);
      return null;
    },
    async needsResearchSource(
      ...args: unknown[]
    ): Promise<SourceRecord | null> {
      calls.needsResearchSource.push(args);
      return null;
    },
    async getReviewQueue(...args: unknown[]): Promise<ReviewQueue> {
      calls.getReviewQueue.push(args);
      return {
        pending: 0n,
        approved: 0n,
        rejected: 0n,
        conflicting: 0n,
        needsResearch: 0n,
        items: [],
      };
    },
    async isCallerSteward(): Promise<boolean> {
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

function makeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    familyId: FAMILY_A,
    id: 1n,
    title: "Family A census",
    sourceType: SourceType.CensusCitation,
    description: "Census record listing the Family A household.",
    archiveItemId: undefined,
    contributor: OWNER,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

describe("Research source read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useListSources calls listSourcesForFamily(familyId) and not the legacy listSources", async () => {
    const { result } = renderHook(() => useListSources(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listSourcesForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listSources).toEqual([]);
  });

  it("useGetSource calls getSourceForFamily(familyId, id) and not the legacy getSource", async () => {
    const source = makeSource({ id: 7n });
    mockActor.getSourceForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getSourceForFamily.push(args);
      return source;
    });

    const { result } = renderHook(() => useGetSource(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getSourceForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.getSource).toEqual([]);
    expect(result.current.data).toBe(source);
  });

  it("useGetReviewQueue calls getReviewQueueForFamily(familyId) and not the legacy getReviewQueue", async () => {
    const { result } = renderHook(() => useGetReviewQueue(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReviewQueueForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getReviewQueue).toEqual([]);
  });
});

describe("Research source review hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useApproveSource calls approveSourceForFamily(familyId, id)", async () => {
    const approved = makeSource({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveSourceForFamily = vi.fn(async (...args: unknown[]) => {
      calls.approveSourceForFamily.push(args);
      return approved;
    });

    const { result } = renderHook(() => useApproveSource(), { wrapper });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveSourceForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(calls.approveSource).toEqual([]);
    expect(returned).toBe(approved);
  });

  it("useRejectSource calls rejectSourceForFamily(familyId, id)", async () => {
    const rejected = makeSource({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectSourceForFamily = vi.fn(async (...args: unknown[]) => {
      calls.rejectSourceForFamily.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectSource(), { wrapper });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectSourceForFamily).toEqual([[FAMILY_A, 9n]]);
    expect(calls.rejectSource).toEqual([]);
    expect(returned).toBe(rejected);
  });

  it("useNeedsResearchSource calls needsResearchSourceForFamily(familyId, id)", async () => {
    const needsResearch = makeSource({
      id: 11n,
      status: ReviewStatus.NeedsResearch,
    });
    mockActor.needsResearchSourceForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.needsResearchSourceForFamily.push(args);
        return needsResearch;
      },
    );

    const { result } = renderHook(() => useNeedsResearchSource(), { wrapper });
    const returned = await result.current.mutateAsync(11n);

    expect(calls.needsResearchSourceForFamily).toEqual([[FAMILY_A, 11n]]);
    expect(calls.needsResearchSource).toEqual([]);
    expect(returned).toBe(needsResearch);
  });
});

describe("Research source hooks: non-default family React Query keys are family-qualified (cover)", () => {
  // The familyId must be part of the key so a Family A cache entry can never be
  // served to a Family B render. The default-family legacy keys are frozen by
  // the characterization file.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListSources registers ['research','sources',familyId]", async () => {
    const { result } = renderHook(
      () => ({ list: useListSources(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "sources", FAMILY_A]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["research", "sources"]);
  });

  it("useGetSource registers ['research','sources',familyId,id]", async () => {
    const { result } = renderHook(
      () => ({ source: useGetSource(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.source.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "sources", FAMILY_A, "7"]);
    expect(keys).not.toContainEqual(["research", "sources", "7"]);
  });

  it("useGetReviewQueue registers ['research','queue',familyId]", async () => {
    const { result } = renderHook(
      () => ({ queue: useGetReviewQueue(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.queue.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "queue", FAMILY_A]);
    expect(keys).not.toContainEqual(["research", "queue"]);
  });
});

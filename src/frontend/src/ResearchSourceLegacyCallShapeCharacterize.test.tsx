import "@testing-library/jest-dom/vitest";
import {
  type ReviewQueue,
  ReviewStatus,
  type SourceRecord,
  SourceType,
} from "@/backend";
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
// Characterization baseline for the family-scoped Research Source change.
//
// The requested change adds a `familyId` to SourceRecord, introduces the
// canonical `listSourcesForFamily` / `getSourceForFamily` /
// `approveSourceForFamily` / `rejectSourceForFamily` /
// `needsResearchSourceForFamily` endpoints, makes the Review Queue source
// section family-scoped, and routes the `useResearchIntake` source calls
// through the centralized active familyId.
//
// The DEFAULT-family (Norwood) source workflow must keep working unchanged.
// This file freezes the FRONTEND half of that contract: the exact argument
// shapes the source hooks pass to the legacy endpoints today. A refactor that
// family-qualifies a public method signature, or that threads a familyId into a
// default-family call, fails here before it reaches a user.
//
// It deliberately does NOT freeze the absence of a familyId argument as a
// permanent property of the API — adding an explicit familyId parameter is
// exactly the change under way. What it freezes is that the DEFAULT-family call
// the hooks make today keeps its current shape: no familyId argument, and the
// same positional arguments in the same order.
//
// The create/upload argument order is already frozen by
// SecurityHardeningBaselineCharacterize.test.tsx (createSourceWithUpload) and
// FamilyMembershipGatingContractCharacterize.test.tsx (submit path), and the
// default-Norwood approve/reject/needs-research behavior by
// ResearchReviewWorkflowCover.test.tsx, so this file covers the remaining
// read/lookup/review/queue call shapes the family-scoping change touches.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listSources: unknown[][];
    getSource: unknown[][];
    approveSource: unknown[][];
    rejectSource: unknown[][];
    needsResearchSource: unknown[][];
    getReviewQueue: unknown[][];
  } = {
    listSources: [],
    getSource: [],
    approveSource: [],
    rejectSource: [],
    needsResearchSource: [],
    getReviewQueue: [],
  };

  const mockActor = {
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
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeSource(overrides: Partial<SourceRecord> = {}): SourceRecord {
  return {
    familyId: "norwood",
    id: 1n,
    title: "1900 census, Norwood household",
    sourceType: SourceType.CensusCitation,
    description: "Census record listing the Norwood family.",
    archiveItemId: undefined,
    contributor: OWNER,
    status: ReviewStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

describe("Research source read hooks: legacy no-argument call shapes (characterization)", () => {
  it("useListSources calls listSources() with no arguments", async () => {
    const { result } = renderHook(() => useListSources(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The legacy endpoint takes no arguments; the default family is the
    // backend's concern, not an argument the hook supplies.
    expect(calls.listSources).toEqual([[]]);
  });

  it("useGetSource calls getSource(id) with the id and no familyId", async () => {
    const source = makeSource({ id: 7n });
    mockActor.getSource = vi.fn(async (...args: unknown[]) => {
      calls.getSource.push(args);
      return source;
    });

    const { result } = renderHook(() => useGetSource(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly one positional argument — the source id — and no familyId.
    expect(calls.getSource).toEqual([[7n]]);
    expect(result.current.data).toBe(source);
  });

  it("useGetReviewQueue calls getReviewQueue() with no arguments", async () => {
    const { result } = renderHook(() => useGetReviewQueue(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReviewQueue).toEqual([[]]);
  });
});

describe("Research source review hooks: legacy single-argument call shapes (characterization)", () => {
  it("useApproveSource calls approveSource(id) with the id and no familyId", async () => {
    const approved = makeSource({ id: 7n, status: ReviewStatus.Approved });
    mockActor.approveSource = vi.fn(async (...args: unknown[]) => {
      calls.approveSource.push(args);
      return approved;
    });

    const { result } = renderHook(() => useApproveSource(), { wrapper });
    const returned = await result.current.mutateAsync(7n);

    expect(calls.approveSource).toEqual([[7n]]);
    expect(returned).toBe(approved);
  });

  it("useRejectSource calls rejectSource(id) with the id and no familyId", async () => {
    const rejected = makeSource({ id: 9n, status: ReviewStatus.Rejected });
    mockActor.rejectSource = vi.fn(async (...args: unknown[]) => {
      calls.rejectSource.push(args);
      return rejected;
    });

    const { result } = renderHook(() => useRejectSource(), { wrapper });
    const returned = await result.current.mutateAsync(9n);

    expect(calls.rejectSource).toEqual([[9n]]);
    expect(returned).toBe(rejected);
  });

  it("useNeedsResearchSource calls needsResearchSource(id) with the id and no familyId", async () => {
    const needsResearch = makeSource({
      id: 11n,
      status: ReviewStatus.NeedsResearch,
    });
    mockActor.needsResearchSource = vi.fn(async (...args: unknown[]) => {
      calls.needsResearchSource.push(args);
      return needsResearch;
    });

    const { result } = renderHook(() => useNeedsResearchSource(), { wrapper });
    const returned = await result.current.mutateAsync(11n);

    expect(calls.needsResearchSource).toEqual([[11n]]);
    expect(returned).toBe(needsResearch);
  });
});

describe("Research source hooks: legacy default-family React Query keys (characterization)", () => {
  // The family-scoping change adds the active familyId to the source query keys
  // so caches never collide across families. The DEFAULT family must keep the
  // legacy keys byte-for-byte, because the mutation hooks invalidate exactly
  // these keys — a changed default-family key would silently stop the queue and
  // source lists from refreshing after an approve/reject.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListSources registers the legacy ['research','sources'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListSources(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "sources"]);
  });

  it("useGetSource registers the legacy ['research','sources',id] key", async () => {
    const { result } = renderHook(
      () => ({ source: useGetSource(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.source.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "sources", "7"]);
  });

  it("useGetReviewQueue registers the legacy ['research','queue'] key", async () => {
    const { result } = renderHook(
      () => ({ queue: useGetReviewQueue(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.queue.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "queue"]);
  });
});

import "@testing-library/jest-dom/vitest";
import {
  ConflictResolutionAction,
  type ConflictReviewItem,
  EvidenceLabel,
  type ReviewQueue,
  ReviewStatus,
} from "@/backend";
import { FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useGetReviewQueue,
  useListConflictReviewItems,
  useListConflictsForPerson,
  useResolveConflict,
} from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the Tenancy 1C-B2-B4 frontend half of the family-scoped Conflict
// Review change: when a NON-default family is active, every conflict hook must
// route to the canonical `*ForFamily` endpoint with the explicit familyId, and
// the familyId must be part of the React Query key so caches never collide
// across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by ResearchConflictLegacyCallShapeCharacterize.test.tsx; this file
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
    listConflictReviewItemsForFamily: unknown[][];
    listConflictsForPersonForFamily: unknown[][];
    resolveConflictForFamily: unknown[][];
    getReviewQueueForFamily: unknown[][];
    listConflictReviewItems: unknown[][];
    listConflictsForPerson: unknown[][];
    resolveConflict: unknown[][];
    getReviewQueue: unknown[][];
  } = {
    listConflictReviewItemsForFamily: [],
    listConflictsForPersonForFamily: [],
    resolveConflictForFamily: [],
    getReviewQueueForFamily: [],
    listConflictReviewItems: [],
    listConflictsForPerson: [],
    resolveConflict: [],
    getReviewQueue: [],
  };

  const mockActor = {
    async listConflictReviewItemsForFamily(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      calls.listConflictReviewItemsForFamily.push(args);
      return [];
    },
    async listConflictsForPersonForFamily(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      calls.listConflictsForPersonForFamily.push(args);
      return [];
    },
    async resolveConflictForFamily(...args: unknown[]): Promise<unknown> {
      calls.resolveConflictForFamily.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
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
    async listConflictReviewItems(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      calls.listConflictReviewItems.push(args);
      return [];
    },
    async listConflictsForPerson(
      ...args: unknown[]
    ): Promise<ConflictReviewItem[]> {
      calls.listConflictsForPerson.push(args);
      return [];
    },
    async resolveConflict(...args: unknown[]): Promise<unknown> {
      calls.resolveConflict.push(args);
      return { __kind__: "err", err: { notFound: 0n } };
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

function makeConflict(
  overrides: Partial<ConflictReviewItem> = {},
): ConflictReviewItem {
  return {
    id: 1n,
    findingId: 1n,
    field: "Birth date",
    canonicalValue: "1899",
    proposedValue: "1898",
    status: ReviewStatus.Conflicting,
    evidenceLabel: EvidenceLabel.Conflicting,
    stewardNotes: "",
    personId: "julia",
    existingSourceId: 1n,
    proposedSourceId: 1n,
    familyId: FAMILY_A,
    ...overrides,
  };
}

describe("Conflict Review read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useListConflictReviewItems calls listConflictReviewItemsForFamily(familyId) and not the legacy listConflictReviewItems", async () => {
    const { result } = renderHook(() => useListConflictReviewItems(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listConflictReviewItemsForFamily).toEqual([[FAMILY_A]]);
    expect(calls.listConflictReviewItems).toEqual([]);
  });

  it("useListConflictsForPerson calls listConflictsForPersonForFamily(familyId, personId) and not the legacy listConflictsForPerson", async () => {
    const conflict = makeConflict({ personId: "julia" });
    mockActor.listConflictsForPersonForFamily = vi.fn(
      async (...args: unknown[]) => {
        calls.listConflictsForPersonForFamily.push(args);
        return [conflict];
      },
    );

    const { result } = renderHook(() => useListConflictsForPerson("julia"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // The familyId is the first positional argument, then the personId.
    expect(calls.listConflictsForPersonForFamily).toEqual([
      [FAMILY_A, "julia"],
    ]);
    expect(calls.listConflictsForPerson).toEqual([]);
    expect(result.current.data).toEqual([conflict]);
  });

  it("useGetReviewQueue calls getReviewQueueForFamily(familyId) and not the legacy getReviewQueue", async () => {
    const { result } = renderHook(() => useGetReviewQueue(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getReviewQueueForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getReviewQueue).toEqual([]);
  });
});

describe("Conflict Review resolve hook: non-default family routes to *ForFamily (cover)", () => {
  it("useResolveConflict calls resolveConflictForFamily(familyId, id, action, notes) with the familyId first", async () => {
    const resolved = makeConflict({ status: ReviewStatus.Approved });
    mockActor.resolveConflictForFamily = vi.fn(async (...args: unknown[]) => {
      calls.resolveConflictForFamily.push(args);
      return { __kind__: "ok", ok: resolved };
    });

    const { result } = renderHook(() => useResolveConflict(), { wrapper });
    const returned = await result.current.mutateAsync({
      conflictId: 7n,
      action: ConflictResolutionAction.KeepExisting,
      notes: "Canonical record is authoritative",
    });

    // The familyId is the first positional argument; the remaining three mirror
    // the legacy resolveConflict order.
    expect(calls.resolveConflictForFamily).toEqual([
      [
        FAMILY_A,
        7n,
        ConflictResolutionAction.KeepExisting,
        "Canonical record is authoritative",
      ],
    ]);
    expect(calls.resolveConflict).toEqual([]);
    expect(returned).toEqual({ __kind__: "ok", ok: resolved });
  });
});

describe("Conflict Review hooks: non-default family React Query keys are family-qualified (cover)", () => {
  // The familyId must be part of the key so a Family A cache entry can never be
  // served to a Family B render. The default-family legacy keys are frozen by
  // the characterization file.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListConflictReviewItems registers ['research','conflicts',familyId]", async () => {
    const { result } = renderHook(
      () => ({ list: useListConflictReviewItems(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["research", "conflicts", FAMILY_A]);
    // The legacy default-family key must not be registered for a non-default
    // family.
    expect(keys).not.toContainEqual(["research", "conflicts"]);
  });

  it("useListConflictsForPerson registers ['research','conflicts','person',personId,familyId]", async () => {
    const { result } = renderHook(
      () => ({ list: useListConflictsForPerson("julia"), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "research",
      "conflicts",
      "person",
      "julia",
      FAMILY_A,
    ]);
    expect(keys).not.toContainEqual([
      "research",
      "conflicts",
      "person",
      "julia",
    ]);
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

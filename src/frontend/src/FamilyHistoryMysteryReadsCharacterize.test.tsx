import "@testing-library/jest-dom/vitest";
import {
  type Mystery,
  type MysteryContribution,
  MysteryContributionStatus,
  type MysteryContributionType,
  MysteryStatus,
  type TimelineEvent,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useCreateCanonicalMystery,
  useMarkMysteryResolved,
  useMysteries,
  usePendingMysteryContributions,
  useReviewMysteryContribution,
  useSubmitMysteryContribution,
  useTimelineEvents,
  useUpdateCanonicalMystery,
} from "./hooks/useFamilyHistory";

// ---------------------------------------------------------------------------
// Characterization baseline for the Family Mysteries frontend family-wiring
// change.
//
// The requested change wires the Mystery READ hooks in
// `src/frontend/src/hooks/useFamilyHistory.ts` to the centralized active family
// context (`useFamilyScopedId()`) and the canonical family-scoped Mystery APIs
// (`listMysteriesForFamily`, `getMysteryForFamily`,
// `listMysteryContributionsForFamily`,
// `listPendingMysteryContributionsForFamily`, `listTimelineEventsForFamily`),
// appending the familyId to the Mystery read query keys so family-owned caches
// are family-separated.
//
// The change is deliberately narrow. This file freezes the behavior it must
// NOT alter:
//
//   1. DEFAULT-family Mystery reads. The production app mounts
//      `<FamilyProvider>` with the default family, so `familyScopedId` resolves
//      to `undefined` and the Mystery read hooks must keep making the legacy
//      no-familyId call (`listMysteries()` /
//      `listPendingMysteryContributions()` / `listTimelineEvents()`) and keep
//      the legacy React Query keys. The requirement states the existing
//      default-family Mystery read behavior remains unchanged.
//   2. Mystery MUTATIONS. The change is read-only; `useSubmitMysteryContribution`,
//      `useReviewMysteryContribution`, `useCreateCanonicalMystery`,
//      `useUpdateCanonicalMystery`, and `useMarkMysteryResolved` must keep their
//      exact legacy call shapes and their exact cache-invalidation keys, or the
//      Mystery list and pending-review list stop refreshing after a submit,
//      review, create, update, or resolve.
//
// It deliberately does NOT freeze the non-default-family Mystery read branch
// (that is the new behavior) and does NOT assert the absence of a familyId
// argument on the *new* family-scoped endpoints. What it protects is that the
// default-family path and every adjacent Mystery mutation keep working exactly
// as before.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Mystery reads (default-family legacy shape).
    listMysteries: unknown[][];
    listPendingMysteryContributions: unknown[][];
    // Mystery mutations (out of scope for the read-wiring change).
    submitMysteryContribution: unknown[][];
    reviewMysteryContribution: unknown[][];
    createCanonicalMystery: unknown[][];
    updateCanonicalMystery: unknown[][];
    markMysteryResolved: unknown[][];
    // Timeline read (default-family legacy shape).
    listTimelineEvents: unknown[][];
  } = {
    listMysteries: [],
    listPendingMysteryContributions: [],
    submitMysteryContribution: [],
    reviewMysteryContribution: [],
    createCanonicalMystery: [],
    updateCanonicalMystery: [],
    markMysteryResolved: [],
    listTimelineEvents: [],
  };

  const mockActor = {
    async listMysteries(...args: unknown[]): Promise<Mystery[]> {
      calls.listMysteries.push(args);
      return [];
    },
    async listPendingMysteryContributions(
      ...args: unknown[]
    ): Promise<MysteryContribution[]> {
      calls.listPendingMysteryContributions.push(args);
      return [];
    },
    async submitMysteryContribution(
      ...args: unknown[]
    ): Promise<MysteryContribution> {
      calls.submitMysteryContribution.push(args);
      return makeContribution();
    },
    async reviewMysteryContribution(
      ...args: unknown[]
    ): Promise<MysteryContribution | null> {
      calls.reviewMysteryContribution.push(args);
      return null;
    },
    async createCanonicalMystery(...args: unknown[]): Promise<Mystery> {
      calls.createCanonicalMystery.push(args);
      return makeMystery();
    },
    async updateCanonicalMystery(...args: unknown[]): Promise<Mystery | null> {
      calls.updateCanonicalMystery.push(args);
      return null;
    },
    async markMysteryResolved(...args: unknown[]): Promise<Mystery | null> {
      calls.markMysteryResolved.push(args);
      return null;
    },
    async listTimelineEvents(...args: unknown[]): Promise<TimelineEvent[]> {
      calls.listTimelineEvents.push(args);
      return [];
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

/**
 * The production composition: a QueryClientProvider wrapping a FamilyProvider
 * with the DEFAULT family (the same default main.tsx mounts).
 */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeMystery(overrides: Partial<Mystery> = {}): Mystery {
  return {
    id: 1n,
    title: "Who was the first Norwood?",
    description: "Still researching.",
    relatedMemberIds: ["julia"],
    relatedBranchId: undefined,
    knownFacts: ["Settled in Ohio."],
    possibilities: ["May have come from Virginia."],
    relatedSourceIds: [],
    relatedArchiveItemIds: [],
    status: MysteryStatus.Open,
    contributor: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    resolution: undefined,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<MysteryContribution> = {},
): MysteryContribution {
  return {
    id: 1n,
    mysteryId: 1n,
    contributionType: "Note" as MysteryContributionType,
    text: "A note.",
    contributor: OWNER,
    status: MysteryContributionStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    reviewedBy: undefined,
    reviewedAt: undefined,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (1) Default-family Mystery reads keep the legacy no-familyId call shape.
// ---------------------------------------------------------------------------

describe("Mystery read hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useMysteries calls listMysteries() with no arguments", async () => {
    const { result } = renderHook(() => useMysteries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listMysteries).toEqual([[]]);
  });

  it("usePendingMysteryContributions calls listPendingMysteryContributions() with no arguments", async () => {
    const { result } = renderHook(() => usePendingMysteryContributions(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingMysteryContributions).toEqual([[]]);
  });

  it("useTimelineEvents calls listTimelineEvents() with no arguments", async () => {
    const { result } = renderHook(() => useTimelineEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listTimelineEvents).toEqual([[]]);
  });

  it("useMysteries exposes the backend mysteries unchanged", async () => {
    const mysteries = [
      makeMystery({ id: 1n, title: "Who was the first Norwood?" }),
      makeMystery({ id: 2n, title: "Where is the missing photograph?" }),
    ];
    mockActor.listMysteries = vi.fn(async () => mysteries);

    const { result } = renderHook(() => useMysteries(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(mysteries);
  });

  it("usePendingMysteryContributions exposes the backend contributions unchanged", async () => {
    const contributions = [makeContribution({ id: 3n, text: "A lead." })];
    mockActor.listPendingMysteryContributions = vi.fn(
      async () => contributions,
    );

    const { result } = renderHook(() => usePendingMysteryContributions(), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(contributions);
  });
});

// ---------------------------------------------------------------------------
// (2) Default-family Mystery reads keep the legacy React Query keys.
// ---------------------------------------------------------------------------

describe("Mystery read hooks under the default-family provider: legacy query keys (characterization)", () => {
  // The family-wiring change appends the active familyId to the Mystery read
  // keys for a NON-default family so caches never collide across families. The
  // DEFAULT family must keep the legacy keys byte-for-byte, because the Mystery
  // mutation hooks invalidate exactly these keys — a changed default-family key
  // would silently stop the Mystery list and pending review list from
  // refreshing after a submit, review, create, update, or resolve.
  function keyProbe() {
    return new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  }

  it("useMysteries registers the legacy ['familyHistory','mysteries'] key", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useMysteries(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["familyHistory", "mysteries"]);
  });

  it("usePendingMysteryContributions registers the legacy ['familyHistory','mysteries','contributions','pending'] key", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => usePendingMysteryContributions(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "pending",
    ]);
  });

  it("useTimelineEvents registers the legacy ['familyHistory','timeline'] key", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useTimelineEvents(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["familyHistory", "timeline"]);
  });
});

// ---------------------------------------------------------------------------
// (3) Mystery mutations keep their legacy call shapes.
// ---------------------------------------------------------------------------

describe("Mystery mutation hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useSubmitMysteryContribution calls submitMysteryContribution(mysteryId, type, text)", async () => {
    const { result } = renderHook(() => useSubmitMysteryContribution(), {
      wrapper,
    });

    await result.current.mutateAsync({
      mysteryId: 4n,
      contributionType: "Lead" as MysteryContributionType,
      text: "A lead.",
    });

    expect(calls.submitMysteryContribution).toEqual([[4n, "Lead", "A lead."]]);
  });

  it("useReviewMysteryContribution calls reviewMysteryContribution(id, approve)", async () => {
    const { result } = renderHook(() => useReviewMysteryContribution(), {
      wrapper,
    });

    await result.current.mutateAsync({ id: 7n, approve: true });

    expect(calls.reviewMysteryContribution).toEqual([[7n, true]]);
  });

  it("useCreateCanonicalMystery calls createCanonicalMystery with the nine positional arguments", async () => {
    const { result } = renderHook(() => useCreateCanonicalMystery(), {
      wrapper,
    });

    await result.current.mutateAsync({
      title: "Where did the family originate?",
      description: "Still researching.",
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      knownFacts: ["Settled in Ohio."],
      possibilities: ["May have come from Virginia."],
      relatedSourceIds: [5n],
      relatedArchiveItemIds: [],
      status: MysteryStatus.Open,
    });

    expect(calls.createCanonicalMystery).toEqual([
      [
        "Where did the family originate?",
        "Still researching.",
        ["julia"],
        null,
        ["Settled in Ohio."],
        ["May have come from Virginia."],
        [5n],
        [],
        MysteryStatus.Open,
      ],
    ]);
  });

  it("useUpdateCanonicalMystery calls updateCanonicalMystery with the id first and the nine positional arguments", async () => {
    const { result } = renderHook(() => useUpdateCanonicalMystery(), {
      wrapper,
    });

    await result.current.mutateAsync({
      id: 9n,
      title: "Revised question",
      description: "Updated context.",
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      knownFacts: ["Settled in Ohio."],
      possibilities: ["May have come from Virginia."],
      relatedSourceIds: [5n],
      relatedArchiveItemIds: [],
      status: MysteryStatus.Researching,
    });

    expect(calls.updateCanonicalMystery).toEqual([
      [
        9n,
        "Revised question",
        "Updated context.",
        ["julia"],
        null,
        ["Settled in Ohio."],
        ["May have come from Virginia."],
        [5n],
        [],
        MysteryStatus.Researching,
      ],
    ]);
  });

  it("useMarkMysteryResolved calls markMysteryResolved(id, summary, supportingEvidence)", async () => {
    const { result } = renderHook(() => useMarkMysteryResolved(), { wrapper });

    await result.current.mutateAsync({
      id: 3n,
      summary: "Records show the family arrived in 1842.",
      supportingEvidence: ["1842 census record"],
    });

    expect(calls.markMysteryResolved).toEqual([
      [3n, "Records show the family arrived in 1842.", ["1842 census record"]],
    ]);
  });
});

// ---------------------------------------------------------------------------
// (4) Mystery mutations keep their cache-invalidation keys.
// ---------------------------------------------------------------------------

describe("Mystery mutations under the default-family provider: cache invalidation (characterization)", () => {
  // `invalidateQueries` only marks *existing* matching queries stale, so the
  // probe spies on the call itself rather than reading the (empty) query cache.
  function renderWithSpy<T>(hook: () => T) {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const rendered = renderHook(hook, {
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={queryClient}>
          <FamilyProvider>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    const invalidatedKeys = () =>
      invalidateSpy.mock.calls.map(
        ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
      );
    return { ...rendered, invalidatedKeys };
  }

  it("useSubmitMysteryContribution invalidates the pending contributions and pendingContributionsCount keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useSubmitMysteryContribution(),
    );

    await result.current.mutateAsync({
      mysteryId: 4n,
      contributionType: "Lead" as MysteryContributionType,
      text: "A lead.",
    });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "pending",
    ]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
  });

  it("useReviewMysteryContribution invalidates the pending contributions, mysteries, pendingContributionsCount, and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useReviewMysteryContribution(),
    );

    await result.current.mutateAsync({ id: 7n, approve: true });

    const keys = invalidatedKeys();
    expect(keys).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "pending",
    ]);
    expect(keys).toContainEqual(["familyHistory", "mysteries"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("useCreateCanonicalMystery invalidates the mysteries key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useCreateCanonicalMystery(),
    );

    await result.current.mutateAsync({
      title: "Where did the family originate?",
      description: "Still researching.",
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      knownFacts: ["Settled in Ohio."],
      possibilities: ["May have come from Virginia."],
      relatedSourceIds: [5n],
      relatedArchiveItemIds: [],
      status: MysteryStatus.Open,
    });

    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);
  });

  it("useUpdateCanonicalMystery invalidates the mysteries key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useUpdateCanonicalMystery(),
    );

    await result.current.mutateAsync({
      id: 9n,
      title: "Revised question",
      description: "Updated context.",
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      knownFacts: ["Settled in Ohio."],
      possibilities: ["May have come from Virginia."],
      relatedSourceIds: [5n],
      relatedArchiveItemIds: [],
      status: MysteryStatus.Researching,
    });

    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);
  });

  it("useMarkMysteryResolved invalidates the mysteries key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useMarkMysteryResolved(),
    );

    await result.current.mutateAsync({
      id: 3n,
      summary: "Records show the family arrived in 1842.",
      supportingEvidence: ["1842 census record"],
    });

    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);
  });
});

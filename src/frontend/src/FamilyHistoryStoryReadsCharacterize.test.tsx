import "@testing-library/jest-dom/vitest";
import {
  EvidenceStatus,
  type Mystery,
  type MysteryContribution,
  MysteryContributionStatus,
  MysteryStatus,
  type Story,
  StoryStatus,
  type TimelineEvent,
  TimelineEventType,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SubmitStoryInput,
  useAddCanonicalStory,
  useApproveStory,
  useApprovedStories,
  useCreateCanonicalMystery,
  useMarkMysteryResolved,
  useMysteries,
  usePendingMysteryContributions,
  usePendingStories,
  useRejectStory,
  useReviewMysteryContribution,
  useSubmitMysteryContribution,
  useSubmitStory,
  useTimelineEvents,
  useUpdateCanonicalStory,
} from "./hooks/useFamilyHistory";

// ---------------------------------------------------------------------------
// Characterization baseline for the Family Stories frontend family-wiring
// change.
//
// The requested change wires the Story READ hooks in
// `src/frontend/src/hooks/useFamilyHistory.ts` to the centralized active family
// context (`useFamilyScopedId()`) and the family-scoped Story APIs
// (`listApprovedStoriesForFamily`, `listPendingStoriesForFamily`,
// `listStoriesForFamily`, `getStoryForFamily`), appending the familyId to the
// Story read query keys so family-owned caches are family-separated.
//
// The change is deliberately narrow. This file freezes the behavior it must
// NOT alter:
//
//   1. DEFAULT-family Story reads. The production app mounts `<FamilyProvider>`
//      with the default family, so `familyScopedId` resolves to `undefined` and
//      the Story read hooks must keep making the legacy no-familyId call
//      (`listApprovedStories()` / `listPendingStories()`) and keep the legacy
//      React Query keys. The requirement states the existing default-family
//      Story read behavior remains unchanged.
//   2. Story MUTATIONS. The change is read-only; `useSubmitStory`,
//      `useApproveStory`, `useRejectStory`, `useAddCanonicalStory`, and
//      `useUpdateCanonicalStory` must keep their exact legacy call shapes and
//      their exact cache-invalidation keys, or the browse/pending lists stop
//      refreshing after a submit, approve, reject, or canonical edit.
//   3. MYSTERIES and TIMELINE. Explicitly out of scope; their read and mutation
//      hooks must keep their exact call shapes and keys.
//
// It deliberately does NOT freeze the non-default-family Story read branch
// (that is the new behavior) and does NOT assert the absence of a familyId
// argument on the *new* family-scoped endpoints. What it protects is that the
// default-family path and every adjacent hook keep working exactly as before.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Story reads (default-family legacy shape).
    listApprovedStories: unknown[][];
    listPendingStories: unknown[][];
    // Story mutations.
    submitStory: unknown[][];
    approveStory: unknown[][];
    rejectStory: unknown[][];
    addCanonicalStory: unknown[][];
    updateCanonicalStory: unknown[][];
    // Mysteries (out of scope).
    listMysteries: unknown[][];
    submitMysteryContribution: unknown[][];
    listPendingMysteryContributions: unknown[][];
    reviewMysteryContribution: unknown[][];
    createCanonicalMystery: unknown[][];
    markMysteryResolved: unknown[][];
    // Timeline (out of scope).
    listTimelineEvents: unknown[][];
  } = {
    listApprovedStories: [],
    listPendingStories: [],
    submitStory: [],
    approveStory: [],
    rejectStory: [],
    addCanonicalStory: [],
    updateCanonicalStory: [],
    listMysteries: [],
    submitMysteryContribution: [],
    listPendingMysteryContributions: [],
    reviewMysteryContribution: [],
    createCanonicalMystery: [],
    markMysteryResolved: [],
    listTimelineEvents: [],
  };

  const mockActor = {
    async listApprovedStories(...args: unknown[]): Promise<Story[]> {
      calls.listApprovedStories.push(args);
      return [];
    },
    async listPendingStories(...args: unknown[]): Promise<Story[]> {
      calls.listPendingStories.push(args);
      return [];
    },
    async submitStory(...args: unknown[]): Promise<Story> {
      calls.submitStory.push(args);
      return makeStory();
    },
    async approveStory(...args: unknown[]): Promise<Story | null> {
      calls.approveStory.push(args);
      return null;
    },
    async rejectStory(...args: unknown[]): Promise<Story | null> {
      calls.rejectStory.push(args);
      return null;
    },
    async addCanonicalStory(...args: unknown[]): Promise<Story> {
      calls.addCanonicalStory.push(args);
      return makeStory();
    },
    async updateCanonicalStory(...args: unknown[]): Promise<Story | null> {
      calls.updateCanonicalStory.push(args);
      return null;
    },
    async listMysteries(...args: unknown[]): Promise<Mystery[]> {
      calls.listMysteries.push(args);
      return [];
    },
    async submitMysteryContribution(
      ...args: unknown[]
    ): Promise<MysteryContribution> {
      calls.submitMysteryContribution.push(args);
      return makeContribution();
    },
    async listPendingMysteryContributions(
      ...args: unknown[]
    ): Promise<MysteryContribution[]> {
      calls.listPendingMysteryContributions.push(args);
      return [];
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

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: 1n,
    title: "The family farm",
    storyText: "How the farm came to be.",
    relatedMemberIds: ["julia"],
    era: "early 1900s",
    year: 1910n,
    location: "Ohio",
    contributor: OWNER,
    evidenceStatus: EvidenceStatus.FamilyHistory,
    relatedArchiveItemIds: [],
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    status: StoryStatus.Approved,
    familyId: DEFAULT_FAMILY_ID,
    ...overrides,
  };
}

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
    ...overrides,
  };
}

function makeContribution(
  overrides: Partial<MysteryContribution> = {},
): MysteryContribution {
  return {
    id: 1n,
    mysteryId: 1n,
    contributionType: "Note" as MysteryContribution["contributionType"],
    text: "A note.",
    contributor: OWNER,
    status: MysteryContributionStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    reviewedBy: undefined,
    reviewedAt: undefined,
    ...overrides,
  };
}

function makeSubmitStoryInput(
  overrides: Partial<SubmitStoryInput> = {},
): SubmitStoryInput {
  return {
    title: "A story",
    storyText: "The story text.",
    relatedMemberIds: ["julia"],
    era: "1920s",
    year: 1920n,
    location: "Mississippi",
    evidenceStatus: EvidenceStatus.FamilyHistory,
    relatedArchiveItemIds: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// (1) Default-family Story reads keep the legacy no-familyId call shape.
// ---------------------------------------------------------------------------

describe("Story read hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useApprovedStories calls listApprovedStories() with no arguments", async () => {
    const { result } = renderHook(() => useApprovedStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedStories).toEqual([[]]);
  });

  it("usePendingStories calls listPendingStories() with no arguments", async () => {
    const { result } = renderHook(() => usePendingStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingStories).toEqual([[]]);
  });

  it("useApprovedStories exposes the backend stories unchanged", async () => {
    const stories = [
      makeStory({ id: 1n, title: "The family farm" }),
      makeStory({ id: 2n, title: "Grandma's recipe" }),
    ];
    mockActor.listApprovedStories = vi.fn(async () => stories);

    const { result } = renderHook(() => useApprovedStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(stories);
  });

  it("usePendingStories exposes the backend stories unchanged", async () => {
    const stories = [makeStory({ id: 3n, status: StoryStatus.Pending })];
    mockActor.listPendingStories = vi.fn(async () => stories);

    const { result } = renderHook(() => usePendingStories(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(stories);
  });
});

// ---------------------------------------------------------------------------
// (2) Default-family Story reads keep the legacy React Query keys.
// ---------------------------------------------------------------------------

describe("Story read hooks under the default-family provider: legacy query keys (characterization)", () => {
  // The family-wiring change appends the active familyId to the Story read
  // keys for a NON-default family so caches never collide across families. The
  // DEFAULT family must keep the legacy keys byte-for-byte, because the Story
  // mutation hooks invalidate exactly these keys — a changed default-family key
  // would silently stop the browse list and pending review list from refreshing
  // after a submit, approve, or reject.
  function keyProbe() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return queryClient;
  }

  it("useApprovedStories registers the legacy ['familyHistory','stories','approved'] key", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => useApprovedStories(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["familyHistory", "stories", "approved"]);
  });

  it("usePendingStories registers the legacy ['familyHistory','stories','pending'] key", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const { result } = renderHook(() => usePendingStories(), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["familyHistory", "stories", "pending"]);
  });
});

// ---------------------------------------------------------------------------
// (3) Story mutations keep their legacy call shapes.
// ---------------------------------------------------------------------------

describe("Story mutation hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useSubmitStory calls submitStory with the eight positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useSubmitStory(), { wrapper });

    await result.current.mutateAsync(makeSubmitStoryInput());

    expect(calls.submitStory).toEqual([
      [
        "A story",
        "The story text.",
        ["julia"],
        "1920s",
        1920n,
        "Mississippi",
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
  });

  it("useApproveStory calls approveStory(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useApproveStory(), { wrapper });

    await result.current.mutateAsync(5n);

    expect(calls.approveStory).toEqual([[5n]]);
  });

  it("useRejectStory calls rejectStory(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useRejectStory(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.rejectStory).toEqual([[6n]]);
  });

  it("useAddCanonicalStory calls addCanonicalStory with the eight positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useAddCanonicalStory(), { wrapper });

    await result.current.mutateAsync(
      makeSubmitStoryInput({ title: "Canonical" }),
    );

    expect(calls.addCanonicalStory).toEqual([
      [
        "Canonical",
        "The story text.",
        ["julia"],
        "1920s",
        1920n,
        "Mississippi",
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
  });

  it("useUpdateCanonicalStory calls updateCanonicalStory with the id first and no familyId", async () => {
    const { result } = renderHook(() => useUpdateCanonicalStory(), { wrapper });

    await result.current.mutateAsync({
      ...makeSubmitStoryInput({ title: "Revised" }),
      id: 9n,
    });

    expect(calls.updateCanonicalStory).toEqual([
      [
        9n,
        "Revised",
        "The story text.",
        ["julia"],
        "1920s",
        1920n,
        "Mississippi",
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
  });
});

// ---------------------------------------------------------------------------
// (4) Story mutations keep their cache-invalidation keys.
// ---------------------------------------------------------------------------

describe("Story mutations under the default-family provider: cache invalidation (characterization)", () => {
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

  it("useSubmitStory invalidates the pending and pendingContributionsCount keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useSubmitStory());

    await result.current.mutateAsync(makeSubmitStoryInput());

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["familyHistory", "stories", "pending"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
  });

  it("useApproveStory invalidates the pending, approved, pendingContributionsCount, and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useApproveStory());

    await result.current.mutateAsync(5n);

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["familyHistory", "stories", "pending"]);
    expect(keys).toContainEqual(["familyHistory", "stories", "approved"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("useRejectStory invalidates the pending, pendingContributionsCount, and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useRejectStory());

    await result.current.mutateAsync(6n);

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["familyHistory", "stories", "pending"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("useAddCanonicalStory invalidates the approved key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useAddCanonicalStory(),
    );

    await result.current.mutateAsync(makeSubmitStoryInput());

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
    ]);
  });

  it("useUpdateCanonicalStory invalidates the approved key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() =>
      useUpdateCanonicalStory(),
    );

    await result.current.mutateAsync({
      ...makeSubmitStoryInput(),
      id: 9n,
    });

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
    ]);
  });
});

// ---------------------------------------------------------------------------
// (5) Mysteries are out of scope and keep their exact call shapes.
// ---------------------------------------------------------------------------

describe("Mystery hooks under the default-family provider: call shapes (characterization)", () => {
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

  it("useSubmitMysteryContribution calls submitMysteryContribution(mysteryId, type, text)", async () => {
    const { result } = renderHook(() => useSubmitMysteryContribution(), {
      wrapper,
    });

    await result.current.mutateAsync({
      mysteryId: 4n,
      contributionType: "Lead" as MysteryContribution["contributionType"],
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
// (6) Timeline is out of scope and keeps its exact call shape.
// ---------------------------------------------------------------------------

describe("Timeline hook under the default-family provider: call shape (characterization)", () => {
  it("useTimelineEvents calls listTimelineEvents() with no arguments", async () => {
    const { result } = renderHook(() => useTimelineEvents(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listTimelineEvents).toEqual([[]]);
  });
});

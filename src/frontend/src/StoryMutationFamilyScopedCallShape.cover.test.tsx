import "@testing-library/jest-dom/vitest";
import { EvidenceStatus, type Story, StoryStatus } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SubmitStoryInput,
  useAddCanonicalStory,
  useApproveStory,
  useRejectStory,
  useSubmitStory,
  useUpdateCanonicalStory,
} from "./hooks/useFamilyHistory";

// ---------------------------------------------------------------------------
// Cover for the Family Stories frontend MUTATION family-wiring change (D3-C):
// when a NON-default family is active, every Story MUTATION hook must route to
// the canonical `*ForFamily` endpoint with the explicit familyId as the FIRST
// positional argument, and must never fall back to the legacy no-familyId
// endpoint.
//
// The DEFAULT-family (Norwood) legacy mutation call shapes and invalidation
// keys are frozen separately by FamilyHistoryStoryReadsCharacterize.test.tsx
// and FamilyHistoryStoryMutationFallbackCharacterize.test.tsx; this file only
// asserts the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Story mutation path hard-codes the default family id:
// the non-default-family calls must never receive the literal default family id
// as their familyId argument, and the legacy no-familyId endpoints must stay
// untouched on the non-default branch.
//
// Finally it asserts that Story mutation cache invalidation is family-separated:
// React Query matches `invalidateQueries` by key PREFIX, so a bare
// ['familyHistory','stories',kind] filter would also match
// ['familyHistory','stories',kind,<otherFamily>] and mark another family's
// cache stale. The non-default branch keeps the same bare prefix but narrows it
// with a predicate that admits only the active family's key (familyId at index
// 3 for pending/approved, index 4 for detail), so a mutation in Family A never
// invalidates Family B's Story caches.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Canonical family-scoped Story mutation endpoints.
    submitStoryForFamily: unknown[][];
    approveStoryForFamily: unknown[][];
    rejectStoryForFamily: unknown[][];
    addCanonicalStoryForFamily: unknown[][];
    updateCanonicalStoryForFamily: unknown[][];
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
    submitStory: unknown[][];
    approveStory: unknown[][];
    rejectStory: unknown[][];
    addCanonicalStory: unknown[][];
    updateCanonicalStory: unknown[][];
  } = {
    submitStoryForFamily: [],
    approveStoryForFamily: [],
    rejectStoryForFamily: [],
    addCanonicalStoryForFamily: [],
    updateCanonicalStoryForFamily: [],
    submitStory: [],
    approveStory: [],
    rejectStory: [],
    addCanonicalStory: [],
    updateCanonicalStory: [],
  };

  const mockActor = {
    async submitStoryForFamily(...args: unknown[]): Promise<Story> {
      calls.submitStoryForFamily.push(args);
      return makeStory();
    },
    async approveStoryForFamily(...args: unknown[]): Promise<Story | null> {
      calls.approveStoryForFamily.push(args);
      return null;
    },
    async rejectStoryForFamily(...args: unknown[]): Promise<Story | null> {
      calls.rejectStoryForFamily.push(args);
      return null;
    },
    async addCanonicalStoryForFamily(...args: unknown[]): Promise<Story> {
      calls.addCanonicalStoryForFamily.push(args);
      return makeStory();
    },
    async updateCanonicalStoryForFamily(
      ...args: unknown[]
    ): Promise<Story | null> {
      calls.updateCanonicalStoryForFamily.push(args);
      return null;
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

/** The production composition with a NON-default active family. */
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
    familyId: FAMILY_A,
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

/** Every legacy no-familyId Story mutation endpoint must stay untouched. */
function expectNoLegacyStoryMutationCalls() {
  expect(calls.submitStory).toEqual([]);
  expect(calls.approveStory).toEqual([]);
  expect(calls.rejectStory).toEqual([]);
  expect(calls.addCanonicalStory).toEqual([]);
  expect(calls.updateCanonicalStory).toEqual([]);
}

describe("Story mutation hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useSubmitStory calls submitStoryForFamily(familyId, ...eight args) with the familyId first", async () => {
    const { result } = renderHook(() => useSubmitStory(), { wrapper });

    await result.current.mutateAsync(makeSubmitStoryInput());

    expect(calls.submitStoryForFamily).toEqual([
      [
        FAMILY_A,
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
    expectNoLegacyStoryMutationCalls();
  });

  it("useApproveStory calls approveStoryForFamily(familyId, storyId) with the familyId first", async () => {
    const { result } = renderHook(() => useApproveStory(), { wrapper });

    await result.current.mutateAsync(5n);

    expect(calls.approveStoryForFamily).toEqual([[FAMILY_A, 5n]]);
    expectNoLegacyStoryMutationCalls();
  });

  it("useRejectStory calls rejectStoryForFamily(familyId, storyId) with the familyId first", async () => {
    const { result } = renderHook(() => useRejectStory(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.rejectStoryForFamily).toEqual([[FAMILY_A, 6n]]);
    expectNoLegacyStoryMutationCalls();
  });

  it("useAddCanonicalStory calls addCanonicalStoryForFamily(familyId, ...eight args) with the familyId first", async () => {
    const { result } = renderHook(() => useAddCanonicalStory(), { wrapper });

    await result.current.mutateAsync(
      makeSubmitStoryInput({ title: "Canonical" }),
    );

    expect(calls.addCanonicalStoryForFamily).toEqual([
      [
        FAMILY_A,
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
    expectNoLegacyStoryMutationCalls();
  });

  it("useUpdateCanonicalStory calls updateCanonicalStoryForFamily(familyId, id, ...eight args) with the familyId first", async () => {
    const { result } = renderHook(() => useUpdateCanonicalStory(), { wrapper });

    await result.current.mutateAsync({
      ...makeSubmitStoryInput({ title: "Revised" }),
      id: 9n,
    });

    expect(calls.updateCanonicalStoryForFamily).toEqual([
      [
        FAMILY_A,
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
    expectNoLegacyStoryMutationCalls();
  });
});

describe("Story mutation hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily mutation call receives the active familyId, never the default literal", async () => {
    const submit = renderHook(() => useSubmitStory(), { wrapper });
    const approve = renderHook(() => useApproveStory(), { wrapper });
    const reject = renderHook(() => useRejectStory(), { wrapper });
    const addCanonical = renderHook(() => useAddCanonicalStory(), { wrapper });
    const updateCanonical = renderHook(() => useUpdateCanonicalStory(), {
      wrapper,
    });

    await submit.result.current.mutateAsync(makeSubmitStoryInput());
    await approve.result.current.mutateAsync(5n);
    await reject.result.current.mutateAsync(6n);
    await addCanonical.result.current.mutateAsync(makeSubmitStoryInput());
    await updateCanonical.result.current.mutateAsync({
      ...makeSubmitStoryInput(),
      id: 9n,
    });

    const familyIdArgs: unknown[] = [
      calls.submitStoryForFamily[0]?.[0],
      calls.approveStoryForFamily[0]?.[0],
      calls.rejectStoryForFamily[0]?.[0],
      calls.addCanonicalStoryForFamily[0]?.[0],
      calls.updateCanonicalStoryForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyStoryMutationCalls();
  });
});

describe("Story mutation hooks: non-default family invalidation stays family-separated (cover)", () => {
  // The accepted requirement is that Story mutation cache invalidation is
  // family-separated and does not invalidate another family's Story cache.
  // React Query's `invalidateQueries` matches by key prefix, so a bare
  // ['familyHistory','stories','pending'] / ['familyHistory','stories','approved']
  // invalidation would also match the family-appended key of another family and
  // mark its cache stale. This probe seeds a Family A and a Family B read query,
  // runs a Family A mutation, and asserts only the Family A query is invalidated.
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
          <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
        </QueryClientProvider>
      ),
    });
    const invalidatedKeys = () =>
      invalidateSpy.mock.calls.map(
        ([filters]) => (filters as { queryKey: unknown[] }).queryKey,
      );
    return { ...rendered, queryClient, invalidatedKeys };
  }

  it("useSubmitStory invalidates the pending prefix, which matches Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useSubmitStory(),
    );

    // Seed a Family A and a Family B pending query so the invalidation has
    // something to match against.
    queryClient.setQueryData(
      ["familyHistory", "stories", "pending", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "pending", FAMILY_B],
      [],
    );

    await result.current.mutateAsync(makeSubmitStoryInput());

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "pending",
    ]);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "pending",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "pending",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });

  it("useApproveStory invalidates the pending, approved, and detail prefixes, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useApproveStory(),
    );

    queryClient.setQueryData(
      ["familyHistory", "stories", "pending", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "pending", FAMILY_B],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "approved", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "approved", FAMILY_B],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "detail", "5", FAMILY_A],
      null,
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "detail", "5", FAMILY_B],
      null,
    );

    await result.current.mutateAsync(5n);

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "pending",
    ]);
    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
    ]);
    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "detail",
    ]);

    for (const kind of ["pending", "approved"] as const) {
      expect(
        queryClient.getQueryState(["familyHistory", "stories", kind, FAMILY_A])
          ?.isInvalidated,
      ).toBe(true);
      expect(
        queryClient.getQueryState(["familyHistory", "stories", kind, FAMILY_B])
          ?.isInvalidated,
      ).toBe(false);
    }
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "detail",
        "5",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "detail",
        "5",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });

  it("useRejectStory invalidates the pending and detail prefixes, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useRejectStory(),
    );

    queryClient.setQueryData(
      ["familyHistory", "stories", "pending", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "pending", FAMILY_B],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "detail", "6", FAMILY_A],
      null,
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "detail", "6", FAMILY_B],
      null,
    );

    await result.current.mutateAsync(6n);

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "pending",
    ]);
    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "detail",
    ]);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "pending",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "pending",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "detail",
        "6",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "detail",
        "6",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });

  it("useAddCanonicalStory invalidates the approved prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useAddCanonicalStory(),
    );

    queryClient.setQueryData(
      ["familyHistory", "stories", "approved", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "approved", FAMILY_B],
      [],
    );

    await result.current.mutateAsync(makeSubmitStoryInput());

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "approved",
    ]);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "approved",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "approved",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });

  it("useUpdateCanonicalStory invalidates the approved and detail prefixes, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useUpdateCanonicalStory(),
    );

    queryClient.setQueryData(
      ["familyHistory", "stories", "approved", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "approved", FAMILY_B],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "detail", "9", FAMILY_A],
      null,
    );
    queryClient.setQueryData(
      ["familyHistory", "stories", "detail", "9", FAMILY_B],
      null,
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
    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "stories",
      "detail",
    ]);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "approved",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "approved",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "detail",
        "9",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "stories",
        "detail",
        "9",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });
});

describe("Story mutation hooks: non-default family return shapes (cover)", () => {
  // The pages consume these hook return shapes directly. The family-wiring
  // change only changes which endpoint is called, never the shape the hook
  // exposes, so the data passthrough must be unchanged on the non-default
  // branch too.
  it("useSubmitStory resolves the backend story unchanged", async () => {
    const created = makeStory({ id: 42n, status: StoryStatus.Pending });
    mockActor.submitStoryForFamily = vi.fn(async () => created);

    const { result } = renderHook(() => useSubmitStory(), { wrapper });

    const submitted = await result.current.mutateAsync(makeSubmitStoryInput());
    expect(submitted).toEqual(created);
  });

  it("useApproveStory resolves the backend story unchanged", async () => {
    const approved = makeStory({ id: 5n, status: StoryStatus.Approved });
    mockActor.approveStoryForFamily = vi.fn(async () => approved);

    const { result } = renderHook(() => useApproveStory(), { wrapper });

    const story = await result.current.mutateAsync(5n);
    expect(story).toEqual(approved);
  });

  it("useRejectStory resolves the backend story unchanged", async () => {
    const rejected = makeStory({ id: 6n, status: StoryStatus.Rejected });
    mockActor.rejectStoryForFamily = vi.fn(async () => rejected);

    const { result } = renderHook(() => useRejectStory(), { wrapper });

    const story = await result.current.mutateAsync(6n);
    expect(story).toEqual(rejected);
  });

  it("useAddCanonicalStory resolves the backend story unchanged", async () => {
    const created = makeStory({ id: 8n, status: StoryStatus.Approved });
    mockActor.addCanonicalStoryForFamily = vi.fn(async () => created);

    const { result } = renderHook(() => useAddCanonicalStory(), { wrapper });

    const story = await result.current.mutateAsync(makeSubmitStoryInput());
    expect(story).toEqual(created);
  });

  it("useUpdateCanonicalStory resolves the backend story unchanged", async () => {
    const updated = makeStory({ id: 9n, title: "Revised" });
    mockActor.updateCanonicalStoryForFamily = vi.fn(async () => updated);

    const { result } = renderHook(() => useUpdateCanonicalStory(), { wrapper });

    const story = await result.current.mutateAsync({
      ...makeSubmitStoryInput(),
      id: 9n,
    });
    expect(story).toEqual(updated);
  });
});

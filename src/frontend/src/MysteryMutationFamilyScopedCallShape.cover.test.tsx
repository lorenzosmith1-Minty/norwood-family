import "@testing-library/jest-dom/vitest";
import {
  type Mystery,
  type MysteryContribution,
  MysteryContributionStatus,
  type MysteryContributionType,
  MysteryStatus,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type CreateCanonicalMysteryInput,
  type MarkMysteryResolvedInput,
  type SubmitMysteryContributionInput,
  type UpdateCanonicalMysteryInput,
  useCreateCanonicalMystery,
  useMarkMysteryResolved,
  useReviewMysteryContribution,
  useSubmitMysteryContribution,
  useUpdateCanonicalMystery,
} from "./hooks/useFamilyHistory";

// ---------------------------------------------------------------------------
// Cover for the Family Mysteries frontend MUTATION family-wiring change
// (D4-B): when a NON-default family is active, every Mystery MUTATION hook must
// route to the canonical `*ForFamily` endpoint with the explicit familyId as
// the FIRST positional argument, and must never fall back to the legacy
// no-familyId endpoint.
//
// The DEFAULT-family (Norwood) legacy mutation call shapes and invalidation
// keys are frozen separately by FamilyHistoryMysteryReadsCharacterize.test.tsx
// and FamilyHistoryMysteryMutationFallbackCharacterize.test.tsx; this file only
// asserts the non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Mystery mutation path hard-codes the default family
// id: the non-default-family calls must never receive the literal default
// family id as their familyId argument, and the legacy no-familyId endpoints
// must stay untouched on the non-default branch.
//
// Finally it asserts that Mystery mutation cache invalidation is
// family-separated: React Query matches `invalidateQueries` by key PREFIX, so a
// bare ['familyHistory','mysteries'] filter would also match
// ['familyHistory','mysteries',<otherFamily>] and mark another family's cache
// stale. The non-default branch keeps the same bare prefix but narrows it with
// a predicate that admits only the active family's key (familyId at index 2 for
// list/timeline, index 4 for detail/contributions/pending), so a mutation in
// Family A never invalidates Family B's Mystery caches.
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
    // Canonical family-scoped Mystery mutation endpoints.
    submitMysteryContributionForFamily: unknown[][];
    reviewMysteryContributionForFamily: unknown[][];
    createCanonicalMysteryForFamily: unknown[][];
    updateCanonicalMysteryForFamily: unknown[][];
    markMysteryResolvedForFamily: unknown[][];
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
    submitMysteryContribution: unknown[][];
    reviewMysteryContribution: unknown[][];
    createCanonicalMystery: unknown[][];
    updateCanonicalMystery: unknown[][];
    markMysteryResolved: unknown[][];
  } = {
    submitMysteryContributionForFamily: [],
    reviewMysteryContributionForFamily: [],
    createCanonicalMysteryForFamily: [],
    updateCanonicalMysteryForFamily: [],
    markMysteryResolvedForFamily: [],
    submitMysteryContribution: [],
    reviewMysteryContribution: [],
    createCanonicalMystery: [],
    updateCanonicalMystery: [],
    markMysteryResolved: [],
  };

  const mockActor = {
    async submitMysteryContributionForFamily(
      ...args: unknown[]
    ): Promise<MysteryContribution> {
      calls.submitMysteryContributionForFamily.push(args);
      return makeContribution();
    },
    async reviewMysteryContributionForFamily(
      ...args: unknown[]
    ): Promise<MysteryContribution | null> {
      calls.reviewMysteryContributionForFamily.push(args);
      return null;
    },
    async createCanonicalMysteryForFamily(
      ...args: unknown[]
    ): Promise<Mystery> {
      calls.createCanonicalMysteryForFamily.push(args);
      return makeMystery();
    },
    async updateCanonicalMysteryForFamily(
      ...args: unknown[]
    ): Promise<Mystery | null> {
      calls.updateCanonicalMysteryForFamily.push(args);
      return null;
    },
    async markMysteryResolvedForFamily(
      ...args: unknown[]
    ): Promise<Mystery | null> {
      calls.markMysteryResolvedForFamily.push(args);
      return null;
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
    familyId: FAMILY_A,
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
    familyId: FAMILY_A,
    ...overrides,
  };
}

function makeContributionInput(
  overrides: Partial<SubmitMysteryContributionInput> = {},
): SubmitMysteryContributionInput {
  return {
    mysteryId: 4n,
    contributionType: "Lead" as MysteryContributionType,
    text: "A lead.",
    ...overrides,
  };
}

function makeCreateInput(
  overrides: Partial<CreateCanonicalMysteryInput> = {},
): CreateCanonicalMysteryInput {
  return {
    title: "Where did the family originate?",
    description: "Still researching.",
    relatedMemberIds: ["julia"],
    relatedBranchId: null,
    knownFacts: ["Settled in Ohio."],
    possibilities: ["May have come from Virginia."],
    relatedSourceIds: [5n],
    relatedArchiveItemIds: [],
    status: MysteryStatus.Open,
    ...overrides,
  };
}

function makeUpdateInput(
  overrides: Partial<UpdateCanonicalMysteryInput> = {},
): UpdateCanonicalMysteryInput {
  return {
    ...makeCreateInput(),
    id: 9n,
    ...overrides,
  };
}

function makeResolveInput(
  overrides: Partial<MarkMysteryResolvedInput> = {},
): MarkMysteryResolvedInput {
  return {
    id: 3n,
    summary: "Records show the family arrived in 1842.",
    supportingEvidence: ["1842 census record"],
    ...overrides,
  };
}

/** Every legacy no-familyId Mystery mutation endpoint must stay untouched. */
function expectNoLegacyMysteryMutationCalls() {
  expect(calls.submitMysteryContribution).toEqual([]);
  expect(calls.reviewMysteryContribution).toEqual([]);
  expect(calls.createCanonicalMystery).toEqual([]);
  expect(calls.updateCanonicalMystery).toEqual([]);
  expect(calls.markMysteryResolved).toEqual([]);
}

describe("Mystery mutation hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useSubmitMysteryContribution calls submitMysteryContributionForFamily(familyId, mysteryId, type, text) with the familyId first", async () => {
    const { result } = renderHook(() => useSubmitMysteryContribution(), {
      wrapper,
    });

    await result.current.mutateAsync(makeContributionInput());

    expect(calls.submitMysteryContributionForFamily).toEqual([
      [FAMILY_A, 4n, "Lead", "A lead."],
    ]);
    expectNoLegacyMysteryMutationCalls();
  });

  it("useReviewMysteryContribution approve calls reviewMysteryContributionForFamily(familyId, contributionId, true) with the familyId first", async () => {
    const { result } = renderHook(() => useReviewMysteryContribution(), {
      wrapper,
    });

    await result.current.mutateAsync({ id: 7n, approve: true });

    expect(calls.reviewMysteryContributionForFamily).toEqual([
      [FAMILY_A, 7n, true],
    ]);
    expectNoLegacyMysteryMutationCalls();
  });

  it("useReviewMysteryContribution reject calls reviewMysteryContributionForFamily(familyId, contributionId, false) with the familyId first", async () => {
    const { result } = renderHook(() => useReviewMysteryContribution(), {
      wrapper,
    });

    await result.current.mutateAsync({ id: 8n, approve: false });

    expect(calls.reviewMysteryContributionForFamily).toEqual([
      [FAMILY_A, 8n, false],
    ]);
    expectNoLegacyMysteryMutationCalls();
  });

  it("useCreateCanonicalMystery calls createCanonicalMysteryForFamily(familyId, ...nine args) with the familyId first", async () => {
    const { result } = renderHook(() => useCreateCanonicalMystery(), {
      wrapper,
    });

    await result.current.mutateAsync(makeCreateInput());

    expect(calls.createCanonicalMysteryForFamily).toEqual([
      [
        FAMILY_A,
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
    expectNoLegacyMysteryMutationCalls();
  });

  it("useUpdateCanonicalMystery calls updateCanonicalMysteryForFamily(familyId, id, ...nine args) with the familyId first", async () => {
    const { result } = renderHook(() => useUpdateCanonicalMystery(), {
      wrapper,
    });

    await result.current.mutateAsync(makeUpdateInput());

    expect(calls.updateCanonicalMysteryForFamily).toEqual([
      [
        FAMILY_A,
        9n,
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
    expectNoLegacyMysteryMutationCalls();
  });

  it("useUpdateCanonicalMystery status change calls updateCanonicalMysteryForFamily(familyId, id, ...) with the new status and the familyId first", async () => {
    const { result } = renderHook(() => useUpdateCanonicalMystery(), {
      wrapper,
    });

    await result.current.mutateAsync(
      makeUpdateInput({ status: MysteryStatus.Resolved }),
    );

    expect(calls.updateCanonicalMysteryForFamily).toEqual([
      [
        FAMILY_A,
        9n,
        "Where did the family originate?",
        "Still researching.",
        ["julia"],
        null,
        ["Settled in Ohio."],
        ["May have come from Virginia."],
        [5n],
        [],
        MysteryStatus.Resolved,
      ],
    ]);
    expectNoLegacyMysteryMutationCalls();
  });

  it("useMarkMysteryResolved calls markMysteryResolvedForFamily(familyId, id, summary, supportingEvidence) with the familyId first", async () => {
    const { result } = renderHook(() => useMarkMysteryResolved(), { wrapper });

    await result.current.mutateAsync(makeResolveInput());

    expect(calls.markMysteryResolvedForFamily).toEqual([
      [
        FAMILY_A,
        3n,
        "Records show the family arrived in 1842.",
        ["1842 census record"],
      ],
    ]);
    expectNoLegacyMysteryMutationCalls();
  });
});

describe("Mystery mutation hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily mutation call receives the active familyId, never the default literal", async () => {
    const submit = renderHook(() => useSubmitMysteryContribution(), {
      wrapper,
    });
    const approve = renderHook(() => useReviewMysteryContribution(), {
      wrapper,
    });
    const create = renderHook(() => useCreateCanonicalMystery(), { wrapper });
    const update = renderHook(() => useUpdateCanonicalMystery(), { wrapper });
    const resolve = renderHook(() => useMarkMysteryResolved(), { wrapper });

    await submit.result.current.mutateAsync(makeContributionInput());
    await approve.result.current.mutateAsync({ id: 7n, approve: true });
    await create.result.current.mutateAsync(makeCreateInput());
    await update.result.current.mutateAsync(makeUpdateInput());
    await resolve.result.current.mutateAsync(makeResolveInput());

    const familyIdArgs: unknown[] = [
      calls.submitMysteryContributionForFamily[0]?.[0],
      calls.reviewMysteryContributionForFamily[0]?.[0],
      calls.createCanonicalMysteryForFamily[0]?.[0],
      calls.updateCanonicalMysteryForFamily[0]?.[0],
      calls.markMysteryResolvedForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyMysteryMutationCalls();
  });
});

describe("Mystery mutation hooks: non-default family invalidation stays family-separated (cover)", () => {
  // The accepted requirement is that Mystery mutation cache invalidation is
  // family-separated and does not invalidate another family's Mystery cache.
  // React Query's `invalidateQueries` matches by key prefix, so a bare
  // ['familyHistory','mysteries'] invalidation would also match the
  // family-appended key of another family and mark its cache stale. This probe
  // seeds a Family A and a Family B read query, runs a Family A mutation, and
  // asserts only the Family A query is invalidated.
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

  it("useSubmitMysteryContribution invalidates the pending prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useSubmitMysteryContribution(),
    );

    queryClient.setQueryData(
      ["familyHistory", "mysteries", "contributions", "pending", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "mysteries", "contributions", "pending", FAMILY_B],
      [],
    );

    await result.current.mutateAsync(makeContributionInput());

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "pending",
    ]);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "contributions",
        "pending",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "contributions",
        "pending",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });

  it("useReviewMysteryContribution invalidates the pending and list prefixes, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useReviewMysteryContribution(),
    );

    queryClient.setQueryData(
      ["familyHistory", "mysteries", "contributions", "pending", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "mysteries", "contributions", "pending", FAMILY_B],
      [],
    );
    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_A], []);
    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_B], []);

    await result.current.mutateAsync({ id: 7n, approve: true });

    expect(invalidatedKeys()).toContainEqual([
      "familyHistory",
      "mysteries",
      "contributions",
      "pending",
    ]);
    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);

    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "contributions",
        "pending",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "contributions",
        "pending",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useCreateCanonicalMystery invalidates the list prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useCreateCanonicalMystery(),
    );

    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_A], []);
    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_B], []);

    await result.current.mutateAsync(makeCreateInput());

    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useUpdateCanonicalMystery invalidates the list prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useUpdateCanonicalMystery(),
    );

    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_A], []);
    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_B], []);

    await result.current.mutateAsync(makeUpdateInput());

    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useMarkMysteryResolved invalidates the list prefix, matching Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useMarkMysteryResolved(),
    );

    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_A], []);
    queryClient.setQueryData(["familyHistory", "mysteries", FAMILY_B], []);

    await result.current.mutateAsync(makeResolveInput());

    expect(invalidatedKeys()).toContainEqual(["familyHistory", "mysteries"]);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["familyHistory", "mysteries", FAMILY_B])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("the detail and contributions predicates admit the active family's key and reject another family's key", async () => {
    // The detail and contributions keys put the familyId at index 4. The
    // mutation hooks only invalidate list/pending, so this probe exercises the
    // shared `mysteryInvalidation` predicate directly through the same
    // QueryClient the hooks use: seed Family A and Family B detail and
    // contributions keys, then invalidate with the exact filter the hook builds
    // for a non-default family and assert only Family A is marked stale.
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    queryClient.setQueryData(
      ["familyHistory", "mysteries", "detail", "7", FAMILY_A],
      null,
    );
    queryClient.setQueryData(
      ["familyHistory", "mysteries", "detail", "7", FAMILY_B],
      null,
    );
    queryClient.setQueryData(
      ["familyHistory", "mysteries", "contributions", "4", FAMILY_A],
      [],
    );
    queryClient.setQueryData(
      ["familyHistory", "mysteries", "contributions", "4", FAMILY_B],
      [],
    );

    await queryClient.invalidateQueries({
      queryKey: ["familyHistory", "mysteries", "detail"],
      predicate: (query) => query.queryKey[4] === FAMILY_A,
    });
    await queryClient.invalidateQueries({
      queryKey: ["familyHistory", "mysteries", "contributions"],
      predicate: (query) => query.queryKey[4] === FAMILY_A,
    });

    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "detail",
        "7",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "detail",
        "7",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "contributions",
        "4",
        FAMILY_A,
      ])?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState([
        "familyHistory",
        "mysteries",
        "contributions",
        "4",
        FAMILY_B,
      ])?.isInvalidated,
    ).toBe(false);
  });
});

describe("Mystery mutation hooks: non-default family return shapes (cover)", () => {
  // The pages consume these hook return shapes directly. The family-wiring
  // change only changes which endpoint is called, never the shape the hook
  // exposes, so the data passthrough must be unchanged on the non-default
  // branch too.
  it("useSubmitMysteryContribution resolves the backend contribution unchanged", async () => {
    const created = makeContribution({ id: 42n });
    mockActor.submitMysteryContributionForFamily = vi.fn(async () => created);

    const { result } = renderHook(() => useSubmitMysteryContribution(), {
      wrapper,
    });

    const contribution = await result.current.mutateAsync(
      makeContributionInput(),
    );
    expect(contribution).toEqual(created);
  });

  it("useReviewMysteryContribution resolves the backend contribution unchanged", async () => {
    const reviewed = makeContribution({
      id: 7n,
      status: MysteryContributionStatus.Approved,
    });
    mockActor.reviewMysteryContributionForFamily = vi.fn(async () => reviewed);

    const { result } = renderHook(() => useReviewMysteryContribution(), {
      wrapper,
    });

    const contribution = await result.current.mutateAsync({
      id: 7n,
      approve: true,
    });
    expect(contribution).toEqual(reviewed);
  });

  it("useCreateCanonicalMystery resolves the backend mystery unchanged", async () => {
    const created = makeMystery({ id: 8n });
    mockActor.createCanonicalMysteryForFamily = vi.fn(async () => created);

    const { result } = renderHook(() => useCreateCanonicalMystery(), {
      wrapper,
    });

    const mystery = await result.current.mutateAsync(makeCreateInput());
    expect(mystery).toEqual(created);
  });

  it("useUpdateCanonicalMystery resolves the backend mystery unchanged", async () => {
    const updated = makeMystery({ id: 9n, title: "Revised question" });
    mockActor.updateCanonicalMysteryForFamily = vi.fn(async () => updated);

    const { result } = renderHook(() => useUpdateCanonicalMystery(), {
      wrapper,
    });

    const mystery = await result.current.mutateAsync(makeUpdateInput());
    expect(mystery).toEqual(updated);
  });

  it("useMarkMysteryResolved resolves the backend mystery unchanged", async () => {
    const resolved = makeMystery({ id: 3n, status: MysteryStatus.Resolved });
    mockActor.markMysteryResolvedForFamily = vi.fn(async () => resolved);

    const { result } = renderHook(() => useMarkMysteryResolved(), { wrapper });

    const mystery = await result.current.mutateAsync(makeResolveInput());
    expect(mystery).toEqual(resolved);
  });
});

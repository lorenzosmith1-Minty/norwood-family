import "@testing-library/jest-dom/vitest";
import {
  EvidenceStatus,
  PrivacyLevel,
  type Recipe,
  RecipeStatus,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SubmitRecipeInput,
  useApproveRecipe,
  usePublishRecipe,
  useRejectRecipe,
  useSubmitRecipe,
} from "./hooks/useRecipes";

// ---------------------------------------------------------------------------
// Cover for the Family Recipes frontend MUTATION family-wiring change (D2-B):
// when a NON-default family is active, every Recipe MUTATION hook must route to
// the canonical `*ForFamily` endpoint with the explicit familyId as the FIRST
// positional argument, and must never fall back to the legacy no-familyId
// endpoint.
//
// The DEFAULT-family (Norwood) legacy mutation call shapes and invalidation
// keys are frozen separately by RecipesDefaultFamilyProviderCharacterize.test.tsx
// and RecipesMutationFallbackCharacterize.test.tsx; this file only asserts the
// non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Recipe mutation path hard-codes the default family
// id: the non-default-family calls must never receive the literal default
// family id as their familyId argument, and the legacy no-familyId endpoints
// must stay untouched on the non-default branch.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    // Canonical family-scoped mutation endpoints.
    submitRecipeForFamily: unknown[][];
    approveRecipeForFamily: unknown[][];
    rejectRecipeForFamily: unknown[][];
    publishRecipeForFamily: unknown[][];
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
    submitRecipe: unknown[][];
    approveRecipe: unknown[][];
    rejectRecipe: unknown[][];
    publishRecipe: unknown[][];
  } = {
    submitRecipeForFamily: [],
    approveRecipeForFamily: [],
    rejectRecipeForFamily: [],
    publishRecipeForFamily: [],
    submitRecipe: [],
    approveRecipe: [],
    rejectRecipe: [],
    publishRecipe: [],
  };

  const mockActor = {
    async submitRecipeForFamily(...args: unknown[]): Promise<Recipe> {
      calls.submitRecipeForFamily.push(args);
      return makeRecipe();
    },
    async approveRecipeForFamily(...args: unknown[]): Promise<Recipe | null> {
      calls.approveRecipeForFamily.push(args);
      return null;
    },
    async rejectRecipeForFamily(...args: unknown[]): Promise<Recipe | null> {
      calls.rejectRecipeForFamily.push(args);
      return null;
    },
    async publishRecipeForFamily(...args: unknown[]): Promise<Recipe> {
      calls.publishRecipeForFamily.push(args);
      return makeRecipe();
    },
    async submitRecipe(...args: unknown[]): Promise<Recipe> {
      calls.submitRecipe.push(args);
      return makeRecipe();
    },
    async approveRecipe(...args: unknown[]): Promise<Recipe | null> {
      calls.approveRecipe.push(args);
      return null;
    },
    async rejectRecipe(...args: unknown[]): Promise<Recipe | null> {
      calls.rejectRecipe.push(args);
      return null;
    },
    async publishRecipe(...args: unknown[]): Promise<Recipe> {
      calls.publishRecipe.push(args);
      return makeRecipe();
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

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    familyId: FAMILY_A,
    recipeId: 1n,
    title: "Sweet Potato Pie",
    shortDescription: "Grandma Julia's holiday favorite.",
    originatingPersonId: "julia",
    relatedPersonIds: ["clayton"],
    era: "1940s",
    year: 1942n,
    location: "Clayton, Mississippi",
    familyBranch: "the Clayton Norwood branch",
    ingredients: ["3 cups sweet potato"],
    instructions: "Mix and bake at 350.",
    familyStory: "Made every Thanksgiving.",
    tags: ["dessert"],
    privacyLevel: PrivacyLevel.FamilyOnly,
    evidenceStatus: EvidenceStatus.PersonalMemory,
    status: RecipeStatus.Approved,
    linkedMediaIds: [],
    contributorAccountId: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

function makeSubmitInput(
  overrides: Partial<SubmitRecipeInput> = {},
): SubmitRecipeInput {
  return {
    title: "A recipe",
    shortDescription: "A short description.",
    originatingPersonId: "julia",
    relatedPersonIds: ["clayton"],
    era: "1940s",
    year: 1942n,
    location: "Norwood",
    familyBranch: "branch-1",
    ingredients: ["flour"],
    instructions: "Mix everything.",
    familyStory: "A story.",
    tags: ["recipes"],
    privacyLevel: PrivacyLevel.FamilyOnly,
    evidenceStatus: EvidenceStatus.FamilyHistory,
    linkedMediaIds: [],
    ...overrides,
  };
}

/** Every legacy no-familyId recipe mutation endpoint must stay untouched. */
function expectNoLegacyRecipeMutationCalls() {
  expect(calls.submitRecipe).toEqual([]);
  expect(calls.approveRecipe).toEqual([]);
  expect(calls.rejectRecipe).toEqual([]);
  expect(calls.publishRecipe).toEqual([]);
}

describe("Recipe mutation hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useSubmitRecipe calls submitRecipeForFamily(familyId, ...fifteen args) with the familyId first", async () => {
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });

    await result.current.mutateAsync(makeSubmitInput());

    expect(calls.submitRecipeForFamily).toEqual([
      [
        FAMILY_A,
        "A recipe",
        "A short description.",
        "julia",
        ["clayton"],
        "1940s",
        1942n,
        "Norwood",
        "branch-1",
        ["flour"],
        "Mix everything.",
        "A story.",
        ["recipes"],
        PrivacyLevel.FamilyOnly,
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
    expectNoLegacyRecipeMutationCalls();
  });

  it("useApproveRecipe calls approveRecipeForFamily(familyId, id) with the familyId first", async () => {
    const { result } = renderHook(() => useApproveRecipe(), { wrapper });

    await result.current.mutateAsync(5n);

    expect(calls.approveRecipeForFamily).toEqual([[FAMILY_A, 5n]]);
    expectNoLegacyRecipeMutationCalls();
  });

  it("useRejectRecipe calls rejectRecipeForFamily(familyId, id) with the familyId first", async () => {
    const { result } = renderHook(() => useRejectRecipe(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.rejectRecipeForFamily).toEqual([[FAMILY_A, 6n]]);
    expectNoLegacyRecipeMutationCalls();
  });

  it("usePublishRecipe calls publishRecipeForFamily(familyId, ...fifteen args) with the familyId first", async () => {
    const { result } = renderHook(() => usePublishRecipe(), { wrapper });

    await result.current.mutateAsync(makeSubmitInput({ title: "Published" }));

    expect(calls.publishRecipeForFamily).toEqual([
      [
        FAMILY_A,
        "Published",
        "A short description.",
        "julia",
        ["clayton"],
        "1940s",
        1942n,
        "Norwood",
        "branch-1",
        ["flour"],
        "Mix everything.",
        "A story.",
        ["recipes"],
        PrivacyLevel.FamilyOnly,
        EvidenceStatus.FamilyHistory,
        [],
      ],
    ]);
    expectNoLegacyRecipeMutationCalls();
  });
});

describe("Recipe mutation hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily mutation call receives the active familyId, never the default literal", async () => {
    const submit = renderHook(() => useSubmitRecipe(), { wrapper });
    const approve = renderHook(() => useApproveRecipe(), { wrapper });
    const reject = renderHook(() => useRejectRecipe(), { wrapper });
    const publish = renderHook(() => usePublishRecipe(), { wrapper });

    await submit.result.current.mutateAsync(makeSubmitInput());
    await approve.result.current.mutateAsync(5n);
    await reject.result.current.mutateAsync(6n);
    await publish.result.current.mutateAsync(makeSubmitInput());

    const familyIdArgs: unknown[] = [
      calls.submitRecipeForFamily[0]?.[0],
      calls.approveRecipeForFamily[0]?.[0],
      calls.rejectRecipeForFamily[0]?.[0],
      calls.publishRecipeForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyRecipeMutationCalls();
  });
});

describe("Recipe mutation hooks: non-default family invalidation stays family-separated (cover)", () => {
  // The accepted requirement is that Recipe mutation cache invalidation is
  // family-separated and does not invalidate another family's Recipe cache.
  // React Query's `invalidateQueries` matches by key prefix, so a bare
  // ['recipes', 'pending'] / ['recipes', 'approved'] invalidation would also
  // match ['recipes', 'pending', <otherFamily>] and mark another family's cache
  // stale. This probe seeds a Family A and a Family B read query, runs a
  // Family A mutation, and asserts only the Family A query is invalidated.
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

  it("useSubmitRecipe invalidates the pending prefix, which matches Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useSubmitRecipe(),
    );

    // Seed a Family A and a Family B pending query so the invalidation has
    // something to match against.
    queryClient.setQueryData(["recipes", "pending", FAMILY_A], []);
    queryClient.setQueryData(["recipes", "pending", "test-family-b"], []);

    await result.current.mutateAsync(makeSubmitInput());

    expect(invalidatedKeys()).toContainEqual(["recipes", "pending"]);
    expect(
      queryClient.getQueryState(["recipes", "pending", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["recipes", "pending", "test-family-b"])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useApproveRecipe invalidates the approved prefix, which matches Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useApproveRecipe(),
    );

    queryClient.setQueryData(["recipes", "approved", FAMILY_A], []);
    queryClient.setQueryData(["recipes", "approved", "test-family-b"], []);

    await result.current.mutateAsync(5n);

    expect(invalidatedKeys()).toContainEqual(["recipes", "approved"]);
    expect(
      queryClient.getQueryState(["recipes", "approved", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["recipes", "approved", "test-family-b"])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("usePublishRecipe invalidates the approved prefix, which matches Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      usePublishRecipe(),
    );

    queryClient.setQueryData(["recipes", "approved", FAMILY_A], []);
    queryClient.setQueryData(["recipes", "approved", "test-family-b"], []);

    await result.current.mutateAsync(makeSubmitInput());

    expect(invalidatedKeys()).toContainEqual(["recipes", "approved"]);
    expect(
      queryClient.getQueryState(["recipes", "approved", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["recipes", "approved", "test-family-b"])
        ?.isInvalidated,
    ).toBe(false);
  });

  it("useRejectRecipe invalidates the pending prefix, which matches Family A but not Family B", async () => {
    const { result, queryClient, invalidatedKeys } = renderWithSpy(() =>
      useRejectRecipe(),
    );

    queryClient.setQueryData(["recipes", "pending", FAMILY_A], []);
    queryClient.setQueryData(["recipes", "pending", "test-family-b"], []);

    await result.current.mutateAsync(6n);

    expect(invalidatedKeys()).toContainEqual(["recipes", "pending"]);
    expect(
      queryClient.getQueryState(["recipes", "pending", FAMILY_A])
        ?.isInvalidated,
    ).toBe(true);
    expect(
      queryClient.getQueryState(["recipes", "pending", "test-family-b"])
        ?.isInvalidated,
    ).toBe(false);
  });
});

describe("Recipe mutation hooks: non-default family return shapes (cover)", () => {
  // The pages consume these hook return shapes directly. The family-wiring
  // change only changes which endpoint is called, never the shape the hook
  // exposes, so the data passthrough must be unchanged on the non-default
  // branch too.
  it("useSubmitRecipe resolves the backend recipe unchanged", async () => {
    const created = makeRecipe({ recipeId: 42n, status: RecipeStatus.Pending });
    mockActor.submitRecipeForFamily = vi.fn(async () => created);

    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });

    const submitted = await result.current.mutateAsync(makeSubmitInput());
    expect(submitted).toEqual(created);
  });

  it("useApproveRecipe resolves the backend recipe unchanged", async () => {
    const approved = makeRecipe({
      recipeId: 5n,
      status: RecipeStatus.Approved,
    });
    mockActor.approveRecipeForFamily = vi.fn(async () => approved);

    const { result } = renderHook(() => useApproveRecipe(), { wrapper });

    const recipe = await result.current.mutateAsync(5n);
    expect(recipe).toEqual(approved);
  });

  it("useRejectRecipe resolves the backend recipe unchanged", async () => {
    const rejected = makeRecipe({
      recipeId: 6n,
      status: RecipeStatus.Rejected,
    });
    mockActor.rejectRecipeForFamily = vi.fn(async () => rejected);

    const { result } = renderHook(() => useRejectRecipe(), { wrapper });

    const recipe = await result.current.mutateAsync(6n);
    expect(recipe).toEqual(rejected);
  });

  it("usePublishRecipe resolves the backend recipe unchanged", async () => {
    const published = makeRecipe({
      recipeId: 8n,
      status: RecipeStatus.Approved,
    });
    mockActor.publishRecipeForFamily = vi.fn(async () => published);

    const { result } = renderHook(() => usePublishRecipe(), { wrapper });

    const recipe = await result.current.mutateAsync(makeSubmitInput());
    expect(recipe).toEqual(published);
  });
});

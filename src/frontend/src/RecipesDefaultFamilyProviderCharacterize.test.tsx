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
import { useQueryClient } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type SubmitRecipeInput,
  useApproveRecipe,
  useApprovedRecipes,
  usePendingRecipes,
  usePublishRecipe,
  useRecipe,
  useRecipesForPerson,
  useRejectRecipe,
  useSubmitRecipe,
} from "./hooks/useRecipes";

// ---------------------------------------------------------------------------
// Characterization baseline for the Family Recipes frontend family-wiring
// change: the DEFAULT-family path through the production FamilyProvider
// composition.
//
// The requested change wires every Family Recipes frontend path to the
// centralized active family context and the family-scoped Recipe APIs, exactly
// as the Board and Messaging hooks were wired before it. Each of the eight
// recipe hooks will read the active family from `useFamilyScopedId()` and fork:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook must keep making the legacy no-familyId call and keep the legacy
//     React Query key — the default-family behavior and UI must be unchanged;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// The real app mounts `<FamilyProvider>` (main.tsx) with the default family, so
// the default-family path *through the provider* is the production path. This
// file pins that path for all eight recipe hooks: the exact positional
// arguments each hook passes to the legacy endpoint, the exact React Query keys
// the read hooks register, and the cache keys the mutations invalidate.
//
// It deliberately does NOT freeze the non-default branch (that is the new
// behavior) and does NOT freeze the legacy call shape as the *only* shape — the
// change replaces the unconditional legacy call with a fork. What it protects
// is that, for the default family, every recipe hook still reaches the legacy
// endpoint with the same positional arguments and registers the same query
// keys, so the default-family browse page, detail page, add-recipe flow,
// person-profile section, and steward approval flow keep working exactly as
// before.
//
// The page-level journeys (browse, empty state, add form, pending -> approve,
// detail, profile section) are covered by FamilyRecipesCover.test.tsx, and the
// submit call contract by FamilyMembershipGatingContractCharacterize.test.tsx.
// This file covers the hook-level call shapes and query keys the family-scoping
// change touches, mirroring MessagingDefaultFamilyProviderCharacterize.test.tsx
// for Messaging and BoardDefaultFamilyProviderCharacterize.test.tsx for Board.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listApprovedRecipes: unknown[][];
    listPendingRecipes: unknown[][];
    getRecipe: unknown[][];
    listRecipesForPerson: unknown[][];
    submitRecipe: unknown[][];
    approveRecipe: unknown[][];
    rejectRecipe: unknown[][];
    publishRecipe: unknown[][];
  } = {
    listApprovedRecipes: [],
    listPendingRecipes: [],
    getRecipe: [],
    listRecipesForPerson: [],
    submitRecipe: [],
    approveRecipe: [],
    rejectRecipe: [],
    publishRecipe: [],
  };

  const mockActor = {
    async listApprovedRecipes(...args: unknown[]): Promise<Recipe[]> {
      calls.listApprovedRecipes.push(args);
      return [];
    },
    async listPendingRecipes(...args: unknown[]): Promise<Recipe[]> {
      calls.listPendingRecipes.push(args);
      return [];
    },
    async getRecipe(...args: unknown[]): Promise<Recipe | null> {
      calls.getRecipe.push(args);
      return null;
    },
    async listRecipesForPerson(...args: unknown[]): Promise<Recipe[]> {
      calls.listRecipesForPerson.push(args);
      return [];
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

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    familyId: DEFAULT_FAMILY_ID,
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

describe("Recipe read hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useApprovedRecipes calls listApprovedRecipes() with no arguments", async () => {
    const { result } = renderHook(() => useApprovedRecipes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedRecipes).toEqual([[]]);
  });

  it("usePendingRecipes calls listPendingRecipes() with no arguments", async () => {
    const { result } = renderHook(() => usePendingRecipes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingRecipes).toEqual([[]]);
  });

  it("useRecipe calls getRecipe(id) with the id and no familyId", async () => {
    const recipe = makeRecipe({ recipeId: 7n });
    mockActor.getRecipe = vi.fn(async (...args: unknown[]) => {
      calls.getRecipe.push(args);
      return recipe;
    });

    const { result } = renderHook(() => useRecipe(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getRecipe).toEqual([[7n]]);
    expect(result.current.data).toBe(recipe);
  });

  it("useRecipesForPerson calls listRecipesForPerson(personId) with the personId and no familyId", async () => {
    const { result } = renderHook(() => useRecipesForPerson("julia"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listRecipesForPerson).toEqual([["julia"]]);
  });
});

describe("Recipe mutation hooks under the default-family provider: legacy call shapes (characterization)", () => {
  it("useSubmitRecipe calls submitRecipe with the fifteen positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });

    await result.current.mutateAsync(makeSubmitInput());

    expect(calls.submitRecipe).toEqual([
      [
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
  });

  it("useApproveRecipe calls approveRecipe(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useApproveRecipe(), { wrapper });

    await result.current.mutateAsync(5n);

    expect(calls.approveRecipe).toEqual([[5n]]);
  });

  it("useRejectRecipe calls rejectRecipe(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useRejectRecipe(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.rejectRecipe).toEqual([[6n]]);
  });

  it("usePublishRecipe calls publishRecipe with the fifteen positional arguments and no familyId", async () => {
    const { result } = renderHook(() => usePublishRecipe(), { wrapper });

    await result.current.mutateAsync(makeSubmitInput({ title: "Published" }));

    expect(calls.publishRecipe).toEqual([
      [
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
  });
});

describe("Recipe hooks under the default-family provider: legacy query keys (characterization)", () => {
  // The family-scoping change appends the active familyId to the Recipe query
  // keys for a NON-default family so caches never collide across families. The
  // DEFAULT family must keep the legacy keys byte-for-byte, because the mutation
  // hooks invalidate exactly these keys — a changed default-family key would
  // silently stop the browse list, pending review list, and detail view from
  // refreshing after a submit, approve, reject, or publish.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useApprovedRecipes registers the legacy ['recipes','approved'] key", async () => {
    const { result } = renderHook(
      () => ({ list: useApprovedRecipes(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "approved"]);
  });

  it("usePendingRecipes registers the legacy ['recipes','pending'] key", async () => {
    const { result } = renderHook(
      () => ({ list: usePendingRecipes(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "pending"]);
  });

  it("useRecipe registers the legacy ['recipes','detail',id] key", async () => {
    const { result } = renderHook(
      () => ({ detail: useRecipe(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.detail.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "detail", "7"]);
  });

  it("useRecipesForPerson registers the legacy ['recipes','person',personId] key", async () => {
    const { result } = renderHook(
      () => ({ list: useRecipesForPerson("julia"), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "person", "julia"]);
  });
});

describe("Recipe mutations under the default-family provider: cache invalidation (characterization)", () => {
  // The mutation hooks invalidate the legacy query-key prefix, which matches
  // both the default-family legacy key and the non-default family-scoped key.
  // A changed invalidation key would silently stop the affected list from
  // refreshing after a mutation. `invalidateQueries` only marks *existing*
  // matching queries stale, so the probe spies on the call itself rather than
  // reading the (empty) query cache.
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

  it("useSubmitRecipe invalidates the pending and pendingContributionsCount keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useSubmitRecipe());

    await result.current.mutateAsync(makeSubmitInput());

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["recipes", "pending"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
  });

  it("useApproveRecipe invalidates the pending, approved, pendingContributionsCount, and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useApproveRecipe());

    await result.current.mutateAsync(5n);

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["recipes", "pending"]);
    expect(keys).toContainEqual(["recipes", "approved"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("useRejectRecipe invalidates the pending, pendingContributionsCount, and notifications keys", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => useRejectRecipe());

    await result.current.mutateAsync(6n);

    const keys = invalidatedKeys();
    expect(keys).toContainEqual(["recipes", "pending"]);
    expect(keys).toContainEqual(["pendingContributionsCount"]);
    expect(keys).toContainEqual(["notifications"]);
  });

  it("usePublishRecipe invalidates the approved key", async () => {
    const { result, invalidatedKeys } = renderWithSpy(() => usePublishRecipe());

    await result.current.mutateAsync(makeSubmitInput());

    expect(invalidatedKeys()).toContainEqual(["recipes", "approved"]);
  });
});

describe("Recipe hooks under the default-family provider: return shapes (characterization)", () => {
  // The pages consume these hook return shapes directly. The family-scoping
  // change only changes which endpoint is called, never the shape the hook
  // exposes, so the data passthrough must be unchanged.
  it("useApprovedRecipes exposes the backend recipes unchanged", async () => {
    const recipes = [
      makeRecipe({ recipeId: 1n }),
      makeRecipe({ recipeId: 2n }),
    ];
    mockActor.listApprovedRecipes = vi.fn(async () => recipes);

    const { result } = renderHook(() => useApprovedRecipes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(recipes);
  });

  it("usePendingRecipes exposes the backend recipes unchanged", async () => {
    const recipes = [makeRecipe({ status: RecipeStatus.Pending })];
    mockActor.listPendingRecipes = vi.fn(async () => recipes);

    const { result } = renderHook(() => usePendingRecipes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(recipes);
  });

  it("useRecipe exposes the backend recipe unchanged", async () => {
    const recipe = makeRecipe({ recipeId: 9n, title: "Gumbo" });
    mockActor.getRecipe = vi.fn(async () => recipe);

    const { result } = renderHook(() => useRecipe(9n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(recipe);
  });

  it("useRecipesForPerson exposes the backend recipes unchanged", async () => {
    const recipes = [makeRecipe({ originatingPersonId: "julia" })];
    mockActor.listRecipesForPerson = vi.fn(async () => recipes);

    const { result } = renderHook(() => useRecipesForPerson("julia"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(recipes);
  });

  it("useSubmitRecipe resolves the backend recipe unchanged", async () => {
    const created = makeRecipe({ recipeId: 42n, status: RecipeStatus.Pending });
    mockActor.submitRecipe = vi.fn(async () => created);

    const { result } = renderHook(() => useSubmitRecipe(), { wrapper });

    const submitted = await result.current.mutateAsync(makeSubmitInput());
    expect(submitted).toEqual(created);
  });

  it("useApproveRecipe resolves the backend recipe unchanged", async () => {
    const approved = makeRecipe({
      recipeId: 5n,
      status: RecipeStatus.Approved,
    });
    mockActor.approveRecipe = vi.fn(async () => approved);

    const { result } = renderHook(() => useApproveRecipe(), { wrapper });

    const recipe = await result.current.mutateAsync(5n);
    expect(recipe).toEqual(approved);
  });

  it("useRejectRecipe resolves the backend recipe unchanged", async () => {
    const rejected = makeRecipe({
      recipeId: 6n,
      status: RecipeStatus.Rejected,
    });
    mockActor.rejectRecipe = vi.fn(async () => rejected);

    const { result } = renderHook(() => useRejectRecipe(), { wrapper });

    const recipe = await result.current.mutateAsync(6n);
    expect(recipe).toEqual(rejected);
  });

  it("usePublishRecipe resolves the backend recipe unchanged", async () => {
    const published = makeRecipe({
      recipeId: 8n,
      status: RecipeStatus.Approved,
    });
    mockActor.publishRecipe = vi.fn(async () => published);

    const { result } = renderHook(() => usePublishRecipe(), { wrapper });

    const recipe = await result.current.mutateAsync(makeSubmitInput());
    expect(recipe).toEqual(published);
  });
});

import "@testing-library/jest-dom/vitest";
import { type Recipe, RecipeStatus } from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  useApprovedRecipes,
  usePendingRecipes,
  useRecipe,
  useRecipesForPerson,
} from "./hooks/useRecipes";

// ---------------------------------------------------------------------------
// Cover for the Family Recipes frontend family-wiring change: when a
// NON-default family is active, every Recipe READ hook must route to the
// canonical `*ForFamily` endpoint with the explicit familyId as the FIRST
// positional argument, and the familyId must be part of the React Query key so
// caches never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by RecipesDefaultFamilyProviderCharacterize.test.tsx and
// RecipesReadFallbackCharacterize.test.tsx; this file only asserts the
// non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Recipe read path hard-codes the default family id:
// the non-default-family calls must never receive the literal default family id
// as their familyId argument, and the legacy no-familyId endpoints must stay
// untouched on the non-default branch.
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
    // Canonical family-scoped endpoints.
    listApprovedRecipesForFamily: unknown[][];
    listPendingRecipesForFamily: unknown[][];
    getRecipeForFamily: unknown[][];
    listRecipesForPersonForFamily: unknown[][];
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
    listApprovedRecipes: unknown[][];
    listPendingRecipes: unknown[][];
    getRecipe: unknown[][];
    listRecipesForPerson: unknown[][];
  } = {
    listApprovedRecipesForFamily: [],
    listPendingRecipesForFamily: [],
    getRecipeForFamily: [],
    listRecipesForPersonForFamily: [],
    listApprovedRecipes: [],
    listPendingRecipes: [],
    getRecipe: [],
    listRecipesForPerson: [],
  };

  const mockActor = {
    async listApprovedRecipesForFamily(...args: unknown[]): Promise<Recipe[]> {
      calls.listApprovedRecipesForFamily.push(args);
      return [];
    },
    async listPendingRecipesForFamily(...args: unknown[]): Promise<Recipe[]> {
      calls.listPendingRecipesForFamily.push(args);
      return [];
    },
    async getRecipeForFamily(...args: unknown[]): Promise<Recipe | null> {
      calls.getRecipeForFamily.push(args);
      return null;
    },
    async listRecipesForPersonForFamily(...args: unknown[]): Promise<Recipe[]> {
      calls.listRecipesForPersonForFamily.push(args);
      return [];
    },
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
    privacyLevel: { FamilyOnly: null },
    evidenceStatus: { PersonalMemory: null },
    status: RecipeStatus.Approved,
    linkedMediaIds: [],
    contributorAccountId: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    ...overrides,
  } as Recipe;
}

/** Every legacy no-familyId recipe read endpoint must stay untouched. */
function expectNoLegacyRecipeReadCalls() {
  expect(calls.listApprovedRecipes).toEqual([]);
  expect(calls.listPendingRecipes).toEqual([]);
  expect(calls.getRecipe).toEqual([]);
  expect(calls.listRecipesForPerson).toEqual([]);
}

describe("Recipe read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useApprovedRecipes calls listApprovedRecipesForFamily(familyId)", async () => {
    const { result } = renderHook(() => useApprovedRecipes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedRecipesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyRecipeReadCalls();
  });

  it("usePendingRecipes calls listPendingRecipesForFamily(familyId)", async () => {
    const { result } = renderHook(() => usePendingRecipes(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingRecipesForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyRecipeReadCalls();
  });

  it("useRecipe calls getRecipeForFamily(familyId, recipeId) with the familyId first", async () => {
    const recipe = makeRecipe({ recipeId: 7n });
    mockActor.getRecipeForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getRecipeForFamily.push(args);
      return recipe;
    });

    const { result } = renderHook(() => useRecipe(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getRecipeForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(result.current.data).toBe(recipe);
    expectNoLegacyRecipeReadCalls();
  });

  it("useRecipesForPerson calls listRecipesForPersonForFamily(familyId, personId) with the familyId first", async () => {
    const { result } = renderHook(() => useRecipesForPerson("julia"), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listRecipesForPersonForFamily).toEqual([[FAMILY_A, "julia"]]);
    expectNoLegacyRecipeReadCalls();
  });
});

describe("Recipe read hooks: non-default family query keys include the familyId (cover)", () => {
  // The familyId must be part of every family-owned Recipe read cache key so
  // Family A and Family B caches never collide. The default-family legacy keys
  // are frozen separately; here we assert the family-scoped shape.
  function keyProbe() {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    return queryClient;
  }

  it("registers family-scoped keys for all four read hooks", async () => {
    const queryClient = keyProbe();
    const scopedWrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
      </QueryClientProvider>
    );

    const approved = renderHook(() => useApprovedRecipes(), {
      wrapper: scopedWrapper,
    });
    const pending = renderHook(() => usePendingRecipes(), {
      wrapper: scopedWrapper,
    });
    const detail = renderHook(() => useRecipe(7n), { wrapper: scopedWrapper });
    const person = renderHook(() => useRecipesForPerson("julia"), {
      wrapper: scopedWrapper,
    });

    await waitFor(() => expect(approved.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(person.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "approved", FAMILY_A]);
    expect(keys).toContainEqual(["recipes", "pending", FAMILY_A]);
    expect(keys).toContainEqual(["recipes", "detail", "7", FAMILY_A]);
    expect(keys).toContainEqual(["recipes", "person", "julia", FAMILY_A]);
  });

  it("keeps Family A and Family B caches distinct for the same recipe id", async () => {
    const queryClient = keyProbe();
    const wrapperFor = (familyId: string) =>
      function FamilyWrapper({ children }: { children: ReactNode }) {
        return (
          <QueryClientProvider client={queryClient}>
            <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
          </QueryClientProvider>
        );
      };

    const familyA = renderHook(() => useRecipe(7n), {
      wrapper: wrapperFor(FAMILY_A),
    });
    const familyB = renderHook(() => useRecipe(7n), {
      wrapper: wrapperFor(FAMILY_B),
    });

    await waitFor(() => expect(familyA.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(familyB.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "detail", "7", FAMILY_A]);
    expect(keys).toContainEqual(["recipes", "detail", "7", FAMILY_B]);
    expect(calls.getRecipeForFamily).toEqual([
      [FAMILY_A, 7n],
      [FAMILY_B, 7n],
    ]);
  });
});

describe("Recipe read hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily read call receives the active familyId, never the default literal", async () => {
    const approved = renderHook(() => useApprovedRecipes(), { wrapper });
    const pending = renderHook(() => usePendingRecipes(), { wrapper });
    const detail = renderHook(() => useRecipe(7n), { wrapper });
    const person = renderHook(() => useRecipesForPerson("julia"), {
      wrapper,
    });

    await waitFor(() => expect(approved.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(person.result.current.isSuccess).toBe(true));

    const familyIdArgs: unknown[] = [
      calls.listApprovedRecipesForFamily[0]?.[0],
      calls.listPendingRecipesForFamily[0]?.[0],
      calls.getRecipeForFamily[0]?.[0],
      calls.listRecipesForPersonForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyRecipeReadCalls();
  });
});

import "@testing-library/jest-dom/vitest";
import { type Recipe, RecipeStatus } from "@/backend";
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
// Characterization baseline for the Family Recipes frontend family-wiring
// change: the two adjacent read paths the provider-mounted baseline does NOT
// cover.
//
// The requested change makes the four Recipe read hooks family-aware by reading
// the active family from `useFamilyScopedId()` and forking on it. The
// provider-mounted DEFAULT-family path (legacy call shapes and legacy query
// keys through the production FamilyProvider) is frozen separately by
// RecipesDefaultFamilyProviderCharacterize.test.tsx. This file protects the two
// remaining default-family read paths that the same change can silently break:
//
//   1. NO PROVIDER MOUNTED. `useActiveFamily()` falls back to the default family
//      when no FamilyProvider is mounted, so `useFamilyScopedId()` resolves to
//      `undefined` and the hook must still make the legacy no-familyId call and
//      register the legacy query key. A change that read the context directly,
//      or that treated a missing provider as a non-default family, would break
//      every bare render.
//
//   2. ACTOR NOT READY. The read hooks are gated on
//      `providersPresent && !!actor && !isFetching`. While the actor is still
//      loading the hook must stay disabled and must not call the backend; once
//      the actor arrives it must issue exactly one legacy call. A change that
//      moved the family read outside the query, or that dropped the readiness
//      gate, would fire an unauthorized call on mount.
//
// It deliberately does NOT freeze the non-default branch (that is the new
// behavior) and does NOT freeze the legacy call shape as the only shape — the
// change replaces the unconditional legacy call with a fork. What it protects
// is that, absent a provider and before the actor is ready, the default-family
// read behavior is unchanged.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const mockState = vi.hoisted(() => {
  const calls: {
    listApprovedRecipes: unknown[][];
    listPendingRecipes: unknown[][];
    getRecipe: unknown[][];
    listRecipesForPerson: unknown[][];
  } = {
    listApprovedRecipes: [],
    listPendingRecipes: [],
    getRecipe: [],
    listRecipesForPerson: [],
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
  };

  return {
    mockActor,
    calls,
    actorReady: true,
  };
});

const { mockActor, calls } = mockState;

function resetCalls() {
  for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
    calls[key].length = 0;
  }
  mockState.actorReady = true;
}

function setActorReady(value: boolean) {
  mockState.actorReady = value;
}

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({
    actor: mockState.actorReady ? mockState.mockActor : null,
    isFetching: false,
  }),
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
 * A QueryClientProvider with NO FamilyProvider, so `useActiveFamily()` takes its
 * documented default-family fallback.
 */
function bareWrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
  return {
    familyId: "norwood",
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

describe("Recipe read hooks with no FamilyProvider: default-family fallback (characterization)", () => {
  it("useApprovedRecipes calls listApprovedRecipes() with no arguments", async () => {
    const { result } = renderHook(() => useApprovedRecipes(), {
      wrapper: bareWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedRecipes).toEqual([[]]);
  });

  it("usePendingRecipes calls listPendingRecipes() with no arguments", async () => {
    const { result } = renderHook(() => usePendingRecipes(), {
      wrapper: bareWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listPendingRecipes).toEqual([[]]);
  });

  it("useRecipe calls getRecipe(id) with the id and no familyId", async () => {
    const recipe = makeRecipe({ recipeId: 7n });
    mockActor.getRecipe = vi.fn(async (...args: unknown[]) => {
      calls.getRecipe.push(args);
      return recipe;
    });

    const { result } = renderHook(() => useRecipe(7n), {
      wrapper: bareWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getRecipe).toEqual([[7n]]);
    expect(result.current.data).toBe(recipe);
  });

  it("useRecipesForPerson calls listRecipesForPerson(personId) with the personId and no familyId", async () => {
    const { result } = renderHook(() => useRecipesForPerson("julia"), {
      wrapper: bareWrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listRecipesForPerson).toEqual([["julia"]]);
  });

  it("registers the legacy query keys with no provider mounted", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const approved = renderHook(() => useApprovedRecipes(), { wrapper });
    const pending = renderHook(() => usePendingRecipes(), { wrapper });
    const detail = renderHook(() => useRecipe(7n), { wrapper });
    const person = renderHook(() => useRecipesForPerson("julia"), { wrapper });

    await waitFor(() => expect(approved.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(pending.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(person.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["recipes", "approved"]);
    expect(keys).toContainEqual(["recipes", "pending"]);
    expect(keys).toContainEqual(["recipes", "detail", "7"]);
    expect(keys).toContainEqual(["recipes", "person", "julia"]);
  });
});

describe("Recipe read hooks before the actor is ready: no eager backend call (characterization)", () => {
  it("stays disabled and issues no call while the actor is null, then calls once when it arrives", async () => {
    setActorReady(false);

    const { result, rerender } = renderHook(() => useApprovedRecipes(), {
      wrapper: bareWrapper,
    });

    // The readiness gate keeps the query disabled: no backend call on mount.
    expect(result.current.fetchStatus).toBe("idle");
    expect(calls.listApprovedRecipes).toEqual([]);

    // The actor becomes available; the hook issues exactly one legacy call.
    setActorReady(true);
    rerender();

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listApprovedRecipes).toEqual([[]]);
  });

  it("keeps all four read hooks idle while the actor is null", async () => {
    setActorReady(false);

    const approved = renderHook(() => useApprovedRecipes(), {
      wrapper: bareWrapper,
    });
    const pending = renderHook(() => usePendingRecipes(), {
      wrapper: bareWrapper,
    });
    const detail = renderHook(() => useRecipe(7n), { wrapper: bareWrapper });
    const person = renderHook(() => useRecipesForPerson("julia"), {
      wrapper: bareWrapper,
    });

    expect(approved.result.current.fetchStatus).toBe("idle");
    expect(pending.result.current.fetchStatus).toBe("idle");
    expect(detail.result.current.fetchStatus).toBe("idle");
    expect(person.result.current.fetchStatus).toBe("idle");

    expect(calls.listApprovedRecipes).toEqual([]);
    expect(calls.listPendingRecipes).toEqual([]);
    expect(calls.getRecipe).toEqual([]);
    expect(calls.listRecipesForPerson).toEqual([]);
  });
});

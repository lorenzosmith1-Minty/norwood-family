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
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePendingCount } from "./hooks/usePendingCount";
import {
  type SubmitRecipeInput,
  useApproveRecipe,
  useRejectRecipe,
  useSubmitRecipe,
} from "./hooks/useRecipes";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped pending-contributions-count
// cache-invalidation change.
//
// The requested change makes the pending-contributions-count invalidation
// family-scoped: a mutation in one family must invalidate only that family's
// pending-count cache. The behavior the change intentionally alters is the
// *bare* `["pendingContributionsCount"]` invalidation filter that every
// mutation hook currently records, so this file deliberately does NOT freeze
// that filter shape.
//
// What it freezes instead is the adjacent working behavior the change must
// preserve:
//
//   1. The `usePendingCount` query-key contract. The default family registers
//      `["pendingContributionsCount", ""]` and calls the legacy no-argument
//      endpoint; a non-default family registers
//      `["pendingContributionsCount", <familyId>]` and calls the
//      `*ForFamily` endpoint. A family-scoped invalidation can only refresh the
//      right cache if these keys stay exactly as they are.
//
//   2. The default-family (Norwood) outcome: with the default family active, a
//      pending-contribution mutation still refreshes the default pending-count
//      query. This is asserted behaviorally — seed the default key, run the
//      mutation, observe the query is invalidated — so it holds whether the
//      default-family filter stays a bare prefix or becomes an explicit
//      `["pendingContributionsCount", ""]` key.
//
// The non-default half of the new behavior (a Family A mutation must NOT
// invalidate Family B's pending count) is the change under way and is not
// characterized here.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    getPendingContributionsCount: unknown[][];
    getPendingContributionsCountForFamily: unknown[][];
    submitRecipe: unknown[][];
    approveRecipe: unknown[][];
    rejectRecipe: unknown[][];
  } = {
    getPendingContributionsCount: [],
    getPendingContributionsCountForFamily: [],
    submitRecipe: [],
    approveRecipe: [],
    rejectRecipe: [],
  };

  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return true;
    },
    async getPendingContributionsCount(): Promise<bigint> {
      calls.getPendingContributionsCount.push([]);
      return 3n;
    },
    async getPendingContributionsCountForFamily(
      ...args: unknown[]
    ): Promise<bigint> {
      calls.getPendingContributionsCountForFamily.push(args);
      return 5n;
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

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient, familyId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

describe("usePendingCount: family-scoped query-key contract (characterization)", () => {
  it("registers the default-family key ['pendingContributionsCount',''] and calls the legacy endpoint", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePendingCount(), {
      wrapper: wrapperFor(queryClient),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["pendingContributionsCount", ""]);
    // The default family keeps the legacy no-argument endpoint.
    expect(calls.getPendingContributionsCount).toEqual([[]]);
    expect(calls.getPendingContributionsCountForFamily).toEqual([]);
    expect(result.current.data).toBe(3);
  });

  it("registers the non-default key ['pendingContributionsCount', familyId] and calls the *ForFamily endpoint", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => usePendingCount(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["pendingContributionsCount", FAMILY_A]);
    expect(calls.getPendingContributionsCountForFamily).toEqual([[FAMILY_A]]);
    expect(calls.getPendingContributionsCount).toEqual([]);
    expect(result.current.data).toBe(5);
  });
});

describe("default-family pending-count invalidation still refreshes the default count (characterization)", () => {
  // The acceptance criterion is that default Norwood behavior is unchanged:
  // with the default family active, pending-count invalidation still refreshes
  // the default pending count. Asserted behaviorally against the exact key
  // `usePendingCount` registers for the default family, so it is independent of
  // whether the filter is a bare prefix or an explicit default-family key.
  function renderMutationWithSpy<T>(hook: () => T) {
    const queryClient = makeQueryClient();
    const rendered = renderHook(hook, {
      wrapper: wrapperFor(queryClient),
    });
    return { ...rendered, queryClient };
  }

  it("useSubmitRecipe invalidates the default pending-count query", async () => {
    const { result, queryClient } = renderMutationWithSpy(() =>
      useSubmitRecipe(),
    );
    queryClient.setQueryData(["pendingContributionsCount", ""], 3);

    await result.current.mutateAsync(makeSubmitInput());

    expect(
      queryClient.getQueryState(["pendingContributionsCount", ""])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useApproveRecipe invalidates the default pending-count query", async () => {
    const { result, queryClient } = renderMutationWithSpy(() =>
      useApproveRecipe(),
    );
    queryClient.setQueryData(["pendingContributionsCount", ""], 3);

    await result.current.mutateAsync(5n);

    expect(
      queryClient.getQueryState(["pendingContributionsCount", ""])
        ?.isInvalidated,
    ).toBe(true);
  });

  it("useRejectRecipe invalidates the default pending-count query", async () => {
    const { result, queryClient } = renderMutationWithSpy(() =>
      useRejectRecipe(),
    );
    queryClient.setQueryData(["pendingContributionsCount", ""], 3);

    await result.current.mutateAsync(6n);

    expect(
      queryClient.getQueryState(["pendingContributionsCount", ""])
        ?.isInvalidated,
    ).toBe(true);
  });
});

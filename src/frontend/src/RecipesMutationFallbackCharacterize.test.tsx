import "@testing-library/jest-dom/vitest";
import {
  EvidenceStatus,
  PrivacyLevel,
  type Recipe,
  RecipeStatus,
} from "@/backend";
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
// Characterization baseline for the Family Recipes frontend mutation
// family-wiring change (D2-B).
//
// The requested change makes the four Recipe MUTATION hooks
// (useSubmitRecipe / useApproveRecipe / useRejectRecipe / usePublishRecipe)
// family-aware by reading the active family from `useFamilyScopedId()` and
// forking on it, exactly as the four read hooks were wired in D2-A:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook must keep making the legacy no-familyId call and keep the legacy
//     invalidation keys — the default-family behavior must be unchanged;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// The provider-mounted DEFAULT-family mutation call shapes and invalidation
// keys are frozen separately by RecipesDefaultFamilyProviderCharacterize.test.tsx,
// and the `useSubmitRecipe` call contract by
// FamilyMembershipGatingContractCharacterize.test.tsx. This file protects the
// two adjacent default-family mutation paths those files do NOT cover, both of
// which the D2-B change can silently break by introducing a family read:
//
//   1. NO PROVIDER MOUNTED. `useActiveFamily()` falls back to the default family
//      when no FamilyProvider is mounted, so `useFamilyScopedId()` resolves to
//      `undefined` and the mutation must still make the legacy no-familyId call.
//      A change that read the context directly, or that treated a missing
//      provider as a non-default family, would move every bare render onto a
//      `*ForFamily` endpoint and change default-family behavior.
//
//   2. ACTOR NOT READY. Every mutation throws the stable "Backend is not ready"
//      error when the actor is still loading, and must not call the backend. A
//      change that moved the family read or the actor guard around could fire an
//      unauthorized call on mount or change the surfaced error.
//
// It deliberately does NOT freeze the non-default branch (that is the new
// behavior) and does NOT freeze the legacy call shape as the only shape — the
// change replaces the unconditional legacy call with a fork. What it protects
// is that, absent a provider and before the actor is ready, the default-family
// mutation behavior is unchanged.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const mockState = vi.hoisted(() => {
  const calls: {
    submitRecipe: unknown[][];
    approveRecipe: unknown[][];
    rejectRecipe: unknown[][];
    publishRecipe: unknown[][];
  } = {
    submitRecipe: [],
    approveRecipe: [],
    rejectRecipe: [],
    publishRecipe: [],
  };

  const mockActor = {
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
    actorReady: true,
  };
});

const { calls } = mockState;

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

describe("Recipe mutation hooks with no FamilyProvider: default-family fallback (characterization)", () => {
  it("useSubmitRecipe calls submitRecipe with the fifteen positional arguments and no familyId", async () => {
    const { result } = renderHook(() => useSubmitRecipe(), {
      wrapper: bareWrapper,
    });

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
    const { result } = renderHook(() => useApproveRecipe(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync(5n);

    expect(calls.approveRecipe).toEqual([[5n]]);
  });

  it("useRejectRecipe calls rejectRecipe(id) with the id and no familyId", async () => {
    const { result } = renderHook(() => useRejectRecipe(), {
      wrapper: bareWrapper,
    });

    await result.current.mutateAsync(6n);

    expect(calls.rejectRecipe).toEqual([[6n]]);
  });

  it("usePublishRecipe calls publishRecipe with the fifteen positional arguments and no familyId", async () => {
    const { result } = renderHook(() => usePublishRecipe(), {
      wrapper: bareWrapper,
    });

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

describe("Recipe mutation hooks before the actor is ready: no eager backend call (characterization)", () => {
  it("throws the stable 'Backend is not ready' error and issues no call while the actor is null", async () => {
    setActorReady(false);

    const submit = renderHook(() => useSubmitRecipe(), {
      wrapper: bareWrapper,
    });
    const approve = renderHook(() => useApproveRecipe(), {
      wrapper: bareWrapper,
    });
    const reject = renderHook(() => useRejectRecipe(), {
      wrapper: bareWrapper,
    });
    const publish = renderHook(() => usePublishRecipe(), {
      wrapper: bareWrapper,
    });

    await expect(
      submit.result.current.mutateAsync(makeSubmitInput()),
    ).rejects.toThrow("Backend is not ready");
    await expect(approve.result.current.mutateAsync(5n)).rejects.toThrow(
      "Backend is not ready",
    );
    await expect(reject.result.current.mutateAsync(6n)).rejects.toThrow(
      "Backend is not ready",
    );
    await expect(
      publish.result.current.mutateAsync(makeSubmitInput()),
    ).rejects.toThrow("Backend is not ready");

    // No mutation reached the backend while the actor was null.
    expect(calls.submitRecipe).toEqual([]);
    expect(calls.approveRecipe).toEqual([]);
    expect(calls.rejectRecipe).toEqual([]);
    expect(calls.publishRecipe).toEqual([]);
  });
});

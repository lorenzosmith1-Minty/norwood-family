import "@testing-library/jest-dom/vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  EvidenceStatus,
  PrivacyLevel,
  type ProfileClaim,
  ProfileClaimStatus,
  type Recipe,
  RecipeStatus,
  SourceStatus,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useSubmitArchiveItem } from "./hooks/useArchiveStorage";
import { useCreateBoardPostWithMedia } from "./hooks/useBoard";
import {
  useReviewMysteryContribution,
  useSubmitStory,
} from "./hooks/useFamilyHistory";
import { pendingContributionsCountInvalidation } from "./hooks/usePendingCount";
import { useRequestProfileClaim } from "./hooks/useProfileClaims";
import { useSubmitRecipe } from "./hooks/useRecipes";
import { useApproveRelationshipRequest } from "./hooks/useRelationshipRequests";
import { useApproveSource } from "./hooks/useResearchIntake";

// ---------------------------------------------------------------------------
// Cover for the family-aware pending-contributions-count invalidation change.
//
// The requested change routes every pending-count invalidation through the
// single helper `pendingContributionsCountInvalidation(familyScopedId)` in
// `hooks/usePendingCount.ts`, and makes that helper family-aware: a mutation
// performed while a NON-default family is active must invalidate ONLY that
// family's pending-count query key, never another family's.
//
// This file asserts the accepted behavior:
//
//   1. Non-default isolation: with Family A active, a mutation invalidates
//      `["pendingContributionsCount", "test-family-a"]` and leaves Family B's
//      `["pendingContributionsCount", "test-family-b"]` and the default
//      `["pendingContributionsCount", ""]` entries untouched. Asserted
//      behaviorally through the real mutation hooks (not the helper in
//      isolation), so a hook that bypasses the helper is caught.
//
//   2. Default-family exactness: with the default family active, a mutation
//      invalidates ONLY the exact default read key
//      `["pendingContributionsCount", ""]` and leaves Family A's and Family B's
//      keys untouched. The default branch no longer uses a bare
//      `["pendingContributionsCount"]` prefix, which would also match every
//      family-appended key.
//
//   3. No production frontend source file contains a bare
//      `["pendingContributionsCount"]` prefix invalidation. A bare prefix
//      filter would also match every family-appended key and mark another
//      family's pending count stale, which is the regression this change
//      removes. The scan reads the real source text.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async isCallerSteward(): Promise<boolean> {
      return true;
    },
    async submitRecipe(..._args: unknown[]): Promise<Recipe> {
      return makeRecipe();
    },
    async submitRecipeForFamily(..._args: unknown[]): Promise<Recipe> {
      return makeRecipe();
    },
    async submitArchiveItem(..._args: unknown[]): Promise<unknown> {
      return makeArchiveItem();
    },
    async submitArchiveItemForFamily(..._args: unknown[]): Promise<unknown> {
      return makeArchiveItem();
    },
    async createBoardPostWithMediaForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return { id: 1n };
    },
    async requestProfileClaimForFamily(..._args: unknown[]): Promise<unknown> {
      return { __kind__: "ok", ok: makeProfileClaim() };
    },
    async approveRelationshipRequest(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async approveRelationshipRequestForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
    async submitStoryForFamily(..._args: unknown[]): Promise<unknown> {
      return makeStory();
    },
    async reviewMysteryContributionForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return null;
    },
    async approveSourceForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // No call recording is needed for this file; the assertions are on the
      // React Query cache state. Kept as a hook point for symmetry.
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

function makeArchiveItem(): unknown {
  return {
    familyId: FAMILY_A,
    id: 1n,
    title: "A family letter",
    description: "A letter from 1924.",
    itemType: ArchiveItemType.Document,
    blob: { getBytes: async () => new Uint8Array(), directURL: "" },
    mimeType: "application/pdf",
    filename: "letter.pdf",
    era: "1924",
    year: 1924n,
    tags: ["letters"],
    contributor: OWNER,
    relatedMemberIds: [],
    relatedBranchId: undefined,
    sourceStatus: SourceStatus.Original,
    privacyLevel: PrivacyLevel.FamilyOnly,
    status: ArchiveItemStatus.Pending,
    createdAt: 1_700_000_000_000_000_000n,
    classification: ArchiveItemClassification.Standard,
    primarySpeaker: undefined,
  };
}

function makeProfileClaim(): ProfileClaim {
  return {
    id: 1n,
    submittedDate: 1_700_000_000_000_000_000n,
    status: ProfileClaimStatus.Pending,
    reviewedDate: undefined,
    reviewedBy: undefined,
    personId: "julia",
    requestingUserId: OWNER,
    familyId: FAMILY_A,
  };
}

function makeStory(): unknown {
  return {
    id: 1n,
    title: "A story",
    storyText: "Once upon a time.",
    relatedMemberIds: [],
    era: "1940s",
    year: 1942n,
    location: "Norwood",
    evidenceStatus: EvidenceStatus.FamilyHistory,
    relatedArchiveItemIds: [],
    status: "Pending",
    contributor: OWNER,
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    familyId: FAMILY_A,
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

/**
 * Seeds the pending-count caches for the default family, Family A, and Family B
 * so an invalidation can be observed as a state transition on each key.
 */
function seedPendingCountCaches(queryClient: QueryClient) {
  queryClient.setQueryData(["pendingContributionsCount", ""], 1);
  queryClient.setQueryData(["pendingContributionsCount", FAMILY_A], 2);
  queryClient.setQueryData(["pendingContributionsCount", FAMILY_B], 3);
}

function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

/**
 * Runs one mutation hook under the given active family and returns the
 * invalidation state of the three pending-count keys afterwards.
 */
async function runMutationAndReadPendingKeys(
  familyId: string | undefined,
  hook: () => { mutateAsync: (input: never) => Promise<unknown> },
  input: unknown,
) {
  const queryClient = makeQueryClient();
  const { result } = renderHook(hook, {
    wrapper: wrapperFor(queryClient, familyId),
  });
  seedPendingCountCaches(queryClient);

  await result.current.mutateAsync(input as never);

  return {
    defaultKey: isInvalidated(queryClient, ["pendingContributionsCount", ""]),
    familyA: isInvalidated(queryClient, [
      "pendingContributionsCount",
      FAMILY_A,
    ]),
    familyB: isInvalidated(queryClient, [
      "pendingContributionsCount",
      FAMILY_B,
    ]),
  };
}

const RECIPE_INPUT = {
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
};

const ARCHIVE_INPUT = {
  title: "A letter",
  description: "A letter from 1924.",
  itemType: ArchiveItemType.Document,
  mimeType: "application/pdf",
  blob: { getBytes: async () => new Uint8Array(), directURL: "" },
  filename: "letter.pdf",
  era: "1924",
  year: 1924n,
  tags: ["letters"],
  relatedMemberIds: [],
  relatedBranchId: null,
  sourceStatus: SourceStatus.Original,
  privacyLevel: PrivacyLevel.FamilyOnly,
  classification: ArchiveItemClassification.Standard,
  primarySpeaker: null,
};

const BOARD_MEDIA_INPUT = {
  postType: "Update",
  title: "A post",
  body: "A body.",
  relatedPersonIds: [],
  existingArchiveItemIds: [],
  newUploads: [],
  tags: [],
};

const STORY_INPUT = {
  title: "A story",
  storyText: "Once upon a time.",
  relatedMemberIds: [],
  era: "1940s",
  year: 1942n,
  location: "Norwood",
  evidenceStatus: EvidenceStatus.FamilyHistory,
  relatedArchiveItemIds: [],
};

// ---------------------------------------------------------------------------
// Helper contract: both branches are family-exact.
// ---------------------------------------------------------------------------

describe("pendingContributionsCountInvalidation is family-exact in both branches (cover)", () => {
  it("the default branch targets only the exact ['pendingContributionsCount', ''] key", () => {
    const filter = pendingContributionsCountInvalidation(undefined);
    expect(filter.queryKey).toEqual(["pendingContributionsCount", ""]);
    // No predicate is needed: the exact key cannot match a family-appended key.
    expect(filter.predicate).toBeUndefined();
  });

  it("a non-default branch targets only ['pendingContributionsCount', familyId] via a predicate", () => {
    const filter = pendingContributionsCountInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["pendingContributionsCount"]);
    expect(typeof filter.predicate).toBe("function");
    // The predicate must match the active family's key and reject another
    // family's key and the default key.
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["pendingContributionsCount", FAMILY_A] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["pendingContributionsCount", FAMILY_B] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["pendingContributionsCount", ""] })).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Non-default family isolation: only the active family's key is invalidated.
// ---------------------------------------------------------------------------

describe("non-default family: a mutation invalidates only that family's pending-count key (cover)", () => {
  it("useSubmitRecipe (Recipes) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useSubmitRecipe() as never,
      RECIPE_INPUT,
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useSubmitArchiveItem (Archive) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useSubmitArchiveItem() as never,
      ARCHIVE_INPUT,
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useCreateBoardPostWithMedia (Board) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useCreateBoardPostWithMedia() as never,
      BOARD_MEDIA_INPUT,
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useRequestProfileClaim (Profile Claims) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useRequestProfileClaim(FAMILY_A) as never,
      "julia",
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useApproveRelationshipRequest (Relationship Requests) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useApproveRelationshipRequest(FAMILY_A) as never,
      7n,
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useSubmitStory (Family History) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useSubmitStory() as never,
      STORY_INPUT,
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useReviewMysteryContribution (Family History) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useReviewMysteryContribution() as never,
      { id: 7n, approve: true },
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("useApproveSource (Research Intake) invalidates Family A only", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_A,
      () => useApproveSource() as never,
      1n,
    );
    expect(state.familyA).toBe(true);
    expect(state.familyB).toBe(false);
    expect(state.defaultKey).toBe(false);
  });

  it("a Family B mutation invalidates Family B only, not Family A", async () => {
    const state = await runMutationAndReadPendingKeys(
      FAMILY_B,
      () => useSubmitRecipe() as never,
      RECIPE_INPUT,
    );
    expect(state.familyB).toBe(true);
    expect(state.familyA).toBe(false);
    expect(state.defaultKey).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Default Norwood behavior is unchanged.
// ---------------------------------------------------------------------------

describe("default family: a mutation invalidates only the exact default key (cover)", () => {
  // The accepted change makes the default branch family-exact: it targets only
  // the exact read key `["pendingContributionsCount", ""]` instead of a bare
  // `["pendingContributionsCount"]` prefix. A bare prefix would also match
  // every family-appended key and mark another family's pending count stale.
  // These tests therefore assert the default key is invalidated AND that the
  // Family A / Family B keys are left untouched.
  it("useSubmitRecipe invalidates the default key and no family key", async () => {
    const state = await runMutationAndReadPendingKeys(
      undefined,
      () => useSubmitRecipe() as never,
      RECIPE_INPUT,
    );
    expect(state.defaultKey).toBe(true);
    expect(state.familyA).toBe(false);
    expect(state.familyB).toBe(false);
  });

  it("useSubmitArchiveItem invalidates the default key and no family key", async () => {
    const state = await runMutationAndReadPendingKeys(
      undefined,
      () => useSubmitArchiveItem() as never,
      ARCHIVE_INPUT,
    );
    expect(state.defaultKey).toBe(true);
    expect(state.familyA).toBe(false);
    expect(state.familyB).toBe(false);
  });

  it("useApproveRelationshipRequest invalidates the default key and no family key", async () => {
    const state = await runMutationAndReadPendingKeys(
      undefined,
      () => useApproveRelationshipRequest() as never,
      7n,
    );
    expect(state.defaultKey).toBe(true);
    expect(state.familyA).toBe(false);
    expect(state.familyB).toBe(false);
  });

  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// Static source scan: no production frontend source contains a bare
// `["pendingContributionsCount"]` invalidation.
// ---------------------------------------------------------------------------

describe("no production frontend source contains a bare pendingContributionsCount prefix invalidation (cover)", () => {
  const SRC_ROOT = join(process.cwd(), "src");

  function collectProductionSources(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === "declarations" || entry === "test") continue;
        out.push(...collectProductionSources(full));
        continue;
      }
      if (!/\.(ts|tsx)$/u.test(entry)) continue;
      if (/\.(test|spec)\.(ts|tsx)$/u.test(entry)) continue;
      out.push(full);
    }
    return out;
  }

  const productionSources = collectProductionSources(SRC_ROOT);

  it("scans a non-trivial set of production source files", () => {
    // Guards against a scan that silently matches nothing (e.g. a wrong root).
    expect(productionSources.length).toBeGreaterThan(50);
    expect(
      productionSources.some((file) =>
        file.endsWith("hooks/usePendingCount.ts"),
      ),
    ).toBe(true);
  });

  it("no production source passes a bare ['pendingContributionsCount'] queryKey to invalidateQueries", () => {
    // A bare prefix filter matches every family-appended key, so it would mark
    // another family's pending count stale. The helper must narrow a
    // non-default family with a predicate; the default family's bare filter is
    // built inside the helper and is the only permitted occurrence.
    const offenders: string[] = [];
    for (const file of productionSources) {
      const source = readFileSync(file, "utf8");
      // Match `invalidateQueries({ queryKey: ["pendingContributionsCount"] })`
      // and the multi-line equivalent, but not the helper's own construction
      // (which is a `return { queryKey: [...] }`, not an invalidateQueries
      // call) and not a family-appended key.
      const bareInvalidation =
        /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']pendingContributionsCount["']\s*\]\s*\}/u;
      if (bareInvalidation.test(source)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the helper is the single source of the pending-count invalidation filter", () => {
    // Every hook that invalidates the pending count must import the helper
    // rather than build the filter inline. The helper's own module is the only
    // file allowed to name the key in an invalidation filter.
    const helperFile = join(SRC_ROOT, "hooks", "usePendingCount.ts");
    const importers = productionSources.filter((file) => {
      if (file === helperFile) return false;
      const source = readFileSync(file, "utf8");
      return source.includes("pendingContributionsCountInvalidation");
    });
    // The changed hooks named in the request all route through the helper.
    for (const expected of [
      "hooks/useRecipes.ts",
      "hooks/useFamilyHistory.ts",
      "hooks/useArchiveStorage.ts",
      "hooks/useBoard.ts",
      "hooks/useProfileClaims.ts",
      "hooks/useRelationshipRequests.ts",
      "hooks/useResearchIntake.ts",
    ]) {
      expect(
        importers.some((file) => file.endsWith(expected)),
        `${expected} must import pendingContributionsCountInvalidation`,
      ).toBe(true);
    }
  });
});

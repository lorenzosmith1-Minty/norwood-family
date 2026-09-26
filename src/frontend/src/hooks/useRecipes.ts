import { createActor } from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import type { EvidenceStatus, PrivacyLevel } from "@/types/recipes";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/**
 * React Query hooks for Family Recipes, following the existing
 * useActor(createActor) + useQuery/useMutation pattern.
 *
 * Every hook is family-aware, following the useBoard / useMessaging pattern:
 * the active family is read from the centralized FamilyContext and
 * `familyScopedId` is `undefined` for the default family. The default family
 * keeps the exact legacy no-argument call shape and React Query key, while a
 * non-default family routes to the canonical `*ForFamily` endpoint with the
 * familyId appended to the key so caches never collide across families.
 *
 * Mutations invalidate family-separated Recipe caches. The default family keeps
 * the exact legacy bare-prefix invalidation; a non-default family keeps the same
 * bare prefix (so the recorded filter is unchanged) but adds a predicate that
 * admits only the active family's family-appended key, so a mutation in one
 * family never marks another family's Recipe cache stale.
 */

/**
 * Builds the React Query invalidation filter for a Recipe list cache.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["recipes", kind]` filter would also match `["recipes", kind, <otherFamily>]`
 * and mark another family's cache stale. The default family keeps the exact
 * legacy bare-prefix filter; a non-default family keeps the same bare prefix but
 * narrows it with a predicate that admits only the active family's key.
 */
function recipeListInvalidation(
  kind: "pending" | "approved",
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["recipes", kind] };
  }
  return {
    queryKey: ["recipes", kind],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/** Lists approved (publicly visible) family recipes. */
export function useApprovedRecipes() {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["recipes", "approved"]
        : ["recipes", "approved", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listApprovedRecipes()
        : actor.listApprovedRecipesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists recipes pending steward review (steward-only). */
export function usePendingRecipes() {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["recipes", "pending"]
        : ["recipes", "pending", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listPendingRecipes()
        : actor.listPendingRecipesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Fetches a single recipe by id. */
export function useRecipe(id: bigint) {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["recipes", "detail", id.toString()]
        : ["recipes", "detail", id.toString(), familyScopedId],
    queryFn: async () => {
      if (!actor) return null;
      return familyScopedId === undefined
        ? actor.getRecipe(id)
        : actor.getRecipeForFamily(familyScopedId, id);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists approved recipes linked to a specific family member. */
export function useRecipesForPerson(personId: string) {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["recipes", "person", personId]
        : ["recipes", "person", personId, familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listRecipesForPerson(personId)
        : actor.listRecipesForPersonForFamily(familyScopedId, personId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export interface SubmitRecipeInput {
  title: string;
  shortDescription: string;
  originatingPersonId: string;
  relatedPersonIds: string[];
  era: string | null;
  year: bigint | null;
  location: string | null;
  familyBranch: string | null;
  ingredients: string[];
  instructions: string;
  familyStory: string | null;
  tags: string[];
  privacyLevel: PrivacyLevel;
  evidenceStatus: EvidenceStatus;
  linkedMediaIds: bigint[];
}

/** Submits a new recipe in a pending state awaiting steward approval. */
export function useSubmitRecipe() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitRecipeInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.submitRecipe(
            input.title,
            input.shortDescription,
            input.originatingPersonId,
            input.relatedPersonIds,
            input.era,
            input.year,
            input.location,
            input.familyBranch,
            input.ingredients,
            input.instructions,
            input.familyStory,
            input.tags,
            input.privacyLevel,
            input.evidenceStatus,
            input.linkedMediaIds,
          )
        : actor.submitRecipeForFamily(
            familyScopedId,
            input.title,
            input.shortDescription,
            input.originatingPersonId,
            input.relatedPersonIds,
            input.era,
            input.year,
            input.location,
            input.familyBranch,
            input.ingredients,
            input.instructions,
            input.familyStory,
            input.tags,
            input.privacyLevel,
            input.evidenceStatus,
            input.linkedMediaIds,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        recipeListInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Approves a pending recipe, making it publicly visible. */
export function useApproveRecipe() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveRecipe(id)
        : actor.approveRecipeForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        recipeListInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries(
        recipeListInvalidation("approved", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Approval notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/** Rejects a pending recipe, excluding it from public view. */
export function useRejectRecipe() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectRecipe(id)
        : actor.rejectRecipeForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        recipeListInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Rejection notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/** Publishes a recipe directly as approved (steward-only add flow). */
export function usePublishRecipe() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitRecipeInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.publishRecipe(
            input.title,
            input.shortDescription,
            input.originatingPersonId,
            input.relatedPersonIds,
            input.era,
            input.year,
            input.location,
            input.familyBranch,
            input.ingredients,
            input.instructions,
            input.familyStory,
            input.tags,
            input.privacyLevel,
            input.evidenceStatus,
            input.linkedMediaIds,
          )
        : actor.publishRecipeForFamily(
            familyScopedId,
            input.title,
            input.shortDescription,
            input.originatingPersonId,
            input.relatedPersonIds,
            input.era,
            input.year,
            input.location,
            input.familyBranch,
            input.ingredients,
            input.instructions,
            input.familyStory,
            input.tags,
            input.privacyLevel,
            input.evidenceStatus,
            input.linkedMediaIds,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        recipeListInvalidation("approved", familyScopedId),
      );
    },
  });
}

import { createActor } from "@/backend";
import type { EvidenceStatus, PrivacyLevel } from "@/types/recipes";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/** Lists approved (publicly visible) family recipes. */
export function useApprovedRecipes() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["recipes", "approved"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listApprovedRecipes();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists recipes pending steward review (steward-only). */
export function usePendingRecipes() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["recipes", "pending"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPendingRecipes();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Fetches a single recipe by id. */
export function useRecipe(id: bigint) {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["recipes", "detail", id.toString()],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getRecipe(id);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists approved recipes linked to a specific family member. */
export function useRecipesForPerson(personId: string) {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["recipes", "person", personId],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listRecipesForPerson(personId);
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
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitRecipeInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.submitRecipe(
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
      void queryClient.invalidateQueries({ queryKey: ["recipes", "pending"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Approves a pending recipe, making it publicly visible. */
export function useApproveRecipe() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveRecipe(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["recipes", "approved"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Approval notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Rejects a pending recipe, excluding it from public view. */
export function useRejectRecipe() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectRecipe(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["recipes", "pending"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Rejection notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Publishes a recipe directly as approved (steward-only add flow). */
export function usePublishRecipe() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitRecipeInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.publishRecipe(
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
      void queryClient.invalidateQueries({ queryKey: ["recipes", "approved"] });
    },
  });
}

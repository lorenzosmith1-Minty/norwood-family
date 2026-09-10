import { createActor } from "@/backend";
import type {
  EvidenceStatus,
  MysteryContributionType,
  MysteryStatus,
} from "@/types/family-history";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/** Lists approved (publicly visible) family stories. */
export function useApprovedStories() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "stories", "approved"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listApprovedStories();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists stories pending steward review (steward-only). */
export function usePendingStories() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "stories", "pending"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPendingStories();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export interface SubmitStoryInput {
  title: string;
  storyText: string;
  relatedMemberIds: string[];
  era: string | null;
  year: bigint | null;
  location: string | null;
  evidenceStatus: EvidenceStatus;
  relatedArchiveItemIds: bigint[];
}

/** Submits a new story in a pending state awaiting steward approval. */
export function useSubmitStory() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitStoryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.submitStory(
        input.title,
        input.storyText,
        input.relatedMemberIds,
        input.era,
        input.year,
        input.location,
        input.evidenceStatus,
        input.relatedArchiveItemIds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "stories", "pending"],
      });
    },
  });
}

/** Approves a pending story, making it publicly visible. */
export function useApproveStory() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.approveStory(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "stories", "pending"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "stories", "approved"],
      });
    },
  });
}

/** Rejects a pending story, excluding it from public view. */
export function useRejectStory() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.rejectStory(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "stories", "pending"],
      });
    },
  });
}

/** Creates a canonical story directly (steward-only). */
export function useAddCanonicalStory() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitStoryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.addCanonicalStory(
        input.title,
        input.storyText,
        input.relatedMemberIds,
        input.era,
        input.year,
        input.location,
        input.evidenceStatus,
        input.relatedArchiveItemIds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "stories", "approved"],
      });
    },
  });
}

export interface UpdateStoryInput extends SubmitStoryInput {
  id: bigint;
}

/** Updates a canonical story (steward-only). */
export function useUpdateCanonicalStory() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateStoryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateCanonicalStory(
        input.id,
        input.title,
        input.storyText,
        input.relatedMemberIds,
        input.era,
        input.year,
        input.location,
        input.evidenceStatus,
        input.relatedArchiveItemIds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "stories", "approved"],
      });
    },
  });
}

/** Lists all family mysteries. */
export function useMysteries() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "mysteries"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listMysteries();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export interface SubmitMysteryContributionInput {
  mysteryId: bigint;
  contributionType: MysteryContributionType;
  text: string;
}

/** Submits a contribution to a mystery (note, memory, lead, or source). */
export function useSubmitMysteryContribution() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitMysteryContributionInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.submitMysteryContribution(
        input.mysteryId,
        input.contributionType,
        input.text,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "mysteries", "contributions", "pending"],
      });
    },
  });
}

/** Lists mystery contributions pending steward review (steward-only). */
export function usePendingMysteryContributions() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "mysteries", "contributions", "pending"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listPendingMysteryContributions();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Reviews a pending mystery contribution (approve or reject). */
export function useReviewMysteryContribution() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: bigint; approve: boolean }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.reviewMysteryContribution(input.id, input.approve);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "mysteries", "contributions", "pending"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "mysteries"],
      });
    },
  });
}

export interface CreateCanonicalMysteryInput {
  title: string;
  description: string;
  relatedMemberIds: string[];
  relatedBranchId: string | null;
  knownFacts: string[];
  possibilities: string[];
  relatedSourceIds: bigint[];
  relatedArchiveItemIds: bigint[];
  status: MysteryStatus;
}

/** Creates a canonical mystery directly (steward-only). */
export function useCreateCanonicalMystery() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCanonicalMysteryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createCanonicalMystery(
        input.title,
        input.description,
        input.relatedMemberIds,
        input.relatedBranchId,
        input.knownFacts,
        input.possibilities,
        input.relatedSourceIds,
        input.relatedArchiveItemIds,
        input.status,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "mysteries"],
      });
    },
  });
}

export interface UpdateCanonicalMysteryInput
  extends CreateCanonicalMysteryInput {
  id: bigint;
}

/** Updates a canonical mystery (steward-only). */
export function useUpdateCanonicalMystery() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCanonicalMysteryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateCanonicalMystery(
        input.id,
        input.title,
        input.description,
        input.relatedMemberIds,
        input.relatedBranchId,
        input.knownFacts,
        input.possibilities,
        input.relatedSourceIds,
        input.relatedArchiveItemIds,
        input.status,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "mysteries"],
      });
    },
  });
}

export interface MarkMysteryResolvedInput {
  id: bigint;
  summary: string;
  supportingEvidence: string[];
}

/** Marks a mystery resolved, preserving the research trail. */
export function useMarkMysteryResolved() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkMysteryResolvedInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markMysteryResolved(
        input.id,
        input.summary,
        input.supportingEvidence,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["familyHistory", "mysteries"],
      });
    },
  });
}

/** Lists the aggregated Travel Through Time timeline events. */
export function useTimelineEvents() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "timeline"],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listTimelineEvents();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

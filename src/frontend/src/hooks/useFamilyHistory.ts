import { createActor } from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import type {
  EvidenceStatus,
  MysteryContributionType,
  MysteryStatus,
} from "@/types/family-history";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/**
 * React Query hooks for Family Stories, Mysteries, and the Timeline.
 *
 * The Story READ and MUTATION hooks are family-aware, following the useBoard /
 * useMessaging / useRecipes pattern: the active family is read from the
 * centralized FamilyContext and `familyScopedId` is `undefined` for the default
 * family. The default family keeps the exact legacy no-argument call shape and
 * React Query key, while a non-default family routes to the canonical
 * `*ForFamily` endpoint with the familyId appended to the key so caches never
 * collide across families.
 *
 * Story mutations invalidate family-separated Story caches. The default family
 * keeps the exact legacy bare-prefix invalidation; a non-default family keeps
 * the same bare prefix (so the recorded filter is unchanged) but adds a
 * predicate that admits only the active family's family-appended key, so a
 * mutation in one family never marks another family's Story cache stale.
 *
 * Mysteries and the Timeline are intentionally left on the legacy endpoints in
 * this task; their family wiring is deferred.
 */

/**
 * Builds the React Query invalidation filter for a Story cache.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["familyHistory", "stories", kind]` filter would also match
 * `["familyHistory", "stories", kind, <otherFamily>]` and mark another family's
 * cache stale. The default family keeps the exact legacy bare-prefix filter; a
 * non-default family keeps the same bare prefix but narrows it with a predicate
 * that admits only the active family's key.
 *
 * The Story detail key is `["familyHistory", "stories", "detail", id, familyId]`
 * (familyId at index 4), so it uses its own predicate index.
 */
function storyInvalidation(
  kind: "pending" | "approved" | "detail",
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["familyHistory", "stories", kind] };
  }
  const familyIndex = kind === "detail" ? 4 : 3;
  return {
    queryKey: ["familyHistory", "stories", kind],
    predicate: (query) => query.queryKey[familyIndex] === familyScopedId,
  };
}

/** Lists approved (publicly visible) family stories. */
export function useApprovedStories() {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["familyHistory", "stories", "approved"]
        : ["familyHistory", "stories", "approved", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listApprovedStories()
        : actor.listApprovedStoriesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists stories pending steward review (steward-only). */
export function usePendingStories() {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["familyHistory", "stories", "pending"]
        : ["familyHistory", "stories", "pending", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listPendingStories()
        : actor.listPendingStoriesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Fetches a single story by id within the active family.
 *
 * There is no legacy unscoped Story detail endpoint in the generated bindings —
 * only `getStoryForFamily` — so the detail read always passes the active family
 * id explicitly (including the default family). The family id is part of the
 * cache key, so Family A and Family B never share a Story detail cache entry.
 */
export function useStory(id: bigint) {
  const familyId = useActiveFamilyId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "stories", "detail", id.toString(), familyId],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getStoryForFamily(familyId, id);
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
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitStoryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.submitStory(
            input.title,
            input.storyText,
            input.relatedMemberIds,
            input.era,
            input.year,
            input.location,
            input.evidenceStatus,
            input.relatedArchiveItemIds,
          )
        : actor.submitStoryForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries(
        storyInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Approves a pending story, making it publicly visible. */
export function useApproveStory() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveStory(id)
        : actor.approveStoryForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        storyInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries(
        storyInvalidation("approved", familyScopedId),
      );
      void queryClient.invalidateQueries(
        storyInvalidation("detail", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Approval notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Rejects a pending story, excluding it from public view. */
export function useRejectStory() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectStory(id)
        : actor.rejectStoryForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        storyInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries(
        storyInvalidation("detail", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Rejection notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Creates a canonical story directly (steward-only). */
export function useAddCanonicalStory() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitStoryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.addCanonicalStory(
            input.title,
            input.storyText,
            input.relatedMemberIds,
            input.era,
            input.year,
            input.location,
            input.evidenceStatus,
            input.relatedArchiveItemIds,
          )
        : actor.addCanonicalStoryForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries(
        storyInvalidation("approved", familyScopedId),
      );
    },
  });
}

export interface UpdateStoryInput extends SubmitStoryInput {
  id: bigint;
}

/** Updates a canonical story (steward-only). */
export function useUpdateCanonicalStory() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateStoryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.updateCanonicalStory(
            input.id,
            input.title,
            input.storyText,
            input.relatedMemberIds,
            input.era,
            input.year,
            input.location,
            input.evidenceStatus,
            input.relatedArchiveItemIds,
          )
        : actor.updateCanonicalStoryForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries(
        storyInvalidation("approved", familyScopedId),
      );
      void queryClient.invalidateQueries(
        storyInvalidation("detail", familyScopedId),
      );
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
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
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
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Reviewing a contribution notifies the contributor, so the unread badge
      // must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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

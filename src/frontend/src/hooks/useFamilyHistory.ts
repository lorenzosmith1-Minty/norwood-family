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
 * The Mystery READ hooks and the Timeline read hook are family-aware in the
 * same way: the active family is read from the centralized FamilyContext and
 * `familyScopedId` is `undefined` for the default family. The default family
 * keeps the exact legacy no-argument call shape and React Query key, while a
 * non-default family routes to the canonical `*ForFamily` endpoint with the
 * familyId appended to the key so caches never collide across families.
 *
 * The Mystery MUTATION hooks are family-aware in the same way: the active
 * family is read from the centralized FamilyContext and `familyScopedId` is
 * `undefined` for the default family. The default family keeps the exact legacy
 * no-familyId mutation call and legacy invalidation keys, while a non-default
 * family routes to the canonical `*ForFamily` mutation with the familyId as the
 * FIRST argument. Mystery mutations invalidate family-separated Mystery caches
 * through `mysteryInvalidation`, so a mutation in one family never marks
 * another family's Mystery cache stale.
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

/**
 * Builds the React Query invalidation filter for a Mystery cache.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["familyHistory", "mysteries"]` filter would also match
 * `["familyHistory", "mysteries", <otherFamily>]` and mark another family's
 * cache stale. The default family keeps the exact legacy bare-prefix filter; a
 * non-default family keeps the same bare prefix but narrows it with a predicate
 * that admits only the active family's key.
 *
 * The family id sits at a different index per Mystery cache key:
 * - list: `["familyHistory", "mysteries", familyId]` (index 2)
 * - detail: `["familyHistory", "mysteries", "detail", id, familyId]` (index 4)
 * - contributions: `["familyHistory", "mysteries", "contributions", mysteryId,
 *   familyId]` (index 4)
 * - pending contributions: `["familyHistory", "mysteries", "contributions",
 *   "pending", familyId]` (index 4)
 * - timeline: `["familyHistory", "timeline", familyId]` (index 2)
 */
function mysteryInvalidation(
  kind: "list" | "detail" | "contributions" | "pending" | "timeline",
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    switch (kind) {
      case "list":
        return { queryKey: ["familyHistory", "mysteries"] };
      case "detail":
        return { queryKey: ["familyHistory", "mysteries", "detail"] };
      case "contributions":
        return { queryKey: ["familyHistory", "mysteries", "contributions"] };
      case "pending":
        return {
          queryKey: ["familyHistory", "mysteries", "contributions", "pending"],
        };
      case "timeline":
        return { queryKey: ["familyHistory", "timeline"] };
    }
  }
  switch (kind) {
    case "list":
      return {
        queryKey: ["familyHistory", "mysteries"],
        predicate: (query) => query.queryKey[2] === familyScopedId,
      };
    case "detail":
      return {
        queryKey: ["familyHistory", "mysteries", "detail"],
        predicate: (query) => query.queryKey[4] === familyScopedId,
      };
    case "contributions":
      return {
        queryKey: ["familyHistory", "mysteries", "contributions"],
        predicate: (query) => query.queryKey[4] === familyScopedId,
      };
    case "pending":
      return {
        queryKey: ["familyHistory", "mysteries", "contributions", "pending"],
        predicate: (query) => query.queryKey[4] === familyScopedId,
      };
    case "timeline":
      return {
        queryKey: ["familyHistory", "timeline"],
        predicate: (query) => query.queryKey[2] === familyScopedId,
      };
  }
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
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["familyHistory", "mysteries"]
        : ["familyHistory", "mysteries", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listMysteries()
        : actor.listMysteriesForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Fetches a single mystery by id within the active family.
 *
 * There is no legacy unscoped Mystery detail endpoint in the generated
 * bindings — only `getMysteryForFamily` — so the detail read always passes the
 * active family id explicitly (including the default family). The family id is
 * part of the cache key, so Family A and Family B never share a Mystery detail
 * cache entry.
 */
export function useMystery(id: bigint) {
  const familyId = useActiveFamilyId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["familyHistory", "mysteries", "detail", id.toString(), familyId],
    queryFn: async () => {
      if (!actor) return null;
      return actor.getMysteryForFamily(familyId, id);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Lists the contributions attached to a single mystery within the active
 * family.
 *
 * There is no legacy unscoped contribution-list endpoint in the generated
 * bindings — only `listMysteryContributionsForFamily` — so the read always
 * passes the active family id explicitly (including the default family). The
 * family id is part of the cache key so contributions never leak across
 * families.
 */
export function useMysteryContributions(mysteryId: bigint) {
  const familyId = useActiveFamilyId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      "familyHistory",
      "mysteries",
      "contributions",
      mysteryId.toString(),
      familyId,
    ],
    queryFn: async () => {
      if (!actor) return [];
      return actor.listMysteryContributionsForFamily(familyId, mysteryId);
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
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitMysteryContributionInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.submitMysteryContribution(
            input.mysteryId,
            input.contributionType,
            input.text,
          )
        : actor.submitMysteryContributionForFamily(
            familyScopedId,
            input.mysteryId,
            input.contributionType,
            input.text,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        mysteryInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Lists mystery contributions pending steward review (steward-only). */
export function usePendingMysteryContributions() {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["familyHistory", "mysteries", "contributions", "pending"]
        : [
            "familyHistory",
            "mysteries",
            "contributions",
            "pending",
            familyScopedId,
          ],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listPendingMysteryContributions()
        : actor.listPendingMysteryContributionsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Reviews a pending mystery contribution (approve or reject). */
export function useReviewMysteryContribution() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: bigint; approve: boolean }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.reviewMysteryContribution(input.id, input.approve)
        : actor.reviewMysteryContributionForFamily(
            familyScopedId,
            input.id,
            input.approve,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        mysteryInvalidation("pending", familyScopedId),
      );
      void queryClient.invalidateQueries(
        mysteryInvalidation("list", familyScopedId),
      );
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
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateCanonicalMysteryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.createCanonicalMystery(
            input.title,
            input.description,
            input.relatedMemberIds,
            input.relatedBranchId,
            input.knownFacts,
            input.possibilities,
            input.relatedSourceIds,
            input.relatedArchiveItemIds,
            input.status,
          )
        : actor.createCanonicalMysteryForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries(
        mysteryInvalidation("list", familyScopedId),
      );
    },
  });
}

export interface UpdateCanonicalMysteryInput
  extends CreateCanonicalMysteryInput {
  id: bigint;
}

/** Updates a canonical mystery (steward-only). */
export function useUpdateCanonicalMystery() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateCanonicalMysteryInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.updateCanonicalMystery(
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
          )
        : actor.updateCanonicalMysteryForFamily(
            familyScopedId,
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
      void queryClient.invalidateQueries(
        mysteryInvalidation("list", familyScopedId),
      );
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
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: MarkMysteryResolvedInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.markMysteryResolved(
            input.id,
            input.summary,
            input.supportingEvidence,
          )
        : actor.markMysteryResolvedForFamily(
            familyScopedId,
            input.id,
            input.summary,
            input.supportingEvidence,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        mysteryInvalidation("list", familyScopedId),
      );
    },
  });
}

/** Lists the aggregated Travel Through Time timeline events. */
export function useTimelineEvents() {
  const familyScopedId = useFamilyScopedId();
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["familyHistory", "timeline"]
        : ["familyHistory", "timeline", familyScopedId],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listTimelineEvents()
        : actor.listTimelineEventsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

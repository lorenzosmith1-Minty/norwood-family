import { createActor } from "@/backend";
import { useFamilyScopedId } from "@/context/FamilyContext";
import type {
  ArchiveItem,
  ArchiveItemClassification,
  ArchiveItemType,
  ArchiveSearchFilter,
  OralHistorySpeaker,
  PrivacyLevel,
  SourceStatus,
} from "@/types/archive";
import { getMediaKind } from "@/types/archive";
import { useActor } from "@caffeineai/core-infrastructure";
import type { ExternalBlob } from "@caffeineai/object-storage";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/**
 * The active family is read from the centralized FamilyContext. `familyScopedId`
 * is `undefined` for the default family, which the backend's legacy endpoints
 * already resolve, and the explicit family id otherwise. Every Archive hook
 * passes this value straight through: the default family keeps the exact legacy
 * no-argument call shape and React Query key, while a non-default family routes
 * to the canonical `*ForFamily` endpoint with the familyId included in the key
 * so caches never collide across families.
 */

/** True when the signed-in caller is an admin (used to gate the admin nav link). */
export function useIsAdmin() {
  const providersPresent = useProvidersPresent();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["isAdmin"],
    queryFn: async () => {
      if (!actor) return false;
      return actor.isCallerAdmin();
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists pending contributions awaiting admin approval. */
export function usePendingArchiveItems() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["archive", "pending", familyScopedId ?? ""],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listPendingArchiveItems()
        : actor.listPendingArchiveItemsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/** Lists approved archive items that are part of the archive. */
export function useApprovedArchiveItems() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["archive", "approved", familyScopedId ?? ""],
    queryFn: async () => {
      if (!actor) return [];
      return familyScopedId === undefined
        ? actor.listApprovedArchiveItems()
        : actor.listApprovedArchiveItemsForFamily(familyScopedId);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Lists approved media items (uploaded video, oral-history video, and
 * audio-only oral history) for the Family Videos & Oral History page. Plain
 * audio and non-media archive items are excluded.
 */
export function useApprovedMediaItems() {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["archive", "approved", "media", familyScopedId ?? ""],
    queryFn: async () => {
      if (!actor) return [];
      const items =
        familyScopedId === undefined
          ? await actor.listApprovedArchiveItems()
          : await actor.listApprovedArchiveItemsForFamily(familyScopedId);
      return items.filter((item) => getMediaKind(item) !== null);
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

/**
 * Searches/filters approved archive items by title query, tags, item type,
 * related family member, and era. Returns only approved items. The filter is
 * serialized into the query key so a change to any field refetches.
 */
export function useSearchArchiveItems(filter: ArchiveSearchFilter) {
  const providersPresent = useProvidersPresent();
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      "archive",
      "search",
      familyScopedId ?? "",
      filter.query ?? "",
      filter.tags.join(","),
      filter.itemType ?? "",
      filter.relatedMemberId ?? "",
      filter.era ?? "",
    ],
    queryFn: async () => {
      if (!actor) return [] as ArchiveItem[];
      if (familyScopedId === undefined) {
        return actor.searchArchiveItems({
          searchTerm: filter.query ?? undefined,
          tags: filter.tags,
          itemType: filter.itemType ?? undefined,
          relatedMemberId: filter.relatedMemberId ?? undefined,
          era: filter.era ?? undefined,
        });
      }
      return actor.searchArchiveItemsForFamily(familyScopedId, {
        familyId: familyScopedId,
        searchTerm: filter.query ?? undefined,
        tags: filter.tags,
        itemType: filter.itemType ?? undefined,
        relatedMemberId: filter.relatedMemberId ?? undefined,
        era: filter.era ?? undefined,
      });
    },
    enabled: providersPresent && !!actor && !isFetching,
  });
}

export interface SubmitArchiveItemInput {
  title: string;
  description: string;
  itemType: ArchiveItemType;
  /** The declared MIME type of the uploaded file. */
  mimeType: string;
  blob: ExternalBlob;
  /**
   * The sanitized original filename of the uploaded file. Persisted on the
   * ArchiveItem record so the detail view can resolve the preview type and the
   * download name without relying on ExternalBlob metadata.
   */
  filename: string;
  era: string;
  year: bigint | null;
  tags: string[];
  relatedMemberIds: string[];
  relatedBranchId: string | null;
  sourceStatus: SourceStatus;
  privacyLevel: PrivacyLevel;
  /** Whether the item is classified as oral history (or a standard item). */
  classification: ArchiveItemClassification;
  /** The single primary speaker, required for oral-history items. */
  primarySpeaker: OralHistorySpeaker | null;
}

/** Submits a new contribution in a pending state awaiting admin approval. */
export function useSubmitArchiveItem() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: SubmitArchiveItemInput) => {
      if (!actor) throw new Error("Backend is not ready");
      if (familyScopedId === undefined) {
        return actor.submitArchiveItem(
          input.title,
          input.description,
          input.itemType,
          input.mimeType,
          input.blob,
          input.era,
          input.year,
          input.tags,
          input.relatedMemberIds,
          input.relatedBranchId,
          input.sourceStatus,
          input.privacyLevel,
          input.classification,
          input.primarySpeaker,
          input.filename,
        );
      }
      return actor.submitArchiveItemForFamily(
        familyScopedId,
        input.title,
        input.description,
        input.itemType,
        input.mimeType,
        input.blob,
        input.era,
        input.year,
        input.tags,
        input.relatedMemberIds,
        input.relatedBranchId,
        input.sourceStatus,
        input.privacyLevel,
        input.classification,
        input.primarySpeaker,
        input.filename,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["archive", "approved"] });
      void queryClient.invalidateQueries({
        queryKey: ["archive", "approved", "media"],
      });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
    },
  });
}

/** Approves a pending contribution, moving it into the archive. */
export function useApproveArchiveItem() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.approveArchiveItem(id)
        : actor.approveArchiveItemForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["archive", "approved"] });
      // Approving media makes it visible in the Family Videos & Oral History
      // view, so the approved-media list must refresh immediately.
      void queryClient.invalidateQueries({
        queryKey: ["archive", "approved", "media"],
      });
      // Approved media may link to a member's profile/photo state, so refresh
      // the linked profile-photo keys (the mutation only carries the item id,
      // so the photo prefixes are invalidated to cover every linked member).
      void queryClient.invalidateQueries({ queryKey: ["photos"] });
      void queryClient.invalidateQueries({ queryKey: ["profilePhoto"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Approval notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Rejects a pending contribution, excluding it from the archive. */
export function useRejectArchiveItem() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.rejectArchiveItem(id)
        : actor.rejectArchiveItemForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
      // Rejection notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

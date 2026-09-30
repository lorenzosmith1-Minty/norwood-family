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
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";
import { pendingContributionsCountInvalidation } from "./usePendingCount";
import { useProvidersPresent } from "./usePhotoStorage";

export { useProvidersPresent };

/**
 * Family-aware React Query invalidation filters for the Archive caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["archive", "pending"]` filter would also match
 * `["archive", "pending", <otherFamily>]` and mark another family's Archive
 * cache stale. These helpers follow the exact precedent of
 * `pendingContributionsCountInvalidation` in `usePendingCount.ts`: both
 * branches are family-exact.
 *
 * The Archive query keys carry the family id at index 2:
 * `["archive", "pending", familyScopedId ?? ""]`,
 * `["archive", "approved", familyScopedId ?? ""]`,
 * `["archive", "approved", "media", familyScopedId ?? ""]`, and
 * `["archive", "search", familyScopedId ?? "", ...]`.
 *
 * - The default family (`familyScopedId` undefined) targets only the exact
 *   read key with the empty-string family slot, so no bare prefix is used.
 * - A non-default family keeps the bare prefix (so the recorded filter shape is
 *   unchanged) but narrows it with a predicate that admits only the active
 *   family's keys.
 *
 * The active family id is always the centralized `useFamilyScopedId()` value;
 * no family id is hard-coded here.
 */

/** Invalidation filter for the pending Archive items cache of the active family. */
export function pendingArchiveItemsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["archive", "pending", ""] };
  }
  return {
    queryKey: ["archive", "pending"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/** Invalidation filter for the approved Archive items cache of the active family. */
export function approvedArchiveItemsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["archive", "approved", ""] };
  }
  return {
    queryKey: ["archive", "approved"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/** Invalidation filter for the approved Archive media cache of the active family. */
export function approvedArchiveMediaInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["archive", "approved", "media", ""] };
  }
  return {
    queryKey: ["archive", "approved", "media"],
    predicate: (query) => query.queryKey[3] === familyScopedId,
  };
}

/** Invalidation filter for the Archive search/list cache of the active family. */
export function archiveSearchInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["archive", "search"],
      predicate: (query) => query.queryKey[2] === "",
    };
  }
  return {
    queryKey: ["archive", "search"],
    predicate: (query) => query.queryKey[2] === familyScopedId,
  };
}

/**
 * Invalidation filter for a person's photo caches, respecting the existing
 * photo key shapes built by `photoQueryKey` in `usePhotoStorage.ts`:
 * `["photos", familyId, personId]` / `["profilePhoto", familyId, personId]` for
 * a non-default family, and `["photos", personId]` / `["profilePhoto", personId]`
 * for the default family.
 *
 * When `personId` is known, only that person's cache in the active family is
 * invalidated. When it is not, the filter is scoped to the active family's
 * photo caches without touching another family's.
 */
export function archivePhotoInvalidation(
  prefix: "photos" | "profilePhoto",
  familyScopedId: string | undefined,
  personId?: string,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    // The default family's photo keys omit the family id: `[prefix, personId]`.
    // When the affected personId is known, the exact two-element key
    // `[prefix, personId]` is already family-exact: React Query matches by key
    // PREFIX, and a two-element key can never match a three-element non-default
    // key `[prefix, familyId, personId]`, so no other family's photo cache is
    // touched.
    if (personId !== undefined) {
      return { queryKey: [prefix, personId] };
    }
    // When the personId is not known, keep the `[prefix]` prefix but narrow with
    // a predicate that admits ONLY the two-element default-family shape
    // (`queryKey.length === 2`), which excludes every three-element non-default
    // key so another family's photo caches are never marked stale.
    return {
      queryKey: [prefix],
      predicate: (query) => query.queryKey.length === 2,
    };
  }
  return {
    queryKey: [prefix],
    predicate: (query) =>
      query.queryKey[1] === familyScopedId &&
      (personId === undefined || query.queryKey[2] === personId),
  };
}

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
      void queryClient.invalidateQueries(
        pendingArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        approvedArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        approvedArchiveMediaInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        archiveSearchInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
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
      void queryClient.invalidateQueries(
        pendingArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        approvedArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        archiveSearchInvalidation(familyScopedId),
      );
      // Approving media makes it visible in the Family Videos & Oral History
      // view, so the approved-media list must refresh immediately.
      void queryClient.invalidateQueries(
        approvedArchiveMediaInvalidation(familyScopedId),
      );
      // Approved media may link to a member's profile/photo state, so refresh
      // the linked profile-photo keys. The mutation only carries the item id,
      // so the photo prefixes are invalidated for the active family only —
      // never another family's photo caches.
      void queryClient.invalidateQueries(
        archivePhotoInvalidation("photos", familyScopedId),
      );
      void queryClient.invalidateQueries(
        archivePhotoInvalidation("profilePhoto", familyScopedId),
      );
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
      // Approval notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
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
      void queryClient.invalidateQueries(
        pendingArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
      // Rejection notifies the contributor, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

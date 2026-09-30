import { createActor } from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import type {
  BoardMediaUpload,
  Post,
  PostTag,
  PostType,
  Reply,
} from "@/types/board";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  approvedArchiveItemsInvalidation,
  pendingArchiveItemsInvalidation,
} from "./useArchiveStorage";
import { notificationInvalidation } from "./useNotifications";
import { pendingContributionsCountInvalidation } from "./usePendingCount";

/**
 * React Query hooks for the Family Message Board, following the existing
 * useActor(createActor) + useQuery/useMutation pattern. Board posts are
 * Family-Only and authored by approved family members; replies are one-level
 * and shown chronologically under each post.
 *
 * Every hook is family-aware, following the useArchiveStorage /
 * useResearchIntake pattern: the active family is read from the centralized
 * FamilyContext and `familyScopedId` is `undefined` for the default family.
 * The default family keeps the exact legacy no-argument call shape and React
 * Query key, while a non-default family routes to the canonical `*ForFamily`
 * endpoint with the familyId included in the key so caches never collide
 * across families. Mutations invalidate through the family-exact helpers below.
 */

/**
 * Family-aware React Query invalidation filters for the Board caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["board", "posts"]` filter would also match
 * `["board", "posts", <filter>, <otherFamily>]` and mark another family's
 * Board cache stale. These helpers follow the exact precedent of
 * `pendingContributionsCountInvalidation` in `usePendingCount.ts`, the Archive
 * helpers in `useArchiveStorage.ts`, and the Research helpers in
 * `useResearchIntake.ts`: both branches are family-exact.
 *
 * The Board read keys carry the family id at the LAST index:
 * `["board", "posts", filter]` / `["board", "posts", filter, familyScopedId]`,
 * `["board", "post", id]` / `["board", "post", id, familyScopedId]`,
 * `["board", "replies", id]` / `["board", "replies", id, familyScopedId]`,
 * `["board", "posts", "tags", tags]` /
 * `["board", "posts", "tags", tags, familyScopedId]`, and
 * `["board", "posts", "hidden"]` /
 * `["board", "posts", "hidden", familyScopedId]`.
 *
 * The default family's read key omits the family slot entirely, which is a
 * PREFIX of every non-default key for the same cache. A bare exact-key filter
 * would therefore still mark another family's cache stale, so the default
 * branch keeps the exact key but narrows it with a predicate that admits only
 * the default shape (a `queryKey.length` check). This mirrors the
 * `researchSourcesInvalidation` default branch in `useResearchIntake.ts`.
 *
 * - The default family (`familyScopedId` undefined) targets only the exact
 *   default read key, so no non-default family's key can match.
 * - A non-default family keeps the bare prefix (so the recorded filter shape is
 *   unchanged) but narrows it with a predicate that admits only the active
 *   family's keys.
 *
 * The active family id is always the centralized `useFamilyScopedId()` value;
 * no family id is hard-coded here.
 */

/**
 * Invalidation filter for the Board post-list caches of the active family.
 *
 * The `["board", "posts"]` prefix also matches the tag-search keys
 * (`["board", "posts", "tags", ...]`) and the hidden keys
 * (`["board", "posts", "hidden", ...]`), which have their own helpers, so the
 * predicate excludes index 2 === "tags" and index 2 === "hidden".
 */
export function boardPostListsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["board", "posts"],
      predicate: (query) =>
        query.queryKey.length === 3 &&
        query.queryKey[2] !== "tags" &&
        query.queryKey[2] !== "hidden",
    };
  }
  return {
    queryKey: ["board", "posts"],
    predicate: (query) =>
      query.queryKey.length === 4 &&
      query.queryKey[2] !== "tags" &&
      query.queryKey[2] !== "hidden" &&
      query.queryKey[3] === familyScopedId,
  };
}

/** Invalidation filter for the single Board post-detail cache of the active family. */
export function boardPostDetailInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["board", "post"],
      predicate: (query) => query.queryKey.length === 3,
    };
  }
  return {
    queryKey: ["board", "post"],
    predicate: (query) =>
      query.queryKey.length === 4 && query.queryKey[3] === familyScopedId,
  };
}

/** Invalidation filter for the Board replies caches of the active family. */
export function boardRepliesInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["board", "replies"],
      predicate: (query) => query.queryKey.length === 3,
    };
  }
  return {
    queryKey: ["board", "replies"],
    predicate: (query) =>
      query.queryKey.length === 4 && query.queryKey[3] === familyScopedId,
  };
}

/** Invalidation filter for the Board tag-search caches of the active family. */
export function boardTagSearchInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["board", "posts", "tags"],
      predicate: (query) => query.queryKey.length === 4,
    };
  }
  return {
    queryKey: ["board", "posts", "tags"],
    predicate: (query) =>
      query.queryKey.length === 5 && query.queryKey[4] === familyScopedId,
  };
}

/** Invalidation filter for the hidden / moderated Board post caches of the active family. */
export function boardHiddenPostsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return {
      queryKey: ["board", "posts", "hidden"],
      predicate: (query) => query.queryKey.length === 3,
    };
  }
  return {
    queryKey: ["board", "posts", "hidden"],
    predicate: (query) =>
      query.queryKey.length === 4 && query.queryKey[3] === familyScopedId,
  };
}

/** Lists board posts, newest first, optionally filtered by post type. */
export function useListBoardPosts(filter: PostType | null = null) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["board", "posts", filter ?? "all"]
        : ["board", "posts", filter ?? "all", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Post[];
      return familyScopedId === undefined
        ? actor.listBoardPosts(filter)
        : actor.listBoardPostsForFamily(familyScopedId, filter);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a single board post by id. */
export function useGetBoardPost(postId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["board", "post", postId?.toString() ?? "all"]
        : ["board", "post", postId?.toString() ?? "all", familyScopedId],
    queryFn: async () => {
      if (!actor || postId === null) return null;
      return familyScopedId === undefined
        ? actor.getBoardPost(postId)
        : actor.getBoardPostForFamily(familyScopedId, postId);
    },
    enabled: !!actor && !isFetching && postId !== null,
  });
}

/** Lists the one-level replies to a board post, chronologically. */
export function useListBoardReplies(postId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["board", "replies", postId?.toString() ?? "all"]
        : ["board", "replies", postId?.toString() ?? "all", familyScopedId],
    queryFn: async () => {
      if (!actor || postId === null) return [] as Reply[];
      return familyScopedId === undefined
        ? actor.listBoardReplies(postId)
        : actor.listBoardRepliesForFamily(familyScopedId, postId);
    },
    enabled: !!actor && !isFetching && postId !== null,
  });
}

export interface CreateBoardPostInput {
  postType: PostType;
  title: string | null;
  body: string;
  relatedPersonIds: string[];
  linkedMediaIds: bigint[];
  tags: PostTag[];
}

/** Creates a new board post. */
export function useCreateBoardPost() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBoardPostInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.createBoardPost(
            input.postType,
            input.title,
            input.body,
            input.relatedPersonIds,
            input.linkedMediaIds,
            input.tags,
          )
        : actor.createBoardPostForFamily(
            familyScopedId,
            input.postType,
            input.title,
            input.body,
            input.relatedPersonIds,
            input.linkedMediaIds,
            input.tags,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardPostListsInvalidation(familyScopedId),
      );
      // A new post notifies family members, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

export interface CreateBoardPostWithMediaInput {
  postType: PostType;
  title: string | null;
  body: string;
  relatedPersonIds: string[];
  existingArchiveItemIds: bigint[];
  newUploads: BoardMediaUpload[];
  tags: PostTag[];
}

/**
 * Creates a board post that attaches existing Archive items (by id) and/or new
 * uploads. Each new upload creates one canonical Archive item (pending) linked
 * to the post; the underlying file is never duplicated. Approved family members
 * only.
 */
export function useCreateBoardPostWithMedia() {
  const familyScopedId = useFamilyScopedId();
  const activeFamilyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBoardPostWithMediaInput) => {
      if (!actor) throw new Error("Backend is not ready");
      const uploads = input.newUploads.map((upload) => ({
        title: upload.title,
        description: upload.description,
        itemType: upload.itemType,
        mimeType: upload.mimeType,
        blob: upload.blob,
        filename: upload.filename,
        era: upload.era,
        year: upload.year ?? undefined,
        tags: upload.tags,
        relatedMemberIds: upload.relatedMemberIds,
        relatedBranchId: upload.relatedBranchId ?? undefined,
        sourceStatus: upload.sourceStatus,
        privacyLevel: upload.privacyLevel,
        classification: upload.classification,
        primarySpeaker: upload.primarySpeaker ?? undefined,
        // The active family is read from the centralized FamilyContext; the
        // default family resolves to the same value the legacy endpoint
        // delegates with, so no family id is hardcoded here.
        familyId: activeFamilyId,
      }));
      return familyScopedId === undefined
        ? actor.createBoardPostWithMedia(
            input.postType,
            input.title,
            input.body,
            input.relatedPersonIds,
            input.existingArchiveItemIds,
            uploads,
            input.tags,
          )
        : actor.createBoardPostWithMediaForFamily(
            familyScopedId,
            input.postType,
            input.title,
            input.body,
            input.relatedPersonIds,
            input.existingArchiveItemIds,
            uploads,
            input.tags,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardPostListsInvalidation(familyScopedId),
      );
      // New uploads create pending Archive items, so the pending/approved
      // archive lists must refresh for the active family only.
      void queryClient.invalidateQueries(
        pendingArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        approvedArchiveItemsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        pendingContributionsCountInvalidation(familyScopedId),
      );
      // A new post notifies family members, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

export interface UpdateBoardPostInput {
  postId: bigint;
  postType: PostType;
  title: string | null;
  body: string;
  relatedPersonIds: string[];
  linkedMediaIds: bigint[];
  tags: PostTag[];
}

/** Updates an existing board post (author-only). */
export function useUpdateBoardPost() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBoardPostInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.updateBoardPost(
            input.postId,
            input.postType,
            input.title,
            input.body,
            input.relatedPersonIds,
            input.linkedMediaIds,
            input.tags,
          )
        : actor.updateBoardPostForFamily(
            familyScopedId,
            input.postId,
            input.postType,
            input.title,
            input.body,
            input.relatedPersonIds,
            input.linkedMediaIds,
            input.tags,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardPostListsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        boardPostDetailInvalidation(familyScopedId),
      );
    },
  });
}

/** Archives a board post (author or steward). */
export function useArchiveBoardPost() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.archiveBoardPost(postId)
        : actor.archiveBoardPostForFamily(familyScopedId, postId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardPostListsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        boardPostDetailInvalidation(familyScopedId),
      );
      // Archiving hides a post, so the hidden/moderated review list must refresh.
      void queryClient.invalidateQueries(
        boardHiddenPostsInvalidation(familyScopedId),
      );
    },
  });
}

/** Restores an archived board post (steward-only). */
export function useRestoreBoardPost() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.restoreBoardPost(postId)
        : actor.restoreBoardPostForFamily(familyScopedId, postId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardPostListsInvalidation(familyScopedId),
      );
      void queryClient.invalidateQueries(
        boardPostDetailInvalidation(familyScopedId),
      );
      // Restoring removes a post from the hidden/moderated review list.
      void queryClient.invalidateQueries(
        boardHiddenPostsInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Searches board posts by tag. Returns every post carrying at least one of the
 * given tags. Used by the Board filter bar's tag search and the Hidden /
 * Moderated Posts review view.
 */
export function useSearchBoardPostsByTags(tags: PostTag[]) {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["board", "posts", "tags", tags]
        : ["board", "posts", "tags", tags, familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Post[];
      return familyScopedId === undefined
        ? actor.searchBoardPostsByTags(tags)
        : actor.searchBoardPostsByTagsForFamily(familyScopedId, tags);
    },
    enabled: !!actor && !isFetching && tags.length > 0,
  });
}

/**
 * Lists hidden / moderated board posts (steward-only). Hidden posts are
 * archived by a steward and surfaced here for review before restoring.
 */
export function useListHiddenBoardPosts() {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["board", "posts", "hidden"]
        : ["board", "posts", "hidden", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Post[];
      return familyScopedId === undefined
        ? actor.listHiddenBoardPosts()
        : actor.listHiddenBoardPostsForFamily(familyScopedId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Adds a one-level reply to a board post. */
export function useAddBoardReply() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: bigint; body: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.addBoardReply(input.postId, input.body)
        : actor.addBoardReplyForFamily(
            familyScopedId,
            input.postId,
            input.body,
          );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardRepliesInvalidation(familyScopedId),
      );
      // A reply notifies the post author, so the unread badge must refresh.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/** Removes a board reply (steward-only). */
export function useRemoveBoardReply() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (replyId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.removeBoardReply(replyId)
        : actor.removeBoardReplyForFamily(familyScopedId, replyId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        boardRepliesInvalidation(familyScopedId),
      );
    },
  });
}

export type { Post, PostTag, PostType, Reply };

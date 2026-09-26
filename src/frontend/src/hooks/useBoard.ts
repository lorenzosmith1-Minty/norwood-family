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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";

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
 * across families. Mutations invalidate the legacy query-key prefix, which
 * matches both branches.
 */

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
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
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
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      // New uploads create pending Archive items, so the pending/approved
      // archive lists must refresh.
      void queryClient.invalidateQueries({ queryKey: ["archive", "pending"] });
      void queryClient.invalidateQueries({ queryKey: ["archive", "approved"] });
      void queryClient.invalidateQueries({
        queryKey: ["pendingContributionsCount"],
      });
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
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["board", "post"] });
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
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["board", "post"] });
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
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["board", "post"] });
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
      void queryClient.invalidateQueries({ queryKey: ["board", "replies"] });
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
      void queryClient.invalidateQueries({ queryKey: ["board", "replies"] });
    },
  });
}

export type { Post, PostTag, PostType, Reply };

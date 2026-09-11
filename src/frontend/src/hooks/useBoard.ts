import { createActor } from "@/backend";
import type { Post, PostType, Reply } from "@/types/board";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * React Query hooks for the Family Message Board, following the existing
 * useActor(createActor) + useQuery/useMutation pattern. Board posts are
 * Family-Only and authored by approved family members; replies are one-level
 * and shown chronologically under each post.
 */

/** Lists board posts, newest first, optionally filtered by post type. */
export function useListBoardPosts(filter: PostType | null = null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["board", "posts", filter ?? "all"],
    queryFn: async () => {
      if (!actor) return [] as Post[];
      return actor.listBoardPosts(filter);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Fetches a single board post by id. */
export function useGetBoardPost(postId: bigint | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["board", "post", postId?.toString() ?? "all"],
    queryFn: async () => {
      if (!actor || postId === null) return null;
      return actor.getBoardPost(postId);
    },
    enabled: !!actor && !isFetching && postId !== null,
  });
}

/** Lists the one-level replies to a board post, chronologically. */
export function useListBoardReplies(postId: bigint | null) {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["board", "replies", postId?.toString() ?? "all"],
    queryFn: async () => {
      if (!actor || postId === null) return [] as Reply[];
      return actor.listBoardReplies(postId);
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
}

/** Creates a new board post. */
export function useCreateBoardPost() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBoardPostInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.createBoardPost(
        input.postType,
        input.title,
        input.body,
        input.relatedPersonIds,
        input.linkedMediaIds,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      // A new post notifies family members, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
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
}

/** Updates an existing board post (author-only). */
export function useUpdateBoardPost() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBoardPostInput) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.updateBoardPost(
        input.postId,
        input.postType,
        input.title,
        input.body,
        input.relatedPersonIds,
        input.linkedMediaIds,
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
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.archiveBoardPost(postId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["board", "post"] });
    },
  });
}

/** Restores an archived board post (steward-only). */
export function useRestoreBoardPost() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.restoreBoardPost(postId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", "posts"] });
      void queryClient.invalidateQueries({ queryKey: ["board", "post"] });
    },
  });
}

/** Adds a one-level reply to a board post. */
export function useAddBoardReply() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { postId: bigint; body: string }) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.addBoardReply(input.postId, input.body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", "replies"] });
      // A reply notifies the post author, so the unread badge must refresh.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/** Removes a board reply (steward-only). */
export function useRemoveBoardReply() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (replyId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.removeBoardReply(replyId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["board", "replies"] });
    },
  });
}

export type { Post, PostType, Reply };

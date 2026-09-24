import "@testing-library/jest-dom/vitest";
import {
  type Post,
  PostStatus,
  PostType,
  PrivacyScope,
  type Reply,
} from "@/backend";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useQueryClient } from "@tanstack/react-query";

import {
  useAddBoardReply,
  useArchiveBoardPost,
  useCreateBoardPost,
  useCreateBoardPostWithMedia,
  useGetBoardPost,
  useListBoardPosts,
  useListBoardReplies,
  useListHiddenBoardPosts,
  useRemoveBoardReply,
  useRestoreBoardPost,
  useSearchBoardPostsByTags,
  useUpdateBoardPost,
} from "./hooks/useBoard";

// ---------------------------------------------------------------------------
// Characterization baseline for the family-scoped Board change.
//
// The requested change gives BoardPost, BoardReply, and the Board media record
// a `familyId` field, adds canonical family-scoped `*ForFamily` endpoints, and
// keeps the existing no-familyId Board endpoints as thin TEMPORARY wrappers
// delegating to the canonical methods with DEFAULT_FAMILY_ID.
//
// The frontend Board surface is explicitly OUT of scope for this build (the
// frontend Board screens are not rewired to the family-scoped endpoints), so
// the frontend must keep calling the legacy no-familyId endpoints with exactly
// the argument shapes it uses today. This file freezes that FRONTEND half of
// the contract: the exact positional arguments each Board hook passes to the
// legacy endpoint, and the exact React Query keys the read hooks register.
//
// A refactor that family-qualifies a legacy Board method signature, inserts a
// familyId argument into a default-family call, or renames a Board query key
// fails here before it reaches a user.
//
// It deliberately does NOT freeze the absence of a `familyId` field on the
// Board records — adding one is exactly the change under way. The record
// fixtures below carry only the fields the hooks read, so a new field does not
// break them.
//
// The Board UI journeys (post creation with checkmark multi-select, replies,
// archive/restore, tags, hidden posts, post detail/edit) are already covered by
// BoardFeatureCover.test.tsx, BoardTagsAndHiddenCover.test.tsx, and
// BoardPostDetailCharacterize.test.tsx. This file covers the remaining
// hook-level call shapes and query keys the family-scoping change touches,
// mirroring ResearchFindingLegacyCallShapeCharacterize.test.tsx for the
// research family.
//
// The backend is a typed local actor mock, so this is component/integration
// coverage of the frontend consumer contract — it does not exercise the real
// canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listBoardPosts: unknown[][];
    searchBoardPostsByTags: unknown[][];
    getBoardPost: unknown[][];
    createBoardPost: unknown[][];
    updateBoardPost: unknown[][];
    archiveBoardPost: unknown[][];
    restoreBoardPost: unknown[][];
    listHiddenBoardPosts: unknown[][];
    listBoardReplies: unknown[][];
    addBoardReply: unknown[][];
    removeBoardReply: unknown[][];
    createBoardPostWithMedia: unknown[][];
  } = {
    listBoardPosts: [],
    searchBoardPostsByTags: [],
    getBoardPost: [],
    createBoardPost: [],
    updateBoardPost: [],
    archiveBoardPost: [],
    restoreBoardPost: [],
    listHiddenBoardPosts: [],
    listBoardReplies: [],
    addBoardReply: [],
    removeBoardReply: [],
    createBoardPostWithMedia: [],
  };

  const mockActor = {
    async listBoardPosts(...args: unknown[]): Promise<Post[]> {
      calls.listBoardPosts.push(args);
      return [];
    },
    async searchBoardPostsByTags(...args: unknown[]): Promise<Post[]> {
      calls.searchBoardPostsByTags.push(args);
      return [];
    },
    async getBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.getBoardPost.push(args);
      return null;
    },
    async createBoardPost(...args: unknown[]): Promise<Post> {
      calls.createBoardPost.push(args);
      return makePost();
    },
    async updateBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.updateBoardPost.push(args);
      return null;
    },
    async archiveBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.archiveBoardPost.push(args);
      return null;
    },
    async restoreBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.restoreBoardPost.push(args);
      return null;
    },
    async listHiddenBoardPosts(...args: unknown[]): Promise<Post[]> {
      calls.listHiddenBoardPosts.push(args);
      return [];
    },
    async listBoardReplies(...args: unknown[]): Promise<Reply[]> {
      calls.listBoardReplies.push(args);
      return [];
    },
    async addBoardReply(...args: unknown[]): Promise<Reply> {
      calls.addBoardReply.push(args);
      return makeReply();
    },
    async removeBoardReply(...args: unknown[]): Promise<Reply | null> {
      calls.removeBoardReply.push(args);
      return null;
    },
    async createBoardPostWithMedia(...args: unknown[]): Promise<Post> {
      calls.createBoardPostWithMedia.push(args);
      return makePost();
    },
  };

  return {
    mockActor,
    calls,
    resetCalls: () => {
      for (const key of Object.keys(calls) as Array<keyof typeof calls>) {
        calls[key].length = 0;
      }
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: true,
    login: () => {},
    clear: () => {},
    identity: { getPrincipal: () => OWNER },
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    familyId: "norwood",
    postId: 1n,
    authorAccountId: OWNER,
    authorPersonId: "julia",
    title: "Family reunion",
    body: "Save the date for the annual reunion.",
    postType: PostType.Announcement,
    relatedPersonIds: ["hudson"],
    linkedMediaIds: [],
    tags: ["reunion", "family"],
    createdAt: 1_700_000_000_000_000_000n,
    updatedAt: 1_700_000_000_000_000_000n,
    status: PostStatus.Active,
    privacyScope: PrivacyScope.FamilyOnly,
    ...overrides,
  };
}

function makeReply(overrides: Partial<Reply> = {}): Reply {
  return {
    familyId: "norwood",
    replyId: 1n,
    postId: 1n,
    authorAccountId: OWNER,
    authorPersonId: "hudson",
    body: "I will be there.",
    createdAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

describe("Board read hooks: legacy no-familyId call shapes (characterization)", () => {
  it("useListBoardPosts calls listBoardPosts(filter) with the filter and no familyId", async () => {
    const { result } = renderHook(() => useListBoardPosts(PostType.General), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly one positional argument — the post-type filter — and no familyId.
    expect(calls.listBoardPosts).toEqual([[PostType.General]]);
  });

  it("useListBoardPosts calls listBoardPosts(null) when no filter is given", async () => {
    const { result } = renderHook(() => useListBoardPosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardPosts).toEqual([[null]]);
  });

  it("useGetBoardPost calls getBoardPost(id) with the id and no familyId", async () => {
    const post = makePost({ postId: 7n });
    mockActor.getBoardPost = vi.fn(async (...args: unknown[]) => {
      calls.getBoardPost.push(args);
      return post;
    });

    const { result } = renderHook(() => useGetBoardPost(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getBoardPost).toEqual([[7n]]);
    expect(result.current.data).toBe(post);
  });

  it("useListBoardReplies calls listBoardReplies(postId) with the post id and no familyId", async () => {
    const { result } = renderHook(() => useListBoardReplies(3n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardReplies).toEqual([[3n]]);
  });

  it("useSearchBoardPostsByTags calls searchBoardPostsByTags(tags) with the tags and no familyId", async () => {
    const { result } = renderHook(
      () => useSearchBoardPostsByTags(["reunion", "family"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // One call with one positional argument — the tags array — and no familyId.
    expect(calls.searchBoardPostsByTags).toEqual([[["reunion", "family"]]]);
  });

  it("useListHiddenBoardPosts calls listHiddenBoardPosts() with no arguments", async () => {
    const { result } = renderHook(() => useListHiddenBoardPosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listHiddenBoardPosts).toEqual([[]]);
  });
});

describe("Board create/update hooks: legacy positional call shapes (characterization)", () => {
  it("useCreateBoardPost calls createBoardPost(postType, title, body, relatedPersonIds, linkedMediaIds, tags) with no familyId", async () => {
    const { result } = renderHook(() => useCreateBoardPost(), { wrapper });

    await result.current.mutateAsync({
      postType: PostType.Announcement,
      title: "Family reunion",
      body: "Save the date for the annual reunion.",
      relatedPersonIds: ["hudson"],
      linkedMediaIds: [],
      tags: ["reunion", "family"],
    });

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere.
    expect(calls.createBoardPost).toEqual([
      [
        PostType.Announcement,
        "Family reunion",
        "Save the date for the annual reunion.",
        ["hudson"],
        [],
        ["reunion", "family"],
      ],
    ]);
  });

  it("useUpdateBoardPost calls updateBoardPost(postId, postType, title, body, relatedPersonIds, linkedMediaIds, tags) with no familyId", async () => {
    const { result } = renderHook(() => useUpdateBoardPost(), { wrapper });

    await result.current.mutateAsync({
      postId: 5n,
      postType: PostType.General,
      title: "Updated title",
      body: "Updated body.",
      relatedPersonIds: [],
      linkedMediaIds: [2n],
      tags: ["updated"],
    });

    expect(calls.updateBoardPost).toEqual([
      [
        5n,
        PostType.General,
        "Updated title",
        "Updated body.",
        [],
        [2n],
        ["updated"],
      ],
    ]);
  });

  it("useCreateBoardPostWithMedia calls createBoardPostWithMedia(postType, title, body, relatedPersonIds, existingArchiveItemIds, newUploads, tags) with no familyId", async () => {
    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper,
    });

    await result.current.mutateAsync({
      postType: PostType.General,
      title: "Reunion photos",
      body: "Here are the reunion photos.",
      relatedPersonIds: ["clayton"],
      existingArchiveItemIds: [4n],
      newUploads: [],
      tags: ["reunion", "photos"],
    });

    // The exact positional argument order the legacy endpoint expects, with no
    // familyId inserted anywhere. The uploads array is empty here so the
    // assertion stays on the call shape rather than the upload mapping.
    expect(calls.createBoardPostWithMedia).toEqual([
      [
        PostType.General,
        "Reunion photos",
        "Here are the reunion photos.",
        ["clayton"],
        [4n],
        [],
        ["reunion", "photos"],
      ],
    ]);
  });
});

describe("Board reply/moderation hooks: legacy single-argument call shapes (characterization)", () => {
  it("useAddBoardReply calls addBoardReply(postId, body) with no familyId", async () => {
    const { result } = renderHook(() => useAddBoardReply(), { wrapper });

    await result.current.mutateAsync({ postId: 2n, body: "I will be there." });

    expect(calls.addBoardReply).toEqual([[2n, "I will be there."]]);
  });

  it("useArchiveBoardPost calls archiveBoardPost(postId) with the id and no familyId", async () => {
    const { result } = renderHook(() => useArchiveBoardPost(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.archiveBoardPost).toEqual([[6n]]);
  });

  it("useRestoreBoardPost calls restoreBoardPost(postId) with the id and no familyId", async () => {
    const { result } = renderHook(() => useRestoreBoardPost(), { wrapper });

    await result.current.mutateAsync(8n);

    expect(calls.restoreBoardPost).toEqual([[8n]]);
  });

  it("useRemoveBoardReply calls removeBoardReply(replyId) with the id and no familyId", async () => {
    const { result } = renderHook(() => useRemoveBoardReply(), { wrapper });

    await result.current.mutateAsync(9n);

    expect(calls.removeBoardReply).toEqual([[9n]]);
  });
});

describe("Board hooks: legacy default-family React Query keys (characterization)", () => {
  // The family-scoping change adds the active familyId to the Board query keys
  // so caches never collide across families. The DEFAULT family must keep the
  // legacy keys byte-for-byte, because the mutation hooks invalidate exactly
  // these keys — a changed default-family key would silently stop the Board
  // list, post detail, and reply thread from refreshing after a create, edit,
  // archive, restore, or reply.
  function keyProbe() {
    const queryClient = useQueryClient();
    return queryClient;
  }

  it("useListBoardPosts registers the legacy ['board','posts',filter] key", async () => {
    const { result } = renderHook(
      () => ({ list: useListBoardPosts(PostType.General), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.list.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "posts", PostType.General]);
  });

  it("useGetBoardPost registers the legacy ['board','post',id] key", async () => {
    const { result } = renderHook(
      () => ({ post: useGetBoardPost(7n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.post.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "post", "7"]);
  });

  it("useListBoardReplies registers the legacy ['board','replies',id] key", async () => {
    const { result } = renderHook(
      () => ({ replies: useListBoardReplies(3n), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.replies.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "replies", "3"]);
  });

  it("useListHiddenBoardPosts registers the legacy ['board','posts','hidden'] key", async () => {
    const { result } = renderHook(
      () => ({ hidden: useListHiddenBoardPosts(), client: keyProbe() }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.hidden.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "posts", "hidden"]);
  });
});

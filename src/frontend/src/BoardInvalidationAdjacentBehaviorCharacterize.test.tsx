import "@testing-library/jest-dom/vitest";
import {
  ArchiveItemClassification,
  ArchiveItemType,
  type Post,
  PostStatus,
  PostType,
  PrivacyLevel,
  PrivacyScope,
  type Reply,
  SourceStatus,
} from "@/backend";
import { DEFAULT_FAMILY_ID, FamilyProvider } from "@/context/FamilyContext";
import type { BoardMediaUpload } from "@/types/board";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
// Characterization baseline for the Board family-exact invalidation change.
//
// The requested change replaces the ten bare cross-family Board invalidation
// prefixes in `hooks/useBoard.ts` (`["board","posts"]`, `["board","post"]`,
// `["board","replies"]`) with family-exact filters built from the active
// `familyScopedId`, so a Board mutation in Family A no longer marks Family B's
// Board caches stale.
//
// That bare-prefix shape is the behavior under intentional change, so this file
// deliberately does NOT freeze it. What it protects is the ADJACENT working
// behavior the change must leave intact:
//
//   1. The Board READ query keys (default and non-default) that the new
//      family-exact invalidation must still target. If a read key changes shape,
//      the family-exact invalidation silently stops refreshing the Board list,
//      post detail, reply thread, tag search, or hidden/moderated list.
//
//   2. The NON-Board invalidation routing from Board mutations — Archive
//      pending/approved, pending-contributions count, and notifications — which
//      is explicitly out of scope and must stay family-exact and unchanged.
//
//   3. The Board mutation call shapes (which endpoint, which positional
//      arguments), which the invalidation-only change must not disturb.
//
// The Board read keys are asserted by registering them through the real read
// hooks and reading the query cache, so the assertion tracks the production key
// construction rather than a copied literal.
//
// This is component/integration coverage over a typed local actor mock. It does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listBoardPosts: unknown[][];
    listBoardPostsForFamily: unknown[][];
    searchBoardPostsByTags: unknown[][];
    searchBoardPostsByTagsForFamily: unknown[][];
    getBoardPost: unknown[][];
    getBoardPostForFamily: unknown[][];
    listBoardReplies: unknown[][];
    listBoardRepliesForFamily: unknown[][];
    listHiddenBoardPosts: unknown[][];
    listHiddenBoardPostsForFamily: unknown[][];
    createBoardPost: unknown[][];
    createBoardPostForFamily: unknown[][];
    createBoardPostWithMedia: unknown[][];
    createBoardPostWithMediaForFamily: unknown[][];
    updateBoardPost: unknown[][];
    updateBoardPostForFamily: unknown[][];
    archiveBoardPost: unknown[][];
    archiveBoardPostForFamily: unknown[][];
    restoreBoardPost: unknown[][];
    restoreBoardPostForFamily: unknown[][];
    addBoardReply: unknown[][];
    addBoardReplyForFamily: unknown[][];
    removeBoardReply: unknown[][];
    removeBoardReplyForFamily: unknown[][];
  } = {
    listBoardPosts: [],
    listBoardPostsForFamily: [],
    searchBoardPostsByTags: [],
    searchBoardPostsByTagsForFamily: [],
    getBoardPost: [],
    getBoardPostForFamily: [],
    listBoardReplies: [],
    listBoardRepliesForFamily: [],
    listHiddenBoardPosts: [],
    listHiddenBoardPostsForFamily: [],
    createBoardPost: [],
    createBoardPostForFamily: [],
    createBoardPostWithMedia: [],
    createBoardPostWithMediaForFamily: [],
    updateBoardPost: [],
    updateBoardPostForFamily: [],
    archiveBoardPost: [],
    archiveBoardPostForFamily: [],
    restoreBoardPost: [],
    restoreBoardPostForFamily: [],
    addBoardReply: [],
    addBoardReplyForFamily: [],
    removeBoardReply: [],
    removeBoardReplyForFamily: [],
  };

  const mockActor = {
    async listBoardPosts(...args: unknown[]): Promise<Post[]> {
      calls.listBoardPosts.push(args);
      return [];
    },
    async listBoardPostsForFamily(...args: unknown[]): Promise<Post[]> {
      calls.listBoardPostsForFamily.push(args);
      return [];
    },
    async searchBoardPostsByTags(...args: unknown[]): Promise<Post[]> {
      calls.searchBoardPostsByTags.push(args);
      return [];
    },
    async searchBoardPostsByTagsForFamily(...args: unknown[]): Promise<Post[]> {
      calls.searchBoardPostsByTagsForFamily.push(args);
      return [];
    },
    async getBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.getBoardPost.push(args);
      return null;
    },
    async getBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.getBoardPostForFamily.push(args);
      return null;
    },
    async listBoardReplies(...args: unknown[]): Promise<Reply[]> {
      calls.listBoardReplies.push(args);
      return [];
    },
    async listBoardRepliesForFamily(...args: unknown[]): Promise<Reply[]> {
      calls.listBoardRepliesForFamily.push(args);
      return [];
    },
    async listHiddenBoardPosts(...args: unknown[]): Promise<Post[]> {
      calls.listHiddenBoardPosts.push(args);
      return [];
    },
    async listHiddenBoardPostsForFamily(...args: unknown[]): Promise<Post[]> {
      calls.listHiddenBoardPostsForFamily.push(args);
      return [];
    },
    async createBoardPost(...args: unknown[]): Promise<Post> {
      calls.createBoardPost.push(args);
      return makePost();
    },
    async createBoardPostForFamily(...args: unknown[]): Promise<Post> {
      calls.createBoardPostForFamily.push(args);
      return makePost();
    },
    async createBoardPostWithMedia(...args: unknown[]): Promise<Post> {
      calls.createBoardPostWithMedia.push(args);
      return makePost();
    },
    async createBoardPostWithMediaForFamily(...args: unknown[]): Promise<Post> {
      calls.createBoardPostWithMediaForFamily.push(args);
      return makePost();
    },
    async updateBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.updateBoardPost.push(args);
      return null;
    },
    async updateBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.updateBoardPostForFamily.push(args);
      return null;
    },
    async archiveBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.archiveBoardPost.push(args);
      return null;
    },
    async archiveBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.archiveBoardPostForFamily.push(args);
      return null;
    },
    async restoreBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.restoreBoardPost.push(args);
      return null;
    },
    async restoreBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.restoreBoardPostForFamily.push(args);
      return null;
    },
    async addBoardReply(...args: unknown[]): Promise<Reply> {
      calls.addBoardReply.push(args);
      return makeReply();
    },
    async addBoardReplyForFamily(...args: unknown[]): Promise<Reply> {
      calls.addBoardReplyForFamily.push(args);
      return makeReply();
    },
    async removeBoardReply(...args: unknown[]): Promise<Reply | null> {
      calls.removeBoardReply.push(args);
      return null;
    },
    async removeBoardReplyForFamily(...args: unknown[]): Promise<Reply | null> {
      calls.removeBoardReplyForFamily.push(args);
      return null;
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

afterEach(cleanup);
beforeEach(resetCalls);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

function wrapperFor(queryClient: QueryClient, familyId?: string) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <FamilyProvider familyId={familyId}>{children}</FamilyProvider>
      </QueryClientProvider>
    );
  };
}

function makePost(overrides: Partial<Post> = {}): Post {
  return {
    familyId: DEFAULT_FAMILY_ID,
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
    familyId: DEFAULT_FAMILY_ID,
    replyId: 1n,
    postId: 1n,
    authorAccountId: OWNER,
    authorPersonId: "hudson",
    body: "I will be there.",
    createdAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

// ---------------------------------------------------------------------------
// Board read query keys: the shapes the family-exact invalidation must target.
// ---------------------------------------------------------------------------

describe("Board read query keys are unchanged (characterization)", () => {
  it("default family registers the legacy Board read keys", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, undefined);

    const list = renderHook(() => useListBoardPosts(PostType.General), {
      wrapper,
    });
    const detail = renderHook(() => useGetBoardPost(7n), { wrapper });
    const replies = renderHook(() => useListBoardReplies(3n), { wrapper });
    const search = renderHook(() => useSearchBoardPostsByTags(["reunion"]), {
      wrapper,
    });
    const hidden = renderHook(() => useListHiddenBoardPosts(), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(replies.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(search.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(hidden.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "posts", PostType.General]);
    expect(keys).toContainEqual(["board", "post", "7"]);
    expect(keys).toContainEqual(["board", "replies", "3"]);
    expect(keys).toContainEqual(["board", "posts", "tags", ["reunion"]]);
    expect(keys).toContainEqual(["board", "posts", "hidden"]);
  });

  it("non-default family appends the active familyId to every Board read key", async () => {
    const queryClient = makeQueryClient();
    const wrapper = wrapperFor(queryClient, FAMILY_A);

    const list = renderHook(() => useListBoardPosts(PostType.General), {
      wrapper,
    });
    const detail = renderHook(() => useGetBoardPost(7n), { wrapper });
    const replies = renderHook(() => useListBoardReplies(3n), { wrapper });
    const search = renderHook(() => useSearchBoardPostsByTags(["reunion"]), {
      wrapper,
    });
    const hidden = renderHook(() => useListHiddenBoardPosts(), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(replies.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(search.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(hidden.result.current.isSuccess).toBe(true));

    const keys = queryClient
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "posts", PostType.General, FAMILY_A]);
    expect(keys).toContainEqual(["board", "post", "7", FAMILY_A]);
    expect(keys).toContainEqual(["board", "replies", "3", FAMILY_A]);
    expect(keys).toContainEqual([
      "board",
      "posts",
      "tags",
      ["reunion"],
      FAMILY_A,
    ]);
    expect(keys).toContainEqual(["board", "posts", "hidden", FAMILY_A]);
  });
});

// ---------------------------------------------------------------------------
// Non-Board invalidation routing from Board mutations (out of scope, must stay).
// ---------------------------------------------------------------------------

describe("Board mutations keep their non-Board invalidation routing (characterization)", () => {
  it("useCreateBoardPost invalidates the active family's notifications only", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateBoardPost(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    // Seed notification caches for the default, Family A, and Family B.
    queryClient.setQueryData(["notifications"], []);
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_A], 0);
    queryClient.setQueryData(["notifications", "unreadCount", FAMILY_B], 0);

    await result.current.mutateAsync({
      postType: PostType.Announcement,
      title: "Family reunion",
      body: "Save the date.",
      relatedPersonIds: [],
      linkedMediaIds: [],
      tags: [],
    });

    expect(isInvalidated(queryClient, ["notifications", FAMILY_A])).toBe(true);
    expect(
      isInvalidated(queryClient, ["notifications", "unreadCount", FAMILY_A]),
    ).toBe(true);
    expect(isInvalidated(queryClient, ["notifications", FAMILY_B])).toBe(false);
    expect(
      isInvalidated(queryClient, ["notifications", "unreadCount", FAMILY_B]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["notifications"])).toBe(false);
  });

  it("useAddBoardReply invalidates the active family's notifications only", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useAddBoardReply(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    queryClient.setQueryData(["notifications"], []);
    queryClient.setQueryData(["notifications", FAMILY_A], []);
    queryClient.setQueryData(["notifications", FAMILY_B], []);

    await result.current.mutateAsync({ postId: 2n, body: "I will be there." });

    expect(isInvalidated(queryClient, ["notifications", FAMILY_A])).toBe(true);
    expect(isInvalidated(queryClient, ["notifications", FAMILY_B])).toBe(false);
    expect(isInvalidated(queryClient, ["notifications"])).toBe(false);
  });

  it("useCreateBoardPostWithMedia invalidates the active family's Archive and pending-count caches only", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    for (const familySlot of ["", FAMILY_A, FAMILY_B]) {
      queryClient.setQueryData(["archive", "pending", familySlot], []);
      queryClient.setQueryData(["archive", "approved", familySlot], []);
      queryClient.setQueryData(["pendingContributionsCount", familySlot], 0);
    }

    await result.current.mutateAsync({
      postType: PostType.General,
      title: "Reunion photos",
      body: "Here are the reunion photos.",
      relatedPersonIds: [],
      existingArchiveItemIds: [],
      newUploads: [],
      tags: [],
    });

    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      true,
    );
    expect(
      isInvalidated(queryClient, ["pendingContributionsCount", FAMILY_A]),
    ).toBe(true);
    // Family B and the default family are untouched.
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_B])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["pendingContributionsCount", FAMILY_B]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(false);
    expect(isInvalidated(queryClient, ["archive", "approved", ""])).toBe(false);
    expect(isInvalidated(queryClient, ["pendingContributionsCount", ""])).toBe(
      false,
    );
  });

  it("a default-family Board mutation invalidates the exact default non-Board keys only", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper: wrapperFor(queryClient, undefined),
    });
    for (const familySlot of ["", FAMILY_A, FAMILY_B]) {
      queryClient.setQueryData(["archive", "pending", familySlot], []);
      queryClient.setQueryData(["archive", "approved", familySlot], []);
      queryClient.setQueryData(["pendingContributionsCount", familySlot], 0);
    }

    await result.current.mutateAsync({
      postType: PostType.General,
      title: "Reunion photos",
      body: "Here are the reunion photos.",
      relatedPersonIds: [],
      existingArchiveItemIds: [],
      newUploads: [],
      tags: [],
    });

    expect(isInvalidated(queryClient, ["archive", "pending", ""])).toBe(true);
    expect(isInvalidated(queryClient, ["archive", "approved", ""])).toBe(true);
    expect(isInvalidated(queryClient, ["pendingContributionsCount", ""])).toBe(
      true,
    );
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_A])).toBe(
      false,
    );
    expect(isInvalidated(queryClient, ["archive", "approved", FAMILY_A])).toBe(
      false,
    );
    expect(
      isInvalidated(queryClient, ["pendingContributionsCount", FAMILY_A]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["archive", "pending", FAMILY_B])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Board mutation call shapes: the invalidation-only change must not disturb them.
// ---------------------------------------------------------------------------

describe("Board mutation call shapes are unchanged (characterization)", () => {
  it("default-family mutations keep the legacy no-familyId call shapes", async () => {
    const wrapper = wrapperFor(makeQueryClient(), undefined);

    const create = renderHook(() => useCreateBoardPost(), { wrapper });
    await create.result.current.mutateAsync({
      postType: PostType.Announcement,
      title: "Family reunion",
      body: "Save the date.",
      relatedPersonIds: ["hudson"],
      linkedMediaIds: [],
      tags: ["reunion"],
    });
    expect(calls.createBoardPost).toEqual([
      [
        PostType.Announcement,
        "Family reunion",
        "Save the date.",
        ["hudson"],
        [],
        ["reunion"],
      ],
    ]);

    const update = renderHook(() => useUpdateBoardPost(), { wrapper });
    await update.result.current.mutateAsync({
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

    const archive = renderHook(() => useArchiveBoardPost(), { wrapper });
    await archive.result.current.mutateAsync(6n);
    expect(calls.archiveBoardPost).toEqual([[6n]]);

    const restore = renderHook(() => useRestoreBoardPost(), { wrapper });
    await restore.result.current.mutateAsync(8n);
    expect(calls.restoreBoardPost).toEqual([[8n]]);

    const addReply = renderHook(() => useAddBoardReply(), { wrapper });
    await addReply.result.current.mutateAsync({
      postId: 2n,
      body: "I will be there.",
    });
    expect(calls.addBoardReply).toEqual([[2n, "I will be there."]]);

    const removeReply = renderHook(() => useRemoveBoardReply(), { wrapper });
    await removeReply.result.current.mutateAsync(9n);
    expect(calls.removeBoardReply).toEqual([[9n]]);
  });

  it("non-default-family mutations keep the *ForFamily call shapes with the familyId first", async () => {
    const wrapper = wrapperFor(makeQueryClient(), FAMILY_A);

    const create = renderHook(() => useCreateBoardPost(), { wrapper });
    await create.result.current.mutateAsync({
      postType: PostType.Announcement,
      title: "Family reunion",
      body: "Save the date.",
      relatedPersonIds: ["hudson"],
      linkedMediaIds: [],
      tags: ["reunion"],
    });
    expect(calls.createBoardPostForFamily).toEqual([
      [
        FAMILY_A,
        PostType.Announcement,
        "Family reunion",
        "Save the date.",
        ["hudson"],
        [],
        ["reunion"],
      ],
    ]);

    const archive = renderHook(() => useArchiveBoardPost(), { wrapper });
    await archive.result.current.mutateAsync(6n);
    expect(calls.archiveBoardPostForFamily).toEqual([[FAMILY_A, 6n]]);

    const addReply = renderHook(() => useAddBoardReply(), { wrapper });
    await addReply.result.current.mutateAsync({
      postId: 2n,
      body: "I will be there.",
    });
    expect(calls.addBoardReplyForFamily).toEqual([
      [FAMILY_A, 2n, "I will be there."],
    ]);

    const removeReply = renderHook(() => useRemoveBoardReply(), { wrapper });
    await removeReply.result.current.mutateAsync(9n);
    expect(calls.removeBoardReplyForFamily).toEqual([[FAMILY_A, 9n]]);

    // The legacy no-familyId endpoints are never used on the non-default branch.
    expect(calls.createBoardPost).toEqual([]);
    expect(calls.archiveBoardPost).toEqual([]);
    expect(calls.addBoardReply).toEqual([]);
    expect(calls.removeBoardReply).toEqual([]);
  });

  it("useCreateBoardPostWithMedia stamps each upload with the active familyId", async () => {
    const blob = ExternalBlob.fromBytes(
      new Uint8Array([7, 8, 9]),
      "image/png",
      "reunion.png",
    );
    const upload: BoardMediaUpload = {
      title: "Reunion photo",
      description: "A photo from the reunion.",
      itemType: ArchiveItemType.Photo,
      mimeType: "image/png",
      blob,
      filename: "reunion.png",
      era: "2024",
      year: 2024n,
      tags: ["reunion"],
      relatedMemberIds: ["julia"],
      relatedBranchId: null,
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
      familyId: FAMILY_A,
    };

    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper: wrapperFor(makeQueryClient(), FAMILY_A),
    });

    await result.current.mutateAsync({
      postType: PostType.General,
      title: "Reunion photos",
      body: "Here are the reunion photos.",
      relatedPersonIds: ["julia"],
      existingArchiveItemIds: [42n],
      newUploads: [upload],
      tags: ["reunion"],
    });

    const [args] = calls.createBoardPostWithMediaForFamily;
    expect(args[0]).toBe(FAMILY_A);
    const uploads = args[6] as Array<{ familyId: string }>;
    expect(uploads).toHaveLength(1);
    expect(uploads[0].familyId).toBe(FAMILY_A);
    expect(uploads[0].familyId).not.toBe(DEFAULT_FAMILY_ID);
  });
});

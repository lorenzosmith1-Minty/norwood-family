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

import { useQueryClient } from "@tanstack/react-query";

import {
  type CreateBoardPostWithMediaInput,
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
// Characterization baseline for the family-scoped Message Board change: the
// DEFAULT-family path through the production FamilyProvider composition.
//
// The requested change makes every Board hook read the active family from the
// centralized family context and fork on `useFamilyScopedId()`:
//
//   * the DEFAULT family (Norwood) resolves `familyScopedId` to `undefined`, so
//     the hook must keep making the legacy no-familyId call and keep the legacy
//     React Query key — the default-family behavior and UI must be unchanged;
//   * a NON-default family resolves it to that family id, so the hook makes the
//     `*ForFamily` call with an explicit familyId.
//
// The real app mounts `<FamilyProvider>` (main.tsx) with the default family, so
// the default-family path *through the provider* is the production path. The
// sibling BoardLegacyCallShapeCharacterize.test.tsx renders the hooks with NO
// provider (the context fallback), and SecurityHardeningBaselineCharacterize
// pins the upload mapping; neither pins the default-family behavior under the
// provider the app actually mounts. This file closes that gap.
//
// It deliberately does NOT freeze the non-default branch (that is the new
// behavior, covered by the `*FamilyScopedCallShape.cover` files) and does NOT
// freeze the hard-coded `familyId: "norwood"` literal as a permanent value —
// the change replaces that literal with the active family id. What it protects
// is that, for the default family, every Board hook still reaches the legacy
// endpoint with the same positional arguments and registers the same query
// keys, so the default-family Board list, post detail, reply thread, tag
// search, hidden/moderated list, and every mutation's cache invalidation keep
// working exactly as before.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister (see coverageLimits).
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

/**
 * The production composition: a QueryClientProvider wrapping a FamilyProvider
 * with the DEFAULT family (the same default main.tsx mounts).
 */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider>{children}</FamilyProvider>
    </QueryClientProvider>
  );
}

afterEach(cleanup);
beforeEach(resetCalls);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

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

describe("Board hooks under the default-family provider: legacy reads unchanged (characterization)", () => {
  it("useListBoardPosts calls listBoardPosts(filter) with no familyId", async () => {
    const { result } = renderHook(() => useListBoardPosts(PostType.General), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardPosts).toEqual([[PostType.General]]);
  });

  it("useGetBoardPost calls getBoardPost(id) with no familyId", async () => {
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

  it("useListBoardReplies calls listBoardReplies(postId) with no familyId", async () => {
    const { result } = renderHook(() => useListBoardReplies(3n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardReplies).toEqual([[3n]]);
  });

  it("useSearchBoardPostsByTags calls searchBoardPostsByTags(tags) with no familyId", async () => {
    const { result } = renderHook(
      () => useSearchBoardPostsByTags(["reunion", "family"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.searchBoardPostsByTags).toEqual([[["reunion", "family"]]]);
  });

  it("useListHiddenBoardPosts calls listHiddenBoardPosts() with no arguments", async () => {
    const { result } = renderHook(() => useListHiddenBoardPosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listHiddenBoardPosts).toEqual([[]]);
  });
});

describe("Board hooks under the default-family provider: legacy mutations unchanged (characterization)", () => {
  it("useCreateBoardPost calls createBoardPost with the legacy positional order and no familyId", async () => {
    const { result } = renderHook(() => useCreateBoardPost(), { wrapper });

    await result.current.mutateAsync({
      postType: PostType.Announcement,
      title: "Family reunion",
      body: "Save the date for the annual reunion.",
      relatedPersonIds: ["hudson"],
      linkedMediaIds: [],
      tags: ["reunion", "family"],
    });

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

  it("useUpdateBoardPost calls updateBoardPost with the legacy positional order and no familyId", async () => {
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

  it("useAddBoardReply calls addBoardReply(postId, body) with no familyId", async () => {
    const { result } = renderHook(() => useAddBoardReply(), { wrapper });

    await result.current.mutateAsync({ postId: 2n, body: "I will be there." });

    expect(calls.addBoardReply).toEqual([[2n, "I will be there."]]);
  });

  it("useArchiveBoardPost calls archiveBoardPost(postId) with no familyId", async () => {
    const { result } = renderHook(() => useArchiveBoardPost(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.archiveBoardPost).toEqual([[6n]]);
  });

  it("useRestoreBoardPost calls restoreBoardPost(postId) with no familyId", async () => {
    const { result } = renderHook(() => useRestoreBoardPost(), { wrapper });

    await result.current.mutateAsync(8n);

    expect(calls.restoreBoardPost).toEqual([[8n]]);
  });

  it("useRemoveBoardReply calls removeBoardReply(replyId) with no familyId", async () => {
    const { result } = renderHook(() => useRemoveBoardReply(), { wrapper });

    await result.current.mutateAsync(9n);

    expect(calls.removeBoardReply).toEqual([[9n]]);
  });
});

describe("Board hooks under the default-family provider: media upload mapping unchanged (characterization)", () => {
  it("useCreateBoardPostWithMedia maps every upload field and carries the default family id", async () => {
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
      // The active family is read from the centralized FamilyContext; under the
      // default-family provider it resolves to the default family id.
      familyId: DEFAULT_FAMILY_ID,
    };

    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper,
    });

    await result.current.mutateAsync({
      postType: PostType.General,
      title: "Reunion photos",
      body: "Here are the reunion photos.",
      relatedPersonIds: ["julia"],
      existingArchiveItemIds: [42n],
      newUploads: [upload],
      tags: ["reunion"],
    } satisfies CreateBoardPostWithMediaInput);

    // The legacy endpoint is called with the legacy positional order (no
    // familyId argument), and the upload is mapped to the backend's
    // BoardMediaUpload shape: the optional year/branch/speaker become
    // `undefined` (the generated wrapper's optional representation), the
    // existing item id is passed through, and the default family id is carried
    // on the upload record. The change replaces the literal default with the
    // active family id; for the default family the value is unchanged.
    expect(calls.createBoardPostWithMedia).toEqual([
      [
        PostType.General,
        "Reunion photos",
        "Here are the reunion photos.",
        ["julia"],
        [42n],
        [
          {
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
            familyId: DEFAULT_FAMILY_ID,
            relatedBranchId: undefined,
            sourceStatus: SourceStatus.Original,
            privacyLevel: PrivacyLevel.FamilyOnly,
            classification: ArchiveItemClassification.Standard,
            primarySpeaker: undefined,
          },
        ],
        ["reunion"],
      ],
    ]);
  });
});

describe("Board hooks under the default-family provider: legacy query keys unchanged (characterization)", () => {
  // The mutation hooks invalidate exactly these keys. A changed default-family
  // key would silently stop the Board list, post detail, and reply thread from
  // refreshing after a create, edit, archive, restore, or reply.
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

  it("useSearchBoardPostsByTags registers the legacy ['board','posts','tags',tags] key", async () => {
    const { result } = renderHook(
      () => ({
        search: useSearchBoardPostsByTags(["reunion"]),
        client: keyProbe(),
      }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.search.isSuccess).toBe(true));
    const keys = result.current.client
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey);
    expect(keys).toContainEqual(["board", "posts", "tags", ["reunion"]]);
  });
});

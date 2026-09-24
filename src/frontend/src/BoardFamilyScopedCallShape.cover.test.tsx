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
// Cover for the Tenancy 1C-C1 frontend half of the family-scoped Message Board
// change: when a NON-default family is active, every Board hook must route to
// the canonical `*ForFamily` endpoint with the explicit familyId as the first
// positional argument, and the familyId must be part of the React Query key so
// caches never collide across families.
//
// The DEFAULT-family (Norwood) legacy call shapes and query keys are frozen
// separately by BoardDefaultFamilyProviderCharacterize.test.tsx and
// BoardLegacyCallShapeCharacterize.test.tsx; this file only asserts the
// non-default branch, so the two together pin both sides of the
// `familyScopedId === undefined` fork.
//
// It also asserts that no Board frontend path hard-codes the default family id:
// the non-default-family calls must never receive the literal default family id
// as their familyId argument.
//
// This is component/integration coverage over a typed local actor mock. It
// proves the consumer contract — which endpoint each hook calls and with which
// arguments — and does not exercise the real canister; the family boundary
// itself is covered by the PocketIC lane (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";

const { mockActor, calls, resetCalls } = vi.hoisted(() => {
  const calls: {
    listBoardPostsForFamily: unknown[][];
    searchBoardPostsByTagsForFamily: unknown[][];
    listHiddenBoardPostsForFamily: unknown[][];
    getBoardPostForFamily: unknown[][];
    listBoardRepliesForFamily: unknown[][];
    createBoardPostForFamily: unknown[][];
    createBoardPostWithMediaForFamily: unknown[][];
    addBoardReplyForFamily: unknown[][];
    updateBoardPostForFamily: unknown[][];
    archiveBoardPostForFamily: unknown[][];
    restoreBoardPostForFamily: unknown[][];
    removeBoardReplyForFamily: unknown[][];
    // Legacy no-familyId endpoints: recorded so the cover can prove the
    // non-default branch never falls back to them.
    listBoardPosts: unknown[][];
    getBoardPost: unknown[][];
    listBoardReplies: unknown[][];
    createBoardPost: unknown[][];
    createBoardPostWithMedia: unknown[][];
    addBoardReply: unknown[][];
    updateBoardPost: unknown[][];
    archiveBoardPost: unknown[][];
    restoreBoardPost: unknown[][];
    removeBoardReply: unknown[][];
    searchBoardPostsByTags: unknown[][];
    listHiddenBoardPosts: unknown[][];
  } = {
    listBoardPostsForFamily: [],
    searchBoardPostsByTagsForFamily: [],
    listHiddenBoardPostsForFamily: [],
    getBoardPostForFamily: [],
    listBoardRepliesForFamily: [],
    createBoardPostForFamily: [],
    createBoardPostWithMediaForFamily: [],
    addBoardReplyForFamily: [],
    updateBoardPostForFamily: [],
    archiveBoardPostForFamily: [],
    restoreBoardPostForFamily: [],
    removeBoardReplyForFamily: [],
    listBoardPosts: [],
    getBoardPost: [],
    listBoardReplies: [],
    createBoardPost: [],
    createBoardPostWithMedia: [],
    addBoardReply: [],
    updateBoardPost: [],
    archiveBoardPost: [],
    restoreBoardPost: [],
    removeBoardReply: [],
    searchBoardPostsByTags: [],
    listHiddenBoardPosts: [],
  };

  const mockActor = {
    async listBoardPostsForFamily(...args: unknown[]): Promise<Post[]> {
      calls.listBoardPostsForFamily.push(args);
      return [];
    },
    async searchBoardPostsByTagsForFamily(...args: unknown[]): Promise<Post[]> {
      calls.searchBoardPostsByTagsForFamily.push(args);
      return [];
    },
    async listHiddenBoardPostsForFamily(...args: unknown[]): Promise<Post[]> {
      calls.listHiddenBoardPostsForFamily.push(args);
      return [];
    },
    async getBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.getBoardPostForFamily.push(args);
      return null;
    },
    async listBoardRepliesForFamily(...args: unknown[]): Promise<Reply[]> {
      calls.listBoardRepliesForFamily.push(args);
      return [];
    },
    async createBoardPostForFamily(...args: unknown[]): Promise<Post> {
      calls.createBoardPostForFamily.push(args);
      return makePost();
    },
    async createBoardPostWithMediaForFamily(...args: unknown[]): Promise<Post> {
      calls.createBoardPostWithMediaForFamily.push(args);
      return makePost();
    },
    async addBoardReplyForFamily(...args: unknown[]): Promise<Reply> {
      calls.addBoardReplyForFamily.push(args);
      return makeReply();
    },
    async updateBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.updateBoardPostForFamily.push(args);
      return null;
    },
    async archiveBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.archiveBoardPostForFamily.push(args);
      return null;
    },
    async restoreBoardPostForFamily(...args: unknown[]): Promise<Post | null> {
      calls.restoreBoardPostForFamily.push(args);
      return null;
    },
    async removeBoardReplyForFamily(...args: unknown[]): Promise<Reply | null> {
      calls.removeBoardReplyForFamily.push(args);
      return null;
    },
    async listBoardPosts(...args: unknown[]): Promise<Post[]> {
      calls.listBoardPosts.push(args);
      return [];
    },
    async getBoardPost(...args: unknown[]): Promise<Post | null> {
      calls.getBoardPost.push(args);
      return null;
    },
    async listBoardReplies(...args: unknown[]): Promise<Reply[]> {
      calls.listBoardReplies.push(args);
      return [];
    },
    async createBoardPost(...args: unknown[]): Promise<Post> {
      calls.createBoardPost.push(args);
      return makePost();
    },
    async createBoardPostWithMedia(...args: unknown[]): Promise<Post> {
      calls.createBoardPostWithMedia.push(args);
      return makePost();
    },
    async addBoardReply(...args: unknown[]): Promise<Reply> {
      calls.addBoardReply.push(args);
      return makeReply();
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
    async removeBoardReply(...args: unknown[]): Promise<Reply | null> {
      calls.removeBoardReply.push(args);
      return null;
    },
    async searchBoardPostsByTags(...args: unknown[]): Promise<Post[]> {
      calls.searchBoardPostsByTags.push(args);
      return [];
    },
    async listHiddenBoardPosts(...args: unknown[]): Promise<Post[]> {
      calls.listHiddenBoardPosts.push(args);
      return [];
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

/** The production composition with a NON-default active family. */
function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <FamilyProvider familyId={FAMILY_A}>{children}</FamilyProvider>
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
    familyId: FAMILY_A,
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
    familyId: FAMILY_A,
    replyId: 1n,
    postId: 1n,
    authorAccountId: OWNER,
    authorPersonId: "hudson",
    body: "I will be there.",
    createdAt: 1_700_000_000_000_000_000n,
    ...overrides,
  };
}

/** Every legacy no-familyId board endpoint must stay untouched. */
function expectNoLegacyBoardCalls() {
  expect(calls.listBoardPosts).toEqual([]);
  expect(calls.getBoardPost).toEqual([]);
  expect(calls.listBoardReplies).toEqual([]);
  expect(calls.createBoardPost).toEqual([]);
  expect(calls.createBoardPostWithMedia).toEqual([]);
  expect(calls.addBoardReply).toEqual([]);
  expect(calls.updateBoardPost).toEqual([]);
  expect(calls.archiveBoardPost).toEqual([]);
  expect(calls.restoreBoardPost).toEqual([]);
  expect(calls.removeBoardReply).toEqual([]);
  expect(calls.searchBoardPostsByTags).toEqual([]);
  expect(calls.listHiddenBoardPosts).toEqual([]);
}

describe("Board read hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useListBoardPosts calls listBoardPostsForFamily(familyId, filter)", async () => {
    const { result } = renderHook(() => useListBoardPosts(PostType.General), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardPostsForFamily).toEqual([
      [FAMILY_A, PostType.General],
    ]);
    expectNoLegacyBoardCalls();
  });

  it("useListBoardPosts passes a null filter through unchanged", async () => {
    const { result } = renderHook(() => useListBoardPosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardPostsForFamily).toEqual([[FAMILY_A, null]]);
  });

  it("useSearchBoardPostsByTags calls searchBoardPostsByTagsForFamily(familyId, tags)", async () => {
    const { result } = renderHook(
      () => useSearchBoardPostsByTags(["reunion", "family"]),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.searchBoardPostsByTagsForFamily).toEqual([
      [FAMILY_A, ["reunion", "family"]],
    ]);
    expectNoLegacyBoardCalls();
  });

  it("useListHiddenBoardPosts calls listHiddenBoardPostsForFamily(familyId)", async () => {
    const { result } = renderHook(() => useListHiddenBoardPosts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listHiddenBoardPostsForFamily).toEqual([[FAMILY_A]]);
    expectNoLegacyBoardCalls();
  });

  it("useGetBoardPost calls getBoardPostForFamily(familyId, postId)", async () => {
    const post = makePost({ postId: 7n });
    mockActor.getBoardPostForFamily = vi.fn(async (...args: unknown[]) => {
      calls.getBoardPostForFamily.push(args);
      return post;
    });

    const { result } = renderHook(() => useGetBoardPost(7n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.getBoardPostForFamily).toEqual([[FAMILY_A, 7n]]);
    expect(result.current.data).toBe(post);
    expectNoLegacyBoardCalls();
  });

  it("useListBoardReplies calls listBoardRepliesForFamily(familyId, postId)", async () => {
    const { result } = renderHook(() => useListBoardReplies(3n), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(calls.listBoardRepliesForFamily).toEqual([[FAMILY_A, 3n]]);
    expectNoLegacyBoardCalls();
  });
});

describe("Board write hooks: non-default family routes to *ForFamily (cover)", () => {
  it("useCreateBoardPost calls createBoardPostForFamily(familyId, ...) with the familyId first", async () => {
    const { result } = renderHook(() => useCreateBoardPost(), { wrapper });

    await result.current.mutateAsync({
      postType: PostType.Announcement,
      title: "Family reunion",
      body: "Save the date for the annual reunion.",
      relatedPersonIds: ["hudson"],
      linkedMediaIds: [],
      tags: ["reunion", "family"],
    });

    expect(calls.createBoardPostForFamily).toEqual([
      [
        FAMILY_A,
        PostType.Announcement,
        "Family reunion",
        "Save the date for the annual reunion.",
        ["hudson"],
        [],
        ["reunion", "family"],
      ],
    ]);
    expectNoLegacyBoardCalls();
  });

  it("useUpdateBoardPost calls updateBoardPostForFamily(familyId, ...) with the familyId first", async () => {
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

    expect(calls.updateBoardPostForFamily).toEqual([
      [
        FAMILY_A,
        5n,
        PostType.General,
        "Updated title",
        "Updated body.",
        [],
        [2n],
        ["updated"],
      ],
    ]);
    expectNoLegacyBoardCalls();
  });

  it("useArchiveBoardPost calls archiveBoardPostForFamily(familyId, postId)", async () => {
    const { result } = renderHook(() => useArchiveBoardPost(), { wrapper });

    await result.current.mutateAsync(6n);

    expect(calls.archiveBoardPostForFamily).toEqual([[FAMILY_A, 6n]]);
    expectNoLegacyBoardCalls();
  });

  it("useRestoreBoardPost calls restoreBoardPostForFamily(familyId, postId)", async () => {
    const { result } = renderHook(() => useRestoreBoardPost(), { wrapper });

    await result.current.mutateAsync(8n);

    expect(calls.restoreBoardPostForFamily).toEqual([[FAMILY_A, 8n]]);
    expectNoLegacyBoardCalls();
  });

  it("useAddBoardReply calls addBoardReplyForFamily(familyId, postId, body)", async () => {
    const { result } = renderHook(() => useAddBoardReply(), { wrapper });

    await result.current.mutateAsync({ postId: 2n, body: "I will be there." });

    expect(calls.addBoardReplyForFamily).toEqual([
      [FAMILY_A, 2n, "I will be there."],
    ]);
    expectNoLegacyBoardCalls();
  });

  it("useRemoveBoardReply calls removeBoardReplyForFamily(familyId, replyId)", async () => {
    const { result } = renderHook(() => useRemoveBoardReply(), { wrapper });

    await result.current.mutateAsync(9n);

    expect(calls.removeBoardReplyForFamily).toEqual([[FAMILY_A, 9n]]);
    expectNoLegacyBoardCalls();
  });
});

describe("Board media post creation: non-default family routes to *ForFamily (cover)", () => {
  it("useCreateBoardPostWithMedia calls createBoardPostWithMediaForFamily(familyId, ...) and stamps each upload with the active familyId", async () => {
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
      // The caller supplies the active family id; the hook must forward it.
      familyId: FAMILY_A,
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

    expect(calls.createBoardPostWithMediaForFamily).toEqual([
      [
        FAMILY_A,
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
            // The upload carries the ACTIVE family id, not the default one.
            familyId: FAMILY_A,
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
    expectNoLegacyBoardCalls();
  });

  it("stamps the upload with the active familyId even when the caller omits it", async () => {
    const blob = ExternalBlob.fromBytes(
      new Uint8Array([1, 2, 3]),
      "image/png",
      "photo.png",
    );
    // A caller that does not set familyId: the hook must still stamp the active
    // family, never the default family literal.
    const upload = {
      title: "Photo",
      description: "A photo.",
      itemType: ArchiveItemType.Photo,
      mimeType: "image/png",
      blob,
      filename: "photo.png",
      era: "2024",
      year: null,
      tags: [],
      relatedMemberIds: [],
      relatedBranchId: null,
      sourceStatus: SourceStatus.Original,
      privacyLevel: PrivacyLevel.FamilyOnly,
      classification: ArchiveItemClassification.Standard,
      primarySpeaker: null,
    } as unknown as BoardMediaUpload;

    const { result } = renderHook(() => useCreateBoardPostWithMedia(), {
      wrapper,
    });

    await result.current.mutateAsync({
      postType: PostType.General,
      title: "Photos",
      body: "Photos.",
      relatedPersonIds: [],
      existingArchiveItemIds: [],
      newUploads: [upload],
      tags: [],
    });

    const [args] = calls.createBoardPostWithMediaForFamily;
    const uploads = args[6] as Array<{ familyId: string }>;
    expect(uploads).toHaveLength(1);
    expect(uploads[0].familyId).toBe(FAMILY_A);
    expect(uploads[0].familyId).not.toBe(DEFAULT_FAMILY_ID);
  });
});

describe("Board hooks: non-default family never hard-codes the default family id (cover)", () => {
  it("every *ForFamily call receives the active familyId, never the default literal", async () => {
    const list = renderHook(() => useListBoardPosts(), { wrapper });
    const search = renderHook(() => useSearchBoardPostsByTags(["reunion"]), {
      wrapper,
    });
    const hidden = renderHook(() => useListHiddenBoardPosts(), { wrapper });
    const detail = renderHook(() => useGetBoardPost(1n), { wrapper });
    const replies = renderHook(() => useListBoardReplies(1n), { wrapper });

    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(search.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(hidden.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(detail.result.current.isSuccess).toBe(true));
    await waitFor(() => expect(replies.result.current.isSuccess).toBe(true));

    const create = renderHook(() => useCreateBoardPost(), { wrapper });
    await create.result.current.mutateAsync({
      postType: PostType.General,
      title: null,
      body: "Body.",
      relatedPersonIds: [],
      linkedMediaIds: [],
      tags: [],
    });

    const update = renderHook(() => useUpdateBoardPost(), { wrapper });
    await update.result.current.mutateAsync({
      postId: 1n,
      postType: PostType.General,
      title: null,
      body: "Body.",
      relatedPersonIds: [],
      linkedMediaIds: [],
      tags: [],
    });

    const archive = renderHook(() => useArchiveBoardPost(), { wrapper });
    await archive.result.current.mutateAsync(1n);

    const restore = renderHook(() => useRestoreBoardPost(), { wrapper });
    await restore.result.current.mutateAsync(1n);

    const addReply = renderHook(() => useAddBoardReply(), { wrapper });
    await addReply.result.current.mutateAsync({ postId: 1n, body: "Hi." });

    const removeReply = renderHook(() => useRemoveBoardReply(), { wrapper });
    await removeReply.result.current.mutateAsync(1n);

    const familyIdArgs: unknown[] = [
      calls.listBoardPostsForFamily[0]?.[0],
      calls.searchBoardPostsByTagsForFamily[0]?.[0],
      calls.listHiddenBoardPostsForFamily[0]?.[0],
      calls.getBoardPostForFamily[0]?.[0],
      calls.listBoardRepliesForFamily[0]?.[0],
      calls.createBoardPostForFamily[0]?.[0],
      calls.updateBoardPostForFamily[0]?.[0],
      calls.archiveBoardPostForFamily[0]?.[0],
      calls.restoreBoardPostForFamily[0]?.[0],
      calls.addBoardReplyForFamily[0]?.[0],
      calls.removeBoardReplyForFamily[0]?.[0],
    ];

    for (const familyId of familyIdArgs) {
      expect(familyId).toBe(FAMILY_A);
      expect(familyId).not.toBe(DEFAULT_FAMILY_ID);
    }
    expectNoLegacyBoardCalls();
  });
});

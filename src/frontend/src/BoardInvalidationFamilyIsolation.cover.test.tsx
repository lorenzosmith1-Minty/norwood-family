import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
import { cleanup, renderHook } from "@testing-library/react";
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
  boardHiddenPostsInvalidation,
  boardPostDetailInvalidation,
  boardPostListsInvalidation,
  boardRepliesInvalidation,
  boardTagSearchInvalidation,
  useAddBoardReply,
  useArchiveBoardPost,
  useCreateBoardPost,
  useCreateBoardPostWithMedia,
  useRemoveBoardReply,
  useRestoreBoardPost,
  useUpdateBoardPost,
} from "./hooks/useBoard";

// ---------------------------------------------------------------------------
// Cover for the family-exact Board cache-invalidation change in
// `hooks/useBoard.ts`.
//
// The requested change replaces the ten bare cross-family Board invalidation
// prefixes (`["board","posts"]`, `["board","post"]`, `["board","replies"]`)
// with family-exact filters built from the active `familyScopedId`, so a Board
// mutation performed while one family is active invalidates ONLY that family's
// Board caches. Before the change a bare prefix also matched every other
// family's family-appended key and marked it stale.
//
// This file asserts the accepted behavior:
//
//   1. Helper contract: all five Board helpers are family-exact in both
//      branches. The default family targets only the exact default read key
//      shape (narrowed with a `queryKey.length` predicate where the bare prefix
//      would otherwise match a non-default key); a non-default family keeps the
//      bare prefix but narrows it with a predicate that admits only the active
//      family's keys (family id at the LAST index).
//
//   2. Non-default isolation, asserted behaviorally through the real mutation
//      hooks: with Family A active, each Board mutation path (create post,
//      media post creation, reply creation, edit post, archive, restore,
//      remove reply) invalidates Family A's Board caches and leaves Family B's
//      and the default family's Board caches untouched.
//
//   3. Hidden/moderated isolation: archive/restore invalidate only the active
//      family's hidden/moderated cache.
//
//   4. Default-family exactness: with the default family active, a mutation
//      invalidates the exact default read keys and leaves Family A's and
//      Family B's Board caches untouched.
//
//   5. Static source audit: no production Board invalidation in `useBoard.ts`
//      passes a bare cross-family prefix to `invalidateQueries`.
//
// This is component/integration coverage over a typed local actor mock; it does
// not exercise the real canister (see coverageLimits).
// ---------------------------------------------------------------------------

const OWNER = Principal.fromText("aaaaa-aa");
const FAMILY_A = "test-family-a";
const FAMILY_B = "test-family-b";

const { mockActor, resetCalls } = vi.hoisted(() => {
  const mockActor = {
    async createBoardPost(..._args: unknown[]): Promise<unknown> {
      return makePost();
    },
    async createBoardPostForFamily(..._args: unknown[]): Promise<unknown> {
      return makePost();
    },
    async createBoardPostWithMedia(..._args: unknown[]): Promise<unknown> {
      return makePost();
    },
    async createBoardPostWithMediaForFamily(
      ..._args: unknown[]
    ): Promise<unknown> {
      return makePost();
    },
    async updateBoardPost(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async updateBoardPostForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async archiveBoardPost(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async archiveBoardPostForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async restoreBoardPost(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async restoreBoardPostForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async addBoardReply(..._args: unknown[]): Promise<unknown> {
      return makeReply();
    },
    async addBoardReplyForFamily(..._args: unknown[]): Promise<unknown> {
      return makeReply();
    },
    async removeBoardReply(..._args: unknown[]): Promise<unknown> {
      return null;
    },
    async removeBoardReplyForFamily(..._args: unknown[]): Promise<unknown> {
      return null;
    },
  };

  return {
    mockActor,
    resetCalls: () => {
      // The mock methods are stateless; the assertions are on React Query cache
      // state, so there is nothing to reset between tests.
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

function isInvalidated(queryClient: QueryClient, key: unknown[]): boolean {
  return queryClient.getQueryState(key)?.isInvalidated === true;
}

/**
 * Seeds the Board post-list, post-detail, replies, tag-search, and
 * hidden/moderated caches for the default family, Family A, and Family B so an
 * invalidation can be observed as a state transition on each key.
 *
 * The default family's read key omits the family slot entirely; a non-default
 * family appends the family id at the LAST index.
 */
function seedBoardCaches(queryClient: QueryClient) {
  for (const familySlot of [undefined, FAMILY_A, FAMILY_B]) {
    const suffix = familySlot === undefined ? [] : [familySlot];
    queryClient.setQueryData(["board", "posts", "all", ...suffix], []);
    queryClient.setQueryData(["board", "post", "1", ...suffix], null);
    queryClient.setQueryData(["board", "replies", "1", ...suffix], []);
    queryClient.setQueryData(
      ["board", "posts", "tags", ["reunion"], ...suffix],
      [],
    );
    queryClient.setQueryData(["board", "posts", "hidden", ...suffix], []);
  }
}

/** Reads the invalidation state of every seeded Board key. */
function readBoardState(queryClient: QueryClient) {
  const state: Record<string, boolean> = {};
  for (const [label, suffix] of [
    ["default", []],
    ["a", [FAMILY_A]],
    ["b", [FAMILY_B]],
  ] as const) {
    state[`${label}:list`] = isInvalidated(queryClient, [
      "board",
      "posts",
      "all",
      ...suffix,
    ]);
    state[`${label}:detail`] = isInvalidated(queryClient, [
      "board",
      "post",
      "1",
      ...suffix,
    ]);
    state[`${label}:replies`] = isInvalidated(queryClient, [
      "board",
      "replies",
      "1",
      ...suffix,
    ]);
    state[`${label}:tags`] = isInvalidated(queryClient, [
      "board",
      "posts",
      "tags",
      ["reunion"],
      ...suffix,
    ]);
    state[`${label}:hidden`] = isInvalidated(queryClient, [
      "board",
      "posts",
      "hidden",
      ...suffix,
    ]);
  }
  return state;
}

const CREATE_INPUT = {
  postType: PostType.Announcement,
  title: "Family reunion",
  body: "Save the date.",
  relatedPersonIds: [],
  linkedMediaIds: [],
  tags: [],
};

const UPDATE_INPUT = {
  postId: 1n,
  postType: PostType.General,
  title: "Updated title",
  body: "Updated body.",
  relatedPersonIds: [],
  linkedMediaIds: [],
  tags: [],
};

const MEDIA_INPUT = {
  postType: PostType.General,
  title: "Reunion photos",
  body: "Here are the reunion photos.",
  relatedPersonIds: [],
  existingArchiveItemIds: [],
  newUploads: [],
  tags: [],
};

// ---------------------------------------------------------------------------
// Helper contract: all five helpers are family-exact in both branches.
// ---------------------------------------------------------------------------

describe("Board invalidation helpers are family-exact in both branches (cover)", () => {
  it("boardPostListsInvalidation default branch admits only the default list shape", () => {
    const filter = boardPostListsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["board", "posts"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "posts", "all"] })).toBe(true);
    expect(predicate({ queryKey: ["board", "posts", "all", FAMILY_A] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["board", "posts", "all", FAMILY_B] })).toBe(
      false,
    );
    // The tag-search and hidden keys have their own helpers and are excluded.
    expect(
      predicate({ queryKey: ["board", "posts", "tags", ["reunion"]] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["board", "posts", "hidden"] })).toBe(false);
  });

  it("boardPostListsInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = boardPostListsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["board", "posts"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "posts", "all", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["board", "posts", "all", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["board", "posts", "all"] })).toBe(false);
    expect(
      predicate({
        queryKey: ["board", "posts", "tags", ["reunion"], FAMILY_A],
      }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["board", "posts", "hidden", FAMILY_A] }),
    ).toBe(false);
  });

  it("boardPostDetailInvalidation default branch admits only the default detail shape", () => {
    const filter = boardPostDetailInvalidation(undefined);
    expect(filter.queryKey).toEqual(["board", "post"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "post", "1"] })).toBe(true);
    expect(predicate({ queryKey: ["board", "post", "1", FAMILY_A] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["board", "post", "1", FAMILY_B] })).toBe(
      false,
    );
  });

  it("boardPostDetailInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = boardPostDetailInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["board", "post"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "post", "1", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["board", "post", "1", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["board", "post", "1"] })).toBe(false);
  });

  it("boardRepliesInvalidation default branch admits only the default replies shape", () => {
    const filter = boardRepliesInvalidation(undefined);
    expect(filter.queryKey).toEqual(["board", "replies"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "replies", "1"] })).toBe(true);
    expect(predicate({ queryKey: ["board", "replies", "1", FAMILY_A] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["board", "replies", "1", FAMILY_B] })).toBe(
      false,
    );
  });

  it("boardRepliesInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = boardRepliesInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["board", "replies"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "replies", "1", FAMILY_A] })).toBe(
      true,
    );
    expect(predicate({ queryKey: ["board", "replies", "1", FAMILY_B] })).toBe(
      false,
    );
    expect(predicate({ queryKey: ["board", "replies", "1"] })).toBe(false);
  });

  it("boardTagSearchInvalidation default branch admits only the default tag-search shape", () => {
    const filter = boardTagSearchInvalidation(undefined);
    expect(filter.queryKey).toEqual(["board", "posts", "tags"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["board", "posts", "tags", ["reunion"]] }),
    ).toBe(true);
    expect(
      predicate({
        queryKey: ["board", "posts", "tags", ["reunion"], FAMILY_A],
      }),
    ).toBe(false);
    expect(
      predicate({
        queryKey: ["board", "posts", "tags", ["reunion"], FAMILY_B],
      }),
    ).toBe(false);
  });

  it("boardTagSearchInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = boardTagSearchInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["board", "posts", "tags"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({
        queryKey: ["board", "posts", "tags", ["reunion"], FAMILY_A],
      }),
    ).toBe(true);
    expect(
      predicate({
        queryKey: ["board", "posts", "tags", ["reunion"], FAMILY_B],
      }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["board", "posts", "tags", ["reunion"]] }),
    ).toBe(false);
  });

  it("boardHiddenPostsInvalidation default branch admits only the default hidden shape", () => {
    const filter = boardHiddenPostsInvalidation(undefined);
    expect(filter.queryKey).toEqual(["board", "posts", "hidden"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(predicate({ queryKey: ["board", "posts", "hidden"] })).toBe(true);
    expect(
      predicate({ queryKey: ["board", "posts", "hidden", FAMILY_A] }),
    ).toBe(false);
    expect(
      predicate({ queryKey: ["board", "posts", "hidden", FAMILY_B] }),
    ).toBe(false);
  });

  it("boardHiddenPostsInvalidation non-default branch admits only the active family (last index)", () => {
    const filter = boardHiddenPostsInvalidation(FAMILY_A);
    expect(filter.queryKey).toEqual(["board", "posts", "hidden"]);
    const predicate = filter.predicate as (query: {
      queryKey: readonly unknown[];
    }) => boolean;
    expect(
      predicate({ queryKey: ["board", "posts", "hidden", FAMILY_A] }),
    ).toBe(true);
    expect(
      predicate({ queryKey: ["board", "posts", "hidden", FAMILY_B] }),
    ).toBe(false);
    expect(predicate({ queryKey: ["board", "posts", "hidden"] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Non-default family isolation, through the real mutation hooks.
// ---------------------------------------------------------------------------

describe("a Family A Board mutation invalidates only Family A's Board caches (cover)", () => {
  async function runFamilyAMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedBoardCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readBoardState(queryClient);
  }

  it("useCreateBoardPost invalidates only Family A's post list", async () => {
    const state = await runFamilyAMutation(
      () => useCreateBoardPost() as never,
      CREATE_INPUT,
    );
    expect(state["a:list"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:list"]).toBe(false);
    expect(state["default:list"]).toBe(false);
    // The detail/replies/tag/hidden caches are not part of this mutation.
    expect(state["a:detail"]).toBe(false);
    expect(state["a:replies"]).toBe(false);
    expect(state["a:tags"]).toBe(false);
    expect(state["a:hidden"]).toBe(false);
  });

  it("useCreateBoardPostWithMedia invalidates only Family A's post list", async () => {
    const state = await runFamilyAMutation(
      () => useCreateBoardPostWithMedia() as never,
      MEDIA_INPUT,
    );
    expect(state["a:list"]).toBe(true);
    expect(state["b:list"]).toBe(false);
    expect(state["default:list"]).toBe(false);
    expect(state["a:detail"]).toBe(false);
    expect(state["a:replies"]).toBe(false);
  });

  it("useUpdateBoardPost invalidates only Family A's post list and detail", async () => {
    const state = await runFamilyAMutation(
      () => useUpdateBoardPost() as never,
      UPDATE_INPUT,
    );
    expect(state["a:list"]).toBe(true);
    expect(state["a:detail"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:list"]).toBe(false);
    expect(state["b:detail"]).toBe(false);
    expect(state["default:list"]).toBe(false);
    expect(state["default:detail"]).toBe(false);
    expect(state["a:replies"]).toBe(false);
  });

  it("useArchiveBoardPost invalidates only Family A's list, detail, and hidden caches", async () => {
    const state = await runFamilyAMutation(
      () => useArchiveBoardPost() as never,
      1n,
    );
    expect(state["a:list"]).toBe(true);
    expect(state["a:detail"]).toBe(true);
    expect(state["a:hidden"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:list"]).toBe(false);
    expect(state["b:detail"]).toBe(false);
    expect(state["b:hidden"]).toBe(false);
    expect(state["default:list"]).toBe(false);
    expect(state["default:detail"]).toBe(false);
    expect(state["default:hidden"]).toBe(false);
  });

  it("useRestoreBoardPost invalidates only Family A's list, detail, and hidden caches", async () => {
    const state = await runFamilyAMutation(
      () => useRestoreBoardPost() as never,
      1n,
    );
    expect(state["a:list"]).toBe(true);
    expect(state["a:detail"]).toBe(true);
    expect(state["a:hidden"]).toBe(true);
    expect(state["b:list"]).toBe(false);
    expect(state["b:detail"]).toBe(false);
    expect(state["b:hidden"]).toBe(false);
    expect(state["default:list"]).toBe(false);
    expect(state["default:detail"]).toBe(false);
    expect(state["default:hidden"]).toBe(false);
  });

  it("useAddBoardReply invalidates only Family A's replies", async () => {
    const state = await runFamilyAMutation(() => useAddBoardReply() as never, {
      postId: 1n,
      body: "I will be there.",
    });
    expect(state["a:replies"]).toBe(true);
    // Family B and the default family are untouched.
    expect(state["b:replies"]).toBe(false);
    expect(state["default:replies"]).toBe(false);
    expect(state["a:list"]).toBe(false);
    expect(state["a:detail"]).toBe(false);
  });

  it("useRemoveBoardReply invalidates only Family A's replies", async () => {
    const state = await runFamilyAMutation(
      () => useRemoveBoardReply() as never,
      1n,
    );
    expect(state["a:replies"]).toBe(true);
    expect(state["b:replies"]).toBe(false);
    expect(state["default:replies"]).toBe(false);
    expect(state["a:list"]).toBe(false);
    expect(state["a:detail"]).toBe(false);
  });

  it("a Family B mutation invalidates Family B only, not Family A", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useCreateBoardPost(), {
      wrapper: wrapperFor(queryClient, FAMILY_B),
    });
    seedBoardCaches(queryClient);

    await result.current.mutateAsync(CREATE_INPUT as never);

    const state = readBoardState(queryClient);
    expect(state["b:list"]).toBe(true);
    expect(state["a:list"]).toBe(false);
    expect(state["default:list"]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Hidden / moderated isolation.
// ---------------------------------------------------------------------------

describe("hidden/moderated Board caches stay family-scoped (cover)", () => {
  it("a Family A archive invalidates only Family A's hidden cache", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useArchiveBoardPost(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedBoardCaches(queryClient);

    await result.current.mutateAsync(1n);

    expect(
      isInvalidated(queryClient, ["board", "posts", "hidden", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["board", "posts", "hidden", FAMILY_B]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["board", "posts", "hidden"])).toBe(
      false,
    );
  });

  it("a Family A restore invalidates only Family A's hidden cache", async () => {
    const queryClient = makeQueryClient();
    const { result } = renderHook(() => useRestoreBoardPost(), {
      wrapper: wrapperFor(queryClient, FAMILY_A),
    });
    seedBoardCaches(queryClient);

    await result.current.mutateAsync(1n);

    expect(
      isInvalidated(queryClient, ["board", "posts", "hidden", FAMILY_A]),
    ).toBe(true);
    expect(
      isInvalidated(queryClient, ["board", "posts", "hidden", FAMILY_B]),
    ).toBe(false);
    expect(isInvalidated(queryClient, ["board", "posts", "hidden"])).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Default-family exactness.
// ---------------------------------------------------------------------------

describe("a default-family Board mutation does not invalidate non-default Board caches (cover)", () => {
  async function runDefaultMutation(
    hook: () => { mutateAsync: (input: never) => Promise<unknown> },
    input: unknown,
  ) {
    const queryClient = makeQueryClient();
    const { result } = renderHook(hook, {
      wrapper: wrapperFor(queryClient, undefined),
    });
    seedBoardCaches(queryClient);

    await result.current.mutateAsync(input as never);

    return readBoardState(queryClient);
  }

  it("useCreateBoardPost invalidates the exact default list key and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useCreateBoardPost() as never,
      CREATE_INPUT,
    );
    expect(state["default:list"]).toBe(true);
    expect(state["a:list"]).toBe(false);
    expect(state["b:list"]).toBe(false);
  });

  it("useUpdateBoardPost invalidates the exact default list and detail keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useUpdateBoardPost() as never,
      UPDATE_INPUT,
    );
    expect(state["default:list"]).toBe(true);
    expect(state["default:detail"]).toBe(true);
    expect(state["a:list"]).toBe(false);
    expect(state["a:detail"]).toBe(false);
    expect(state["b:list"]).toBe(false);
    expect(state["b:detail"]).toBe(false);
  });

  it("useArchiveBoardPost invalidates the exact default list, detail, and hidden keys and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useArchiveBoardPost() as never,
      1n,
    );
    expect(state["default:list"]).toBe(true);
    expect(state["default:detail"]).toBe(true);
    expect(state["default:hidden"]).toBe(true);
    expect(state["a:list"]).toBe(false);
    expect(state["a:detail"]).toBe(false);
    expect(state["a:hidden"]).toBe(false);
    expect(state["b:list"]).toBe(false);
    expect(state["b:detail"]).toBe(false);
    expect(state["b:hidden"]).toBe(false);
  });

  it("useAddBoardReply invalidates the exact default replies key and no family keys", async () => {
    const state = await runDefaultMutation(() => useAddBoardReply() as never, {
      postId: 1n,
      body: "I will be there.",
    });
    expect(state["default:replies"]).toBe(true);
    expect(state["a:replies"]).toBe(false);
    expect(state["b:replies"]).toBe(false);
  });

  it("useRemoveBoardReply invalidates the exact default replies key and no family keys", async () => {
    const state = await runDefaultMutation(
      () => useRemoveBoardReply() as never,
      1n,
    );
    expect(state["default:replies"]).toBe(true);
    expect(state["a:replies"]).toBe(false);
    expect(state["b:replies"]).toBe(false);
  });

  it("the default family id is Norwood", () => {
    expect(DEFAULT_FAMILY_ID).toBe("norwood");
  });
});

// ---------------------------------------------------------------------------
// Static source audit: no production Board invalidation uses a bare
// cross-family prefix.
// ---------------------------------------------------------------------------

describe("no production Board invalidation uses a bare cross-family prefix (cover)", () => {
  const HOOKS_DIR = join(process.cwd(), "src", "hooks");
  const BOARD_HOOK = "useBoard.ts";

  function readBoardHook(): string {
    return readFileSync(join(HOOKS_DIR, BOARD_HOOK), "utf8");
  }

  it("audits the production Board hook file", () => {
    expect(readBoardHook().length).toBeGreaterThan(0);
  });

  it("no bare ['board','posts'], ['board','post'], or ['board','replies'] queryKey is passed to invalidateQueries", () => {
    // A bare `["board","posts"]` (etc.) prefix matches every family-appended
    // key, so it would mark another family's Board cache stale. The helpers
    // build the filter; the hooks must call the helper, not inline the prefix.
    const source = readBoardHook();
    const barePrefixes = [
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']board["']\s*,\s*["']posts["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']board["']\s*,\s*["']post["']\s*\]\s*\}/u,
      /invalidateQueries\s*\(\s*\{\s*queryKey\s*:\s*\[\s*["']board["']\s*,\s*["']replies["']\s*\]\s*\}/u,
    ];
    const offenders = barePrefixes.filter((pattern) => pattern.test(source));
    expect(offenders).toEqual([]);
  });

  it("the Board mutation hooks route through the family-aware helpers", () => {
    const source = readBoardHook();
    for (const helper of [
      "boardPostListsInvalidation",
      "boardPostDetailInvalidation",
      "boardRepliesInvalidation",
      "boardTagSearchInvalidation",
      "boardHiddenPostsInvalidation",
    ]) {
      expect(source).toContain(helper);
    }
  });
});

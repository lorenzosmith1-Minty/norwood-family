import "@testing-library/jest-dom/vitest";
import {
  ArchiveItemClassification,
  ArchiveItemStatus,
  ArchiveItemType,
  ClaimStatus,
  LivingStatus,
  PostStatus,
  PostType,
  PrivacyLevel,
  PrivacyScope,
  ReportStatus,
  SourceStatus,
} from "@/backend";
import type { ArchiveItem, Post, Reply, Report, ReviewQueue } from "@/backend";
import { ExternalBlob } from "@caffeineai/object-storage";
import { Principal } from "@icp-sdk/core/principal";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  configure,
  render,
  screen,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import App from "./App";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// A stateful in-memory actor standing in for the real backend so the board
// tag + Hidden/Moderated Posts journeys can be exercised end to end without a
// canister. It implements the board, identity, and archive methods the board
// pages and composer call, including the new tags-aware create/update methods,
// searchBoardPostsByTags, and listHiddenBoardPosts.
const {
  mockActor,
  resetBoard,
  setAuthenticated,
  setAdmin,
  getAuthenticated,
  seedApprovedArchiveItem,
} = vi.hoisted(() => {
  const MY_PERSON_ID = "julia";
  let isAuthenticated = false;
  let isAdmin = false;
  let posts: Post[] = [];
  let replies: Reply[] = [];
  let archiveItems: ArchiveItem[] = [];
  let nextPostId = 0n;
  let nextReplyId = 0n;
  let nextArchiveId = 0n;

  const myProfile = {
    personId: MY_PERSON_ID,
    name: "Julia Norwood",
    claimStatus: "Claimed",
    livingStatus: "Living",
  };

  const mockActor = {
    async isCallerAdmin(): Promise<boolean> {
      return isAdmin;
    },
    // Family Steward authority is the canonical gate; the platform admin role
    // is a separate concern. This mock drives both from the same flag.
    async isCallerSteward(): Promise<boolean> {
      return isAdmin;
    },
    async hasActiveSteward(): Promise<boolean> {
      return true;
    },
    async getMyProfile() {
      return isAuthenticated ? myProfile : null;
    },
    async getPersonProfile(personId: string) {
      if (personId === MY_PERSON_ID) return myProfile;
      return {
        personId,
        name: "Family Member",
        claimStatus: "Unclaimed",
        livingStatus: "Living",
      };
    },
    async getProfilePhoto() {
      return null;
    },
    async listApprovedArchiveItems(): Promise<ArchiveItem[]> {
      return archiveItems.filter(
        (i) => i.status === ArchiveItemStatus.Approved,
      );
    },
    async listBoardPosts(filter: PostType | null): Promise<Post[]> {
      let active = posts.filter((p) => p.status === PostStatus.Active);
      if (filter !== null) {
        active = active.filter((p) => p.postType === filter);
      }
      return [...active].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async getBoardPost(postId: bigint): Promise<Post | null> {
      return (
        posts.find(
          (p) => p.postId === postId && p.status === PostStatus.Active,
        ) ?? null
      );
    },
    async createBoardPost(
      postType: PostType,
      title: string | null,
      body: string,
      relatedPersonIds: string[],
      linkedMediaIds: bigint[],
      tags: string[],
    ): Promise<Post> {
      const post: Post = {
        familyId: "norwood",
        postId: nextPostId++,
        authorAccountId: Principal.fromText(ACCOUNT),
        authorPersonId: MY_PERSON_ID,
        title: title ?? undefined,
        body,
        postType,
        relatedPersonIds,
        linkedMediaIds,
        tags,
        createdAt: 1_700_000_000_000_000_000n,
        updatedAt: 1_700_000_000_000_000_000n,
        status: PostStatus.Active,
        privacyScope: PrivacyScope.FamilyOnly,
      };
      posts = [...posts, post];
      return post;
    },
    async updateBoardPost(
      postId: bigint,
      postType: PostType,
      title: string | null,
      body: string,
      relatedPersonIds: string[],
      linkedMediaIds: bigint[],
      tags: string[],
    ): Promise<Post | null> {
      const found = posts.find((p) => p.postId === postId);
      if (!found) return null;
      const updated: Post = {
        ...found,
        postType,
        title: title ?? undefined,
        body,
        relatedPersonIds,
        linkedMediaIds,
        tags,
        updatedAt: found.updatedAt + 1n,
      };
      posts = posts.map((p) => (p.postId === postId ? updated : p));
      return updated;
    },
    async archiveBoardPost(postId: bigint): Promise<Post | null> {
      const found = posts.find((p) => p.postId === postId);
      if (!found) return null;
      const updated: Post = { ...found, status: PostStatus.Archived };
      posts = posts.map((p) => (p.postId === postId ? updated : p));
      return updated;
    },
    async restoreBoardPost(postId: bigint): Promise<Post | null> {
      const found = posts.find((p) => p.postId === postId);
      if (!found) return null;
      const updated: Post = { ...found, status: PostStatus.Active };
      posts = posts.map((p) => (p.postId === postId ? updated : p));
      return updated;
    },
    async listBoardReplies(postId: bigint): Promise<Reply[]> {
      return replies
        .filter((r) => r.postId === postId)
        .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
    },
    async addBoardReply(postId: bigint, body: string): Promise<Reply> {
      const reply: Reply = {
        familyId: "norwood",
        replyId: nextReplyId++,
        postId,
        authorAccountId: Principal.fromText(ACCOUNT),
        authorPersonId: MY_PERSON_ID,
        body,
        createdAt: 1_700_000_000_000_000_000n,
      };
      replies = [...replies, reply];
      return reply;
    },
    async removeBoardReply(replyId: bigint): Promise<Reply | null> {
      const found = replies.find((r) => r.replyId === replyId);
      if (!found) return null;
      replies = replies.filter((r) => r.replyId !== replyId);
      return found;
    },
    async searchBoardPostsByTags(tags: string[]): Promise<Post[]> {
      const wanted = tags.map((t) => t.toLowerCase());
      return posts
        .filter(
          (p) =>
            p.status === PostStatus.Active &&
            wanted.some((w) => p.tags.some((tag) => tag.toLowerCase() === w)),
        )
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async listHiddenBoardPosts(): Promise<Post[]> {
      return posts
        .filter((p) => p.status === PostStatus.Archived)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    },
    async listNotifications() {
      return [];
    },
    async markNotificationRead() {},
    async canMessagePerson() {
      return false;
    },
    // The Family Steward hub renders count badges from these steward-only
    // endpoints, so they must resolve (empty) when the hub is opened.
    async listReports(): Promise<Report[]> {
      return [];
    },
    async listPendingArchiveItems(): Promise<ArchiveItem[]> {
      return [];
    },
    async getReviewQueue(): Promise<ReviewQueue> {
      return {
        pending: 0n,
        conflicting: 0n,
        approved: 0n,
        rejected: 0n,
        needsResearch: 0n,
        items: [],
      };
    },
  };

  return {
    mockActor,
    resetBoard: () => {
      posts = [];
      replies = [];
      archiveItems = [];
      nextPostId = 0n;
      nextReplyId = 0n;
      nextArchiveId = 0n;
      isAuthenticated = false;
      isAdmin = false;
    },
    setAuthenticated: (v: boolean) => {
      isAuthenticated = v;
    },
    setAdmin: (v: boolean) => {
      isAdmin = v;
    },
    getAuthenticated: () => isAuthenticated,
    seedApprovedArchiveItem: (tags: string[]) => {
      const item: ArchiveItem = {
        familyId: "norwood",
        id: nextArchiveId++,
        title: "An archive item",
        description: "Description",
        itemType: ArchiveItemType.Document,
        blob: ExternalBlob.fromBytes(
          new Uint8Array([1, 2, 3]),
          "text/plain",
          "item.txt",
        ),
        era: "1924",
        year: 1924n,
        tags,
        relatedMemberIds: [],
        relatedBranchId: "branch-1",
        sourceStatus: SourceStatus.Original,
        privacyLevel: PrivacyLevel.FamilyOnly,
        classification: ArchiveItemClassification.Standard,
        status: ArchiveItemStatus.Approved,
        createdAt: 1_700_000_000_000_000_000n,
        contributor: Principal.fromText(ACCOUNT),
      };
      archiveItems = [...archiveItems, item];
      return item;
    },
  };
});

vi.mock("@caffeineai/core-infrastructure", () => ({
  useActor: () => ({ actor: mockActor, isFetching: false }),
  useInternetIdentity: () => ({
    isAuthenticated: getAuthenticated(),
    login: () => {},
    clear: () => {},
    identity: getAuthenticated()
      ? { getPrincipal: () => Principal.fromText(ACCOUNT) }
      : null,
    isInitializing: false,
    isLoggingIn: false,
  }),
}));

afterEach(cleanup);
beforeEach(resetBoard);

beforeAll(() => {
  // jsdom does not implement URL.createObjectURL, which ExternalBlob.fromBytes
  // relies on when constructing a blob. Provide a deterministic stand-in.
  let counter = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${counter++}`);
});

function renderApp() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>,
  );
}

async function openBoard(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Message Board" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Message Board/ }),
  );
}

describe("Family Message Board: free-form tags with suggestions", () => {
  it("adds a new tag and shows suggestions from existing archive tags in the composer", async () => {
    setAuthenticated(true);
    // An existing archive item carries a tag that should be suggested.
    seedApprovedArchiveItem(["reunion", "1920s"]);
    const user = userEvent.setup();
    renderApp();

    await openBoard(user);
    await user.click(screen.getByTestId("board.new_post"));

    // Type a message body.
    await user.type(
      screen.getByLabelText("Message"),
      "Save the date for the reunion.",
    );

    // Type a partial tag; the existing archive tag is suggested.
    const tagInput = screen.getByLabelText("Tags");
    await user.type(tagInput, "reun");
    expect(
      await screen.findByTestId("board_compose.tag_suggest.reunion"),
    ).toBeInTheDocument();

    // Select the suggestion.
    await user.click(screen.getByTestId("board_compose.tag_suggest.reunion"));
    expect(screen.getByText("reunion")).toBeInTheDocument();

    // Create a brand-new tag that is not among the suggestions.
    await user.type(tagInput, "family");
    await user.click(screen.getByTestId("board_compose.tag_create"));
    expect(screen.getByText("family")).toBeInTheDocument();

    // Post the board post; the tags persist on the created post.
    await user.click(screen.getByRole("button", { name: "Post to board" }));
    expect(
      await screen.findByText("Save the date for the reunion."),
    ).toBeInTheDocument();

    const created = await mockActor.listBoardPosts(null);
    expect(created).toHaveLength(1);
    expect(created[0].tags).toEqual(["reunion", "family"]);
  });

  it("shows tags on the post card and detail view", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.Announcement,
      "Reunion plans",
      "Save the date.",
      [],
      [],
      ["reunion", "1920s"],
    );

    await openBoard(user);

    // The post card shows its tags (scoped to the tag chips, since the tag
    // filter dropdown also renders the tag text as a native <option>).
    expect(
      await screen.findByTestId("board.post.1.tag.reunion"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("board.post.1.tag.1920s")).toBeInTheDocument();

    // The detail view shows the tags too.
    await user.click(await screen.findByText("Reunion plans"));
    const detail = document.querySelector(
      '[data-ocid="board_post.tags"]',
    ) as HTMLElement;
    expect(detail).toBeInTheDocument();
    expect(within(detail).getByText("reunion")).toBeInTheDocument();
    expect(within(detail).getByText("1920s")).toBeInTheDocument();
  });
});

describe("Family Message Board: tag filtering in the filter bar", () => {
  it("filters posts by a tag selected from the dropdown", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "Reunion post",
      "About the reunion.",
      [],
      [],
      ["reunion"],
    );
    await mockActor.createBoardPost(
      PostType.General,
      "Recipe post",
      "A family recipe.",
      [],
      [],
      ["recipe"],
    );

    await openBoard(user);

    // Select the "reunion" tag from the native tag filter dropdown.
    await user.selectOptions(
      document.querySelector(
        '[data-ocid="board.tag_filter"]',
      ) as HTMLSelectElement,
      "reunion",
    );

    // Only the post carrying the reunion tag remains.
    expect(await screen.findByText("Reunion post")).toBeInTheDocument();
    expect(screen.queryByText("Recipe post")).not.toBeInTheDocument();
  });

  it("searches tags by free text in the filter dropdown", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "Reunion post",
      "About the reunion.",
      [],
      [],
      ["reunion"],
    );
    await mockActor.createBoardPost(
      PostType.General,
      "Recipe post",
      "A family recipe.",
      [],
      [],
      ["recipe"],
    );

    await openBoard(user);

    // Type a free-text search; the native tag filter dropdown narrows its
    // options to the matching tag.
    await user.type(screen.getByLabelText("Search tags"), "reun");

    // Only the matching tag option is offered.
    const select = document.querySelector(
      '[data-ocid="board.tag_filter"]',
    ) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => o.value);
    expect(options).toContain("reunion");
    expect(options).not.toContain("recipe");
  });
});

describe("Family Message Board: Steward Hidden / Moderated Posts view", () => {
  it("is steward-only and lists hidden posts with replies intact, searchable by title and tag", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    // Seed two posts, hide one of them, and add a reply to the hidden post.
    await mockActor.createBoardPost(
      PostType.General,
      "Hidden post",
      "This post was hidden.",
      [],
      [],
      ["reunion"],
    );
    await mockActor.createBoardPost(
      PostType.General,
      "Visible post",
      "This post is visible.",
      [],
      [],
      ["recipe"],
    );
    await mockActor.archiveBoardPost(0n);
    await mockActor.addBoardReply(0n, "A reply on the hidden post.");

    // Open the Family Steward hub from the admin-gated nav, then the Hidden /
    // Moderated Posts option card. The steward link is admin-gated, so wait for
    // the admin query to resolve before clicking.
    await user.click(await screen.findByTestId("layout.steward_link"));
    await user.click(
      await screen.findByTestId("steward_hub.hidden_posts_option"),
    );
    expect(
      await screen.findByRole("heading", {
        name: "Hidden / Moderated Posts",
      }),
    ).toBeInTheDocument();

    // Only the hidden post appears, shown in full with its reply intact.
    expect(screen.getByText("Hidden post")).toBeInTheDocument();
    expect(screen.getByText("This post was hidden.")).toBeInTheDocument();
    expect(screen.getByText("A reply on the hidden post.")).toBeInTheDocument();
    expect(screen.queryByText("Visible post")).not.toBeInTheDocument();

    // Search by title narrows the list.
    await user.type(
      screen.getByLabelText("Search hidden posts by title"),
      "visible",
    );
    expect(
      screen.getByRole("heading", { name: "No matching posts" }),
    ).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Search hidden posts by title"));

    // Filter by tag narrows the list.
    await user.selectOptions(
      document.querySelector(
        '[data-ocid="hidden_posts.tag_filter"]',
      ) as HTMLSelectElement,
      "reunion",
    );
    expect(screen.getByText("Hidden post")).toBeInTheDocument();
  });

  it("lets a steward restore a hidden post back to the normal board", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "To restore",
      "This post was hidden.",
      [],
      [],
      [],
    );
    await mockActor.archiveBoardPost(0n);

    // Open the Family Steward hub, then the Hidden / Moderated Posts option, and
    // restore the post. The steward link is admin-gated, so wait for the admin
    // query to resolve before clicking.
    await user.click(await screen.findByTestId("layout.steward_link"));
    await user.click(
      await screen.findByTestId("steward_hub.hidden_posts_option"),
    );
    await screen.findByRole("heading", {
      name: "Hidden / Moderated Posts",
    });
    await user.click(screen.getByRole("button", { name: "Restore" }));

    // The post is restored to the normal board.
    const restored = await mockActor.getBoardPost(0n);
    expect(restored).toMatchObject({
      title: "To restore",
      status: PostStatus.Active,
    });
    const active = await mockActor.listBoardPosts(null);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ title: "To restore" });
  });

  it("is not reachable by a non-steward", async () => {
    setAuthenticated(true);
    setAdmin(false);
    renderApp();

    // Hidden Posts no longer appears in the global navbar at all.
    expect(
      screen.queryByTestId("layout.hidden_posts_link"),
    ).not.toBeInTheDocument();
    // A non-steward never sees the Family Steward nav link, so the Hidden /
    // Moderated Posts option under the steward hub is unreachable.
    expect(screen.queryByTestId("layout.steward_link")).not.toBeInTheDocument();
  });
});

import "@testing-library/jest-dom/vitest";
import {
  ClaimStatus,
  LivingStatus,
  PostStatus,
  PostType,
  PrivacyScope,
} from "@/backend";
import type { Post, Reply } from "@/backend";
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";

// The generated components use data-ocid for test ids.
configure({ testIdAttribute: "data-ocid" });

const ACCOUNT = "2vxsx-fae";

// A stateful in-memory actor standing in for the real backend so the Family
// Message Board journeys (post creation with checkmark multi-select, replies,
// archive/restore) can be exercised end to end without a canister. It
// implements the board + identity + archive methods the board pages call.
const { mockActor, resetBoard, setAuthenticated, setAdmin, getAuthenticated } =
  vi.hoisted(() => {
    const MY_PERSON_ID = "julia";
    let isAuthenticated = false;
    let isAdmin = false;
    let posts: Post[] = [];
    let replies: Reply[] = [];
    let nextPostId = 0n;
    let nextReplyId = 0n;

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
      async listApprovedArchiveItems() {
        return [];
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
      ): Promise<Post> {
        const post: Post = {
          postId: nextPostId++,
          authorAccountId: Principal.fromText(ACCOUNT),
          authorPersonId: MY_PERSON_ID,
          title: title ?? undefined,
          body,
          postType,
          relatedPersonIds,
          linkedMediaIds,
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
      async listNotifications() {
        return [];
      },
      async markNotificationRead() {},
      async canMessagePerson() {
        return false;
      },
    };

    return {
      mockActor,
      resetBoard: () => {
        posts = [];
        replies = [];
        nextPostId = 0n;
        nextReplyId = 0n;
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
  // The Message Board nav button opens the communication hub; the Family
  // Message Board is the primary option inside it.
  await user.click(
    await screen.findByRole("button", { name: "Message Board" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Message Board/ }),
  );
}

describe("Family Message Board: approved member access", () => {
  it("shows the Message Board nav link only to an approved member", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    expect(
      await screen.findByRole("button", { name: "Message Board" }),
    ).toBeInTheDocument();

    // Private Messages is no longer a separate top-level pill — it is reached
    // through the Message Board hub.
    expect(
      screen.queryByRole("button", { name: "Private Messages" }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Message Board" }));
    expect(
      await screen.findByRole("button", { name: /Private Messages/ }),
    ).toBeInTheDocument();
  });

  it("hides the Message Board nav link from a guest", () => {
    renderApp();

    expect(
      screen.queryByRole("button", { name: "Message Board" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Private Messages" }),
    ).not.toBeInTheDocument();
  });

  it("shows the empty board state for a member with no posts", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openBoard(user);

    expect(
      screen.getByRole("heading", { name: "Family Message Board" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "No posts yet" }),
    ).toBeInTheDocument();
  });
});

describe("Family Message Board: post creation with checkmark multi-select", () => {
  it("creates a post with a type, title, body, and related members via checkmark chips", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openBoard(user);
    await user.click(screen.getByTestId("board.new_post"));

    // Choose a post type.
    await user.click(screen.getByRole("button", { name: "Announcement" }));

    // Fill title and body.
    await user.type(screen.getByLabelText(/Title/), "Family reunion announced");
    await user.type(
      screen.getByLabelText("Message"),
      "Save the date for the annual reunion.",
    );

    // Select related family members via the checkmark multi-select chips.
    const memberChip = screen.getByRole("button", {
      name: "Versie Smith",
    });
    await user.click(memberChip);
    expect(memberChip).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Harvey Adams Sr." }));
    await user.click(screen.getByRole("button", { name: "Lula Mae Norwood" }));

    await user.click(screen.getByRole("button", { name: "Post to board" }));

    // Back on the board, the new post appears.
    expect(
      await screen.findByText("Family reunion announced"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Save the date for the annual reunion."),
    ).toBeInTheDocument();

    // The created post carried the selected related members.
    const created = await mockActor.listBoardPosts(null);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      title: "Family reunion announced",
      postType: PostType.Announcement,
      status: PostStatus.Active,
    });
    expect(created[0].relatedPersonIds).toEqual(
      expect.arrayContaining(["versie-smith", "harvey-adams-sr", "lula-mae"]),
    );
  });

  it("requires a message body before posting", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await openBoard(user);
    await user.click(screen.getByTestId("board.new_post"));

    await user.click(screen.getByRole("button", { name: "Post to board" }));

    expect(
      await screen.findByText("Please write a message before posting."),
    ).toBeInTheDocument();
    expect(await mockActor.listBoardPosts(null)).toEqual([]);
  });

  it("reopens saved related-member selections when editing a post", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    // Seed a post authored by the current user with related members.
    await mockActor.createBoardPost(
      PostType.General,
      "Seed post",
      "Seed body",
      ["versie-smith", "lula-mae"],
      [],
    );

    await openBoard(user);
    await user.click(await screen.findByText("Seed post"));

    // Open the composer to edit the post.
    await user.click(screen.getByRole("button", { name: "Edit" }));

    // The saved related-member selections reopen selected.
    expect(
      screen.getByRole("button", { name: "Versie Smith" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "Lula Mae Norwood" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Family Message Board: replies", () => {
  it("adds a reply that appears chronologically under the post", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "A question",
      "Does anyone have the old photo?",
      [],
      [],
    );

    await openBoard(user);
    await user.click(await screen.findByText("A question"));

    // Add a reply.
    await user.type(
      screen.getByLabelText("Write a reply"),
      "I think I have it.",
    );
    await user.click(screen.getByRole("button", { name: "Send reply" }));

    expect(await screen.findByText("I think I have it.")).toBeInTheDocument();

    const replies = await mockActor.listBoardReplies(0n);
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ body: "I think I have it." });
  });
});

describe("Family Message Board: archive and restore", () => {
  it("lets a steward archive a post and restore it", async () => {
    setAuthenticated(true);
    setAdmin(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "To hide",
      "This post should be hidden.",
      [],
      [],
    );

    await openBoard(user);
    await user.click(await screen.findByText("To hide"));

    // A steward sees the Hide action on the post detail view.
    await user.click(screen.getByRole("button", { name: "Hide" }));

    // The post is archived in the backend: it is no longer returned by the
    // active-post reads (getBoardPost and listBoardPosts both filter to Active,
    // matching the backend contract), so it disappears from the board.
    const archived = await mockActor.getBoardPost(0n);
    expect(archived).toBeNull();
    const all = await mockActor.listBoardPosts(null);
    expect(all).toEqual([]);

    // A steward restores the archived post through the backend API, returning
    // it to the active board.
    const restored = await mockActor.restoreBoardPost(0n);
    expect(restored).toMatchObject({ status: PostStatus.Active });
    const active = await mockActor.listBoardPosts(null);
    expect(active).toHaveLength(1);
    expect(active[0]).toMatchObject({ title: "To hide" });
  });
});

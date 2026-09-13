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
// Message Board post-detail and edit journeys can be exercised end to end
// without a canister. It implements the board + identity methods the board
// pages call.
const { mockActor, resetBoard, setAuthenticated, getAuthenticated } =
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
        tags: string[],
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
  await user.click(
    await screen.findByRole("button", { name: "Message Board" }),
  );
  await user.click(
    await screen.findByRole("button", { name: /Family Message Board/ }),
  );
}

describe("Family Message Board: post detail view", () => {
  it("renders the author, type badge, title, body, related members, and reply count", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.Announcement,
      "Family reunion",
      "Save the date for the annual reunion.",
      ["versie-smith", "lula-mae"],
      [],
      [],
    );
    await mockActor.addBoardReply(0n, "I will be there.");

    await openBoard(user);
    await user.click(await screen.findByText("Family reunion"));

    // The detail view shows the post's type badge and title (the title appears
    // both as the page heading and as the post-card title).
    expect(
      (await screen.findAllByRole("heading", { name: "Family reunion" }))
        .length,
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("board_post.type_badge")).toHaveTextContent(
      "Announcement",
    );
    // The body is rendered.
    expect(
      screen.getByText("Save the date for the annual reunion."),
    ).toBeInTheDocument();
    // Related members render as chips linking to their profiles.
    expect(
      screen.getByTestId("board_post.related.versie-smith"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("board_post.related.lula-mae"),
    ).toBeInTheDocument();
    // The reply count reflects the seeded reply.
    expect(screen.getByText("1 reply")).toBeInTheDocument();
  });

  it("shows the author's canonical display name on the post", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "A question",
      "Does anyone have the old photo?",
      [],
      [],
      [],
    );

    await openBoard(user);
    await user.click(await screen.findByText("A question"));

    // The author chip resolves the canonical display name (Julia Norwood).
    const author = await screen.findByTestId("board_post.author");
    expect(within(author).getByText("Julia Norwood")).toBeInTheDocument();
  });
});

describe("Family Message Board: editing a post", () => {
  it("updates the post body and title through the edit flow", async () => {
    setAuthenticated(true);
    const user = userEvent.setup();
    renderApp();

    await mockActor.createBoardPost(
      PostType.General,
      "Original title",
      "Original body.",
      [],
      [],
      [],
    );

    await openBoard(user);
    await user.click(await screen.findByText("Original title"));

    // Open the composer to edit the post.
    await user.click(await screen.findByRole("button", { name: "Edit" }));

    // The composer is seeded with the existing title and body.
    const titleInput = screen.getByLabelText(/Title/);
    expect(titleInput).toHaveValue("Original title");
    expect(screen.getByLabelText("Message")).toHaveValue("Original body.");

    // Change the title and body, then save.
    await user.clear(titleInput);
    await user.type(titleInput, "Updated title");
    await user.clear(screen.getByLabelText("Message"));
    await user.type(screen.getByLabelText("Message"), "Updated body.");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    // The updated post is persisted through the backend contract.
    const updated = await mockActor.getBoardPost(0n);
    expect(updated).toMatchObject({
      title: "Updated title",
      body: "Updated body.",
      status: PostStatus.Active,
    });
  });
});

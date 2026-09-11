import { MessageSquarePlus, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { type BoardFilter, BoardFilterBar } from "../components/BoardFilterBar";
import { BoardPostCard } from "../components/BoardPostCard";
import {
  useArchiveBoardPost,
  useListBoardPosts,
  useRestoreBoardPost,
} from "../hooks/useBoard";
import { useNavbarIdentity } from "../hooks/useNavbarIdentity";
import type { PostType } from "../types/board";
import { ClaimStatus } from "../types/ownership";

interface MessageBoardPageProps {
  /** Navigates back to the previous view. */
  onBack: () => void;
  /** Opens a post's detail view. */
  onOpenPost: (postId: bigint) => void;
  /** Opens the composer to create a new post. */
  onCompose: () => void;
  /** Opens a person's profile. */
  onOpenProfile: (personId: string) => void;
}

/** Converts a board filter to the backend filter argument (null = all). */
function filterToPostType(filter: BoardFilter): PostType | null {
  return filter === "all" ? null : filter;
}

/**
 * The Family Message Board. Lists board posts newest first with filter pills
 * (All / Announcements / Questions / Research & History / Recipes / Events /
 * Memorials) and a New Post button. Only approved family members (a linked,
 * claimed Person Profile) can view the board; guests see a no-access state.
 */
export function MessageBoardPage({
  onBack,
  onOpenPost,
  onCompose,
  onOpenProfile,
}: MessageBoardPageProps) {
  const { claimStatus } = useNavbarIdentity();
  const [filter, setFilter] = useState<BoardFilter>("all");

  const { data: posts = [], isLoading } = useListBoardPosts(
    filterToPostType(filter),
  );
  const archivePost = useArchiveBoardPost();
  const restorePost = useRestoreBoardPost();

  const isApprovedMember = claimStatus === ClaimStatus.Claimed;

  if (!isApprovedMember) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
        <header className="flex items-center gap-3">
          <button
            type="button"
            data-ocid="board.back_button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageSquarePlus
              className="h-4 w-4 rotate-180"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Family Message Board
          </h1>
        </header>
        <div
          data-ocid="board.no_access"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShieldAlert
              className="h-6 w-6"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Family only
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            The Message Board is private to approved family members. Connect
            your family profile to join the conversation.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-ocid="board.back_button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageSquarePlus
              className="h-4 w-4 rotate-180"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Family Message Board
            </h1>
            <p className="text-sm text-muted-foreground">
              {posts.length > 0
                ? `${posts.length} post${posts.length === 1 ? "" : "s"}`
                : "Share news, questions, and memories"}
            </p>
          </div>
        </div>
        <button
          type="button"
          data-ocid="board.new_post"
          onClick={onCompose}
          className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <MessageSquarePlus
            className="h-4 w-4"
            strokeWidth={2}
            aria-hidden="true"
          />
          New Post
        </button>
      </header>

      <BoardFilterBar active={filter} onChange={setFilter} />

      {isLoading ? (
        <div
          data-ocid="board.loading_state"
          className="flex flex-col gap-3"
          aria-label="Loading posts"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-40 animate-pulse rounded-xl border border-border/60 bg-card"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div
          data-ocid="board.empty_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <MessageSquarePlus
              className="h-6 w-6"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            No posts yet
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Be the first to share something with the family.
          </p>
          <button
            type="button"
            data-ocid="board.empty_compose"
            onClick={onCompose}
            className="mt-1 inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-accent px-4 py-1.5 text-xs font-semibold text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageSquarePlus
              className="h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden="true"
            />
            New Post
          </button>
        </div>
      ) : (
        <div data-ocid="board.list" className="flex flex-col gap-3">
          {posts.map((post, index) => (
            <BoardPostCard
              key={post.postId}
              post={post}
              index={index}
              onOpen={() => onOpenPost(post.postId)}
              onOpenProfile={onOpenProfile}
              onEdit={() => onOpenPost(post.postId)}
              onArchive={() => archivePost.mutate(post.postId)}
              onRestore={() => restorePost.mutate(post.postId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

import {
  ArrowLeft,
  MessageSquare,
  Paperclip,
  Search,
  ShieldAlert,
  Undo2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import {
  useListBoardReplies,
  useListHiddenBoardPosts,
  useRestoreBoardPost,
} from "../hooks/useBoard";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { ARCHIVE_ITEM_TYPE_LABELS } from "../types/archive";
import { POST_TYPE_LABELS, type Post, type Reply } from "../types/board";

interface HiddenPostsPageProps {
  /** Navigates back to the Family Steward hub. */
  onBack: () => void;
  /** Opens a post's detail view. */
  onOpenPost: (postId: bigint) => void;
  /** Opens a person's profile. */
  onOpenProfile: (personId: string) => void;
}

/** Extracts initials from a family member's name for the avatar chip. */
function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Formats a backend nanosecond timestamp as a readable date/time. */
function formatPostDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

/** Maps a post type to its dot-color modifier class from index.css. */
function postTypeBadgeClass(postType: Post["postType"]): string {
  switch (postType) {
    case "Announcement":
      return "post-type-announcement";
    case "FamilyQuestion":
      return "post-type-question";
    case "ResearchHistory":
      return "post-type-research";
    case "PhotoIdentification":
      return "post-type-photo";
    case "Recipe":
      return "post-type-recipe";
    case "ReunionEvent":
      return "post-type-reunion";
    case "Memorial":
      return "post-type-memorial";
    default:
      return "";
  }
}

/**
 * The Steward-only Hidden / Moderated Posts view. Lists hidden (archived) board
 * posts for review before restoring. The view is searchable/filterable by title
 * or tag, and each hidden post is shown in full with its replies intact so a
 * Steward can review the conversation before returning it to the normal board.
 * Restoring a post unhides it; hiding never permanently deletes a post.
 */
export function HiddenPostsPage({
  onBack,
  onOpenPost,
  onOpenProfile,
}: HiddenPostsPageProps) {
  const { data: posts = [], isLoading } = useListHiddenBoardPosts();
  const restorePost = useRestoreBoardPost();

  // Local UI state for the search/filter bar.
  const [titleQuery, setTitleQuery] = useState("");
  const [activeTag, setActiveTag] = useState<string | null>(null);

  // Every tag present across the hidden posts, sorted, for the filter dropdown.
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const post of posts) {
      for (const tag of post.tags) set.add(tag);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [posts]);

  // Filter by title (free text, case-insensitive) and/or a single tag.
  const filteredPosts = useMemo(() => {
    const query = titleQuery.trim().toLowerCase();
    return posts.filter((post) => {
      if (query) {
        const title = (post.title ?? "").toLowerCase();
        if (!title.includes(query)) return false;
      }
      if (activeTag && !post.tags.includes(activeTag)) return false;
      return true;
    });
  }, [posts, titleQuery, activeTag]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex items-center gap-3">
        <button
          type="button"
          data-ocid="hidden_posts.back_button"
          onClick={onBack}
          aria-label="Back to Family Steward"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Hidden / Moderated Posts
          </h1>
          <p className="text-sm text-muted-foreground">
            {posts.length > 0
              ? `${posts.length} hidden post${posts.length === 1 ? "" : "s"} awaiting review`
              : "Review hidden posts before restoring them"}
          </p>
        </div>
      </header>

      {/* Search / filter bar: title search + tag filter dropdown */}
      <div
        data-ocid="hidden_posts.filter_bar"
        className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center"
        style={{
          backgroundColor: "oklch(var(--moderated-panel))",
          borderColor: "oklch(var(--hidden-post-rule))",
        }}
      >
        <label className="search-input sm:max-w-xs">
          <Search
            className="search-icon h-4 w-4 shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          <input
            data-ocid="hidden_posts.search_input"
            value={titleQuery}
            onChange={(event) => setTitleQuery(event.target.value)}
            placeholder="Search by title…"
            aria-label="Search hidden posts by title"
          />
        </label>

        <label className="filter-select">
          <span className="sr-only">Filter by tag</span>
          <select
            data-ocid="hidden_posts.tag_filter"
            value={activeTag ?? ""}
            onChange={(event) => setActiveTag(event.target.value || null)}
            className="bg-transparent outline-none"
          >
            <option value="">All tags</option>
            {availableTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        </label>

        {(titleQuery || activeTag) && (
          <button
            type="button"
            data-ocid="hidden_posts.clear_filters"
            onClick={() => {
              setTitleQuery("");
              setActiveTag(null);
            }}
            className="filter-clear"
          >
            Clear filters
          </button>
        )}
      </div>

      {isLoading ? (
        <div
          data-ocid="hidden_posts.loading_state"
          className="flex flex-col gap-3"
          aria-label="Loading hidden posts"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-48 animate-pulse rounded-xl border border-border/60 bg-card"
            />
          ))}
        </div>
      ) : filteredPosts.length === 0 ? (
        <div
          data-ocid="hidden_posts.empty_state"
          className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <ShieldAlert
              className="h-6 w-6"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            {posts.length === 0 ? "No hidden posts" : "No matching posts"}
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            {posts.length === 0
              ? "There are no hidden posts to review right now."
              : "Try a different title or tag filter."}
          </p>
        </div>
      ) : (
        <div data-ocid="hidden_posts.list" className="flex flex-col gap-4">
          {filteredPosts.map((post, index) => (
            <HiddenPostCard
              key={post.postId}
              post={post}
              index={index}
              onOpenPost={onOpenPost}
              onOpenProfile={onOpenProfile}
              onRestore={() => restorePost.mutate(post.postId)}
              isRestoring={restorePost.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * A single hidden post shown in full with its replies intact for review. The
 * card wears the quiet desaturated hidden-post surface with a spiced-rust
 * "Hidden" badge, distinct from the normal sepia board. A Restore action
 * returns the post to the normal board.
 */
function HiddenPostCard({
  post,
  index,
  onOpenPost,
  onOpenProfile,
  onRestore,
  isRestoring,
}: {
  post: Post;
  index: number;
  onOpenPost: (postId: bigint) => void;
  onOpenProfile: (personId: string) => void;
  onRestore: () => void;
  isRestoring: boolean;
}) {
  const canonical = useCanonicalPerson(post.authorPersonId, "");
  const { data: replies = [], isLoading: repliesLoading } = useListBoardReplies(
    post.postId,
  );
  const { data: archiveItems = [] } = useApprovedArchiveItems();

  const linkedMedia = archiveItems.filter((item) =>
    post.linkedMediaIds.includes(item.id),
  );

  return (
    <article
      data-ocid={`hidden_posts.item.${index + 1}`}
      className="flex flex-col gap-3 rounded-xl border p-4 sm:p-5"
      style={{
        backgroundColor: "oklch(var(--hidden-post-surface))",
        borderColor: "oklch(var(--hidden-post-rule))",
        color: "oklch(var(--hidden-post-surface-foreground))",
      }}
    >
      {/* Header: author identity + Hidden badge */}
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          data-ocid={`hidden_posts.item.${index + 1}.author`}
          onClick={() => onOpenProfile(post.authorPersonId)}
          className="flex min-w-0 items-center gap-2.5 text-left"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-xs font-semibold"
            style={{
              backgroundColor: "oklch(var(--muted))",
              color: "oklch(var(--muted-foreground))",
            }}
            aria-hidden="true"
          >
            {canonical.profilePhotoUrl ? (
              <img
                src={canonical.profilePhotoUrl}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover"
              />
            ) : (
              getInitials(canonical.displayName || "?")
            )}
          </span>
          <span className="min-w-0">
            <span
              className="block truncate text-sm font-semibold leading-tight"
              style={{ color: "oklch(var(--hidden-post-surface-foreground))" }}
            >
              {canonical.displayName || "Family member"}
            </span>
            <span
              className="block text-[11px] font-medium"
              style={{ color: "oklch(var(--muted-foreground))" }}
            >
              {formatPostDate(post.createdAt)}
            </span>
          </span>
        </button>
        <span
          data-ocid={`hidden_posts.item.${index + 1}.hidden_badge`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]"
          style={{
            backgroundColor: "oklch(var(--hidden-post-accent))",
            color: "oklch(var(--hidden-post-accent-foreground))",
          }}
        >
          <ShieldAlert className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
          Hidden
        </span>
      </div>

      {/* Post type badge */}
      <span
        className={`post-type-badge ${postTypeBadgeClass(post.postType)}`}
        data-ocid={`hidden_posts.item.${index + 1}.type_badge`}
      >
        {POST_TYPE_LABELS[post.postType]}
      </span>

      {/* Full post body */}
      <button
        type="button"
        data-ocid={`hidden_posts.item.${index + 1}.open`}
        onClick={() => onOpenPost(post.postId)}
        className="flex flex-col gap-2 text-left"
      >
        {post.title ? (
          <h3
            className="font-display text-lg font-semibold leading-snug"
            style={{ color: "oklch(var(--hidden-post-surface-foreground))" }}
          >
            {post.title}
          </h3>
        ) : null}
        <p
          className="whitespace-pre-line text-sm leading-relaxed"
          style={{ color: "oklch(var(--hidden-post-surface-foreground))" }}
        >
          {post.body}
        </p>
      </button>

      {/* Tags */}
      {post.tags.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {post.tags.map((tag) => (
            <span key={tag} className="tag-chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {/* Related members */}
      {post.relatedPersonIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {post.relatedPersonIds.map((personId) => (
            <RelatedMemberChip
              key={personId}
              personId={personId}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </div>
      ) : null}

      {/* Linked media */}
      {linkedMedia.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          {linkedMedia.map((item) => (
            <span key={item.id} className="attachment-chip">
              <span className="attachment-icon">
                <Paperclip
                  className="h-3.5 w-3.5"
                  strokeWidth={2}
                  aria-hidden="true"
                />
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="attachment-name">{item.title}</span>
                <span className="attachment-meta">
                  {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
                </span>
              </span>
            </span>
          ))}
        </div>
      ) : null}

      {/* Replies intact for review */}
      <div className="reply-thread">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <MessageSquare
            className="h-3.5 w-3.5"
            strokeWidth={2}
            aria-hidden="true"
          />
          {replies.length} {replies.length === 1 ? "reply" : "replies"}
        </div>
        {repliesLoading ? (
          <div className="flex flex-col gap-2.5" aria-label="Loading replies">
            {[0, 1].map((i) => (
              <div
                key={i}
                className="h-14 animate-pulse rounded-lg border border-border/60 bg-card"
              />
            ))}
          </div>
        ) : replies.length === 0 ? (
          <p className="text-sm text-muted-foreground">No replies.</p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {replies.map((reply) => (
              <ReplyItem
                key={reply.replyId}
                reply={reply}
                onOpenProfile={onOpenProfile}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Footer: restore action */}
      <div
        className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t pt-3"
        style={{ borderColor: "oklch(var(--hidden-post-rule))" }}
      >
        <span
          className="text-[11px] font-medium"
          style={{ color: "oklch(var(--muted-foreground))" }}
        >
          Hidden posts are never deleted — restoring returns this post to the
          board.
        </span>
        <button
          type="button"
          data-ocid={`hidden_posts.item.${index + 1}.restore`}
          onClick={onRestore}
          disabled={isRestoring}
          className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          style={{
            backgroundColor: "oklch(var(--hidden-post-accent))",
            color: "oklch(var(--hidden-post-accent-foreground))",
          }}
        >
          <Undo2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          {isRestoring ? "Restoring…" : "Restore"}
        </button>
      </div>
    </article>
  );
}

/** A related-member chip that links to the member's profile. */
function RelatedMemberChip({
  personId,
  onOpenProfile,
}: {
  personId: string;
  onOpenProfile: (personId: string) => void;
}) {
  const canonical = useCanonicalPerson(personId, personId);
  return (
    <button
      type="button"
      data-ocid={`hidden_posts.related.${personId}`}
      onClick={() => onOpenProfile(personId)}
      className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-muted text-[8px] font-semibold text-muted-foreground">
        {getInitials(canonical.displayName || "?")}
      </span>
      {canonical.displayName}
    </button>
  );
}

/** A single reply plate with the replier's canonical identity. */
function ReplyItem({
  reply,
  onOpenProfile,
}: {
  reply: Reply;
  onOpenProfile: (personId: string) => void;
}) {
  const canonical = useCanonicalPerson(reply.authorPersonId, "");
  return (
    <li className="reply-item">
      <button
        type="button"
        data-ocid={`hidden_posts.reply.${reply.replyId}.author`}
        onClick={() => onOpenProfile(reply.authorPersonId)}
        className="reply-avatar shrink-0"
        aria-label="Open profile"
      >
        {canonical.profilePhotoUrl ? (
          <img
            src={canonical.profilePhotoUrl}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover"
          />
        ) : (
          getInitials(canonical.displayName || "?")
        )}
      </button>
      <div className="reply-body">
        <div className="flex items-center justify-between gap-2">
          <span className="reply-name">
            {canonical.displayName || "Family member"}
          </span>
          <span className="reply-meta">{formatPostDate(reply.createdAt)}</span>
        </div>
        <p className="reply-text whitespace-pre-line">{reply.body}</p>
      </div>
    </li>
  );
}

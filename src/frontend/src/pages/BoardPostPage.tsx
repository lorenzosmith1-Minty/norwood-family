import { Archive, MessageSquare, Pencil, Undo2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { BoardReplyThread } from "../components/BoardReplyThread";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import {
  useAddBoardReply,
  useArchiveBoardPost,
  useGetBoardPost,
  useListBoardReplies,
  useRemoveBoardReply,
  useRestoreBoardPost,
} from "../hooks/useBoard";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { useNavbarIdentity } from "../hooks/useNavbarIdentity";
import {
  useListNotifications,
  useMarkNotificationRead,
} from "../hooks/useNotifications";
import { ARCHIVE_ITEM_TYPE_LABELS } from "../types/archive";
import { POST_TYPE_LABELS, type Post, PostStatus } from "../types/board";
import { NotificationType } from "../types/ownership";

interface BoardPostPageProps {
  /** The post id to display. */
  postId: bigint;
  /** Navigates back to the board list. */
  onBack: () => void;
  /** Opens a person's profile. */
  onOpenProfile: (personId: string) => void;
  /** Opens the composer to edit this post (author only). */
  onEdit: () => void;
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
    weekday: "short",
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
 * A single board post's detail view. Shows the full post (author identity from
 * the canonical Person Profile, post-type badge, title, body, related members,
 * linked media, timestamp) followed by the one-level chronological reply
 * thread. Authors can edit/archive their own post; Stewards can
 * archive/restore the post and remove replies.
 */
export function BoardPostPage({
  postId,
  onBack,
  onOpenProfile,
  onEdit,
}: BoardPostPageProps) {
  const { personId: myPersonId } = useNavbarIdentity();
  const { data: isAdmin = false } = useIsAdmin();
  const { data: post } = useGetBoardPost(postId);
  const { data: replies = [], isLoading: repliesLoading } =
    useListBoardReplies(postId);
  const { data: archiveItems = [] } = useApprovedArchiveItems();

  const addReply = useAddBoardReply();
  const removeReply = useRemoveBoardReply();
  const archivePost = useArchiveBoardPost();
  const restorePost = useRestoreBoardPost();

  // Hooks must run unconditionally, so resolve the author's canonical identity
  // before the early return below.
  const canonical = useCanonicalPerson(post?.authorPersonId, "");
  const isAuthor =
    myPersonId !== undefined && post?.authorPersonId === myPersonId;
  const isArchived = post?.status === PostStatus.Archived;
  const linkedMedia = (post ? archiveItems : []).filter((item) =>
    post?.linkedMediaIds.includes(item.id),
  );

  // Opening the post marks the associated #BoardReply / #BoardMention
  // notification(s) as read, so the notification badge clears once the user
  // reads the related content. Guarded with a ref so the invalidation-triggered
  // refetch doesn't re-fire it.
  const { data: notifications = [] } = useListNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const markedNotificationsRef = useRef(false);
  useEffect(() => {
    if (!post || markedNotificationsRef.current) return;
    const unreadBoardNotifications = notifications.filter(
      (notification) =>
        !notification.read &&
        (notification.notificationType === NotificationType.BoardReply ||
          notification.notificationType === NotificationType.BoardMention),
    );
    if (unreadBoardNotifications.length === 0) return;
    markedNotificationsRef.current = true;
    for (const notification of unreadBoardNotifications) {
      markNotificationRead.mutate(notification.id);
    }
  }, [post, notifications, markNotificationRead]);

  if (!post) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
        <header className="flex items-center gap-3">
          <button
            type="button"
            data-ocid="board_post.back_button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageSquare
              className="h-4 w-4 rotate-180"
              strokeWidth={2}
              aria-hidden="true"
            />
          </button>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Post
          </h1>
        </header>
        <div
          data-ocid="board_post.loading_state"
          className="flex flex-col gap-3"
          aria-label="Loading post"
        >
          <div className="h-48 animate-pulse rounded-xl border border-border/60 bg-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex items-center gap-3">
        <button
          type="button"
          data-ocid="board_post.back_button"
          onClick={onBack}
          aria-label="Back to board"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <MessageSquare
            className="h-4 w-4 rotate-180"
            strokeWidth={2}
            aria-hidden="true"
          />
        </button>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {post.title ?? POST_TYPE_LABELS[post.postType]}
        </h1>
      </header>

      <article
        data-ocid="board_post.detail"
        className={`post-card ${isArchived ? "opacity-70" : ""}`}
      >
        {/* Header: author identity + post-type badge */}
        <div className="post-card-head">
          <button
            type="button"
            data-ocid="board_post.author"
            onClick={() => onOpenProfile(post.authorPersonId)}
            className="post-card-author min-w-0 text-left"
          >
            <span className="author-avatar" aria-hidden="true">
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
              <span className="author-name block">
                {canonical.displayName || "Family member"}
              </span>
              <span className="author-meta block">
                {formatPostDate(post.createdAt)}
                {isArchived ? " · Archived" : ""}
              </span>
            </span>
          </button>
          <span
            className={`post-type-badge ${postTypeBadgeClass(post.postType)}`}
            data-ocid="board_post.type_badge"
          >
            {POST_TYPE_LABELS[post.postType]}
          </span>
        </div>

        {/* Body */}
        {post.title ? <h2 className="post-card-title">{post.title}</h2> : null}
        <p className="post-card-body whitespace-pre-line">{post.body}</p>

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
          <div className="flex flex-wrap items-center gap-1.5">
            {linkedMedia.map((item) => (
              <span
                key={item.id}
                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
              >
                {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
                <span className="max-w-[10rem] truncate">{item.title}</span>
              </span>
            ))}
          </div>
        ) : null}

        {/* Actions */}
        <div className="post-card-footer">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <MessageSquare
              className="h-3.5 w-3.5"
              strokeWidth={2}
              aria-hidden="true"
            />
            {replies.length} {replies.length === 1 ? "reply" : "replies"}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            {isAuthor && !isArchived ? (
              <button
                type="button"
                data-ocid="board_post.edit"
                onClick={onEdit}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Pencil
                  className="h-3 w-3"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Edit
              </button>
            ) : null}
            {isAuthor && !isArchived ? (
              <button
                type="button"
                data-ocid="board_post.archive"
                onClick={() => archivePost.mutate(post.postId)}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Archive
                  className="h-3 w-3"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Archive
              </button>
            ) : null}
            {isAdmin && !isArchived ? (
              <button
                type="button"
                data-ocid="board_post.steward_archive"
                onClick={() => archivePost.mutate(post.postId)}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Archive
                  className="h-3 w-3"
                  strokeWidth={2}
                  aria-hidden="true"
                />
                Hide
              </button>
            ) : null}
            {isAdmin && isArchived ? (
              <button
                type="button"
                data-ocid="board_post.restore"
                onClick={() => restorePost.mutate(post.postId)}
                className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <Undo2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
                Restore
              </button>
            ) : null}
          </span>
        </div>
      </article>

      {/* Reply thread */}
      <section aria-label="Replies">
        <h2 className="mb-3 font-display text-lg font-semibold text-foreground">
          Replies
        </h2>
        <BoardReplyThread
          replies={replies}
          isLoading={repliesLoading}
          onSendReply={(body) => addReply.mutate({ postId, body })}
          isSending={addReply.isPending}
          onRemoveReply={(replyId) => removeReply.mutate(replyId)}
          onOpenProfile={onOpenProfile}
        />
      </section>
    </div>
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
      data-ocid={`board_post.related.${personId}`}
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

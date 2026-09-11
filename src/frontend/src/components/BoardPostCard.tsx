import { Archive, MessageSquare, Pencil, Undo2 } from "lucide-react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import { useListBoardReplies } from "../hooks/useBoard";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { useNavbarIdentity } from "../hooks/useNavbarIdentity";
import { ARCHIVE_ITEM_TYPE_LABELS } from "../types/archive";
import { POST_TYPE_LABELS, type Post, PostStatus } from "../types/board";

interface BoardPostCardProps {
  /** The board post to render. */
  post: Post;
  /** Zero-based position in the list, used for deterministic test markers. */
  index: number;
  /** Opens the post detail view. */
  onOpen: () => void;
  /** Opens a person's profile. */
  onOpenProfile: (personId: string) => void;
  /** Opens the composer to edit this post (author only). */
  onEdit: () => void;
  /** Archives the post (author or steward). */
  onArchive: () => void;
  /** Restores an archived post (steward only). */
  onRestore: () => void;
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

/** Formats a backend nanosecond timestamp as a readable relative time. */
function formatPostTime(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
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
 * A single Family Message Board post card. The header renders the author's
 * canonical Person Profile identity (display name + photo, linking to the
 * profile — never a raw account ID) alongside a post-type badge. The body holds
 * the optional title, message, related-member chips, and linked media. The
 * footer shows the reply count and, for the author or a Steward, the
 * edit/archive/restore actions.
 */
export function BoardPostCard({
  post,
  index,
  onOpen,
  onOpenProfile,
  onEdit,
  onArchive,
  onRestore,
}: BoardPostCardProps) {
  const { personId: myPersonId } = useNavbarIdentity();
  const { data: isAdmin = false } = useIsAdmin();
  const { data: archiveItems = [] } = useApprovedArchiveItems();
  const { data: replies = [] } = useListBoardReplies(post.postId);

  const canonical = useCanonicalPerson(post.authorPersonId, "");
  const isAuthor =
    myPersonId !== undefined && post.authorPersonId === myPersonId;
  const isArchived = post.status === PostStatus.Archived;

  const linkedMedia = archiveItems.filter((item) =>
    post.linkedMediaIds.includes(item.id),
  );

  return (
    <article
      data-ocid={`board.post.${index + 1}`}
      className={`post-card ${isArchived ? "opacity-70" : ""}`}
    >
      {/* Header: author identity + post-type badge */}
      <div className="post-card-head">
        <button
          type="button"
          data-ocid={`board.post.${index + 1}.author`}
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
              {formatPostTime(post.createdAt)}
              {isArchived ? " · Archived" : ""}
            </span>
          </span>
        </button>
        <span
          className={`post-type-badge ${postTypeBadgeClass(post.postType)}`}
          data-ocid={`board.post.${index + 1}.type_badge`}
        >
          {POST_TYPE_LABELS[post.postType]}
        </span>
      </div>

      {/* Body: title + message */}
      <button
        type="button"
        data-ocid={`board.post.${index + 1}.open`}
        onClick={onOpen}
        className="flex flex-col gap-2 text-left"
      >
        {post.title ? <h3 className="post-card-title">{post.title}</h3> : null}
        <p className="post-card-body whitespace-pre-line">{post.body}</p>
      </button>

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

      {/* Footer: reply count + actions */}
      <div className="post-card-footer">
        <span
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"
          data-ocid={`board.post.${index + 1}.reply_count`}
        >
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
              data-ocid={`board.post.${index + 1}.edit`}
              onClick={onEdit}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Pencil className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Edit
            </button>
          ) : null}

          {isAuthor && !isArchived ? (
            <button
              type="button"
              data-ocid={`board.post.${index + 1}.archive`}
              onClick={onArchive}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Archive className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Archive
            </button>
          ) : null}

          {isAdmin && !isArchived ? (
            <button
              type="button"
              data-ocid={`board.post.${index + 1}.steward_archive`}
              onClick={onArchive}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Archive className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Hide
            </button>
          ) : null}

          {isAdmin && isArchived ? (
            <button
              type="button"
              data-ocid={`board.post.${index + 1}.restore`}
              onClick={onRestore}
              className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2.5 py-1 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <Undo2 className="h-3 w-3" strokeWidth={2} aria-hidden="true" />
              Restore
            </button>
          ) : null}
        </span>
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
      data-ocid={`board.related.${personId}`}
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

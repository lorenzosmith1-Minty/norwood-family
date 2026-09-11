import { Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import type { Reply } from "../types/board";

interface BoardReplyThreadProps {
  /** The one-level replies to the post, in chronological order. */
  replies: Reply[];
  /** True while the reply list is still loading. */
  isLoading: boolean;
  /** Sends a new reply body. The parent owns the mutation. */
  onSendReply: (body: string) => void;
  /** True while a reply is being sent. */
  isSending: boolean;
  /** Removes a reply (steward only). */
  onRemoveReply: (replyId: bigint) => void;
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
function formatReplyTime(timestamp: bigint): string {
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

/**
 * The one-level reply thread under a board post. Replies are shown
 * chronologically (oldest first) as compact plates, each with the replier's
 * canonical Person Profile identity. A composer at the bottom lets any approved
 * family member add a reply; Stewards can remove any reply.
 */
export function BoardReplyThread({
  replies,
  isLoading,
  onSendReply,
  isSending,
  onRemoveReply,
  onOpenProfile,
}: BoardReplyThreadProps) {
  const { data: isAdmin = false } = useIsAdmin();
  const [draft, setDraft] = useState("");

  const canSend = draft.trim().length > 0 && !isSending;

  const handleSend = () => {
    const body = draft.trim();
    if (!body || isSending) return;
    setDraft("");
    onSendReply(body);
  };

  return (
    <div className="reply-thread">
      {isLoading ? (
        <div className="flex flex-col gap-2.5" aria-label="Loading replies">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-16 animate-pulse rounded-lg border border-border/60 bg-card"
            />
          ))}
        </div>
      ) : replies.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No replies yet. Be the first to reply.
        </p>
      ) : (
        <ul className="flex flex-col gap-2.5">
          {replies.map((reply) => (
            <ReplyItem
              key={reply.replyId}
              reply={reply}
              isAdmin={isAdmin}
              onRemoveReply={onRemoveReply}
              onOpenProfile={onOpenProfile}
            />
          ))}
        </ul>
      )}

      {/* Reply composer */}
      <div className="flex items-start gap-2 pt-1">
        <textarea
          data-ocid="board.reply.composer"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSend();
            }
          }}
          placeholder="Write a reply…"
          rows={2}
          aria-label="Write a reply"
          className="min-h-[44px] flex-1 resize-y rounded-lg border border-border/60 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        />
        <button
          type="button"
          data-ocid="board.reply.send"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send reply"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground transition-colors hover:bg-accent/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

/** A single reply plate with the replier's canonical identity. */
function ReplyItem({
  reply,
  isAdmin,
  onRemoveReply,
  onOpenProfile,
}: {
  reply: Reply;
  isAdmin: boolean;
  onRemoveReply: (replyId: bigint) => void;
  onOpenProfile: (personId: string) => void;
}) {
  const canonical = useCanonicalPerson(reply.authorPersonId, "");
  return (
    <li className="reply-item">
      <button
        type="button"
        data-ocid={`board.reply.${reply.replyId}.author`}
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
          <span className="reply-meta">{formatReplyTime(reply.createdAt)}</span>
        </div>
        <p className="reply-text whitespace-pre-line">{reply.body}</p>
      </div>
      {isAdmin ? (
        <button
          type="button"
          data-ocid={`board.reply.${reply.replyId}.remove`}
          onClick={() => onRemoveReply(reply.replyId)}
          aria-label="Remove reply"
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Trash2 className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
        </button>
      ) : null}
    </li>
  );
}

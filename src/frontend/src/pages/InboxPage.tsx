import { ArrowLeft, Inbox, MessageSquareText, Users } from "lucide-react";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import {
  useListConversations,
  useListMessageableMembers,
} from "../hooks/useMessaging";
import { useNavbarIdentity } from "../hooks/useNavbarIdentity";
import type { ConversationSummary } from "../types/messaging";

/**
 * The Private Messages inbox. Lists the signed-in user's 1:1 conversations
 * (useListConversations), newest activity first, showing the other person's
 * name and photo, the latest message preview, a relative timestamp, and an
 * unread-count pill. Only participants can see a conversation; Stewards cannot
 * browse arbitrary conversations.
 */
interface InboxPageProps {
  /** Opens a conversation by its id. */
  onOpenConversation: (conversationId: bigint) => void;
  /** Navigates back to the previous view. */
  onBack: () => void;
}

/** Converts a backend nanosecond timestamp to a readable relative time. */
function formatInboxTime(timestamp: bigint): string {
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

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

function InboxRow({
  conversation,
  index,
  onOpenConversation,
}: {
  conversation: ConversationSummary;
  index: number;
  onOpenConversation: (conversationId: bigint) => void;
}) {
  const canonical = useCanonicalPerson(
    conversation.otherPersonId,
    conversation.otherDisplayName,
  );
  const hasUnread = conversation.unreadCount > 0n;

  return (
    <li>
      <button
        type="button"
        data-ocid={`inbox.item.${index}`}
        onClick={() => onOpenConversation(conversation.conversationId)}
        className={`inbox-card w-full text-left ${hasUnread ? "inbox-card-unread" : ""}`}
      >
        <span className="inbox-portrait">
          {canonical.profilePhotoUrl ? (
            <img
              src={canonical.profilePhotoUrl}
              alt=""
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            getInitials(canonical.displayName)
          )}
        </span>
        <span className="inbox-body">
          <span className="inbox-row">
            <span className="inbox-name">{canonical.displayName}</span>
            <span className="inbox-time">
              {formatInboxTime(conversation.latestMessageAt)}
            </span>
          </span>
          <span className="inbox-preview">
            {conversation.latestMessagePreview || "No messages yet"}
          </span>
        </span>
        {hasUnread ? (
          <span
            className="unread-pill"
            aria-label={`${conversation.unreadCount} unread`}
          >
            {conversation.unreadCount.toString()}
          </span>
        ) : null}
      </button>
    </li>
  );
}

export function InboxPage({ onOpenConversation, onBack }: InboxPageProps) {
  const { data: conversations = [], isLoading } = useListConversations();
  const { personId: myPersonId } = useNavbarIdentity();
  const { data: messageableMembers = [] } = useListMessageableMembers();

  // Data-driven: no other eligible member exists when the signed-in user is
  // the only approved claimed member with a linked account. Derived from the
  // backend's non-admin messageable-members list (living, approved/claimed,
  // linked account, not archived, not self), never hardcoded — so the next
  // approved relative automatically becomes messageable without a code change.
  // Unlike the steward-only listEligibleStewardCandidates query, this source is
  // available to every approved member, not just Family Stewards.
  const hasOtherEligibleMember = messageableMembers.some(
    (personId) => personId !== myPersonId,
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            data-ocid="inbox.back_button"
            onClick={onBack}
            aria-label="Back"
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          </button>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
            <MessageSquareText
              className="h-5 w-5"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Private Messages
            </h1>
            <p className="text-sm text-muted-foreground">
              {conversations.length > 0
                ? `${conversations.length} conversation${conversations.length === 1 ? "" : "s"}`
                : "Your 1:1 conversations"}
            </p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div
          data-ocid="inbox.loading_state"
          className="flex flex-col gap-2"
          aria-label="Loading conversations"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border/60 bg-card"
            />
          ))}
        </div>
      ) : conversations.length === 0 && !hasOtherEligibleMember ? (
        <div
          data-ocid="inbox.empty_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Users className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            No other family members are available to message yet.
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            Once another relative claims and receives approval for their Norwood
            profile, you&apos;ll be able to message them privately here.
          </p>
        </div>
      ) : conversations.length === 0 ? (
        <div
          data-ocid="inbox.no_conversations_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            No conversations yet
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            When a family member messages you, the conversation will appear
            here. You can also start one from a claimed family member&apos;s
            profile.
          </p>
        </div>
      ) : (
        <ul data-ocid="inbox.list" className="flex flex-col gap-2">
          {conversations.map((conversation, index) => (
            <InboxRow
              key={conversation.conversationId}
              conversation={conversation}
              index={index}
              onOpenConversation={onOpenConversation}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

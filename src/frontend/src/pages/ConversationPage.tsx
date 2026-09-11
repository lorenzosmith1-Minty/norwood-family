import { Ban, Flag, ShieldCheck, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ConversationBubble } from "../components/ConversationBubble";
import { MessageComposer } from "../components/MessageComposer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Textarea } from "../components/ui/textarea";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import {
  useBlockUser,
  useGetConversation,
  useListBlockedUsers,
  useListConversations,
  useMarkConversationRead,
  useReportMessage,
  useSendMessage,
  useUnblockUser,
} from "../hooks/useMessaging";
import { useNavbarIdentity } from "../hooks/useNavbarIdentity";
import {
  useListNotifications,
  useMarkNotificationRead,
} from "../hooks/useNotifications";
import { usePersonProfile } from "../hooks/useProfileClaims";
import { MessageError } from "../types/messaging";
import type { ConversationView, Message } from "../types/messaging";
import { NotificationType } from "../types/ownership";

/**
 * A single 1:1 conversation. Shows the other participant's name and photo, the
 * threaded message history (sent vs received bubbles), and the composer.
 * Opening the conversation marks it read. Includes block/unblock and
 * report-a-message safety actions. Only participants can read a conversation;
 * Stewards cannot browse arbitrary conversations.
 */
interface ConversationPageProps {
  /** The conversation id, when it already exists. Null for a brand-new thread. */
  conversationId: bigint | null;
  /** The other participant's personId, when navigating from a profile. */
  personId: string | null;
  /** Navigates back to the previous view. */
  onBack: () => void;
  /** Opens a person's profile. */
  onOpenProfile: (personId: string) => void;
}

const MESSAGE_ERROR_LABELS: Record<MessageError, string> = {
  [MessageError.BlockedByRecipient]:
    "This person has blocked you, so your message wasn't sent.",
  [MessageError.RecipientArchived]:
    "This person's profile is archived and can't receive messages.",
  [MessageError.RecipientNotClaimed]:
    "This person hasn't connected their profile yet.",
  [MessageError.NotApprovedMember]:
    "Only approved family members can send messages.",
  [MessageError.NotSignedIn]: "Sign in to send messages.",
  [MessageError.CannotMessageSelf]: "You can't message yourself.",
  [MessageError.RecipientNotFound]: "This person could not be found.",
  [MessageError.ConversationNotFound]:
    "This conversation is no longer available.",
  [MessageError.NotParticipant]: "You don't have access to this conversation.",
};

function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Formats a backend nanosecond timestamp as a readable date/time. */
function formatMessageDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** The other participant's personId, excluding the signed-in viewer. */
function otherPersonIdFromView(
  view: ConversationView | null | undefined,
  myPersonId: string | undefined,
): string | null {
  if (!view) return null;
  return view.participantPersonIds.find((id) => id !== myPersonId) ?? null;
}

/** The other participant's display name from the conversation view. */
function otherDisplayNameFromView(
  view: ConversationView | null | undefined,
  myPersonId: string | undefined,
): string | null {
  if (!view) return null;
  const idx = view.participantPersonIds.findIndex((id) => id !== myPersonId);
  return idx >= 0 ? (view.participantDisplayNames[idx] ?? null) : null;
}

export function ConversationPage({
  conversationId,
  personId,
  onBack,
  onOpenProfile,
}: ConversationPageProps) {
  const { personId: myPersonId } = useNavbarIdentity();

  // Resolve the other participant. When navigating from a profile we already
  // have the personId; from the inbox we derive it from the conversation view.
  const { data: viewFromProp } = useGetConversation(conversationId);
  const { data: conversations = [] } = useListConversations();

  const otherPersonId =
    personId ?? otherPersonIdFromView(viewFromProp, myPersonId);

  // Resolve the conversation id from the inbox list when it wasn't passed
  // directly (e.g. a brand-new thread started from a profile).
  const resolvedConversationId =
    conversationId ??
    (otherPersonId
      ? (conversations.find((c) => c.otherPersonId === otherPersonId)
          ?.conversationId ?? null)
      : null);

  const { data: view } = useGetConversation(resolvedConversationId);

  const otherDisplayName =
    otherDisplayNameFromView(view, myPersonId) ?? otherPersonId ?? "";
  const canonical = useCanonicalPerson(
    otherPersonId ?? undefined,
    otherDisplayName,
  );

  // The other participant's account id (for block/unblock) comes from their
  // claimed Person Profile.
  const { data: otherProfile } = usePersonProfile(otherPersonId ?? "", {
    enabled: Boolean(otherPersonId),
  });
  const otherAccountId = otherProfile?.claimedByUserId;

  const { data: blockedUsers = [] } = useListBlockedUsers();
  const isBlocked = Boolean(
    otherAccountId &&
      blockedUsers.some((id) => id.toString() === otherAccountId.toString()),
  );

  const sendMessage = useSendMessage();
  const markRead = useMarkConversationRead();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const reportMessage = useReportMessage();

  const [sendError, setSendError] = useState<string | null>(null);
  const [reportMessageId, setReportMessageId] = useState<bigint | null>(null);
  const [reportReason, setReportReason] = useState("");

  // Opening the conversation marks it read (clears the unread badge). Guarded
  // with a ref so the invalidation-triggered refetch doesn't re-fire it.
  const markedReadRef = useRef(false);
  useEffect(() => {
    if (resolvedConversationId !== null && !markedReadRef.current) {
      markedReadRef.current = true;
      markRead.mutate(resolvedConversationId);
    }
  }, [resolvedConversationId, markRead]);

  // Opening the conversation also marks the associated #NewMessage
  // notification(s) as read, so the notification badge clears once the user
  // reads the related content. Guarded with a ref so the invalidation-triggered
  // refetch doesn't re-fire it.
  const { data: notifications = [] } = useListNotifications();
  const markNotificationRead = useMarkNotificationRead();
  const markedNotificationsRef = useRef(false);
  useEffect(() => {
    if (resolvedConversationId === null || markedNotificationsRef.current) {
      return;
    }
    const unreadNewMessages = notifications.filter(
      (notification) =>
        !notification.read &&
        notification.notificationType === NotificationType.NewMessage,
    );
    if (unreadNewMessages.length === 0) return;
    markedNotificationsRef.current = true;
    for (const notification of unreadNewMessages) {
      markNotificationRead.mutate(notification.id);
    }
  }, [resolvedConversationId, notifications, markNotificationRead]);

  const handleSend = (body: string) => {
    if (!otherPersonId) return;
    setSendError(null);
    sendMessage.mutate(
      { recipientPersonId: otherPersonId, body },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "err") {
            setSendError(
              MESSAGE_ERROR_LABELS[result.err] ??
                "Your message couldn't be sent.",
            );
          }
        },
      },
    );
  };

  const handleReport = () => {
    if (reportMessageId === null || !reportReason.trim()) return;
    reportMessage.mutate(
      { messageId: reportMessageId, reason: reportReason.trim() },
      {
        onSuccess: () => {
          setReportMessageId(null);
          setReportReason("");
        },
      },
    );
  };

  const messages: Message[] = view?.messages ?? [];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-6 py-8">
      {/* Conversation header */}
      <header className="conversation-header">
        <button
          type="button"
          data-ocid="conversation.back_button"
          onClick={onBack}
          aria-label="Back to inbox"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-subtle transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Undo2 className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          data-ocid="conversation.participant"
          onClick={() => otherPersonId && onOpenProfile(otherPersonId)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <span className="conversation-portrait">
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
          <span className="min-w-0">
            <span className="conversation-name block">
              {canonical.displayName}
            </span>
            <span className="conversation-meta block">Private message</span>
          </span>
        </button>
      </header>

      {/* Blocked note */}
      {isBlocked ? (
        <div data-ocid="conversation.blocked_note" className="msg-blocked-note">
          <Ban
            className="h-4 w-4 shrink-0"
            strokeWidth={2}
            aria-hidden="true"
          />
          <span>
            You've blocked this person. They can't send you new messages. You
            can unblock them below.
          </span>
        </div>
      ) : null}

      {/* Message thread */}
      <div className="conversation flex-1">
        {messages.length === 0 ? (
          <div
            data-ocid="conversation.empty_state"
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <ShieldCheck
                className="h-6 w-6"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </span>
            <h2 className="font-display text-xl font-semibold text-foreground">
              Start the conversation
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              Send {canonical.displayName} a private message. Only the two of
              you can read this thread.
            </p>
          </div>
        ) : (
          <div data-ocid="conversation.thread" className="conversation-thread">
            {messages.map((message, index) => {
              const isSent = message.senderPersonId === myPersonId;
              const showDate =
                index === 0 ||
                formatMessageDate(message.createdAt) !==
                  formatMessageDate(messages[index - 1].createdAt);
              return (
                <div key={message.messageId} className="flex flex-col gap-2.5">
                  {showDate ? (
                    <span className="conversation-date">
                      {formatMessageDate(message.createdAt)}
                    </span>
                  ) : null}
                  <ConversationBubble
                    message={message}
                    isSent={isSent}
                    onReport={
                      isSent ? undefined : (id) => setReportMessageId(id)
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Send error */}
      {sendError ? (
        <p
          data-ocid="conversation.send_error"
          className="text-center text-xs font-medium text-destructive"
        >
          {sendError}
        </p>
      ) : null}

      {/* Composer */}
      <MessageComposer
        onSend={handleSend}
        disabled={isBlocked || sendMessage.isPending}
        placeholder={
          isBlocked
            ? "You've blocked this person"
            : `Message ${canonical.displayName}…`
        }
      />

      {/* Safety actions */}
      <div className="msg-safety-actions">
        {otherAccountId ? (
          isBlocked ? (
            <button
              type="button"
              data-ocid="conversation.unblock_button"
              onClick={() => unblockUser.mutate(otherAccountId)}
              disabled={unblockUser.isPending}
              className="msg-block-action"
            >
              <Ban className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Unblock
            </button>
          ) : (
            <button
              type="button"
              data-ocid="conversation.block_button"
              onClick={() => blockUser.mutate(otherAccountId)}
              disabled={blockUser.isPending}
              className="msg-block-action"
            >
              <Ban className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
              Block
            </button>
          )
        ) : null}
      </div>

      {/* Report dialog */}
      <Dialog
        open={reportMessageId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setReportMessageId(null);
            setReportReason("");
          }
        }}
      >
        <DialogContent data-ocid="conversation.report_dialog">
          <DialogHeader>
            <DialogTitle>Report message</DialogTitle>
            <DialogDescription>
              Tell a Family Steward why this message should be reviewed. Your
              report is private and only the Steward can see the message
              content.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            data-ocid="conversation.report_reason_input"
            value={reportReason}
            onChange={(event) => setReportReason(event.target.value)}
            placeholder="Reason for reporting…"
            rows={3}
            aria-label="Reason for reporting"
          />
          <DialogFooter>
            <button
              type="button"
              data-ocid="conversation.report_cancel_button"
              onClick={() => {
                setReportMessageId(null);
                setReportReason("");
              }}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border/60 px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Cancel
            </button>
            <button
              type="button"
              data-ocid="conversation.report_submit_button"
              onClick={handleReport}
              disabled={!reportReason.trim() || reportMessage.isPending}
              className="msg-report-action"
            >
              <Flag
                className="h-3.5 w-3.5"
                strokeWidth={2}
                aria-hidden="true"
              />
              Submit report
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

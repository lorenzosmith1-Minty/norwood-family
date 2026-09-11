import type { Message } from "@/types/messaging";
import { Flag } from "lucide-react";

/**
 * A single message bubble in a 1:1 conversation. Sent messages align right on
 * the sepia ink surface (msg-sent); received messages align left on paper
 * (msg-received). Each bubble shows its send time and, for received messages,
 * a quiet report affordance so the reader can flag a specific message.
 */
interface ConversationBubbleProps {
  message: Message;
  /** True when this message was sent by the signed-in viewer. */
  isSent: boolean;
  /** Opens the report flow for this message. */
  onReport?: (messageId: bigint) => void;
}

/** Formats a backend nanosecond timestamp as a short clock time. */
function formatMessageTime(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function ConversationBubble({
  message,
  isSent,
  onReport,
}: ConversationBubbleProps) {
  return (
    <div
      data-ocid={`conversation.msg_row.${isSent ? "sent" : "received"}`}
      className={`msg-row ${isSent ? "msg-row-sent" : "msg-row-received"}`}
    >
      <div
        className={`msg-bubble ${isSent ? "msg-bubble-sent" : "msg-bubble-received"}`}
      >
        <p className="whitespace-pre-wrap break-words">{message.body}</p>
        <span className="msg-bubble-time">
          {formatMessageTime(message.createdAt)}
        </span>
      </div>
      {!isSent && onReport ? (
        <button
          type="button"
          data-ocid={`conversation.report_button.${message.messageId}`}
          onClick={() => onReport(message.messageId)}
          aria-label="Report this message"
          className="msg-report-action ml-1.5 self-end"
        >
          <Flag className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Report
        </button>
      ) : null}
    </div>
  );
}

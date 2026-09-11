import { MessageError, MessageStatus, ReportStatus } from "@/backend";
import type {
  ConversationSummary as BackendConversationSummary,
  ConversationView as BackendConversationView,
  Message as BackendMessage,
  Report as BackendReport,
  ReportedMessageView as BackendReportedMessageView,
  Result_1,
} from "@/backend";

/**
 * Shared frontend types for Private Messaging, mirroring the generated
 * backend.d.ts contract. The backend enums that ARE exported (`MessageStatus`,
 * `MessageError`, `ReportStatus`) are re-exported here for a single import
 * surface, and the record interfaces are re-exported as type aliases.
 *
 * Page tasks import these rather than reaching into the generated bindings
 * directly.
 */

export type {
  BackendConversationSummary,
  BackendConversationView,
  BackendMessage,
  BackendReport,
  BackendReportedMessageView,
  Result_1,
};
export { MessageError, MessageStatus, ReportStatus };

/** Stable id of a 1:1 conversation. */
export type ConversationId = bigint;
/** Stable id of a single message. */
export type MessageId = bigint;
/** Stable id of a message report. */
export type ReportId = bigint;

/** One row in the Private Messages inbox: a 1:1 conversation summary. */
export type ConversationSummary = BackendConversationSummary;

/** The full view of a 1:1 conversation: participants and message history. */
export type ConversationView = BackendConversationView;

/** A single text message in a 1:1 conversation. */
export type Message = BackendMessage;

/** A report filed against a specific message. */
export type Report = BackendReport;

/** A reported message together with its report (steward review surface). */
export type ReportedMessageView = BackendReportedMessageView;

/** The result of sending a message: the created message or a MessageError. */
export type SendMessageResult = Result_1;

/** Friendly labels for a message's delivery status. */
export const MESSAGE_STATUS_LABELS: Record<MessageStatus, string> = {
  [MessageStatus.Sent]: "Sent",
  [MessageStatus.Blocked]: "Blocked",
};

/** Friendly labels for a report's review status. */
export const REPORT_STATUS_LABELS: Record<ReportStatus, string> = {
  [ReportStatus.Pending]: "Pending",
  [ReportStatus.Reviewed]: "Reviewed",
  [ReportStatus.Dismissed]: "Dismissed",
};

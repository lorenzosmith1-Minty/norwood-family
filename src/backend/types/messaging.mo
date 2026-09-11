import Common "../types/common";

module {
  /// Identifier of a single 1:1 conversation.
  public type ConversationId = Nat;

  /// Identifier of a single private message.
  public type MessageId = Nat;

  /// Identifier of a single reported-message report.
  public type ReportId = Nat;

  /// A canonical 1:1 text-only conversation between two accounts. One
  /// conversation per account pair, reused when the same two users message
  /// again. No group chat, attachments, reactions, calling, or typing
  /// indicators for MVP.
  public type Conversation = {
    conversationId : ConversationId;
    participantAccountIds : [Common.AccountId];
    participantPersonIds : [Common.PersonId];
    createdAt : Common.Timestamp;
    updatedAt : Common.Timestamp;
  };

  /// Lifecycle of a private message. `#Blocked` records a send attempt that was
  /// prevented because the recipient blocked the sender.
  public type MessageStatus = {
    #Sent;
    #Blocked;
  };

  /// A single private message. Only participants may read it.
  public type Message = {
    messageId : MessageId;
    conversationId : ConversationId;
    senderAccountId : Common.AccountId;
    senderPersonId : Common.PersonId;
    body : Text;
    createdAt : Common.Timestamp;
    readAt : ?Common.Timestamp;
    status : MessageStatus;
  };

  /// A block preventing one account from sending new messages to another.
  public type Block = {
    blockerAccountId : Common.AccountId;
    blockedAccountId : Common.AccountId;
    createdAt : Common.Timestamp;
  };

  /// Lifecycle of a reported message.
  public type ReportStatus = {
    #Pending;
    #Reviewed;
    #Dismissed;
  };

  /// A report of a specific message. Stewards see the reported message content
  /// only when a report is filed.
  public type Report = {
    reportId : ReportId;
    reportingAccountId : Common.AccountId;
    reportedMessageId : MessageId;
    reason : Text;
    createdAt : Common.Timestamp;
    status : ReportStatus;
  };

  /// Inbox summary of a conversation: the other participant's identity, latest
  /// message preview, timestamp, and unread count.
  public type ConversationSummary = {
    conversationId : ConversationId;
    otherPersonId : Common.PersonId;
    otherDisplayName : Text;
    latestMessagePreview : Text;
    latestMessageAt : Common.Timestamp;
    unreadCount : Nat;
  };

  /// Full conversation view: participant identity plus message history.
  public type ConversationView = {
    conversationId : ConversationId;
    participantPersonIds : [Common.PersonId];
    participantDisplayNames : [Text];
    messages : [Message];
  };

  /// Reported message content shown to a steward when a report is filed.
  public type ReportedMessageView = {
    report : Report;
    message : Message;
  };

  /// Errors for private messaging operations.
  public type MessageError = {
    #NotSignedIn;
    #NotApprovedMember;
    #RecipientNotFound;
    #RecipientNotClaimed;
    #RecipientArchived;
    #CannotMessageSelf;
    #BlockedByRecipient;
    #NotParticipant;
    #ConversationNotFound;
  };
};

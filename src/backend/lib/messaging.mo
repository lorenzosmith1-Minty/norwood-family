import Char "mo:core/Char";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/messaging";
import OwnershipTypes "../types/ownership";

module {
  /// Returns the signed-in caller's inbox: one summary per conversation they
  /// participate in, newest activity first, with the other participant's
  /// identity, latest message preview, timestamp, and unread count.
  public func listConversations(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    caller : Principal,
  ) : [Types.ConversationSummary] {
    let summaries = List.empty<Types.ConversationSummary>();
    for (conv in conversations.toArray().values()) {
      if (conv.participantAccountIds.any(func a = a == caller)) {
        let convMessages = messages.toArray().filter(func m = m.conversationId == conv.conversationId);
        let otherPersonId = otherParticipantPersonId(conv, caller);
        switch (latestMessage(convMessages)) {
          case (?lm) {
            summaries.add({
              conversationId = conv.conversationId;
              otherPersonId;
              otherDisplayName = displayName(profiles, otherPersonId);
              latestMessagePreview = preview(lm.body);
              latestMessageAt = lm.createdAt;
              unreadCount = convMessages.filter(func m = m.senderAccountId != caller and m.readAt == null).size();
            });
          };
          case null {};
        };
      };
    };
    summaries.toArray().sort(func(a, b) = Int.compare(b.latestMessageAt, a.latestMessageAt));
  };

  /// Returns a full conversation view (participant identity plus message
  /// history) for a participant, or `null` when the conversation does not exist
  /// or the caller is not a participant.
  public func getConversation(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) : ?Types.ConversationView {
    switch (conversations.find(func c = c.conversationId == conversationId)) {
      case null { null };
      case (?conv) {
        if (not conv.participantAccountIds.any(func a = a == caller)) {
          return null;
        };
        let convMessages = messages.toArray().filter(func m = m.conversationId == conversationId).sort(func(a, b) = Int.compare(a.createdAt, b.createdAt));
        ?{
          conversationId = conv.conversationId;
          participantPersonIds = conv.participantPersonIds;
          participantDisplayNames = conv.participantPersonIds.map(func pid = displayName(profiles, pid));
          messages = convMessages;
        };
      };
    };
  };

  /// Sends a private message, reusing the existing 1:1 conversation for the
  /// account pair when one exists. Returns the created message, or an error when
  /// the recipient has blocked the sender.
  public func sendMessage(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    blocks : List.List<Types.Block>,
    senderAccountId : Principal,
    senderPersonId : Text,
    recipientAccountId : Principal,
    recipientPersonId : Text,
    body : Text,
  ) : Result.Result<Types.Message, Types.MessageError> {
    if (blocks.toArray().any(func b = b.blockerAccountId == recipientAccountId and b.blockedAccountId == senderAccountId)) {
      return #err(#BlockedByRecipient);
    };
    let conversationId = findOrCreateConversation(conversations, senderAccountId, senderPersonId, recipientAccountId, recipientPersonId);
    let message : Types.Message = {
      messageId = nextId(messages.toArray().map(func m = m.messageId));
      conversationId;
      senderAccountId;
      senderPersonId;
      body;
      createdAt = Time.now();
      readAt = null;
      status = #Sent;
    };
    messages.add(message);
    #ok(message);
  };

  /// Lists the messages of a conversation for a participant, oldest first.
  public func listMessages(
    messages : List.List<Types.Message>,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) : [Types.Message] {
    messages.toArray().filter(func m = m.conversationId == conversationId).sort(func(a, b) = Int.compare(a.createdAt, b.createdAt));
  };

  /// Marks all of the caller's messages in a conversation as read.
  public func markConversationRead(
    messages : List.List<Types.Message>,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) {
    let snapshot = messages.toArray();
    messages.clear();
    for (m in snapshot.values()) {
      if (m.conversationId == conversationId and m.senderAccountId != caller and m.readAt == null) {
        messages.add({ m with readAt = ?Time.now() });
      } else {
        messages.add(m);
      };
    };
  };

  /// Adds a block preventing `blockedAccountId` from sending new messages to
  /// `blockerAccountId`.
  public func blockUser(
    blocks : List.List<Types.Block>,
    blockerAccountId : Principal,
    blockedAccountId : Principal,
  ) {
    if (not blocks.toArray().any(func b = b.blockerAccountId == blockerAccountId and b.blockedAccountId == blockedAccountId)) {
      blocks.add({
        blockerAccountId;
        blockedAccountId;
        createdAt = Time.now();
      });
    };
  };

  /// Removes a block so `blockedAccountId` may message `blockerAccountId` again.
  public func unblockUser(
    blocks : List.List<Types.Block>,
    blockerAccountId : Principal,
    blockedAccountId : Principal,
  ) {
    let snapshot = blocks.toArray();
    blocks.clear();
    for (b in snapshot.values()) {
      if (not (b.blockerAccountId == blockerAccountId and b.blockedAccountId == blockedAccountId)) {
        blocks.add(b);
      };
    };
  };

  /// Lists the account ids the caller has blocked.
  public func listBlockedUsers(blocks : List.List<Types.Block>, caller : Principal) : [Principal] {
    blocks.toArray().filter(func b = b.blockerAccountId == caller).map(func b = b.blockedAccountId);
  };

  /// Appends a new report of a specific message.
  public func reportMessage(reports : List.List<Types.Report>, report : Types.Report) : Types.Report {
    reports.add(report);
    report;
  };

  /// Lists all reports (steward only).
  public func listReports(reports : List.List<Types.Report>) : [Types.Report] {
    reports.toArray();
  };

  /// Updates a report's review status. Returns the updated report, or `null`
  /// when it does not exist.
  public func reviewReport(reports : List.List<Types.Report>, reportId : Types.ReportId, status : Types.ReportStatus) : ?Types.Report {
    switch (reports.find(func r = r.reportId == reportId)) {
      case null { null };
      case (?report) {
        let updated : Types.Report = { report with status };
        let snapshot = reports.toArray();
        reports.clear();
        for (r in snapshot.values()) {
          if (r.reportId == reportId) { reports.add(updated) } else { reports.add(r) };
        };
        ?updated;
      };
    };
  };

  /// Returns the reported message content for a report (steward only, shown only
  /// when a report is filed), or `null` when the report or message does not
  /// exist.
  public func getReportedMessage(
    reports : List.List<Types.Report>,
    messages : List.List<Types.Message>,
    reportId : Types.ReportId,
  ) : ?Types.ReportedMessageView {
    switch (reports.find(func r = r.reportId == reportId)) {
      case null { null };
      case (?report) {
        switch (messages.find(func m = m.messageId == report.reportedMessageId)) {
          case null { null };
          case (?message) { ?{ report; message } };
        };
      };
    };
  };

  // --- helpers ---

  /// Returns the person id of the participant who is not `caller`.
  func otherParticipantPersonId(conv : Types.Conversation, caller : Principal) : Text {
    var idx = 0;
    var other = "";
    for (acc in conv.participantAccountIds.values()) {
      if (acc != caller) {
        other := conv.participantPersonIds[idx];
      };
      idx += 1;
    };
    other;
  };

  func findOrCreateConversation(
    conversations : List.List<Types.Conversation>,
    senderAccountId : Principal,
    senderPersonId : Text,
    recipientAccountId : Principal,
    recipientPersonId : Text,
  ) : Types.ConversationId {
    switch (conversations.find(func c =
      c.participantAccountIds.size() == 2 and
      c.participantAccountIds.any(func a = a == senderAccountId) and
      c.participantAccountIds.any(func a = a == recipientAccountId)
    )) {
      case (?conv) {
        let updated : Types.Conversation = { conv with updatedAt = Time.now() };
        let snapshot = conversations.toArray();
        conversations.clear();
        for (c in snapshot.values()) {
          if (c.conversationId == conv.conversationId) { conversations.add(updated) } else { conversations.add(c) };
        };
        conv.conversationId;
      };
      case null {
        let conv : Types.Conversation = {
          conversationId = nextId(conversations.toArray().map(func c = c.conversationId));
          participantAccountIds = [senderAccountId, recipientAccountId];
          participantPersonIds = [senderPersonId, recipientPersonId];
          createdAt = Time.now();
          updatedAt = Time.now();
        };
        conversations.add(conv);
        conv.conversationId;
      };
    };
  };

  func latestMessage(msgs : [Types.Message]) : ?Types.Message {
    var latest : ?Types.Message = null;
    for (m in msgs.values()) {
      switch (latest) {
        case (?l) { if (m.createdAt > l.createdAt) { latest := ?m } };
        case null { latest := ?m };
      };
    };
    latest;
  };

  func preview(body : Text) : Text {
    if (body.size() > 80) {
      let chars = body.toArray();
      let first = List.empty<Char>();
      var i = 0;
      while (i < 80) {
        first.add(chars[i]);
        i += 1;
      };
      first.toArray().toText() # "…";
    } else {
      body;
    };
  };

  func displayName(profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>, personId : Text) : Text {
    switch (profiles.get(personId)) {
      case (?p) {
        switch (p.preferredName) {
          case (?pref) { if (pref.size() > 0) { pref } else { p.name } };
          case null p.name;
        };
      };
      case null personId;
    };
  };

  func nextId(ids : [Nat]) : Nat {
    var maxId = 0;
    for (id in ids.values()) {
      if (id >= maxId) { maxId := id + 1 };
    };
    maxId;
  };
};

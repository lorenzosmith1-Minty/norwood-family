import Char "mo:core/Char";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/messaging";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";

/// Tenancy 1C-C3 canonical family-scoped private Messaging domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `Conversation`, `Message`, `Block`, or `Report` whose `familyId` equals it. A
/// `conversationId` or `messageId` alone is never a tenant boundary: a lookup
/// that finds a record belonging to another family behaves exactly like a lookup
/// that found nothing. The API mixin owns authorization and state wiring; this
/// module is pure over the injected collections.
module {
  /// Whether a conversation belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped conversation read and action funnels through.
  public func belongsToFamily(conversation : Types.Conversation, familyId : FamilyTypes.FamilyId) : Bool {
    conversation.familyId == familyId;
  };

  /// Whether a message belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped message read and action funnels through.
  public func messageBelongsToFamily(message : Types.Message, familyId : FamilyTypes.FamilyId) : Bool {
    message.familyId == familyId;
  };

  /// Whether a block belongs to `familyId`.
  public func blockBelongsToFamily(block : Types.Block, familyId : FamilyTypes.FamilyId) : Bool {
    block.familyId == familyId;
  };

  /// Whether a report belongs to `familyId`.
  public func reportBelongsToFamily(report : Types.Report, familyId : FamilyTypes.FamilyId) : Bool {
    report.familyId == familyId;
  };

  /// Returns the caller's inbox in `familyId`: one summary per conversation they
  /// participate in, newest activity first. Only conversations whose `familyId`
  /// equals `familyId` are considered, and only messages whose `familyId` equals
  /// `familyId` contribute to a summary.
  public func listConversationsForFamily(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal,
  ) : [Types.ConversationSummary] {
    let summaries = List.empty<Types.ConversationSummary>();
    for (conv in conversations.toArray().values()) {
      if (belongsToFamily(conv, familyId) and conv.participantAccountIds.any(func a = a == caller)) {
        let convMessages = messages.toArray().filter(func m =
          m.conversationId == conv.conversationId and messageBelongsToFamily(m, familyId)
        );
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

  /// Returns a full conversation view for a participant when the conversation
  /// belongs to `familyId`, or `null` otherwise. A conversation that exists under
  /// another family is never returned, so a `conversationId` alone cannot cross
  /// the family boundary.
  public func getConversationForFamily(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) : ?Types.ConversationView {
    switch (conversations.find(func c = c.conversationId == conversationId and belongsToFamily(c, familyId))) {
      case null { null };
      case (?conv) {
        if (not conv.participantAccountIds.any(func a = a == caller)) {
          return null;
        };
        let convMessages = messages.toArray()
          .filter(func m = m.conversationId == conversationId and messageBelongsToFamily(m, familyId))
          .sort(func(a, b) = Int.compare(a.createdAt, b.createdAt));
        ?{
          conversationId = conv.conversationId;
          participantPersonIds = conv.participantPersonIds;
          participantDisplayNames = conv.participantPersonIds.map(func pid = displayName(profiles, pid));
          messages = convMessages;
        };
      };
    };
  };

  /// Lists the messages of a conversation in `familyId`, oldest first. The parent
  /// conversation must belong to `familyId` and every returned message must carry
  /// `familyId` too. Returns `[]` when the conversation does not belong to
  /// `familyId`.
  public func listMessagesForFamily(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) : [Types.Message] {
    switch (conversations.find(func c = c.conversationId == conversationId and belongsToFamily(c, familyId))) {
      case null { return [] };
      case (?conv) {
        if (not conv.participantAccountIds.any(func a = a == caller)) {
          return [];
        };
      };
    };
    messages.toArray()
      .filter(func m = m.conversationId == conversationId and messageBelongsToFamily(m, familyId))
      .sort(func(a, b) = Int.compare(a.createdAt, b.createdAt));
  };

  /// Creates a 1:1 conversation in `familyId` between the caller and the
  /// recipient, reusing the existing canonical conversation for the account pair
  /// when one exists in `familyId`. The new conversation's `familyId` is the
  /// requested `familyId`.
  public func createConversationForFamily(
    conversations : List.List<Types.Conversation>,
    familyId : FamilyTypes.FamilyId,
    senderAccountId : Principal,
    senderPersonId : Text,
    recipientAccountId : Principal,
    recipientPersonId : Text,
  ) : Types.Conversation {
    let conversationId = findOrCreateConversation(
      conversations,
      familyId,
      senderAccountId,
      senderPersonId,
      recipientAccountId,
      recipientPersonId,
    );
    switch (conversations.find(func c = c.conversationId == conversationId and belongsToFamily(c, familyId))) {
      case (?conv) { conv };
      case null {
        // Unreachable: findOrCreateConversation always leaves a conversation in
        // `familyId` with this id.
        {
          familyId;
          conversationId;
          participantAccountIds = [senderAccountId, recipientAccountId];
          participantPersonIds = [senderPersonId, recipientPersonId];
          createdAt = Time.now();
          updatedAt = Time.now();
        };
      };
    };
  };

  /// Sends a private message into the conversation in `familyId`, reusing the
  /// existing canonical conversation for the account pair when one exists. The
  /// new message's `familyId` is the requested `familyId`. Returns the created
  /// message, or an error when the recipient has blocked the sender.
  public func sendMessageForFamily(
    conversations : List.List<Types.Conversation>,
    messages : List.List<Types.Message>,
    blocks : List.List<Types.Block>,
    familyId : FamilyTypes.FamilyId,
    senderAccountId : Principal,
    senderPersonId : Text,
    recipientAccountId : Principal,
    recipientPersonId : Text,
    body : Text,
  ) : Result.Result<Types.Message, Types.MessageError> {
    if (blocks.toArray().any(func b =
      blockBelongsToFamily(b, familyId) and
      b.blockerAccountId == recipientAccountId and
      b.blockedAccountId == senderAccountId
    )) {
      return #err(#BlockedByRecipient);
    };
    let conversationId = findOrCreateConversation(
      conversations,
      familyId,
      senderAccountId,
      senderPersonId,
      recipientAccountId,
      recipientPersonId,
    );
    let message : Types.Message = {
      familyId;
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

  /// Marks all of the caller's messages in a conversation in `familyId` as read.
  /// Only messages whose `familyId` equals `familyId` are touched.
  public func markConversationReadForFamily(
    messages : List.List<Types.Message>,
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) {
    let snapshot = messages.toArray();
    messages.clear();
    for (m in snapshot.values()) {
      if (m.conversationId == conversationId and messageBelongsToFamily(m, familyId) and m.senderAccountId != caller and m.readAt == null) {
        messages.add({ m with readAt = ?Time.now() });
      } else {
        messages.add(m);
      };
    };
  };

  /// Adds a block in `familyId` preventing `blockedAccountId` from sending new
  /// messages to `blockerAccountId`. Idempotent within `familyId`.
  public func blockUserForFamily(
    blocks : List.List<Types.Block>,
    familyId : FamilyTypes.FamilyId,
    blockerAccountId : Principal,
    blockedAccountId : Principal,
  ) {
    if (not blocks.toArray().any(func b =
      blockBelongsToFamily(b, familyId) and
      b.blockerAccountId == blockerAccountId and
      b.blockedAccountId == blockedAccountId
    )) {
      blocks.add({
        familyId;
        blockerAccountId;
        blockedAccountId;
        createdAt = Time.now();
      });
    };
  };

  /// Removes a block in `familyId` so `blockedAccountId` may message
  /// `blockerAccountId` again. Only blocks whose `familyId` equals `familyId` are
  /// touched.
  public func unblockUserForFamily(
    blocks : List.List<Types.Block>,
    familyId : FamilyTypes.FamilyId,
    blockerAccountId : Principal,
    blockedAccountId : Principal,
  ) {
    let snapshot = blocks.toArray();
    blocks.clear();
    for (b in snapshot.values()) {
      if (not (blockBelongsToFamily(b, familyId) and b.blockerAccountId == blockerAccountId and b.blockedAccountId == blockedAccountId)) {
        blocks.add(b);
      };
    };
  };

  /// Lists the account ids the caller has blocked in `familyId`. Only blocks
  /// whose `familyId` equals `familyId` are considered.
  public func listBlockedUsersForFamily(
    blocks : List.List<Types.Block>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal,
  ) : [Principal] {
    blocks.toArray()
      .filter(func b = blockBelongsToFamily(b, familyId) and b.blockerAccountId == caller)
      .map(func b = b.blockedAccountId);
  };

  /// Appends a new report in `familyId`. The report's `familyId` is set by the
  /// caller; this module never rewrites it.
  public func reportMessageForFamily(
    reports : List.List<Types.Report>,
    report : Types.Report,
  ) : Types.Report {
    reports.add(report);
    report;
  };

  /// Lists all reports in `familyId` (steward only). Only reports whose
  /// `familyId` equals `familyId` are returned.
  public func listReportsForFamily(
    reports : List.List<Types.Report>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Report] {
    reports.toArray().filter(func r = reportBelongsToFamily(r, familyId));
  };

  /// Updates a report's review status when it belongs to `familyId`. Returns the
  /// updated report, or `null` when no report with that id belongs to `familyId`.
  public func reviewReportForFamily(
    reports : List.List<Types.Report>,
    familyId : FamilyTypes.FamilyId,
    reportId : Types.ReportId,
    status : Types.ReportStatus,
  ) : ?Types.Report {
    switch (reports.find(func r = r.reportId == reportId and reportBelongsToFamily(r, familyId))) {
      case null { null };
      case (?report) {
        let updated : Types.Report = { report with status };
        let snapshot = reports.toArray();
        reports.clear();
        for (r in snapshot.values()) {
          if (r.reportId == reportId and reportBelongsToFamily(r, familyId)) {
            reports.add(updated);
          } else {
            reports.add(r);
          };
        };
        ?updated;
      };
    };
  };

  /// Returns the reported message content for a report in `familyId` (steward
  /// only), or `null` when the report or message does not belong to `familyId`.
  public func getReportedMessageForFamily(
    reports : List.List<Types.Report>,
    messages : List.List<Types.Message>,
    familyId : FamilyTypes.FamilyId,
    reportId : Types.ReportId,
  ) : ?Types.ReportedMessageView {
    switch (reports.find(func r = r.reportId == reportId and reportBelongsToFamily(r, familyId))) {
      case null { null };
      case (?report) {
        switch (messages.find(func m = m.messageId == report.reportedMessageId and messageBelongsToFamily(m, familyId))) {
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

  /// Finds the canonical 1:1 conversation for the account pair within `familyId`,
  /// refreshing its `updatedAt`, or creates a new one in `familyId`. A
  /// conversation in another family is never reused, so the same account pair may
  /// hold an independent conversation per family.
  func findOrCreateConversation(
    conversations : List.List<Types.Conversation>,
    familyId : FamilyTypes.FamilyId,
    senderAccountId : Principal,
    senderPersonId : Text,
    recipientAccountId : Principal,
    recipientPersonId : Text,
  ) : Types.ConversationId {
    switch (conversations.find(func c =
      belongsToFamily(c, familyId) and
      c.participantAccountIds.size() == 2 and
      c.participantAccountIds.any(func a = a == senderAccountId) and
      c.participantAccountIds.any(func a = a == recipientAccountId)
    )) {
      case (?conv) {
        let updated : Types.Conversation = { conv with updatedAt = Time.now() };
        let snapshot = conversations.toArray();
        conversations.clear();
        for (c in snapshot.values()) {
          if (c.conversationId == conv.conversationId and belongsToFamily(c, familyId)) {
            conversations.add(updated);
          } else {
            conversations.add(c);
          };
        };
        conv.conversationId;
      };
      case null {
        let conv : Types.Conversation = {
          familyId;
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

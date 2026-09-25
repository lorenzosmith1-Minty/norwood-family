import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-C3: family-scope private Messaging.
  //
  // Adds a `familyId` field to every `Conversation`, `Message`, `Block`, and
  // `Report`. Every pre-existing messaging record migrates to
  // familyId = "norwood", matching the default family that owns all pre-tenancy
  // data. Existing ids, participants, senders, content, timestamps, read state,
  // statuses, and reasons are preserved as-is. No reset, no reseed, and no
  // duplicate entries: each list is rebuilt exactly once from the old list, so a
  // repeated upgrade is idempotent. No other stable collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldConversation = {
    conversationId : Nat;
    participantAccountIds : [Principal];
    participantPersonIds : [Text];
    createdAt : Int;
    updatedAt : Int;
  };

  type NewConversation = {
    familyId : FamilyId;
    conversationId : Nat;
    participantAccountIds : [Principal];
    participantPersonIds : [Text];
    createdAt : Int;
    updatedAt : Int;
  };

  type OldMessage = {
    messageId : Nat;
    conversationId : Nat;
    senderAccountId : Principal;
    senderPersonId : Text;
    body : Text;
    createdAt : Int;
    readAt : ?Int;
    status : { #Sent; #Blocked };
  };

  type NewMessage = {
    familyId : FamilyId;
    messageId : Nat;
    conversationId : Nat;
    senderAccountId : Principal;
    senderPersonId : Text;
    body : Text;
    createdAt : Int;
    readAt : ?Int;
    status : { #Sent; #Blocked };
  };

  type OldBlock = {
    blockerAccountId : Principal;
    blockedAccountId : Principal;
    createdAt : Int;
  };

  type NewBlock = {
    familyId : FamilyId;
    blockerAccountId : Principal;
    blockedAccountId : Principal;
    createdAt : Int;
  };

  type OldReport = {
    reportId : Nat;
    reportingAccountId : Principal;
    reportedMessageId : Nat;
    reason : Text;
    createdAt : Int;
    status : { #Pending; #Reviewed; #Dismissed };
  };

  type NewReport = {
    familyId : FamilyId;
    reportId : Nat;
    reportingAccountId : Principal;
    reportedMessageId : Nat;
    reason : Text;
    createdAt : Int;
    status : { #Pending; #Reviewed; #Dismissed };
  };

  // Subset form: only the collections whose element type changed are listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    conversations : List.List<OldConversation>;
    messages : List.List<OldMessage>;
    blocks : List.List<OldBlock>;
    reports : List.List<OldReport>;
  };

  type NewActor = {
    conversations : List.List<NewConversation>;
    messages : List.List<NewMessage>;
    blocks : List.List<NewBlock>;
    reports : List.List<NewReport>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let conversations = List.empty<NewConversation>();
    for (c in old.conversations.toArray().values()) {
      conversations.add({
        familyId = defaultFamilyId;
        conversationId = c.conversationId;
        participantAccountIds = c.participantAccountIds;
        participantPersonIds = c.participantPersonIds;
        createdAt = c.createdAt;
        updatedAt = c.updatedAt;
      });
    };

    let messages = List.empty<NewMessage>();
    for (m in old.messages.toArray().values()) {
      messages.add({
        familyId = defaultFamilyId;
        messageId = m.messageId;
        conversationId = m.conversationId;
        senderAccountId = m.senderAccountId;
        senderPersonId = m.senderPersonId;
        body = m.body;
        createdAt = m.createdAt;
        readAt = m.readAt;
        status = m.status;
      });
    };

    let blocks = List.empty<NewBlock>();
    for (b in old.blocks.toArray().values()) {
      blocks.add({
        familyId = defaultFamilyId;
        blockerAccountId = b.blockerAccountId;
        blockedAccountId = b.blockedAccountId;
        createdAt = b.createdAt;
      });
    };

    let reports = List.empty<NewReport>();
    for (r in old.reports.toArray().values()) {
      reports.add({
        familyId = defaultFamilyId;
        reportId = r.reportId;
        reportingAccountId = r.reportingAccountId;
        reportedMessageId = r.reportedMessageId;
        reason = r.reason;
        createdAt = r.createdAt;
        status = r.status;
      });
    };

    { conversations; messages; blocks; reports };
  };
};

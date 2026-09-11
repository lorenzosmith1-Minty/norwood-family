import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/messaging";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import AccountIdentityTypes "../types/account-identity";
import MessagingLib "../lib/messaging";

mixin (
  accessControlState : AccessControl.AccessControlState,
  conversations : List.List<Types.Conversation>,
  messages : List.List<Types.Message>,
  blocks : List.List<Types.Block>,
  reports : List.List<Types.Report>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  archivedProfiles : List.List<GovernanceTypes.PersonId>,
  notifications : List.List<OwnershipTypes.Notification>,
  accounts : Map.Map<AccountIdentityTypes.AccountId, AccountIdentityTypes.Account>,
) {
  /// Returns whether the signed-in caller may message the person identified by
  /// `personId`: the viewer is signed in, the target has an active linked
  /// account, the target is not the viewer, and the target is not archived.
  /// Unclaimed profiles are never messageable. Drives the Message button on a
  /// living claimed Person Profile.
  public query ({ caller }) func canMessagePerson(personId : Text) : async Bool {
    if (caller.isAnonymous()) {
      return false;
    };
    if (archivedProfiles.toArray().any(func p = p == personId)) {
      return false;
    };
    switch (profiles.get(personId)) {
      case null { false };
      case (?profile) {
        switch (profile.claimedByUserId) {
          case (?accountId) {
            accountId != caller
            and profile.livingStatus == #Living
            and accounts.get(accountId) != null;
          };
          case null false;
        };
      };
    };
  };

  /// Returns the person ids of every other member the signed-in caller may
  /// message: living, claimed, linked to an active account, not archived, and
  /// not the caller. Not gated to stewards — any approved member may read it, so
  /// the Private Messages inbox can determine whether any other eligible member
  /// exists. Data-driven: as another relative claims and receives approval they
  /// automatically appear without code changes.
  public query ({ caller }) func listMessageableMembers() : async [Text] {
    if (caller.isAnonymous()) {
      return [];
    };
    let archived = archivedProfiles.toArray();
    let result = List.empty<Text>();
    for ((personId, profile) in profiles.entries()) {
      switch (profile.claimedByUserId) {
        case (?accountId) {
          if (accountId != caller
              and profile.livingStatus == #Living
              and accounts.get(accountId) != null
              and not archived.any(func p = p == personId)
          ) {
            result.add(personId);
          };
        };
        case null {};
      };
    };
    result.toArray();
  };

  /// Returns the signed-in caller's inbox: one summary per conversation they
  /// participate in, newest activity first. Approved family members only.
  public query ({ caller }) func listConversations() : async [Types.ConversationSummary] {
    requireMessagingMember(caller);
    MessagingLib.listConversations(conversations, messages, profiles, caller);
  };

  /// Returns a full conversation view for a participant. Only participants may
  /// read a conversation.
  public query ({ caller }) func getConversation(conversationId : Types.ConversationId) : async ?Types.ConversationView {
    requireMessagingMember(caller);
    MessagingLib.getConversation(conversations, messages, profiles, conversationId, caller);
  };

  /// Sends a private message to the person identified by `personId`, reusing the
  /// existing 1:1 conversation when one exists. Approved family members only.
  /// Creates a new-message notification for the recipient. Blocking prevents new
  /// messages from the blocked user.
  public shared ({ caller }) func sendMessage(recipientPersonId : Text, body : Text) : async Result.Result<Types.Message, Types.MessageError> {
    requireMessagingMember(caller);
    let senderPersonId = messagingCallerPersonId(caller);
    switch (resolveMessagingRecipient(recipientPersonId, caller)) {
      case (#err e) { #err(e) };
      case (#ok recipientAccountId) {
        switch (MessagingLib.sendMessage(conversations, messages, blocks, caller, senderPersonId, recipientAccountId, recipientPersonId, body)) {
          case (#err e) { #err(e) };
          case (#ok message) {
            addMessagingNotification(recipientAccountId, #NewMessage, "You have a new private message");
            #ok(message);
          };
        };
      };
    };
  };

  /// Marks all of the caller's messages in a conversation as read. Only
  /// participants may mark a conversation read.
  public shared ({ caller }) func markConversationRead(conversationId : Types.ConversationId) : async () {
    requireMessagingMember(caller);
    switch (conversations.find(func c = c.conversationId == conversationId)) {
      case null { Runtime.trap("Conversation not found") };
      case (?conv) {
        if (not conv.participantAccountIds.any(func a = a == caller)) {
          Runtime.trap("Unauthorized: Only participants can mark a conversation read");
        };
        MessagingLib.markConversationRead(messages, conversationId, caller);
      };
    };
  };

  /// Blocks another member, preventing them from sending new messages to the
  /// caller. Approved family members only.
  public shared ({ caller }) func blockUser(blockedAccountId : Principal) : async () {
    requireMessagingMember(caller);
    MessagingLib.blockUser(blocks, caller, blockedAccountId);
  };

  /// Unblocks another member, allowing them to message the caller again.
  /// Approved family members only.
  public shared ({ caller }) func unblockUser(blockedAccountId : Principal) : async () {
    requireMessagingMember(caller);
    MessagingLib.unblockUser(blocks, caller, blockedAccountId);
  };

  /// Lists the account ids the caller has blocked. Approved family members only.
  public query ({ caller }) func listBlockedUsers() : async [Principal] {
    requireMessagingMember(caller);
    MessagingLib.listBlockedUsers(blocks, caller);
  };

  /// Reports a specific message with a reason. Approved family members only.
  public shared ({ caller }) func reportMessage(messageId : Types.MessageId, reason : Text) : async Types.Report {
    requireMessagingMember(caller);
    switch (messages.find(func m = m.messageId == messageId)) {
      case null { Runtime.trap("Message not found") };
      case (?message) {
        // Only a participant of the message's conversation may report it.
        switch (conversations.find(func c = c.conversationId == message.conversationId)) {
          case null { Runtime.trap("Conversation not found") };
          case (?conv) {
            if (not conv.participantAccountIds.any(func a = a == caller)) {
              Runtime.trap("Unauthorized: Only conversation participants can report a message");
            };
            let report : Types.Report = {
              reportId = messagingNextId(reports.toArray().map(func r = r.reportId));
              reportingAccountId = caller;
              reportedMessageId = messageId;
              reason;
              createdAt = Time.now();
              status = #Pending;
            };
            MessagingLib.reportMessage(reports, report);
          };
        };
      };
    };
  };

  /// Lists all reports. Family Steward only.
  public query ({ caller }) func listReports() : async [Types.Report] {
    requireMessagingSteward(caller);
    MessagingLib.listReports(reports);
  };

  /// Updates a report's review status. Family Steward only.
  public shared ({ caller }) func reviewReport(reportId : Types.ReportId, status : Types.ReportStatus) : async ?Types.Report {
    requireMessagingSteward(caller);
    MessagingLib.reviewReport(reports, reportId, status);
  };

  /// Returns the reported message content for a report. Family Steward only;
  /// reported message content is visible only when a report is filed. Stewards
  /// cannot browse arbitrary private conversations.
  public query ({ caller }) func getReportedMessage(reportId : Types.ReportId) : async ?Types.ReportedMessageView {
    requireMessagingSteward(caller);
    MessagingLib.getReportedMessage(reports, messages, reportId);
  };

  // --- helpers ---

  func requireMessagingMember(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only approved family members can use private messaging");
    };
  };

  func requireMessagingSteward(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
  };

  /// Resolves the caller's canonical person id from their claimed profile.
  func messagingCallerPersonId(caller : Principal) : Text {
    for ((personId, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?caller) {
        return personId;
      };
    };
    caller.toText();
  };

  /// Resolves a recipient person id to their linked account id, validating that
  /// the target is a living, claimed, non-archived member who is not the caller.
  func resolveMessagingRecipient(personId : Text, caller : Principal) : Result.Result<Principal, Types.MessageError> {
    if (archivedProfiles.toArray().any(func p = p == personId)) {
      return #err(#RecipientArchived);
    };
    switch (profiles.get(personId)) {
      case null { #err(#RecipientNotFound) };
      case (?profile) {
        if (profile.livingStatus == #Deceased) {
          return #err(#RecipientArchived);
        };
        switch (profile.claimedByUserId) {
          case null { #err(#RecipientNotClaimed) };
          case (?accountId) {
            if (accountId == caller) {
              #err(#CannotMessageSelf);
            } else if (accounts.get(accountId) == null) {
              // The profile is claimed, but the linked account is not active
              // (not registered in the accounts map), so it is not messageable.
              #err(#RecipientNotClaimed);
            } else {
              #ok(accountId);
            };
          };
        };
      };
    };
  };

  func addMessagingNotification(recipient : Principal, notificationType : OwnershipTypes.NotificationType, message : Text) {
    notifications.add({
      id = messagingNextId(notifications.toArray().map(func n = n.id));
      recipient;
      notificationType;
      message;
      createdAt = Time.now();
      read = false;
    });
  };

  func messagingNextId(ids : [Nat]) : Nat {
    var maxId = 0;
    for (id in ids.values()) {
      if (id >= maxId) { maxId := id + 1 };
    };
    maxId;
  };
};

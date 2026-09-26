import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/messaging";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import AccountIdentityTypes "../types/account-identity";
import MessagingScopeLib "../lib/messaging-scope";
import FamilyAuthorizationLib "../lib/family-authorization";
import NotificationsScopeLib "../lib/notifications-scope";
import TenancyLib "../lib/tenancy";

/// Tenancy 1C-C3 canonical family-scoped private Messaging public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Reads
/// gate on `FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily`;
/// Steward moderation (list/review reports, view reported message) gates on
/// `requireActiveStewardForFamily`; participant-only actions additionally check
/// the caller is a participant of the conversation. Every returned or mutated
/// conversation/message/block/report must carry `familyId == familyId`, so a
/// `conversationId` or `messageId` alone never crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  conversations : List.List<Types.Conversation>,
  messages : List.List<Types.Message>,
  blocks : List.List<Types.Block>,
  reports : List.List<Types.Report>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  archivedProfiles : List.List<GovernanceTypes.PersonId>,
  notifications : List.List<OwnershipTypes.Notification>,
  accounts : Map.Map<AccountIdentityTypes.AccountId, AccountIdentityTypes.Account>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
) {
  // ---------------------------------------------------------------------------
  // Canonical family-scoped endpoints.
  // ---------------------------------------------------------------------------

  /// Returns whether the signed-in caller may message the person identified by
  /// `personId` within `familyId`. Approved members of `familyId` only.
  public query ({ caller }) func canMessagePersonForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
  ) : async Bool {
    if (caller.isAnonymous()) {
      return false;
    };
    requireMessagingMemberForFamily(caller, familyId);
    canMessagePersonInternal(familyId, personId, caller);
  };

  /// Returns the person ids of every other member the signed-in caller may
  /// message within `familyId`. Approved members of `familyId` only.
  public query ({ caller }) func listMessageableMembersForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Text] {
    if (caller.isAnonymous()) {
      return [];
    };
    requireMessagingMemberForFamily(caller, familyId);
    listMessageableMembersInternal(familyId, caller);
  };

  /// Returns the signed-in caller's inbox in `familyId`, newest activity first.
  /// Approved members of `familyId` only.
  public query ({ caller }) func listConversationsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.ConversationSummary] {
    requireMessagingMemberForFamily(caller, familyId);
    MessagingScopeLib.listConversationsForFamily(conversations, messages, profiles, familyId, caller);
  };

  /// Returns a full conversation view for a participant when the conversation
  /// belongs to `familyId`, or `null` otherwise. Approved members of `familyId`
  /// only.
  public query ({ caller }) func getConversationForFamily(
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
  ) : async ?Types.ConversationView {
    requireMessagingMemberForFamily(caller, familyId);
    MessagingScopeLib.getConversationForFamily(conversations, messages, profiles, familyId, conversationId, caller);
  };

  /// Lists the messages of a conversation in `familyId`, oldest first. Approved
  /// members of `familyId` only.
  public query ({ caller }) func listMessagesForFamily(
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
  ) : async [Types.Message] {
    requireMessagingMemberForFamily(caller, familyId);
    MessagingScopeLib.listMessagesForFamily(conversations, messages, familyId, conversationId, caller);
  };

  /// Creates a 1:1 conversation in `familyId` between the caller and the person
  /// identified by `recipientPersonId`. Approved members of `familyId` only;
  /// both participants must belong to `familyId`.
  public shared ({ caller }) func createConversationForFamily(
    familyId : FamilyTypes.FamilyId,
    recipientPersonId : Text,
  ) : async Result.Result<Types.Conversation, Types.MessageError> {
    createConversationForFamilyInternal(familyId, recipientPersonId, caller);
  };

  /// Sends a private message to the person identified by `recipientPersonId`
  /// within `familyId`, reusing the existing 1:1 conversation when one exists.
  /// Approved members of `familyId` only.
  public shared ({ caller }) func sendMessageForFamily(
    familyId : FamilyTypes.FamilyId,
    recipientPersonId : Text,
    body : Text,
  ) : async Result.Result<Types.Message, Types.MessageError> {
    sendMessageForFamilyInternal(familyId, recipientPersonId, body, caller);
  };

  /// Marks all of the caller's messages in a conversation in `familyId` as read.
  /// Approved members of `familyId` only; the caller must be a participant.
  public shared ({ caller }) func markConversationReadForFamily(
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
  ) : async () {
    markConversationReadForFamilyInternal(familyId, conversationId, caller);
  };

  /// Blocks another member within `familyId`. Approved members of `familyId`
  /// only.
  public shared ({ caller }) func blockUserForFamily(
    familyId : FamilyTypes.FamilyId,
    blockedAccountId : Principal,
  ) : async () {
    requireMessagingMemberForFamily(caller, familyId);
    MessagingScopeLib.blockUserForFamily(blocks, familyId, caller, blockedAccountId);
  };

  /// Unblocks another member within `familyId`. Approved members of `familyId`
  /// only.
  public shared ({ caller }) func unblockUserForFamily(
    familyId : FamilyTypes.FamilyId,
    blockedAccountId : Principal,
  ) : async () {
    requireMessagingMemberForFamily(caller, familyId);
    MessagingScopeLib.unblockUserForFamily(blocks, familyId, caller, blockedAccountId);
  };

  /// Lists the account ids the caller has blocked in `familyId`. Approved
  /// members of `familyId` only.
  public query ({ caller }) func listBlockedUsersForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Principal] {
    requireMessagingMemberForFamily(caller, familyId);
    MessagingScopeLib.listBlockedUsersForFamily(blocks, familyId, caller);
  };

  /// Reports a specific message within `familyId`. Approved members of
  /// `familyId` only; the caller must be a participant of the message's
  /// conversation.
  public shared ({ caller }) func reportMessageForFamily(
    familyId : FamilyTypes.FamilyId,
    messageId : Types.MessageId,
    reason : Text,
  ) : async Types.Report {
    reportMessageForFamilyInternal(familyId, messageId, reason, caller);
  };

  /// Lists all reports in `familyId`. Active Steward of `familyId` only.
  public query ({ caller }) func listReportsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Report] {
    requireMessagingStewardForFamily(caller, familyId);
    MessagingScopeLib.listReportsForFamily(reports, familyId);
  };

  /// Updates a report's review status within `familyId`. Active Steward of
  /// `familyId` only.
  public shared ({ caller }) func reviewReportForFamily(
    familyId : FamilyTypes.FamilyId,
    reportId : Types.ReportId,
    status : Types.ReportStatus,
  ) : async ?Types.Report {
    requireMessagingStewardForFamily(caller, familyId);
    MessagingScopeLib.reviewReportForFamily(reports, familyId, reportId, status);
  };

  /// Returns the reported message content for a report in `familyId`. Active
  /// Steward of `familyId` only.
  public query ({ caller }) func getReportedMessageForFamily(
    familyId : FamilyTypes.FamilyId,
    reportId : Types.ReportId,
  ) : async ?Types.ReportedMessageView {
    requireMessagingStewardForFamily(caller, familyId);
    MessagingScopeLib.getReportedMessageForFamily(reports, messages, familyId, reportId);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `canMessagePersonForFamily`.
  /// An anonymous caller resolves `false` rather than trapping, preserving the
  /// documented `canMessagePerson` contract.
  public query ({ caller }) func canMessagePerson(personId : Text) : async Bool {
    if (caller.isAnonymous()) {
      return false;
    };
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    canMessagePersonInternal(FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listMessageableMembersForFamily`. An anonymous caller resolves `[]` rather
  /// than trapping, preserving the documented `listMessageableMembers` contract.
  public query ({ caller }) func listMessageableMembers() : async [Text] {
    if (caller.isAnonymous()) {
      return [];
    };
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    listMessageableMembersInternal(FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listConversationsForFamily`.
  public query ({ caller }) func listConversations() : async [Types.ConversationSummary] {
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.listConversationsForFamily(conversations, messages, profiles, FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getConversationForFamily`.
  public query ({ caller }) func getConversation(conversationId : Types.ConversationId) : async ?Types.ConversationView {
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.getConversationForFamily(conversations, messages, profiles, FamilyTypes.DEFAULT_FAMILY_ID, conversationId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listMessagesForFamily`.
  public query ({ caller }) func listMessages(conversationId : Types.ConversationId) : async [Types.Message] {
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.listMessagesForFamily(conversations, messages, FamilyTypes.DEFAULT_FAMILY_ID, conversationId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `createConversationForFamily`.
  public shared ({ caller }) func createConversation(recipientPersonId : Text) : async Result.Result<Types.Conversation, Types.MessageError> {
    createConversationForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, recipientPersonId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `sendMessageForFamily`.
  public shared ({ caller }) func sendMessage(recipientPersonId : Text, body : Text) : async Result.Result<Types.Message, Types.MessageError> {
    sendMessageForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, recipientPersonId, body, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `markConversationReadForFamily`.
  public shared ({ caller }) func markConversationRead(conversationId : Types.ConversationId) : async () {
    markConversationReadForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, conversationId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `blockUserForFamily`.
  public shared ({ caller }) func blockUser(blockedAccountId : Principal) : async () {
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.blockUserForFamily(blocks, FamilyTypes.DEFAULT_FAMILY_ID, caller, blockedAccountId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `unblockUserForFamily`.
  public shared ({ caller }) func unblockUser(blockedAccountId : Principal) : async () {
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.unblockUserForFamily(blocks, FamilyTypes.DEFAULT_FAMILY_ID, caller, blockedAccountId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listBlockedUsersForFamily`.
  public query ({ caller }) func listBlockedUsers() : async [Principal] {
    requireMessagingMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.listBlockedUsersForFamily(blocks, FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `reportMessageForFamily`.
  public shared ({ caller }) func reportMessage(messageId : Types.MessageId, reason : Text) : async Types.Report {
    reportMessageForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, messageId, reason, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listReportsForFamily`.
  public query ({ caller }) func listReports() : async [Types.Report] {
    requireMessagingStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.listReportsForFamily(reports, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `reviewReportForFamily`.
  public shared ({ caller }) func reviewReport(reportId : Types.ReportId, status : Types.ReportStatus) : async ?Types.Report {
    requireMessagingStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.reviewReportForFamily(reports, FamilyTypes.DEFAULT_FAMILY_ID, reportId, status);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getReportedMessageForFamily`.
  public query ({ caller }) func getReportedMessage(reportId : Types.ReportId) : async ?Types.ReportedMessageView {
    requireMessagingStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MessagingScopeLib.getReportedMessageForFamily(reports, messages, FamilyTypes.DEFAULT_FAMILY_ID, reportId);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Traps unless the caller is a signed-in approved member or Steward of
  /// `familyId`, using the canonical family-scoped membership helper. Anonymous
  /// callers and signed-in but unapproved callers are both denied with the
  /// stable, non-technical family-membership message.
  func requireMessagingMemberForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the canonical family-scoped Steward helper. A Steward of one family can
  /// never moderate another family's reports or messages.
  func requireMessagingStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Internal implementation of `createConversationForFamily` that takes the
  /// caller explicitly, so the membership gate always evaluates the real caller.
  func createConversationForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    recipientPersonId : Text,
    caller : Principal,
  ) : Result.Result<Types.Conversation, Types.MessageError> {
    requireMessagingMemberForFamily(caller, familyId);
    switch (resolveMessagingRecipient(familyId, recipientPersonId, caller)) {
      case (#err e) { #err(e) };
      case (#ok(recipientAccountId)) {
        let senderPersonId = messagingCallerPersonId(caller);
        #ok(MessagingScopeLib.createConversationForFamily(
          conversations,
          familyId,
          caller,
          senderPersonId,
          recipientAccountId,
          recipientPersonId,
        ));
      };
    };
  };

  /// Internal implementation of `sendMessageForFamily` that takes the caller
  /// explicitly, so the membership gate always evaluates the real caller.
  func sendMessageForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    recipientPersonId : Text,
    body : Text,
    caller : Principal,
  ) : Result.Result<Types.Message, Types.MessageError> {
    requireMessagingMemberForFamily(caller, familyId);
    switch (resolveMessagingRecipient(familyId, recipientPersonId, caller)) {
      case (#err e) { #err(e) };
      case (#ok(recipientAccountId)) {
        let senderPersonId = messagingCallerPersonId(caller);
        switch (MessagingScopeLib.sendMessageForFamily(
          conversations,
          messages,
          blocks,
          familyId,
          caller,
          senderPersonId,
          recipientAccountId,
          recipientPersonId,
          body,
        )) {
          case (#err e) { #err(e) };
          case (#ok message) {
            addMessagingNotification(familyId, recipientAccountId, #NewMessage, "You have a new private message");
            #ok(message);
          };
        };
      };
    };
  };

  /// Internal implementation of `markConversationReadForFamily` that takes the
  /// caller explicitly, so the participant check always evaluates the real
  /// caller.
  func markConversationReadForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    conversationId : Types.ConversationId,
    caller : Principal,
  ) {
    requireMessagingMemberForFamily(caller, familyId);
    switch (conversations.find(func c = c.conversationId == conversationId and MessagingScopeLib.belongsToFamily(c, familyId))) {
      case null { Runtime.trap("Conversation not found") };
      case (?conv) {
        if (not conv.participantAccountIds.any(func a = a == caller)) {
          Runtime.trap("Unauthorized: Only participants can mark a conversation read");
        };
        MessagingScopeLib.markConversationReadForFamily(messages, familyId, conversationId, caller);
      };
    };
  };

  /// Internal implementation of `reportMessageForFamily` that takes the caller
  /// explicitly, so the participant check always evaluates the real caller.
  func reportMessageForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    messageId : Types.MessageId,
    reason : Text,
    caller : Principal,
  ) : Types.Report {
    requireMessagingMemberForFamily(caller, familyId);
    let message = switch (messages.find(func m = m.messageId == messageId and MessagingScopeLib.messageBelongsToFamily(m, familyId))) {
      case null { Runtime.trap("Message not found") };
      case (?m) { m };
    };
    let conversation = switch (conversations.find(func c = c.conversationId == message.conversationId and MessagingScopeLib.belongsToFamily(c, familyId))) {
      case null { Runtime.trap("Conversation not found") };
      case (?c) { c };
    };
    if (not conversation.participantAccountIds.any(func a = a == caller)) {
      Runtime.trap("Unauthorized: Only conversation participants can report a message");
    };
    MessagingScopeLib.reportMessageForFamily(reports, {
      familyId;
      reportId = messagingNextId(reports.toArray().map(func r = r.reportId));
      reportingAccountId = caller;
      reportedMessageId = messageId;
      reason;
      createdAt = Time.now();
      status = #Pending;
    });
  };

  /// Whether the caller may message `personId` within `familyId`: the target has
  /// an active linked account, is not the caller, is not archived, and is not an
  /// unclaimed profile. Unclaimed profiles are never messageable. The profile is
  /// resolved through the family-qualified lookup, so a same-family recipient
  /// resolves in any family while a cross-family recipient still fails safely.
  func canMessagePersonInternal(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
    caller : Principal,
  ) : Bool {
    if (archivedProfiles.toArray().any(func p = p == personId)) {
      return false;
    };
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { false };
      case (?profile) {
        if (profile.familyId != familyId) {
          return false;
        };
        switch (profile.claimedByUserId) {
          case null { false };
          case (?accountId) {
            accountId != caller and accounts.get(accountId) != null;
          };
        };
      };
    };
  };

  /// Returns the person ids of every other member the caller may message within
  /// `familyId`. Profiles are enumerated by their stored key, so the canonical
  /// `profile.personId` is used (a non-default family stores profiles under the
  /// family-qualified key) and each candidate is re-resolved through the
  /// family-qualified lookup.
  func listMessageableMembersInternal(
    familyId : FamilyTypes.FamilyId,
    caller : Principal,
  ) : [Text] {
    let members = List.empty<Text>();
    for ((_key, profile) in profiles.entries()) {
      if (profile.familyId == familyId and canMessagePersonInternal(familyId, profile.personId, caller)) {
        members.add(profile.personId);
      };
    };
    members.toArray();
  };

  /// Resolves the recipient person id to their active linked account within
  /// `familyId`, or the matching `MessageError`. The profile is resolved through
  /// the family-qualified lookup, so a same-family recipient resolves in any
  /// family while a recipient that is not a messageable member of `familyId` is
  /// never resolved and a Family A caller can never send into Family B.
  func resolveMessagingRecipient(
    familyId : FamilyTypes.FamilyId,
    recipientPersonId : Text,
    caller : Principal,
  ) : Result.Result<Principal, Types.MessageError> {
    if (recipientPersonId == messagingCallerPersonId(caller)) {
      return #err(#CannotMessageSelf);
    };
    if (archivedProfiles.toArray().any(func p = p == recipientPersonId)) {
      return #err(#RecipientArchived);
    };
    switch (TenancyLib.getProfileForFamily(profiles, familyId, recipientPersonId)) {
      case null { #err(#RecipientNotFound) };
      case (?profile) {
        if (profile.familyId != familyId) {
          return #err(#RecipientNotFound);
        };
        switch (profile.claimedByUserId) {
          case null { #err(#RecipientNotClaimed) };
          case (?accountId) {
            if (accounts.get(accountId) == null) {
              return #err(#RecipientNotClaimed);
            };
            #ok(accountId);
          };
        };
      };
    };
  };

  /// Resolves the caller's canonical person id from their claimed profile. The
  /// canonical `profile.personId` is returned rather than the storage key, so a
  /// non-default family (whose profiles are stored under the family-qualified
  /// key) still yields the bare person id used by the messaging records.
  func messagingCallerPersonId(caller : Principal) : Text {
    for ((_key, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?caller) {
        return profile.personId;
      };
    };
    caller.toText();
  };

  /// Appends a messaging notification for the given recipient in `familyId`.
  /// Delegates to the canonical family-scoped notification helper, so the
  /// stored `familyId` is always the action's family.
  func addMessagingNotification(
    familyId : FamilyTypes.FamilyId,
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    ignore NotificationsScopeLib.createForFamily(notifications, familyId, recipient, notificationType, message, Time.now());
  };

  func messagingNextId(ids : [Nat]) : Nat {
    var maxId = 0;
    for (id in ids.values()) {
      if (id >= maxId) { maxId := id + 1 };
    };
    maxId;
  };
};

import AccessControl "mo:caffeineai-authorization/access-control";
import MixinAuthorization "mo:caffeineai-authorization/MixinAuthorization";
import Expose "mo:caffeineai-oql/Expose";
import OQL "mo:caffeineai-oql";
import Entity "mo:caffeineai-oql/Entity";
import RecordValue "mo:caffeineai-oql/RecordValue";
import TextValue "mo:caffeineai-oql/TextValue";
import IntValue "mo:caffeineai-oql/IntValue";
import BoolValue "mo:caffeineai-oql/BoolValue";
import PrincipalValue "mo:caffeineai-oql/PrincipalValue";
import MixinObjectStorage "mo:caffeineai-object-storage/Mixin";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "types/object-storage";
import ArchiveTypes "types/archive";
import OwnershipTypes "types/ownership";
import AccountIdentityTypes "types/account-identity";
import GovernanceTypes "types/governance";
import FamilyHistoryTypes "types/family-history";
import RecipeTypes "types/recipes";
import BoardTypes "types/board";
import MessagingTypes "types/messaging";
import ObjectStorageLib "lib/object-storage";
import ArchiveLib "lib/archive";
import OwnershipLib "lib/ownership";
import AccountIdentityLib "lib/account-identity";
import RecipesLib "lib/recipes";
import ObjectStorageApi "mixins/object-storage-api";
import ArchiveApi "mixins/archive-api";
import OwnershipApi "mixins/ownership-api";
import RelationshipsApi "mixins/relationships-api";
import NotificationsApi "mixins/notifications-api";
import AccountIdentityApi "mixins/account-identity-api";
import GovernanceApi "mixins/governance-api";
import FamilyHistoryApi "mixins/family-history-api";
import RecipesApi "mixins/recipes-api";
import BoardApi "mixins/board-api";
import MessagingApi "mixins/messaging-api";
import PendingCountApi "mixins/pending-count-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;
  let galleries : Map.Map<Types.PersonId, Types.PhotoGallery>;
  let archiveItems : List.List<ArchiveTypes.ArchiveItem>;
  let profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>;
  let claims : List.List<OwnershipTypes.ProfileClaim>;
  let relationshipRequests : List.List<OwnershipTypes.RelationshipRequest>;
  let confirmedRelationships : List.List<OwnershipTypes.Relationship>;
  let notifications : List.List<OwnershipTypes.Notification>;
  let accounts : Map.Map<AccountIdentityTypes.AccountId, AccountIdentityTypes.Account>;
  let stewards : List.List<GovernanceTypes.StewardRecord>;
  let successors : List.List<GovernanceTypes.SuccessorDesignation>;
  let removalRequests : List.List<GovernanceTypes.ProfileRemovalRequest>;
  let auditLog : List.List<GovernanceTypes.AuditEntry>;
  let mergeConflicts : List.List<GovernanceTypes.MergeConflict>;
  let archivedProfiles : List.List<GovernanceTypes.PersonId>;
  let dismissedDuplicates : List.List<GovernanceTypes.DismissedPair>;
  let stories : List.List<FamilyHistoryTypes.Story>;
  let mysteries : List.List<FamilyHistoryTypes.Mystery>;
  let mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>;
  let recipes : List.List<RecipeTypes.Recipe>;
  let posts : List.List<BoardTypes.Post>;
  let replies : List.List<BoardTypes.Reply>;
  let conversations : List.List<MessagingTypes.Conversation>;
  let messages : List.List<MessagingTypes.Message>;
  let blocks : List.List<MessagingTypes.Block>;
  let reports : List.List<MessagingTypes.Report>;

  /// Renders an audit action type variant as its tag text for OQL rows.
  func auditActionText(a : GovernanceTypes.AuditActionType) : Text {
    switch (a) {
      case (#ClaimApproved) "ClaimApproved";
      case (#ClaimRejected) "ClaimRejected";
      case (#RelationshipRequestApproved) "RelationshipRequestApproved";
      case (#RelationshipRequestRejected) "RelationshipRequestRejected";
      case (#RelationshipRequestPending) "RelationshipRequestPending";
      case (#StewardPromoted) "StewardPromoted";
      case (#StewardRemoved) "StewardRemoved";
      case (#SuccessorDesignated) "SuccessorDesignated";
      case (#SuccessorActivated) "SuccessorActivated";
      case (#ProfileArchived) "ProfileArchived";
      case (#ProfileRestored) "ProfileRestored";
      case (#ProfilePermanentlyDeleted) "ProfilePermanentlyDeleted";
      case (#ProfileRemovalRequested) "ProfileRemovalRequested";
      case (#ProfileRemovalReviewed) "ProfileRemovalReviewed";
      case (#DuplicateMerged) "DuplicateMerged";
      case (#RelationshipAdded) "RelationshipAdded";
      case (#RelationshipRemoved) "RelationshipRemoved";
      case (#RelationshipTypeCorrected) "RelationshipTypeCorrected";
      case (#BoardPostArchived) "BoardPostArchived";
      case (#BoardPostRestored) "BoardPostRestored";
      case (#BoardReplyRemoved) "BoardReplyRemoved";
    };
  };

  /// Renders a board post type variant as its tag text for OQL rows.
  func postTypeText(t : BoardTypes.PostType) : Text {
    switch (t) {
      case (#General) "General";
      case (#Announcement) "Announcement";
      case (#FamilyQuestion) "FamilyQuestion";
      case (#ResearchHistory) "ResearchHistory";
      case (#PhotoIdentification) "PhotoIdentification";
      case (#Recipe) "Recipe";
      case (#ReunionEvent) "ReunionEvent";
      case (#Memorial) "Memorial";
      case (#Other) "Other";
    };
  };

  /// Renders a board post status variant as its tag text for OQL rows.
  func boardPostStatusText(s : BoardTypes.PostStatus) : Text {
    switch (s) {
      case (#Active) "Active";
      case (#Archived) "Archived";
    };
  };

  /// Renders a message status variant as its tag text for OQL rows.
  func messageStatusText(s : MessagingTypes.MessageStatus) : Text {
    switch (s) {
      case (#Sent) "Sent";
      case (#Blocked) "Blocked";
    };
  };

  /// Renders a report status variant as its tag text for OQL rows.
  func reportStatusText(s : MessagingTypes.ReportStatus) : Text {
    switch (s) {
      case (#Pending) "Pending";
      case (#Reviewed) "Reviewed";
      case (#Dismissed) "Dismissed";
    };
  };

  /// Whether the caller is a participant of the conversation with the given id.
  func isConversationParticipant(caller : Principal, conversationId : Nat) : Bool {
    switch (conversations.find(func c = c.conversationId == conversationId)) {
      case (?c) c.participantAccountIds.any(func a = a == caller);
      case null false;
    };
  };

  /// OQL row-visibility rule for conversations: a scoped caller sees only the
  /// conversations they participate in.
  func canSeeConversation(caller : Principal, owner : OQL.Value) : Bool {
    switch (owner) {
      case (#nat id) isConversationParticipant(caller, id);
      case _ false;
    };
  };

  /// OQL row-visibility rule for messages: a scoped caller sees only messages in
  /// conversations they participate in.
  func canSeeMessage(caller : Principal, owner : OQL.Value) : Bool {
    switch (owner) {
      case (#nat conversationId) isConversationParticipant(caller, conversationId);
      case _ false;
    };
  };

  include MixinAuthorization(accessControlState, null);
  include Expose({
    entities = [
      OQL.Entity.build(
        OQL.Entity.new<Types.PhotoRow>(
          "photo",
          func() : Iter.Iter<Types.PhotoRow> = ObjectStorageLib.photoRows(galleries),
          "Photo",
          "key",
        )
        .sample({
          key = "";
          personId = "";
          id = 0;
          filename = "";
          mimeType = "";
          uploadedAt = 0;
          uploadedBy = Principal.fromText("aaaaa-aa");
          isProfilePhoto = false;
        })
        .controllerOnly(),
      ),
      OQL.Entity.manual<ArchiveTypes.ArchiveItemRow>(
        "archiveItem",
        func() : Iter.Iter<ArchiveTypes.ArchiveItemRow> = ArchiveLib.archiveRows(archiveItems),
        "ArchiveItem",
        "id",
      )
      .sample({
        id = 0;
        title = "";
        itemType = "";
        era = "";
        year = null;
        contributor = Principal.fromText("aaaaa-aa");
        sourceStatus = "";
        privacyLevel = "";
        status = "";
        createdAt = 0;
        classification = "";
        primarySpeakerName = "";
      })
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("itemType", func r = r.itemType)
      .payload("era", func r = r.era)
      .payload("year", func r = r.year ?? 0)
      .payload("contributor", func r = r.contributor)
      .payload("sourceStatus", func r = r.sourceStatus)
      .payload("privacyLevel", func r = r.privacyLevel)
      .payload("status", func r = r.status)
      .payload("createdAt", func r = r.createdAt)
      .payload("classification", func r = r.classification)
      .payload("primarySpeakerName", func r = r.primarySpeakerName)
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.ProfileRow>(
        "profile",
        func() : Iter.Iter<OwnershipTypes.ProfileRow> = OwnershipLib.profileRows(profiles),
        "PersonProfile",
        "personId",
      )
      .sample({
        personId = "";
        name = "";
        livingStatus = "";
        claimStatus = "";
        claimedByUserId = "";
        preferredName = "";
        firstName = "";
        middleName = "";
        lastName = "";
        suffix = "";
        nickname = "";
        story = "";
        shortBio = "";
        longerStory = "";
        occupation = "";
        birthInfo = "";
        birthDate = "";
        birthplace = "";
        currentLocation = "";
        privacySettings = "";
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.ClaimRow>(
        "claim",
        func() : Iter.Iter<OwnershipTypes.ClaimRow> = OwnershipLib.claimRows(claims),
        "ProfileClaim",
        "id",
      )
      .sample({
        id = 0;
        personId = "";
        requestingUserId = "";
        status = "";
        submittedDate = 0;
        reviewedBy = "";
        reviewedDate = 0;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.RelationshipRequestRow>(
        "relationshipRequest",
        func() : Iter.Iter<OwnershipTypes.RelationshipRequestRow> = OwnershipLib.relationshipRequestRows(relationshipRequests),
        "RelationshipRequest",
        "id",
      )
      .sample({
        id = 0;
        requestingPersonId = "";
        relatedPersonId = "";
        proposedRelationship = "";
        status = "";
        submittedDate = 0;
        reviewer = "";
        reviewedDate = 0;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.RelationshipRow>(
        "confirmedRelationship",
        func() : Iter.Iter<OwnershipTypes.RelationshipRow> = OwnershipLib.relationshipRows(confirmedRelationships),
        "Relationship",
        "id",
      )
      .sample({
        id = 0;
        fromPersonId = "";
        toPersonId = "";
        relationshipType = "";
        status = "";
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<OwnershipTypes.NotificationRow>(
        "notification",
        func() : Iter.Iter<OwnershipTypes.NotificationRow> = OwnershipLib.notificationRows(notifications),
        "Notification",
        "id",
      )
      .sample({
        id = 0;
        recipient = "";
        notificationType = "";
        message = "";
        createdAt = 0;
        read = false;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.new<AccountIdentityTypes.AccountRow>(
        "account",
        func() : Iter.Iter<AccountIdentityTypes.AccountRow> = AccountIdentityLib.accountRows(accounts),
        "Account",
        "id",
      )
      .sample({
        id = "";
        google = false;
        apple = false;
        createdAt = 0;
      })
      .controllerOnly()
      .build(),
      OQL.Entity.manual<GovernanceTypes.StewardRecord>(
        "steward",
        func() : Iter.Iter<GovernanceTypes.StewardRecord> = stewards.values(),
        "StewardRecord",
        "stewardAccountId",
      )
      .sample({
        stewardAccountId = Principal.fromText("aaaaa-aa");
        roleStatus = #Active;
        successorPriority = null;
        assignedBy = Principal.fromText("aaaaa-aa");
        assignedAt = 0;
      })
      .payload("stewardAccountId", func r = r.stewardAccountId.toText())
      .payload("roleStatus", func r = switch (r.roleStatus) { case (#Active) "Active"; case (#Removed) "Removed" })
      .payload("successorPriority", func r = r.successorPriority ?? 0)
      .payload("assignedBy", func r = r.assignedBy.toText())
      .payload("assignedAt", func r = r.assignedAt)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<GovernanceTypes.SuccessorDesignation>(
        "successor",
        func() : Iter.Iter<GovernanceTypes.SuccessorDesignation> = successors.values(),
        "SuccessorDesignation",
        "personId",
      )
      .sample({
        personId = "";
        priority = 0;
        assignedBy = Principal.fromText("aaaaa-aa");
        assignedAt = 0;
        status = #Designated;
      })
      .payload("personId", func r = r.personId)
      .payload("priority", func r = r.priority)
      .payload("assignedBy", func r = r.assignedBy.toText())
      .payload("assignedAt", func r = r.assignedAt)
      .payload("status", func r = switch (r.status) { case (#Designated) "Designated"; case (#Activated) "Activated"; case (#Removed) "Removed" })
      .controllerOnly()
      .build(),
      OQL.Entity.manual<GovernanceTypes.ProfileRemovalRequest>(
        "removalRequest",
        func() : Iter.Iter<GovernanceTypes.ProfileRemovalRequest> = removalRequests.values(),
        "ProfileRemovalRequest",
        "id",
      )
      .sample({
        id = 0;
        personId = "";
        requestingUserId = Principal.fromText("aaaaa-aa");
        reason = "";
        status = #Pending;
        submittedDate = 0;
        reviewedBy = null;
        reviewedDate = null;
      })
      .payload("id", func r = r.id)
      .payload("personId", func r = r.personId)
      .payload("requestingUserId", func r = r.requestingUserId.toText())
      .payload("reason", func r = r.reason)
      .payload("status", func r = switch (r.status) { case (#Pending) "Pending"; case (#Approved) "Approved"; case (#Rejected) "Rejected" })
      .payload("submittedDate", func r = r.submittedDate)
      .payload("reviewedBy", func r = switch (r.reviewedBy) { case (?p) p.toText(); case null "" })
      .payload("reviewedDate", func r = r.reviewedDate ?? 0)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<GovernanceTypes.AuditEntry>(
        "auditLog",
        func() : Iter.Iter<GovernanceTypes.AuditEntry> = auditLog.values(),
        "AuditEntry",
        "id",
      )
      .sample({
        id = 0;
        actionType = #ClaimApproved;
        actorAccountId = Principal.fromText("aaaaa-aa");
        affectedPersonIds = [];
        timestamp = 0;
        summary = "";
      })
      .payload("id", func r = r.id)
      .payload("actionType", func r = auditActionText(r.actionType))
      .payload("actorAccountId", func r = r.actorAccountId.toText())
      .payload("affectedPersonCount", func r = r.affectedPersonIds.size())
      .payload("timestamp", func r = r.timestamp)
      .payload("summary", func r = r.summary)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<GovernanceTypes.MergeConflict>(
        "mergeConflict",
        func() : Iter.Iter<GovernanceTypes.MergeConflict> = mergeConflicts.values(),
        "MergeConflict",
        "id",
      )
      .sample({
        id = 0;
        field = "";
        canonicalValue = "";
        alternateValue = "";
        status = #Pending;
        resolvedBy = null;
        resolvedAt = null;
      })
      .payload("id", func r = r.id)
      .payload("field", func r = r.field)
      .payload("canonicalValue", func r = r.canonicalValue)
      .payload("alternateValue", func r = r.alternateValue)
      .payload("status", func r = switch (r.status) { case (#Pending) "Pending"; case (#Resolved) "Resolved" })
      .payload("resolvedBy", func r = switch (r.resolvedBy) { case (?p) p.toText(); case null "" })
      .payload("resolvedAt", func r = r.resolvedAt ?? 0)
      .controllerOnly()
      .build(),
      OQL.Entity.manual(
        "archivedProfile",
        func() : Iter.Iter<GovernanceTypes.PersonId> = archivedProfiles.values(),
        "ArchivedProfile",
        "personId",
      )
      .sample("")
      .payload("personId", func p = p)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<GovernanceTypes.DismissedPair>(
        "dismissedPair",
        func() : Iter.Iter<GovernanceTypes.DismissedPair> = dismissedDuplicates.values(),
        "DismissedPair",
        "key",
      )
      .sample({
        personIdA = "";
        personIdB = "";
      })
      .payload("key", func r = r.personIdA # ":" # r.personIdB)
      .payload("personIdA", func r = r.personIdA)
      .payload("personIdB", func r = r.personIdB)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<FamilyHistoryTypes.Story>(
        "story",
        func() : Iter.Iter<FamilyHistoryTypes.Story> = stories.values(),
        "Story",
        "id",
      )
      .sample({
        id = 0;
        title = "";
        storyText = "";
        relatedMemberIds = [];
        era = null;
        year = null;
        location = null;
        contributor = Principal.fromText("aaaaa-aa");
        evidenceStatus = #Documented;
        relatedArchiveItemIds = [];
        createdAt = 0;
        updatedAt = 0;
        status = #Approved;
      })
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("storyText", func r = r.storyText)
      .payload("relatedMemberCount", func r = r.relatedMemberIds.size())
      .payload("era", func r = r.era ?? "")
      .payload("year", func r = r.year ?? 0)
      .payload("location", func r = r.location ?? "")
      .payload("contributor", func r = r.contributor.toText())
      .payload("evidenceStatus", func r = switch (r.evidenceStatus) { case (#Documented) "Documented"; case (#FamilyHistory) "FamilyHistory"; case (#PersonalMemory) "PersonalMemory"; case (#Unresolved) "Unresolved" })
      .payload("relatedArchiveItemCount", func r = r.relatedArchiveItemIds.size())
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .payload("status", func r = switch (r.status) { case (#Pending) "Pending"; case (#Approved) "Approved"; case (#Rejected) "Rejected" })
      .controllerOnly()
      .build(),
      OQL.Entity.manual<FamilyHistoryTypes.Mystery>(
        "mystery",
        func() : Iter.Iter<FamilyHistoryTypes.Mystery> = mysteries.values(),
        "Mystery",
        "id",
      )
      .sample({
        id = 0;
        title = "";
        description = "";
        relatedMemberIds = [];
        relatedBranchId = null;
        knownFacts = [];
        possibilities = [];
        relatedSourceIds = [];
        relatedArchiveItemIds = [];
        status = #Open;
        contributor = Principal.fromText("aaaaa-aa");
        createdAt = 0;
        updatedAt = 0;
        resolution = null;
      })
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("description", func r = r.description)
      .payload("relatedMemberCount", func r = r.relatedMemberIds.size())
      .payload("relatedBranchId", func r = r.relatedBranchId ?? "")
      .payload("knownFactCount", func r = r.knownFacts.size())
      .payload("possibilityCount", func r = r.possibilities.size())
      .payload("relatedSourceCount", func r = r.relatedSourceIds.size())
      .payload("relatedArchiveItemCount", func r = r.relatedArchiveItemIds.size())
      .payload("status", func r = switch (r.status) { case (#Open) "Open"; case (#Researching) "Researching"; case (#PartiallyResolved) "PartiallyResolved"; case (#Resolved) "Resolved" })
      .payload("contributor", func r = r.contributor.toText())
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .payload("resolved", func r = r.resolution != null)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<FamilyHistoryTypes.MysteryContribution>(
        "mysteryContribution",
        func() : Iter.Iter<FamilyHistoryTypes.MysteryContribution> = mysteryContributions.values(),
        "MysteryContribution",
        "id",
      )
      .sample({
        id = 0;
        mysteryId = 0;
        contributionType = #Note;
        text = "";
        contributor = Principal.fromText("aaaaa-aa");
        status = #Pending;
        createdAt = 0;
        reviewedBy = null;
        reviewedAt = null;
      })
      .payload("id", func r = r.id)
      .payload("mysteryId", func r = r.mysteryId)
      .payload("contributionType", func r = switch (r.contributionType) { case (#Note) "Note"; case (#Memory) "Memory"; case (#Lead) "Lead"; case (#Source) "Source" })
      .payload("text", func r = r.text)
      .payload("contributor", func r = r.contributor.toText())
      .payload("status", func r = switch (r.status) { case (#Pending) "Pending"; case (#Approved) "Approved"; case (#Rejected) "Rejected" })
      .payload("createdAt", func r = r.createdAt)
      .payload("reviewedBy", func r = switch (r.reviewedBy) { case (?p) p.toText(); case null "" })
      .payload("reviewedAt", func r = r.reviewedAt ?? 0)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<RecipeTypes.RecipeRow>(
        "recipe",
        func() : Iter.Iter<RecipeTypes.RecipeRow> = RecipesLib.recipeRows(recipes),
        "Recipe",
        "recipeId",
      )
      .sample({
        recipeId = 0;
        title = "";
        shortDescription = "";
        originatingPersonId = "";
        relatedPersonCount = 0;
        contributorAccountId = "";
        era = "";
        year = null;
        location = "";
        familyBranch = "";
        ingredientCount = 0;
        tagCount = 0;
        privacyLevel = "";
        evidenceStatus = "";
        linkedMediaCount = 0;
        status = "";
        createdAt = 0;
        updatedAt = 0;
      })
      .payload("recipeId", func r = r.recipeId)
      .payload("title", func r = r.title)
      .payload("shortDescription", func r = r.shortDescription)
      .payload("originatingPersonId", func r = r.originatingPersonId)
      .payload("relatedPersonCount", func r = r.relatedPersonCount)
      .payload("contributorAccountId", func r = r.contributorAccountId)
      .payload("era", func r = r.era)
      .payload("year", func r = r.year ?? 0)
      .payload("location", func r = r.location)
      .payload("familyBranch", func r = r.familyBranch)
      .payload("ingredientCount", func r = r.ingredientCount)
      .payload("tagCount", func r = r.tagCount)
      .payload("privacyLevel", func r = r.privacyLevel)
      .payload("evidenceStatus", func r = r.evidenceStatus)
      .payload("linkedMediaCount", func r = r.linkedMediaCount)
      .payload("status", func r = r.status)
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<BoardTypes.Post>(
        "boardPost",
        func() : Iter.Iter<BoardTypes.Post> = posts.values(),
        "BoardPost",
        "postId",
      )
      .sample({
        postId = 0;
        authorAccountId = Principal.fromText("aaaaa-aa");
        authorPersonId = "";
        title = null;
        body = "";
        postType = #General;
        relatedPersonIds = [];
        linkedMediaIds = [];
        createdAt = 0;
        updatedAt = 0;
        status = #Active;
        privacyScope = #FamilyOnly;
      })
      .payload("postId", func r = r.postId)
      .payload("authorAccountId", func r = r.authorAccountId.toText())
      .payload("authorPersonId", func r = r.authorPersonId)
      .payload("title", func r = r.title ?? "")
      .payload("body", func r = r.body)
      .payload("postType", func r = postTypeText(r.postType))
      .payload("relatedPersonCount", func r = r.relatedPersonIds.size())
      .payload("linkedMediaCount", func r = r.linkedMediaIds.size())
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .payload("status", func r = boardPostStatusText(r.status))
      .payload("privacyScope", func r = switch (r.privacyScope) { case (#FamilyOnly) "FamilyOnly" })
      .controllerOnly()
      .build(),
      OQL.Entity.manual<BoardTypes.Reply>(
        "boardReply",
        func() : Iter.Iter<BoardTypes.Reply> = replies.values(),
        "BoardReply",
        "replyId",
      )
      .sample({
        replyId = 0;
        postId = 0;
        authorAccountId = Principal.fromText("aaaaa-aa");
        authorPersonId = "";
        body = "";
        createdAt = 0;
      })
      .payload("replyId", func r = r.replyId)
      .payload("postId", func r = r.postId)
      .payload("authorAccountId", func r = r.authorAccountId.toText())
      .payload("authorPersonId", func r = r.authorPersonId)
      .payload("body", func r = r.body)
      .payload("createdAt", func r = r.createdAt)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<MessagingTypes.Conversation>(
        "conversation",
        func() : Iter.Iter<MessagingTypes.Conversation> = conversations.values(),
        "Conversation",
        "conversationId",
      )
      .sample({
        conversationId = 0;
        participantAccountIds = [];
        participantPersonIds = [];
        createdAt = 0;
        updatedAt = 0;
      })
      .payload("conversationId", func r = r.conversationId)
      .payload("participantCount", func r = r.participantAccountIds.size())
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .ownedByWith("conversationId", canSeeConversation)
      .controllerOrScoped()
      .build(),
      OQL.Entity.manual<MessagingTypes.Message>(
        "message",
        func() : Iter.Iter<MessagingTypes.Message> = messages.values(),
        "Message",
        "messageId",
      )
      .sample({
        messageId = 0;
        conversationId = 0;
        senderAccountId = Principal.fromText("aaaaa-aa");
        senderPersonId = "";
        body = "";
        createdAt = 0;
        readAt = null;
        status = #Sent;
      })
      .payload("messageId", func r = r.messageId)
      .payload("conversationId", func r = r.conversationId)
      .payload("senderAccountId", func r = r.senderAccountId.toText())
      .payload("senderPersonId", func r = r.senderPersonId)
      .payload("body", func r = r.body)
      .payload("createdAt", func r = r.createdAt)
      .payload("readAt", func r = r.readAt ?? 0)
      .payload("status", func r = messageStatusText(r.status))
      .ownedByWith("conversationId", canSeeMessage)
      .scopedPerUser()
      .build(),
      OQL.Entity.manual<MessagingTypes.Block>(
        "block",
        func() : Iter.Iter<MessagingTypes.Block> = blocks.values(),
        "Block",
        "key",
      )
      .sample({
        blockerAccountId = Principal.fromText("aaaaa-aa");
        blockedAccountId = Principal.fromText("aaaaa-aa");
        createdAt = 0;
      })
      .payload("key", func r = r.blockerAccountId.toText() # ":" # r.blockedAccountId.toText())
      .payload("blockerAccountId", func r = r.blockerAccountId.toText())
      .payload("blockedAccountId", func r = r.blockedAccountId.toText())
      .payload("createdAt", func r = r.createdAt)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<MessagingTypes.Report>(
        "report",
        func() : Iter.Iter<MessagingTypes.Report> = reports.values(),
        "Report",
        "reportId",
      )
      .sample({
        reportId = 0;
        reportingAccountId = Principal.fromText("aaaaa-aa");
        reportedMessageId = 0;
        reason = "";
        createdAt = 0;
        status = #Pending;
      })
      .payload("reportId", func r = r.reportId)
      .payload("reportingAccountId", func r = r.reportingAccountId.toText())
      .payload("reportedMessageId", func r = r.reportedMessageId)
      .payload("reason", func r = r.reason)
      .payload("createdAt", func r = r.createdAt)
      .payload("status", func r = reportStatusText(r.status))
      .controllerOnly()
      .build(),
    ];
  });
  include MixinObjectStorage();
  include ObjectStorageApi(galleries);
  include ArchiveApi(accessControlState, archiveItems);
  include OwnershipApi(accessControlState, profiles, claims, confirmedRelationships, relationshipRequests, notifications, auditLog);
  include RelationshipsApi(relationshipRequests, confirmedRelationships);
  include NotificationsApi(notifications);
  include AccountIdentityApi(accounts);
  include GovernanceApi(accessControlState, profiles, confirmedRelationships, stewards, successors, removalRequests, auditLog, mergeConflicts, archivedProfiles, galleries, archiveItems, dismissedDuplicates);
  include FamilyHistoryApi(accessControlState, stories, mysteries, mysteryContributions, profiles, archiveItems);
  include RecipesApi(accessControlState, recipes, profiles);
  include BoardApi(accessControlState, posts, replies, profiles, notifications, auditLog);
  include MessagingApi(accessControlState, conversations, messages, blocks, reports, profiles, archivedProfiles, notifications, accounts);
  include PendingCountApi(accessControlState, archiveItems, recipes, stories, mysteryContributions);
  include ApiDocMixin();
};

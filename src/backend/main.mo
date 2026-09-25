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
import FamilyTypes "types/family";
import ArchiveTypes "types/archive";
import OwnershipTypes "types/ownership";
import AccountIdentityTypes "types/account-identity";
import GovernanceTypes "types/governance";
import FamilyHistoryTypes "types/family-history";
import RecipeTypes "types/recipes";
import BoardTypes "types/board";
import MessagingTypes "types/messaging";
import ResearchIntakeTypes "types/research-intake";
import ObjectStorageLib "lib/object-storage";
import FamilyLib "lib/family";
import FamilyAuthorizationLib "lib/family-authorization";
import StewardAuthorityLib "lib/steward-authority";
import ArchiveLib "lib/archive";
import OwnershipLib "lib/ownership";
import AccountIdentityLib "lib/account-identity";
import RecipesScopeLib "lib/recipes-scope";
import FamilyHistoryScopeLib "lib/family-history-scope";
import ObjectStorageApi "mixins/object-storage-api";
import FamilyApi "mixins/family-api";
import ArchiveApi "mixins/archive-api";
import OwnershipApi "mixins/ownership-api";
import ClaimPersistenceApi "mixins/claim-persistence-api";
import RelationshipsApi "mixins/relationships-api";
import NotificationsApi "mixins/notifications-api";
import AccountIdentityApi "mixins/account-identity-api";
import GovernanceApi "mixins/governance-api";
import FamilyHistoryScopeApi "mixins/family-history-scope-api";
import MysteryApi "mixins/mystery-api";
import RecipesScopeApi "mixins/recipes-scope-api";
import BoardScopeApi "mixins/board-scope-api";
import MessagingScopeApi "mixins/messaging-scope-api";
import PendingCountApi "mixins/pending-count-api";
import ResearchIntakeApi "mixins/research-intake-api";
import ResearchSourceScopeApi "mixins/research-source-scope-api";
import FindingScopeApi "mixins/finding-scope-api";
import CandidateScopeApi "mixins/candidate-scope-api";
import RelationshipProposalScopeApi "mixins/relationship-proposal-scope-api";
import ConflictScopeApi "mixins/conflict-scope-api";
import ArchiveResearchBoardNotificationsApi "mixins/archive-research-board-notifications-api";
import AuditAndWorkloadApi "mixins/audit-and-workload-api";
import StewardAuthorityApi "mixins/steward-authority-api";
import ApiDocMixin "mixins/api-doc";

actor {
  let accessControlState : AccessControl.AccessControlState;
  let families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>;
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

  let researchSources : List.List<ResearchIntakeTypes.SourceRecord>;
  let proposedFindings : List.List<ResearchIntakeTypes.ProposedFinding>;
  let newPersonCandidates : List.List<ResearchIntakeTypes.NewPersonCandidate>;
  let relationshipProposals : List.List<ResearchIntakeTypes.RelationshipProposal>;
  let conflictReviewItems : List.List<ResearchIntakeTypes.ConflictReviewItem>;
  let researchAuditLog : List.List<ResearchIntakeTypes.ResearchAuditEntry>;
  let researchState : {
    var nextSourceId : Nat;
    var nextFindingId : Nat;
    var nextCandidateId : Nat;
    var nextProposalId : Nat;
    var nextConflictId : Nat;
    var nextAuditId : Nat;
  };

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

  /// Renders a research source type variant as its tag text for OQL rows.
  func sourceTypeText(t : ResearchIntakeTypes.SourceType) : Text {
    switch (t) {
      case (#CensusCitation) "CensusCitation";
      case (#DeedPropertyReference) "DeedPropertyReference";
      case (#EmailThread) "EmailThread";
      case (#ResearchNotes) "ResearchNotes";
      case (#CertificateHeadstoneReference) "CertificateHeadstoneReference";
      case (#UploadedDocumentImage) "UploadedDocumentImage";
    };
  };

  /// Renders a research review status variant as its tag text for OQL rows.
  func reviewStatusText(s : ResearchIntakeTypes.ReviewStatus) : Text {
    switch (s) {
      case (#Pending) "Pending";
      case (#Approved) "Approved";
      case (#Rejected) "Rejected";
      case (#Conflicting) "Conflicting";
      case (#NeedsResearch) "NeedsResearch";
    };
  };

  /// Renders a research evidence label variant as its tag text for OQL rows.
  func evidenceLabelText(l : ResearchIntakeTypes.EvidenceLabel) : Text {
    switch (l) {
      case (#Documented) "Documented";
      case (#FamilyHistoryOralHistory) "FamilyHistoryOralHistory";
      case (#PersonalMemory) "PersonalMemory";
      case (#Hypothesis) "Hypothesis";
      case (#Conflicting) "Conflicting";
      case (#NeedsResearch) "NeedsResearch";
    };
  };

  /// Renders a research finding type variant as its tag text for OQL rows.
  func findingTypeText(t : ResearchIntakeTypes.FindingType) : Text {
    switch (t) {
      case (#PersonFact) "PersonFact";
      case (#Relationship) "Relationship";
      case (#TimelineEvent) "TimelineEvent";
      case (#Story) "Story";
      case (#Mystery) "Mystery";
      case (#Source) "Source";
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

  /// OQL row-visibility rule for research sources: a scoped caller sees only the
  /// sources of a family they are an approved member or active Steward of. The
  /// owner column is the source's `familyId`, so a caller can never read another
  /// family's sources through OQL. The platform controller still reads all rows.
  func canSeeResearchSource(caller : Principal, owner : OQL.Value) : Bool {
    switch (owner) {
      case (#text familyId) {
        StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)
          or FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
      };
      case _ false;
    };
  };

  /// OQL row-visibility rule for archive items, mirroring the server-side
  /// archive privacy enforcement in `listApprovedArchiveItems` /
  /// `searchArchiveItems`: `#Public` items are visible to everyone; `#FamilyOnly`
  /// items to approved family members or admins; `#Private` items to their
  /// contributor or an admin. The owner column is the archive item's `id`, which
  /// lets the rule look up the item's privacy level and contributor.
  func canSeeArchiveItem(caller : Principal, owner : OQL.Value) : Bool {
    if (StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID)) {
      return true;
    };
    switch (owner) {
      case (#nat id) {
        switch (archiveItems.find(func it = it.id == id)) {
          case (?item) {
            switch (item.privacyLevel) {
              case (#Public) true;
              case (#FamilyOnly) FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
              case (#Private) item.contributor == caller;
            };
          };
          case null false;
        };
      };
      case _ false;
    };
  };

  include MixinAuthorization(accessControlState, null);
  include Expose({
    entities = [
      OQL.Entity.manual<FamilyTypes.Family>(
        "family",
        func() : Iter.Iter<FamilyTypes.Family> = FamilyLib.familyRows(families).values(),
        "Family",
        "id",
      )
      .sample({
        id = "";
        displayName = "";
        createdAt = 0;
        createdBy = Principal.fromText("aaaaa-aa");
        status = #active;
      })
      .payload("id", func r = r.id)
      .payload("displayName", func r = r.displayName)
      .payload("createdAt", func r = r.createdAt)
      .payload("createdBy", func r = r.createdBy.toText())
      .payload("status", func r = switch (r.status) { case (#active) "active"; case (#archived) "archived" })
      .controllerOnly()
      .build(),
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
        familyId = "";
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
        mimeType = "";
        filename = "";
        tags = "";
      })
      .payload("familyId", func r = r.familyId)
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
      .payload("mimeType", func r = r.mimeType)
      .payload("filename", func r = r.filename)
      .payload("tags", func r = r.tags)
      .ownedByWith("id", canSeeArchiveItem)
      .controllerOrScoped()
      .build(),
      OQL.Entity.new<OwnershipTypes.ProfileRow>(
        "profile",
        func() : Iter.Iter<OwnershipTypes.ProfileRow> = OwnershipLib.profileRows(profiles),
        "PersonProfile",
        "personId",
      )
      .sample({
        familyId = "";
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
        familyId = "";
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
        familyId = "";
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
        familyId = "";
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
        familyId = "";
        stewardAccountId = Principal.fromText("aaaaa-aa");
        roleStatus = #Active;
        successorPriority = null;
        assignedBy = Principal.fromText("aaaaa-aa");
        assignedAt = 0;
      })
      .payload("familyId", func r = r.familyId)
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
      OQL.Entity.manual<FamilyHistoryTypes.StoryRow>(
        "story",
        func() : Iter.Iter<FamilyHistoryTypes.StoryRow> = FamilyHistoryScopeLib.storyRows(stories),
        "Story",
        "id",
      )
      .sample({
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        id = 0;
        title = "";
        storyText = "";
        relatedMemberCount = 0;
        era = "";
        year = null;
        location = "";
        contributor = "";
        evidenceStatus = "";
        relatedArchiveItemCount = 0;
        createdAt = 0;
        updatedAt = 0;
        status = "";
      })
      .payload("familyId", func r = r.familyId)
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("storyText", func r = r.storyText)
      .payload("relatedMemberCount", func r = r.relatedMemberCount)
      .payload("era", func r = r.era)
      .payload("year", func r = r.year ?? 0)
      .payload("location", func r = r.location)
      .payload("contributor", func r = r.contributor)
      .payload("evidenceStatus", func r = r.evidenceStatus)
      .payload("relatedArchiveItemCount", func r = r.relatedArchiveItemCount)
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .payload("status", func r = r.status)
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
        func() : Iter.Iter<RecipeTypes.RecipeRow> = RecipesScopeLib.recipeRows(recipes),
        "Recipe",
        "recipeId",
      )
      .sample({
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
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
      .payload("familyId", func r = r.familyId)
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
        familyId = "norwood";
        postId = 0;
        authorAccountId = Principal.fromText("aaaaa-aa");
        authorPersonId = "";
        title = null;
        body = "";
        postType = #General;
        relatedPersonIds = [];
        linkedMediaIds = [];
        tags = [];
        createdAt = 0;
        updatedAt = 0;
        status = #Active;
        privacyScope = #FamilyOnly;
      })
      .payload("familyId", func r = r.familyId)
      .payload("postId", func r = r.postId)
      .payload("authorAccountId", func r = r.authorAccountId.toText())
      .payload("authorPersonId", func r = r.authorPersonId)
      .payload("title", func r = r.title ?? "")
      .payload("body", func r = r.body)
      .payload("postType", func r = postTypeText(r.postType))
      .payload("relatedPersonCount", func r = r.relatedPersonIds.size())
      .payload("linkedMediaCount", func r = r.linkedMediaIds.size())
      .payload("tags", func r = r.tags.values().join(", "))
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
        familyId = "norwood";
        replyId = 0;
        postId = 0;
        authorAccountId = Principal.fromText("aaaaa-aa");
        authorPersonId = "";
        body = "";
        createdAt = 0;
      })
      .payload("familyId", func r = r.familyId)
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
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        conversationId = 0;
        participantAccountIds = [];
        participantPersonIds = [];
        createdAt = 0;
        updatedAt = 0;
      })
      .payload("familyId", func r = r.familyId)
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
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        messageId = 0;
        conversationId = 0;
        senderAccountId = Principal.fromText("aaaaa-aa");
        senderPersonId = "";
        body = "";
        createdAt = 0;
        readAt = null;
        status = #Sent;
      })
      .payload("familyId", func r = r.familyId)
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
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        blockerAccountId = Principal.fromText("aaaaa-aa");
        blockedAccountId = Principal.fromText("aaaaa-aa");
        createdAt = 0;
      })
      .payload("familyId", func r = r.familyId)
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
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        reportId = 0;
        reportingAccountId = Principal.fromText("aaaaa-aa");
        reportedMessageId = 0;
        reason = "";
        createdAt = 0;
        status = #Pending;
      })
      .payload("familyId", func r = r.familyId)
      .payload("reportId", func r = r.reportId)
      .payload("reportingAccountId", func r = r.reportingAccountId.toText())
      .payload("reportedMessageId", func r = r.reportedMessageId)
      .payload("reason", func r = r.reason)
      .payload("createdAt", func r = r.createdAt)
      .payload("status", func r = reportStatusText(r.status))
      .controllerOnly()
      .build(),
      OQL.Entity.manual<ResearchIntakeTypes.SourceRecord>(
        "researchSource",
        func() : Iter.Iter<ResearchIntakeTypes.SourceRecord> = researchSources.values(),
        "SourceRecord",
        "id",
      )
      .sample({
        id = 0;
        title = "";
        sourceType = #CensusCitation;
        description = "";
        archiveItemId = null;
        contributor = Principal.fromText("aaaaa-aa");
        status = #Pending;
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        createdAt = 0;
        updatedAt = 0;
      })
      .payload("familyId", func r = r.familyId)
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("sourceType", func r = sourceTypeText(r.sourceType))
      .payload("description", func r = r.description)
      .payload("archiveItemId", func r = r.archiveItemId ?? 0)
      .payload("contributor", func r = r.contributor.toText())
      .payload("status", func r = reviewStatusText(r.status))
      .payload("createdAt", func r = r.createdAt)
      .payload("updatedAt", func r = r.updatedAt)
      .ownedByWith("familyId", canSeeResearchSource)
      .controllerOrScoped()
      .build(),
      OQL.Entity.manual<ResearchIntakeTypes.ProposedFinding>(
        "proposedFinding",
        func() : Iter.Iter<ResearchIntakeTypes.ProposedFinding> = proposedFindings.values(),
        "ProposedFinding",
        "id",
      )
      .sample({
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        id = 0;
        title = "";
        evidenceLabel = #Documented;
        findingType = #PersonFact;
        content = #PersonFact({ personId = ""; field = ""; value = "" });
        sourceId = 0;
        personId = null;
        newPersonCandidateId = null;
        status = #Pending;
        conflictReviewId = null;
        submittedBy = Principal.fromText("aaaaa-aa");
        submittedAt = 0;
        reviewedBy = null;
        reviewedAt = null;
        updatedAt = 0;
      })
      .payload("familyId", func r = r.familyId)
      .payload("id", func r = r.id)
      .payload("title", func r = r.title)
      .payload("evidenceLabel", func r = evidenceLabelText(r.evidenceLabel))
      .payload("findingType", func r = findingTypeText(r.findingType))
      .payload("sourceId", func r = r.sourceId)
      .payload("personId", func r = r.personId ?? "")
      .payload("newPersonCandidateId", func r = r.newPersonCandidateId ?? 0)
      .payload("status", func r = reviewStatusText(r.status))
      .payload("conflictReviewId", func r = r.conflictReviewId ?? 0)
      .payload("submittedBy", func r = r.submittedBy.toText())
      .payload("submittedAt", func r = r.submittedAt)
      .payload("reviewedBy", func r = switch (r.reviewedBy) { case (?p) p.toText(); case null "" })
      .payload("reviewedAt", func r = r.reviewedAt ?? 0)
      .payload("updatedAt", func r = r.updatedAt)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<ResearchIntakeTypes.NewPersonCandidate>(
        "newPersonCandidate",
        func() : Iter.Iter<ResearchIntakeTypes.NewPersonCandidate> = newPersonCandidates.values(),
        "NewPersonCandidate",
        "id",
      )
      .sample({
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        id = 0;
        name = "";
        details = "";
        sourceId = 0;
        status = #Pending;
        submittedBy = Principal.fromText("aaaaa-aa");
        submittedAt = 0;
        reviewedBy = null;
        reviewedAt = null;
      })
      .payload("familyId", func r = r.familyId)
      .payload("id", func r = r.id)
      .payload("name", func r = r.name)
      .payload("details", func r = r.details)
      .payload("sourceId", func r = r.sourceId)
      .payload("status", func r = reviewStatusText(r.status))
      .payload("submittedBy", func r = r.submittedBy.toText())
      .payload("submittedAt", func r = r.submittedAt)
      .payload("reviewedBy", func r = switch (r.reviewedBy) { case (?p) p.toText(); case null "" })
      .payload("reviewedAt", func r = r.reviewedAt ?? 0)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<ResearchIntakeTypes.RelationshipProposal>(
        "relationshipProposal",
        func() : Iter.Iter<ResearchIntakeTypes.RelationshipProposal> = relationshipProposals.values(),
        "RelationshipProposal",
        "id",
      )
      .sample({
        familyId = "";
        id = 0;
        fromPersonId = "";
        toPersonId = "";
        relationshipType = "";
        sourceId = 0;
        status = #Pending;
        submittedBy = Principal.fromText("aaaaa-aa");
        submittedAt = 0;
        reviewedBy = null;
        reviewedAt = null;
      })
      .payload("familyId", func r = r.familyId)
      .payload("id", func r = r.id)
      .payload("fromPersonId", func r = r.fromPersonId)
      .payload("toPersonId", func r = r.toPersonId)
      .payload("relationshipType", func r = r.relationshipType)
      .payload("sourceId", func r = r.sourceId)
      .payload("status", func r = reviewStatusText(r.status))
      .payload("submittedBy", func r = r.submittedBy.toText())
      .payload("submittedAt", func r = r.submittedAt)
      .payload("reviewedBy", func r = switch (r.reviewedBy) { case (?p) p.toText(); case null "" })
      .payload("reviewedAt", func r = r.reviewedAt ?? 0)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<ResearchIntakeTypes.ConflictReviewItem>(
        "conflictReviewItem",
        func() : Iter.Iter<ResearchIntakeTypes.ConflictReviewItem> = conflictReviewItems.values(),
        "ConflictReviewItem",
        "id",
      )
      .sample({
        familyId = "";
        id = 0;
        findingId = 0;
        personId = null;
        field = "";
        canonicalValue = "";
        proposedValue = "";
        existingSourceId = null;
        proposedSourceId = null;
        evidenceLabel = #Conflicting;
        stewardNotes = "";
        status = #Pending;
        resolvedBy = null;
        resolvedAt = null;
      })
      .payload("id", func r = r.id)
      .payload("findingId", func r = r.findingId)
      .payload("personId", func r = r.personId ?? "")
      .payload("field", func r = r.field)
      .payload("canonicalValue", func r = r.canonicalValue)
      .payload("proposedValue", func r = r.proposedValue)
      .payload("existingSourceId", func r = r.existingSourceId ?? 0)
      .payload("proposedSourceId", func r = r.proposedSourceId ?? 0)
      .payload("evidenceLabel", func r = evidenceLabelText(r.evidenceLabel))
      .payload("stewardNotes", func r = r.stewardNotes)
      .payload("status", func r = reviewStatusText(r.status))
      .payload("resolvedBy", func r = switch (r.resolvedBy) { case (?p) p.toText(); case null "" })
      .payload("resolvedAt", func r = r.resolvedAt ?? 0)
      .controllerOnly()
      .build(),
      OQL.Entity.manual<ResearchIntakeTypes.ResearchAuditEntry>(
        "researchAuditLog",
        func() : Iter.Iter<ResearchIntakeTypes.ResearchAuditEntry> = researchAuditLog.values(),
        "ResearchAuditEntry",
        "id",
      )
      .sample({
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        id = 0;
        action = "";
        findingId = null;
        sourceId = null;
        actorId = Principal.fromText("aaaaa-aa");
        timestamp = 0;
        summary = "";
      })
      .payload("familyId", func r = r.familyId)
      .payload("id", func r = r.id)
      .payload("action", func r = r.action)
      .payload("findingId", func r = r.findingId ?? 0)
      .payload("sourceId", func r = r.sourceId ?? 0)
      .payload("actorId", func r = r.actorId.toText())
      .payload("timestamp", func r = r.timestamp)
      .payload("summary", func r = r.summary)
      .controllerOnly()
      .build(),
    ];
  });
  include MixinObjectStorage();
  include FamilyApi(families);
  include ObjectStorageApi(galleries, claims, profiles, stewards);
  include ArchiveApi(archiveItems, claims, profiles, stewards, notifications, researchSources);
  include OwnershipApi(accessControlState, profiles, claims, confirmedRelationships, relationshipRequests, notifications, auditLog, stewards);
  include ClaimPersistenceApi(profiles, claims);
  include RelationshipsApi(relationshipRequests, confirmedRelationships);
  include NotificationsApi(notifications);
  include AccountIdentityApi(accounts);
  include GovernanceApi(accessControlState, profiles, confirmedRelationships, stewards, successors, removalRequests, auditLog, mergeConflicts, archivedProfiles, galleries, archiveItems, dismissedDuplicates);
  include FamilyHistoryScopeApi(stories, profiles, claims, stewards, archiveItems);
  include MysteryApi(stories, mysteries, mysteryContributions, profiles, archiveItems, claims, stewards);
  include RecipesScopeApi(recipes, profiles, claims, stewards, archiveItems);
  include BoardScopeApi(posts, replies, profiles, notifications, auditLog, stewards, claims, archiveItems);
  include MessagingScopeApi(conversations, messages, blocks, reports, profiles, archivedProfiles, notifications, accounts, stewards, claims);
  include PendingCountApi(accessControlState, archiveItems, recipes, stories, mysteryContributions, stewards, researchSources);
  include ResearchIntakeApi(researchSources, proposedFindings, newPersonCandidates, relationshipProposals, conflictReviewItems, researchAuditLog, researchState, profiles, stories, mysteries, archiveItems, notifications, claims, stewards);
  include ResearchSourceScopeApi(researchSources, proposedFindings, newPersonCandidates, relationshipProposals, conflictReviewItems, researchAuditLog, researchState, archiveItems, notifications, claims, stewards);
  include FindingScopeApi(proposedFindings, researchSources, newPersonCandidates, relationshipProposals, conflictReviewItems, researchAuditLog, researchState, profiles, claims, stewards, notifications);
  include CandidateScopeApi(newPersonCandidates, researchSources, proposedFindings, relationshipProposals, conflictReviewItems, researchAuditLog, researchState, profiles, claims, stewards, notifications);
  include RelationshipProposalScopeApi(relationshipProposals, researchSources, researchAuditLog, researchState, profiles, claims, stewards, notifications, confirmedRelationships);
  include ConflictScopeApi(conflictReviewItems, proposedFindings, researchSources, researchAuditLog, researchState, profiles, stewards);
  include ArchiveResearchBoardNotificationsApi(archiveItems, researchSources, researchState, posts, notifications, claims, profiles, stewards);
  include AuditAndWorkloadApi(accessControlState, auditLog, researchAuditLog, conflictReviewItems, stewards);
  include StewardAuthorityApi(accessControlState, stewards, auditLog);
  include ApiDocMixin();
};

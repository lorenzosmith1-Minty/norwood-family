import List "mo:core/List";
import Map "mo:core/Map";

module {
  type UserRole = {
    #admin;
    #user;
    #guest;
  };

  type Photo = {
    id : Nat;
    blob : Blob;
    filename : Text;
    mimeType : Text;
    uploadedAt : Int;
    uploadedBy : Principal;
  };

  type PhotoGallery = {
    photos : List.List<Photo>;
    var profilePhotoId : ?Nat;
  };

  type ArchiveItemType = {
    #Photo;
    #Document;
    #Audio;
    #Video;
    #WrittenStoryNote;
    #Research;
    #WorkBusiness;
    #Other;
  };

  type SourceStatus = {
    #Original;
    #Copy;
    #Transcribed;
    #Unverified;
  };

  type PrivacyLevel = {
    #Public;
    #FamilyOnly;
    #Private;
  };

  type ArchiveItemStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type ArchiveItemClassification = {
    #Standard;
    #OralHistory;
  };

  type OralHistorySpeaker = {
    personId : ?Text;
    name : Text;
  };

  type ChapterMarker = {
    title : Text;
    timestamp : Nat;
  };

  type ArchiveItem = {
    id : Nat;
    title : Text;
    description : Text;
    itemType : ArchiveItemType;
    blob : Blob;
    era : Text;
    year : ?Nat;
    tags : [Text];
    contributor : Principal;
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    sourceStatus : SourceStatus;
    privacyLevel : PrivacyLevel;
    status : ArchiveItemStatus;
    createdAt : Int;
    classification : ArchiveItemClassification;
    primarySpeaker : ?OralHistorySpeaker;
    transcript : ?Text;
    searchableTranscript : ?Text;
    chapterMarkers : ?[ChapterMarker];
    aiSummary : ?Text;
    extractedNames : ?[Text];
  };

  type LivingStatus = {
    #Living;
    #Deceased;
  };

  type ClaimStatus = {
    #Unclaimed;
    #Claimed;
  };

  type ProfileClaimStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type RelationshipType = {
    #Parent;
    #Child;
    #SpousePartner;
    #Sibling;
  };

  type RelationshipStatus = {
    #Confirmed;
    #Pending;
    #Disputed;
  };

  type RelationshipRequestStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type PersonProfile = {
    personId : Text;
    name : Text;
    livingStatus : LivingStatus;
    claimStatus : ClaimStatus;
    claimedByUserId : ?Principal;
    preferredName : ?Text;
    firstName : ?Text;
    middleName : ?Text;
    lastName : ?Text;
    suffix : ?Text;
    nickname : ?Text;
    story : ?Text;
    shortBio : ?Text;
    longerStory : ?Text;
    occupation : ?Text;
    birthInfo : ?Text;
    birthDate : ?Text;
    birthplace : ?Text;
    currentLocation : ?Text;
    timeline : ?[Text];
    privacySettings : ?Text;
  };

  type ProfileClaim = {
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    status : ProfileClaimStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type Relationship = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : RelationshipType;
    status : RelationshipStatus;
  };

  type RelationshipRequest = {
    id : Nat;
    requestingPersonId : Text;
    relatedPersonId : Text;
    proposedRelationship : RelationshipType;
    status : RelationshipRequestStatus;
    submittedDate : Int;
    reviewer : ?Principal;
    reviewedDate : ?Int;
  };

  type OldNotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
  };

  type NotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
    #BoardReply;
    #BoardMention;
    #NewMessage;
  };

  type Notification = {
    id : Nat;
    recipient : Principal;
    notificationType : NotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type OldNotification = {
    id : Nat;
    recipient : Principal;
    notificationType : OldNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type AuthMethod = {
    #Google;
    #Apple;
  };

  type Account = {
    id : Principal;
    authMethods : [AuthMethod];
    createdAt : Int;
  };

  type StewardRoleStatus = {
    #Active;
    #Removed;
  };

  type StewardRecord = {
    stewardAccountId : Principal;
    roleStatus : StewardRoleStatus;
    successorPriority : ?Nat;
    assignedBy : Principal;
    assignedAt : Int;
  };

  type SuccessorStatus = {
    #Designated;
    #Activated;
    #Removed;
  };

  type SuccessorDesignation = {
    personId : Text;
    priority : Nat;
    assignedBy : Principal;
    assignedAt : Int;
    status : SuccessorStatus;
  };

  type ProfileRemovalStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type ProfileRemovalRequest = {
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    reason : Text;
    status : ProfileRemovalStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type OldAuditActionType = {
    #ClaimApproved;
    #ClaimRejected;
    #RelationshipRequestApproved;
    #RelationshipRequestRejected;
    #RelationshipRequestPending;
    #StewardPromoted;
    #StewardRemoved;
    #SuccessorDesignated;
    #SuccessorActivated;
    #ProfileArchived;
    #ProfileRestored;
    #ProfilePermanentlyDeleted;
    #ProfileRemovalRequested;
    #ProfileRemovalReviewed;
    #DuplicateMerged;
    #RelationshipAdded;
    #RelationshipRemoved;
    #RelationshipTypeCorrected;
  };

  type AuditActionType = {
    #ClaimApproved;
    #ClaimRejected;
    #RelationshipRequestApproved;
    #RelationshipRequestRejected;
    #RelationshipRequestPending;
    #StewardPromoted;
    #StewardRemoved;
    #SuccessorDesignated;
    #SuccessorActivated;
    #ProfileArchived;
    #ProfileRestored;
    #ProfilePermanentlyDeleted;
    #ProfileRemovalRequested;
    #ProfileRemovalReviewed;
    #DuplicateMerged;
    #RelationshipAdded;
    #RelationshipRemoved;
    #RelationshipTypeCorrected;
    #BoardPostArchived;
    #BoardPostRestored;
    #BoardReplyRemoved;
  };

  type AuditEntry = {
    id : Nat;
    actionType : AuditActionType;
    actorAccountId : Principal;
    affectedPersonIds : [Text];
    timestamp : Int;
    summary : Text;
  };

  type OldAuditEntry = {
    id : Nat;
    actionType : OldAuditActionType;
    actorAccountId : Principal;
    affectedPersonIds : [Text];
    timestamp : Int;
    summary : Text;
  };

  type MergeConflictStatus = {
    #Pending;
    #Resolved;
  };

  type MergeConflict = {
    id : Nat;
    field : Text;
    canonicalValue : Text;
    alternateValue : Text;
    status : MergeConflictStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  type DismissedPair = {
    personIdA : Text;
    personIdB : Text;
  };

  type EvidenceStatus = {
    #Documented;
    #FamilyHistory;
    #PersonalMemory;
    #Unresolved;
  };

  type StoryStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type Story = {
    id : Nat;
    title : Text;
    storyText : Text;
    relatedMemberIds : [Text];
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    contributor : Principal;
    evidenceStatus : EvidenceStatus;
    relatedArchiveItemIds : [Nat];
    createdAt : Int;
    updatedAt : Int;
    status : StoryStatus;
  };

  type MysteryStatus = {
    #Open;
    #Researching;
    #PartiallyResolved;
    #Resolved;
  };

  type MysteryContributionType = {
    #Note;
    #Memory;
    #Lead;
    #Source;
  };

  type MysteryContributionStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type Resolution = {
    summary : Text;
    supportingEvidence : [Text];
    resolvedAt : Int;
    resolvedBy : Principal;
  };

  type Mystery = {
    id : Nat;
    title : Text;
    description : Text;
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    knownFacts : [Text];
    possibilities : [Text];
    relatedSourceIds : [Nat];
    relatedArchiveItemIds : [Nat];
    status : MysteryStatus;
    contributor : Principal;
    createdAt : Int;
    updatedAt : Int;
    resolution : ?Resolution;
  };

  type MysteryContribution = {
    id : Nat;
    mysteryId : Nat;
    contributionType : MysteryContributionType;
    text : Text;
    contributor : Principal;
    status : MysteryContributionStatus;
    createdAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type RecipeStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Archived;
  };

  type Recipe = {
    recipeId : Nat;
    title : Text;
    shortDescription : Text;
    originatingPersonId : Text;
    relatedPersonIds : [Text];
    contributorAccountId : Principal;
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    familyBranch : ?Text;
    ingredients : [Text];
    instructions : Text;
    familyStory : ?Text;
    tags : [Text];
    privacyLevel : PrivacyLevel;
    evidenceStatus : EvidenceStatus;
    linkedMediaIds : [Nat];
    status : RecipeStatus;
    createdAt : Int;
    updatedAt : Int;
    ocrText : ?Text;
    transcript : ?Text;
    extractedIngredients : ?[Text];
    aiDerivedText : ?Text;
  };

  // ---------------------------------------------------------------------------
  // New: Family Message Board
  // ---------------------------------------------------------------------------

  type PostType = {
    #General;
    #Announcement;
    #FamilyQuestion;
    #ResearchHistory;
    #PhotoIdentification;
    #Recipe;
    #ReunionEvent;
    #Memorial;
    #Other;
  };

  type PostStatus = {
    #Active;
    #Archived;
  };

  type PrivacyScope = {
    #FamilyOnly;
  };

  type Post = {
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    title : ?Text;
    body : Text;
    postType : PostType;
    relatedPersonIds : [Text];
    linkedMediaIds : [Nat];
    createdAt : Int;
    updatedAt : Int;
    status : PostStatus;
    privacyScope : PrivacyScope;
  };

  type Reply = {
    replyId : Nat;
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    body : Text;
    createdAt : Int;
  };

  // ---------------------------------------------------------------------------
  // New: Private Messaging
  // ---------------------------------------------------------------------------

  type Conversation = {
    conversationId : Nat;
    participantAccountIds : [Principal];
    participantPersonIds : [Text];
    createdAt : Int;
    updatedAt : Int;
  };

  type MessageStatus = {
    #Sent;
    #Blocked;
  };

  type Message = {
    messageId : Nat;
    conversationId : Nat;
    senderAccountId : Principal;
    senderPersonId : Text;
    body : Text;
    createdAt : Int;
    readAt : ?Int;
    status : MessageStatus;
  };

  type Block = {
    blockerAccountId : Principal;
    blockedAccountId : Principal;
    createdAt : Int;
  };

  type ReportStatus = {
    #Pending;
    #Reviewed;
    #Dismissed;
  };

  type Report = {
    reportId : Nat;
    reportingAccountId : Principal;
    reportedMessageId : Nat;
    reason : Text;
    createdAt : Int;
    status : ReportStatus;
  };

  type OldActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<ArchiveItem>;
    profiles : Map.Map<Text, PersonProfile>;
    claims : List.List<ProfileClaim>;
    relationshipRequests : List.List<RelationshipRequest>;
    confirmedRelationships : List.List<Relationship>;
    notifications : List.List<OldNotification>;
    accounts : Map.Map<Principal, Account>;
    stewards : List.List<StewardRecord>;
    successors : List.List<SuccessorDesignation>;
    removalRequests : List.List<ProfileRemovalRequest>;
    auditLog : List.List<OldAuditEntry>;
    mergeConflicts : List.List<MergeConflict>;
    archivedProfiles : List.List<Text>;
    dismissedDuplicates : List.List<DismissedPair>;
    stories : List.List<Story>;
    mysteries : List.List<Mystery>;
    mysteryContributions : List.List<MysteryContribution>;
    recipes : List.List<Recipe>;
  };

  type NewActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<ArchiveItem>;
    profiles : Map.Map<Text, PersonProfile>;
    claims : List.List<ProfileClaim>;
    relationshipRequests : List.List<RelationshipRequest>;
    confirmedRelationships : List.List<Relationship>;
    notifications : List.List<Notification>;
    accounts : Map.Map<Principal, Account>;
    stewards : List.List<StewardRecord>;
    successors : List.List<SuccessorDesignation>;
    removalRequests : List.List<ProfileRemovalRequest>;
    auditLog : List.List<AuditEntry>;
    mergeConflicts : List.List<MergeConflict>;
    archivedProfiles : List.List<Text>;
    dismissedDuplicates : List.List<DismissedPair>;
    stories : List.List<Story>;
    mysteries : List.List<Mystery>;
    mysteryContributions : List.List<MysteryContribution>;
    recipes : List.List<Recipe>;
    posts : List.List<Post>;
    replies : List.List<Reply>;
    conversations : List.List<Conversation>;
    messages : List.List<Message>;
    blocks : List.List<Block>;
    reports : List.List<Report>;
  };

  public func migration(old : OldActor) : NewActor {
    {
      accessControlState = old.accessControlState;
      galleries = old.galleries;
      archiveItems = old.archiveItems;
      profiles = old.profiles;
      claims = old.claims;
      relationshipRequests = old.relationshipRequests;
      confirmedRelationships = old.confirmedRelationships;
      notifications = old.notifications.map(
        func(n) {
          {
            id = n.id;
            recipient = n.recipient;
            notificationType = n.notificationType : NotificationType;
            message = n.message;
            createdAt = n.createdAt;
            read = n.read;
          };
        }
      );
      accounts = old.accounts;
      stewards = old.stewards;
      successors = old.successors;
      removalRequests = old.removalRequests;
      auditLog = old.auditLog.map(
        func(a) {
          {
            id = a.id;
            actionType = a.actionType : AuditActionType;
            actorAccountId = a.actorAccountId;
            affectedPersonIds = a.affectedPersonIds;
            timestamp = a.timestamp;
            summary = a.summary;
          };
        }
      );
      mergeConflicts = old.mergeConflicts;
      archivedProfiles = old.archivedProfiles;
      dismissedDuplicates = old.dismissedDuplicates;
      stories = old.stories;
      mysteries = old.mysteries;
      mysteryContributions = old.mysteryContributions;
      recipes = old.recipes;
      posts = List.empty();
      replies = List.empty();
      conversations = List.empty();
      messages = List.empty();
      blocks = List.empty();
      reports = List.empty();
    };
  };
};

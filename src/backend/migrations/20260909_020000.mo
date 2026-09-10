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

  type OldArchiveItem = {
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
  };

  type NewArchiveItem = {
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

  type NotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
  };

  type Notification = {
    id : Nat;
    recipient : Principal;
    notificationType : NotificationType;
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
  };

  type AuditEntry = {
    id : Nat;
    actionType : AuditActionType;
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

  type OldActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<OldArchiveItem>;
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
  };

  type NewActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<NewArchiveItem>;
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
  };

  public func migration(old : OldActor) : NewActor {
    {
      accessControlState = old.accessControlState;
      galleries = old.galleries;
      archiveItems = old.archiveItems.map(
        func(item) {
          {
            item with
            classification = #Standard;
            primarySpeaker = null;
            transcript = null;
            searchableTranscript = null;
            chapterMarkers = null;
            aiSummary = null;
            extractedNames = null;
          };
        }
      );
      profiles = old.profiles;
      claims = old.claims;
      relationshipRequests = old.relationshipRequests;
      confirmedRelationships = old.confirmedRelationships;
      notifications = old.notifications;
      accounts = old.accounts;
      stewards = old.stewards;
      successors = old.successors;
      removalRequests = old.removalRequests;
      auditLog = old.auditLog;
      mergeConflicts = old.mergeConflicts;
      archivedProfiles = old.archivedProfiles;
      dismissedDuplicates = old.dismissedDuplicates;
      stories = old.stories;
      mysteries = old.mysteries;
      mysteryContributions = old.mysteryContributions;
    };
  };
};

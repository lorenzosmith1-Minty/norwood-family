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
    notifications : List.List<Notification>;
    accounts : Map.Map<Principal, Account>;
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
      notifications = old.notifications;
      accounts = old.accounts;
      stewards = List.empty();
      successors = List.empty();
      removalRequests = List.empty();
      auditLog = List.empty();
      mergeConflicts = List.empty();
      archivedProfiles = List.empty();
      dismissedDuplicates = List.empty();
    };
  };
};

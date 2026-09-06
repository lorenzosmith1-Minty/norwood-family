import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

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

  /// The pre-expansion PersonProfile shape (no separate identity, birthplace,
  /// current-location, short-bio/longer-story, or birth-date fields).
  type OldPersonProfile = {
    personId : Text;
    name : Text;
    livingStatus : LivingStatus;
    claimStatus : ClaimStatus;
    claimedByUserId : ?Principal;
    preferredName : ?Text;
    story : ?Text;
    occupation : ?Text;
    birthInfo : ?Text;
    timeline : ?[Text];
    privacySettings : ?Text;
  };

  /// The expanded PersonProfile with the new optional owner-editable fields.
  type NewPersonProfile = {
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

  type OldActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<ArchiveItem>;
    profiles : Map.Map<Text, OldPersonProfile>;
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
    profiles : Map.Map<Text, NewPersonProfile>;
    claims : List.List<ProfileClaim>;
    relationshipRequests : List.List<RelationshipRequest>;
    confirmedRelationships : List.List<Relationship>;
    notifications : List.List<Notification>;
    accounts : Map.Map<Principal, Account>;
  };

  /// Adds the new optional owner-editable fields to every existing Person
  /// Profile, defaulting each to `null` (unset). All other state is carried
  /// through unchanged, preserving personId, claim ownership, confirmed
  /// relationships, archive links, notifications, and verification history.
  public func migration(old : OldActor) : NewActor {
    let profiles = old.profiles.map<Text, OldPersonProfile, NewPersonProfile>(
      func(_, p) {
        {
          p with
          firstName = null;
          middleName = null;
          lastName = null;
          suffix = null;
          nickname = null;
          shortBio = null;
          longerStory = null;
          birthDate = null;
          birthplace = null;
          currentLocation = null;
        };
      }
    );
    {
      accessControlState = old.accessControlState;
      galleries = old.galleries;
      archiveItems = old.archiveItems;
      profiles;
      claims = old.claims;
      relationshipRequests = old.relationshipRequests;
      confirmedRelationships = old.confirmedRelationships;
      notifications = old.notifications;
      accounts = old.accounts;
    };
  };
};

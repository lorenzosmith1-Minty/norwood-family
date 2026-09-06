import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

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
    story : ?Text;
    occupation : ?Text;
    birthInfo : ?Text;
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
  };

  /// Normalizes a name for duplicate matching: lower-cases, keeps only
  /// alphanumeric characters, collapses whitespace, and drops punctuation
  /// (periods included), so suffix variants like Jr/Jr. and Sr/Sr. collapse to
  /// the same token.
  func normalize(name : Text) : Text {
    let words = List.empty<Text>();
    for (word in name.toLower().tokens(#predicate (func ch = ch.isWhitespace()))) {
      var clean = "";
      for (ch in word.chars()) {
        if (ch.isAlphabetic() or ch.isDigit()) {
          clean := clean # ch.toText();
        };
      };
      if (clean.size() > 0) {
        words.add(clean);
      };
    };
    words.toArray().values().join(" ");
  };

  public func migration(old : OldActor) : NewActor {
    let profiles = old.profiles;
    let claims = old.claims;
    let relationshipRequests = old.relationshipRequests;

    // Identify every duplicate Lorenzo Smith Jr. profile: a runtime-created
    // profile (created via createMyself, keyed by the caller's principal) whose
    // normalized name matches "lorenzo smith jr" but whose personId is not the
    // canonical "lorenzoSmithJr".
    let duplicateIds = List.empty<Text>();
    for ((personId, profile) in profiles.entries()) {
      if (personId != "lorenzoSmithJr" and normalize(profile.name) == "lorenzo smith jr") {
        duplicateIds.add(personId);
      };
    };
    let dups = duplicateIds.toArray();

    // Re-point, not drop, any pending claim tied to a duplicate to the canonical
    // personId, preserving the pending claim and its requestingUserId so the
    // claim is not lost.
    let claimSnapshot = claims.toArray();
    claims.clear();
    for (c in claimSnapshot.values()) {
      if (c.status == #Pending and dups.any(func d = d == c.personId)) {
        claims.add({ c with personId = "lorenzoSmithJr" });
      } else {
        claims.add(c);
      };
    };

    // Re-point, not drop, any pending relationship request referencing a removed
    // duplicate personId to the canonical personId so the child relationship
    // under Lorenzo Smith Sr. resolves to the canonical record.
    let reqSnapshot = relationshipRequests.toArray();
    relationshipRequests.clear();
    for (r in reqSnapshot.values()) {
      if (r.status == #Pending and (dups.any(func d = d == r.requestingPersonId) or dups.any(func d = d == r.relatedPersonId))) {
        let repointed = {
          r with
          requestingPersonId = if (dups.any(func d = d == r.requestingPersonId)) { "lorenzoSmithJr" } else { r.requestingPersonId };
          relatedPersonId = if (dups.any(func d = d == r.relatedPersonId)) { "lorenzoSmithJr" } else { r.relatedPersonId };
        };
        relationshipRequests.add(repointed);
      } else {
        relationshipRequests.add(r);
      };
    };

    // Remove the duplicate profiles so exactly one Lorenzo Smith Jr. record
    // ("lorenzoSmithJr") remains.
    for (d in dups.values()) {
      profiles.remove(d);
    };

    {
      accessControlState = old.accessControlState;
      galleries = old.galleries;
      archiveItems = old.archiveItems;
      profiles;
      claims;
      relationshipRequests;
      confirmedRelationships = old.confirmedRelationships;
      notifications = old.notifications;
      accounts = old.accounts;
    };
  };
};

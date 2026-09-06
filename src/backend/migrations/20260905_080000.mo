import Char "mo:core/Char";
import Iter "mo:core/Iter";
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

  /// Builds an unclaimed person profile for a seeded family member.
  func seed(personId : Text, name : Text, livingStatus : LivingStatus) : PersonProfile {
    {
      personId;
      name;
      livingStatus;
      claimStatus = #Unclaimed;
      claimedByUserId = null;
      preferredName = null;
      story = null;
      occupation = null;
      birthInfo = null;
      timeline = null;
      privacySettings = null;
    };
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

    // Seed the original Lorenzo Smith Jr. profile (child of Lorenzo Smith Sr.)
    // as the authoritative unclaimed living record, if not already present.
    if (profiles.get("lorenzoSmithJr") == null) {
      profiles.add("lorenzoSmithJr", seed("lorenzoSmithJr", "Lorenzo Smith Jr.", #Living));
    };

    // Identify the runtime-created duplicate Lorenzo Smith Jr. profile (created
    // via createMyself during manual testing, keyed by the caller's principal).
    // It is any profile other than the original whose normalized name matches
    // "lorenzo smith jr".
    var duplicateId : ?Text = null;
    for ((personId, profile) in profiles.entries()) {
      if (personId != "lorenzoSmithJr" and normalize(profile.name) == "lorenzo smith jr") {
        duplicateId := ?personId;
      };
    };

    switch (duplicateId) {
      case (?dup) {
        profiles.remove(dup);
        // Cancel any pending relationship request tied only to the duplicate.
        let reqSnapshot = old.relationshipRequests.toArray();
        old.relationshipRequests.clear();
        for (req in reqSnapshot.values()) {
          if (req.status == #Pending and (req.requestingPersonId == dup or req.relatedPersonId == dup)) {
            // dropped
          } else {
            old.relationshipRequests.add(req);
          };
        };
        // Cancel any pending claim tied only to the duplicate.
        let claimSnapshot = old.claims.toArray();
        old.claims.clear();
        for (c in claimSnapshot.values()) {
          if (c.status == #Pending and c.personId == dup) {
            // dropped
          } else {
            old.claims.add(c);
          };
        };
      };
      case null {};
    };

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

import Char "mo:core/Char";
import List "mo:core/List";
import Map "mo:core/Map";
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
    let galleries = old.galleries;
    let claims = old.claims;
    let relationshipRequests = old.relationshipRequests;

    // Detect duplicate Lorenzo Smith Jr. profiles that STILL EXIST in the
    // profiles map at upgrade time. A runtime-created profile (via createMyself,
    // keyed by the caller's principal) whose normalized name matches
    // "lorenzo smith jr" but whose personId is not the canonical
    // "lorenzoSmithJr" is a duplicate to consolidate into the canonical.
    let duplicateIds = List.empty<Text>();
    for ((personId, profile) in profiles.entries()) {
      if (personId != "lorenzoSmithJr" and normalize(profile.name) == "lorenzo smith jr") {
        duplicateIds.add(personId);
      };
    };
    let dups = duplicateIds.toArray();

    // SEED SAFETY GUARD: never overwrite the canonical lorenzoSmithJr record.
    // The canonical already exists (seeded by prior migrations or a real runtime
    // record with edits, ownership, media, or privacy settings) and is preserved
    // ENTIRELY. This migration never creates a new Person record and never
    // resets the canonical's edited fields, ownership history, uploaded media,
    // profilePhotoId, timeline/story data, or privacy settings.

    // PHOTO RESTORATION: consolidate any duplicate's gallery into the canonical
    // gallery BEFORE removing the duplicate, so real user-uploaded media keyed
    // under a duplicate personId is never orphaned. If the canonical gallery
    // exists, append the duplicate's photos and adopt its profilePhotoId only
    // when the canonical gallery has none. If the canonical gallery is missing,
    // adopt the duplicate's gallery wholesale. Never seed a generic/demo image
    // into the real profile.
    switch (galleries.get("lorenzoSmithJr")) {
      case (?canonicalGallery) {
        for (d in dups.values()) {
          switch (galleries.get(d)) {
            case (?dupGallery) {
              for (photo in dupGallery.photos.toArray().values()) {
                canonicalGallery.photos.add(photo);
              };
              if (canonicalGallery.profilePhotoId == null and dupGallery.profilePhotoId != null) {
                canonicalGallery.profilePhotoId := dupGallery.profilePhotoId;
              };
            };
            case null {};
          };
        };
      };
      case null {
        for (d in dups.values()) {
          switch (galleries.get(d)) {
            case (?dupGallery) {
              galleries.add("lorenzoSmithJr", dupGallery);
            };
            case null {};
          };
        };
      };
    };

    // Re-point, not drop, any claim tied to a duplicate to the canonical
    // personId, preserving the claim and its requestingUserId so an approved
    // (or rejected) ownership relationship on a duplicate is recovered onto the
    // canonical. Pending claims on duplicates are re-pointed too; any that turn
    // out to be manual-test duplicates of an approved claim are dropped below.
    let claimSnapshot = claims.toArray();
    claims.clear();
    for (c in claimSnapshot.values()) {
      if (dups.any(func d = d == c.personId)) {
        claims.add({ c with personId = "lorenzoSmithJr" });
      } else {
        claims.add(c);
      };
    };

    // Re-point, not drop, any relationship request referencing a duplicate
    // personId to the canonical personId so the child relationship under
    // Lorenzo Smith Sr. resolves to the canonical record. Both the requesting
    // and related person ids are re-pointed when they match a duplicate.
    let reqSnapshot = relationshipRequests.toArray();
    relationshipRequests.clear();
    for (r in reqSnapshot.values()) {
      if (dups.any(func d = d == r.requestingPersonId) or dups.any(func d = d == r.relatedPersonId)) {
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

    // Remove the duplicate profiles and their now-consolidated galleries so
    // exactly one canonical Lorenzo Smith Jr. record ("lorenzoSmithJr") remains.
    for (d in dups.values()) {
      profiles.remove(d);
      galleries.remove(d);
    };

    // Identify orphaned claims: claims whose personId is not a currently
    // existing profile and not the canonical "lorenzoSmithJr". Every claim is
    // created against an existing profile, so an orphaned claim can only be a
    // claim on a removed duplicate Lorenzo Smith Jr. profile.
    func isExisting(personId : Text) : Bool {
      personId == "lorenzoSmithJr" or profiles.get(personId) != null;
    };

    // Re-point non-pending orphaned claims (#Approved / #Rejected) to the
    // canonical personId so the previously approved ownership relationship is
    // recoverable. Drop any orphaned #Pending claim (a manual-test artifact).
    let orphanSnapshot = claims.toArray();
    claims.clear();
    for (c in orphanSnapshot.values()) {
      if (not isExisting(c.personId)) {
        if (c.status == #Pending) {
          // dropped: orphaned pending claim on a removed duplicate
        } else {
          claims.add({ c with personId = "lorenzoSmithJr" });
        };
      } else {
        claims.add(c);
      };
    };

    // Drop duplicate pending claims on the canonical personId and restore
    // ownership. When an approved claim exists on the canonical (now including
    // any approved claim re-pointed from a duplicate), any pending claim on the
    // canonical by the same user is a manual-test artifact and is dropped so no
    // duplicate pending claim remains. The approved claim is the authoritative
    // ownership record.
    switch (claims.find(func c = c.personId == "lorenzoSmithJr" and c.status == #Approved)) {
      case (?approvedClaim) {
        let snapshot = claims.toArray();
        claims.clear();
        for (c in snapshot.values()) {
          if (c.personId == "lorenzoSmithJr" and c.status == #Pending and c.requestingUserId == approvedClaim.requestingUserId) {
            // dropped: duplicate pending claim created during manual testing
          } else {
            claims.add(c);
          };
        };

        // CLAIM RESTORATION: restore ownership from an EXISTING approved claim
        // record, never from a hardcoded principal. Set claimStatus = #Claimed
        // and claimedByUserId = ?approvedClaim.requestingUserId (the stable
        // account-to-person link). Preserve the approved claim record itself.
        // Seed-safety guard: never overwrite a claim held by a DIFFERENT owner;
        // only restore when the profile is unclaimed or already claimed by that
        // same user (idempotent), including when claimedByUserId was cleared to
        // null by the regression. HARD CONSTRAINT: if no approved claim exists,
        // do NOT fabricate a principal or auto-approve a pending claim.
        switch (profiles.get("lorenzoSmithJr")) {
          case (?p) {
            if (p.claimedByUserId == null or p.claimedByUserId == ?approvedClaim.requestingUserId) {
              profiles.add("lorenzoSmithJr", { p with claimStatus = #Claimed; claimedByUserId = ?approvedClaim.requestingUserId });
            };
          };
          case null {};
        };
      };
      case null {};
    };

    {
      accessControlState = old.accessControlState;
      galleries;
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

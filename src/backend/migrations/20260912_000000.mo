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

  // Subset form: only the fields this migration transforms are listed. All
  // other stable fields (confirmedRelationships, notifications, accounts,
  // successors, removalRequests, auditLog, mergeConflicts, archivedProfiles,
  // dismissedDuplicates, stories, mysteries, mysteryContributions, recipes,
  // posts, replies, conversations, messages, blocks, reports) carry through
  // unchanged. `stewards` and `accessControlState` are included because they
  // are the surviving evidence the ownership recovery below reads.
  //
  // This migration exists because the previous revision ALREADY carries
  // 20260911_000000.mo, so that migration runs at INSTALL of the previous wasm
  // — before any runtime-created duplicate exists — and is already applied when
  // this build upgrades. A duplicate Lorenzo Smith Jr. profile created via
  // createMyself at runtime therefore survives the upgrade untouched unless a
  // NEWER migration consolidates it. This file is that migration: it runs on
  // upgrade and restores canonical ownership and Family Steward permission from
  // the surviving duplicate.
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
    stewards : List.List<StewardRecord>;
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
    stewards : List.List<StewardRecord>;
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
    let galleries = old.galleries;
    let archiveItems = old.archiveItems;
    let relationshipRequests = old.relationshipRequests;
    let stewards = old.stewards;
    let accessControlState = old.accessControlState;

    // Detect duplicate Lorenzo Smith Jr. profiles that STILL EXIST at upgrade
    // time. A runtime-created profile (via createMyself, keyed by the caller's
    // principal) whose normalized name matches "lorenzo smith jr" but whose
    // personId is not the canonical "lorenzoSmithJr" is a duplicate to
    // consolidate into the canonical.
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
    let repointedClaims = List.empty<ProfileClaim>();
    for (c in claimSnapshot.values()) {
      if (dups.any(func d = d == c.personId)) {
        repointedClaims.add({ c with personId = "lorenzoSmithJr" });
      } else {
        repointedClaims.add(c);
      };
    };
    let claims2 = repointedClaims;

    // Re-point, not drop, any relationship request referencing a duplicate
    // personId to the canonical personId so the child relationship under
    // Lorenzo Smith Sr. resolves to the canonical record. Both the requesting
    // and related person ids are re-pointed when they match a duplicate.
    let reqSnapshot = relationshipRequests.toArray();
    let repointedReqs = List.empty<RelationshipRequest>();
    for (r in reqSnapshot.values()) {
      if (dups.any(func d = d == r.requestingPersonId) or dups.any(func d = d == r.relatedPersonId)) {
        let repointed = {
          r with
          requestingPersonId = if (dups.any(func d = d == r.requestingPersonId)) { "lorenzoSmithJr" } else { r.requestingPersonId };
          relatedPersonId = if (dups.any(func d = d == r.relatedPersonId)) { "lorenzoSmithJr" } else { r.relatedPersonId };
        };
        repointedReqs.add(repointed);
      } else {
        repointedReqs.add(r);
      };
    };
    let relationshipRequests2 = repointedReqs;

    // Reconnect orphaned archive/media records: any archive item whose
    // relatedMemberIds references a removed duplicate personId is re-pointed to
    // the canonical personId so approved/pending media stays linked to the
    // canonical person. The media record itself is preserved untouched.
    let archiveSnapshot = archiveItems.toArray();
    let reconnectedArchive = List.empty<ArchiveItem>();
    for (a in archiveSnapshot.values()) {
      if (a.relatedMemberIds.any(func id = dups.any(func d = d == id))) {
        let repointed = {
          a with
          relatedMemberIds = a.relatedMemberIds.map(
            func id = if (dups.any(func d = d == id)) { "lorenzoSmithJr" } else { id }
          );
        };
        reconnectedArchive.add(repointed);
      } else {
        reconnectedArchive.add(a);
      };
    };
    let archiveItems2 = reconnectedArchive;

    // OWNERSHIP RECOVERY FROM DUPLICATE PROFILES: a duplicate Lorenzo Smith Jr.
    // profile may be a runtime-created profile (via createMyself, keyed by the
    // caller's principal) that carries the real ownership link (claimStatus =
    // #Claimed, claimedByUserId = ?owner). Capture that owner BEFORE removing
    // the duplicate so the canonical profile's ownership can be restored from it
    // when no approved claim survives the data-loss migration. This is the
    // recoverable historical ownership record — never a fabricated principal.
    var recoveredOwner : ?Principal = null;
    for (d in dups.values()) {
      switch (profiles.get(d)) {
        case (?dupProfile) {
          if (dupProfile.claimStatus == #Claimed and dupProfile.claimedByUserId != null) {
            recoveredOwner := dupProfile.claimedByUserId;
          };
        };
        case null {};
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
    let orphanSnapshot = claims2.toArray();
    let cleanedClaims = List.empty<ProfileClaim>();
    for (c in orphanSnapshot.values()) {
      if (not isExisting(c.personId)) {
        if (c.status == #Pending) {
          // dropped: orphaned pending claim on a removed duplicate
        } else {
          cleanedClaims.add({ c with personId = "lorenzoSmithJr" });
        };
      } else {
        cleanedClaims.add(c);
      };
    };
    let claims3 = cleanedClaims;

    // Determine the authoritative owner to restore for the canonical
    // lorenzoSmithJr profile. An approved claim on the canonical (now including
    // any approved claim re-pointed from a duplicate) takes precedence;
    // otherwise fall back to the owner recovered from a duplicate profile (a
    // runtime createMyself record that carried the real ownership link before
    // the data-loss migration wiped the approved claim). Never a fabricated
    // principal.
    let approvedClaim = claims3.toArray().find(func c = c.personId == "lorenzoSmithJr" and c.status == #Approved);

    // SURVIVING-STATE OWNERSHIP RECOVERY (tertiary fallback). The data-loss
    // migration 20260905_000000.mo (FROZEN, already applied in production)
    // replaces the ENTIRE profiles map with seed data and resets claims to
    // empty, so in the exact regression scenario neither an approved claim nor
    // a duplicate runtime-created profile survives. It does NOT touch
    // accessControlState, galleries, archiveItems, or stewards, so the only
    // surviving evidence of the durable account-to-person link is:
    //   1. A surviving Family Steward record (stewards survives unchanged).
    //   2. A surviving #admin role in accessControlState.userRoles.
    //   3. The uploader of photos in the canonical lorenzoSmithJr gallery.
    //   4. The contributor of archive items related to lorenzoSmithJr.
    // We gather every candidate and only restore ownership when the surviving
    // evidence unambiguously identifies a single principal — never a fabricated
    // one. If the evidence is genuinely ambiguous or absent, ownership is left
    // unrecovered (ownerToRestore stays null) and NO principal is invented.
    let candidates = List.empty<Principal>();
    for (s in stewards.toArray().values()) {
      if (s.roleStatus == #Active) {
        candidates.add(s.stewardAccountId);
      };
    };
    for ((p, role) in accessControlState.userRoles.entries()) {
      if (role == #admin) {
        candidates.add(p);
      };
    };
    switch (galleries.get("lorenzoSmithJr")) {
      case (?g) {
        for (photo in g.photos.toArray().values()) {
          candidates.add(photo.uploadedBy);
        };
      };
      case null {};
    };
    for (a in archiveItems.toArray().values()) {
      if (a.relatedMemberIds.any(func id = id == "lorenzoSmithJr")) {
        candidates.add(a.contributor);
      };
    };
    let distinct = List.empty<Principal>();
    for (c in candidates.toArray().values()) {
      if (not distinct.toArray().any(func x = x == c)) {
        distinct.add(c);
      };
    };
    let distinctArr = distinct.toArray();

    // A candidate is a "media owner" if they uploaded a photo to the canonical
    // gallery or contributed an archive item related to the canonical person.
    func isMediaOwner(p : Principal) : Bool {
      let uploaded = switch (galleries.get("lorenzoSmithJr")) {
        case (?g) g.photos.toArray().any(func ph = ph.uploadedBy == p);
        case null false;
      };
      let contributed = archiveItems.toArray().any(func a = a.relatedMemberIds.any(func id = id == "lorenzoSmithJr") and a.contributor == p);
      uploaded or contributed;
    };

    // A candidate is "privileged" if they are an active steward or an admin.
    func isPrivileged(p : Principal) : Bool {
      stewards.toArray().any(func s = s.stewardAccountId == p and s.roleStatus == #Active)
      or accessControlState.userRoles.get(p) == ?#admin;
    };

    var survivingOwner : ?Principal = null;
    if (distinctArr.size() == 1) {
      survivingOwner := ?distinctArr[0];
    } else if (distinctArr.size() > 1) {
      let mediaOwners = distinctArr.filter(isMediaOwner);
      if (mediaOwners.size() == 1) {
        survivingOwner := ?mediaOwners[0];
      } else {
        let privileged = distinctArr.filter(isPrivileged);
        if (privileged.size() == 1) {
          survivingOwner := ?privileged[0];
        };
      };
    };

    let ownerToRestore : ?Principal = switch (approvedClaim) {
      case (?c) ?c.requestingUserId;
      case null {
        switch (recoveredOwner) {
          case (?o) ?o;
          case null survivingOwner;
        };
      };
    };

    // When an approved claim exists, drop any duplicate pending claim on the
    // canonical by the same user (a manual-test artifact) so no duplicate
    // pending claim remains. The approved claim is the authoritative ownership
    // record.
    let finalClaims = switch (approvedClaim) {
      case (?ac) {
        let snapshot = claims3.toArray();
        let deduped = List.empty<ProfileClaim>();
        for (c in snapshot.values()) {
          if (c.personId == "lorenzoSmithJr" and c.status == #Pending and c.requestingUserId == ac.requestingUserId) {
            // dropped: duplicate pending claim created during manual testing
          } else {
            deduped.add(c);
          };
        };
        deduped;
      };
      case null claims3;
    };

    // CLAIM RESTORATION: restore ownership from the recovered owner, never from
    // a hardcoded principal. Set claimStatus = #Claimed and claimedByUserId =
    // ?owner (the stable account-to-person link). Seed-safety guard: never
    // overwrite a claim held by a DIFFERENT owner; only restore when the profile
    // is unclaimed or already claimed by that same user (idempotent), including
    // when claimedByUserId was cleared to null by the regression. HARD
    // CONSTRAINT: if no owner is recoverable, do NOT fabricate a principal or
    // auto-approve a pending claim.
    switch (ownerToRestore) {
      case (?owner) {
        switch (profiles.get("lorenzoSmithJr")) {
          case (?p) {
            if (p.claimedByUserId == null or p.claimedByUserId == ?owner) {
              profiles.add("lorenzoSmithJr", { p with claimStatus = #Claimed; claimedByUserId = ?owner });
            };
          };
          case null {};
        };
      };
      case null {};
    };

    // FAMILY STEWARD RESTORATION: when the owner is recovered, restore the
    // durable Family Steward permission from surviving evidence WITHOUT a new
    // claim/approval cycle. The `stewards` list survives the data-loss
    // migration unchanged, so if the owner was a steward their record is
    // already present — ensure it is #Active. If the owner held the #admin role
    // (recoverable evidence they were a steward) but no steward record
    // survives, add an #Active steward record so the permission is not lost.
    // Never fabricate a steward for an unrecovered owner.
    switch (ownerToRestore) {
      case (?owner) {
        let existing = stewards.toArray().find(func s = s.stewardAccountId == owner);
        switch (existing) {
          case (?rec) {
            if (rec.roleStatus != #Active) {
              let snapshot = stewards.toArray();
              stewards.clear();
              for (s in snapshot.values()) {
                if (s.stewardAccountId == owner) {
                  stewards.add({ s with roleStatus = #Active });
                } else {
                  stewards.add(s);
                };
              };
            };
          };
          case null {
            if (accessControlState.userRoles.get(owner) == ?#admin) {
              stewards.add({
                stewardAccountId = owner;
                roleStatus = #Active;
                successorPriority = null;
                assignedBy = owner;
                assignedAt = 0;
              });
            };
          };
        };
      };
      case null {};
    };

    {
      accessControlState;
      galleries;
      archiveItems = archiveItems2;
      profiles;
      claims = finalClaims;
      relationshipRequests = relationshipRequests2;
      stewards;
    };
  };
};

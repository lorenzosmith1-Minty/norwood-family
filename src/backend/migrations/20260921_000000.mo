import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Family tenancy foundation (Tenancy 1A)
  //
  // Adds a stable `families` collection and a `familyId` field to the six core
  // family-owned record types. Every pre-existing record migrates to
  // familyId = "norwood". Existing ids, claims, owners, relationships, Steward
  // state, Archive records, and blob/media references are preserved as-is.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type FamilyStatus = {
    #active;
    #archived;
  };

  type Family = {
    id : FamilyId;
    displayName : Text;
    createdAt : Int;
    createdBy : Principal;
    status : FamilyStatus;
  };

  // --- ownership types (old: no familyId) ---

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

  type OldPersonProfile = {
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

  type NewPersonProfile = {
    familyId : FamilyId;
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

  type OldProfileClaim = {
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    status : ProfileClaimStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type NewProfileClaim = {
    familyId : FamilyId;
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    status : ProfileClaimStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type OldRelationship = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : RelationshipType;
    status : RelationshipStatus;
  };

  type NewRelationship = {
    familyId : FamilyId;
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : RelationshipType;
    status : RelationshipStatus;
  };

  type OldRelationshipRequest = {
    id : Nat;
    requestingPersonId : Text;
    relatedPersonId : Text;
    proposedRelationship : RelationshipType;
    status : RelationshipRequestStatus;
    submittedDate : Int;
    reviewer : ?Principal;
    reviewedDate : ?Int;
  };

  type NewRelationshipRequest = {
    familyId : FamilyId;
    id : Nat;
    requestingPersonId : Text;
    relatedPersonId : Text;
    proposedRelationship : RelationshipType;
    status : RelationshipRequestStatus;
    submittedDate : Int;
    reviewer : ?Principal;
    reviewedDate : ?Int;
  };

  // --- governance types (old: no familyId) ---

  type StewardRoleStatus = {
    #Active;
    #Removed;
  };

  type OldStewardRecord = {
    stewardAccountId : Principal;
    roleStatus : StewardRoleStatus;
    successorPriority : ?Nat;
    assignedBy : Principal;
    assignedAt : Int;
  };

  type NewStewardRecord = {
    familyId : FamilyId;
    stewardAccountId : Principal;
    roleStatus : StewardRoleStatus;
    successorPriority : ?Nat;
    assignedBy : Principal;
    assignedAt : Int;
  };

  // --- archive types (old: no familyId) ---

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
    mimeType : ?Text;
    filename : ?Text;
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

  type NewArchiveItem = {
    familyId : FamilyId;
    id : Nat;
    title : Text;
    description : Text;
    itemType : ArchiveItemType;
    blob : Blob;
    mimeType : ?Text;
    filename : ?Text;
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

  // Subset form: only the collections whose element types changed are listed,
  // plus the new `families` collection. All other pre-existing stable
  // collections carry through unchanged.
  type OldActor = {
    profiles : Map.Map<Text, OldPersonProfile>;
    claims : List.List<OldProfileClaim>;
    confirmedRelationships : List.List<OldRelationship>;
    relationshipRequests : List.List<OldRelationshipRequest>;
    stewards : List.List<OldStewardRecord>;
    archiveItems : List.List<OldArchiveItem>;
  };

  type NewActor = {
    families : Map.Map<FamilyId, Family>;
    profiles : Map.Map<Text, NewPersonProfile>;
    claims : List.List<NewProfileClaim>;
    confirmedRelationships : List.List<NewRelationship>;
    relationshipRequests : List.List<NewRelationshipRequest>;
    stewards : List.List<NewStewardRecord>;
    archiveItems : List.List<NewArchiveItem>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    // Seed the default family only when it is missing. The migration runs once
    // per upgrade, so this is idempotent by construction.
    let families = Map.empty<FamilyId, Family>();
    families.add(defaultFamilyId, {
      id = defaultFamilyId;
      displayName = "Norwood";
      createdAt = 0;
      createdBy = Principal.fromText("aaaaa-aa");
      status = #active;
    });

    let profiles = Map.empty<Text, NewPersonProfile>();
    for ((personId, p) in old.profiles.entries()) {
      profiles.add(personId, {
        familyId = defaultFamilyId;
        personId = p.personId;
        name = p.name;
        livingStatus = p.livingStatus;
        claimStatus = p.claimStatus;
        claimedByUserId = p.claimedByUserId;
        preferredName = p.preferredName;
        firstName = p.firstName;
        middleName = p.middleName;
        lastName = p.lastName;
        suffix = p.suffix;
        nickname = p.nickname;
        story = p.story;
        shortBio = p.shortBio;
        longerStory = p.longerStory;
        occupation = p.occupation;
        birthInfo = p.birthInfo;
        birthDate = p.birthDate;
        birthplace = p.birthplace;
        currentLocation = p.currentLocation;
        timeline = p.timeline;
        privacySettings = p.privacySettings;
      });
    };

    let claims = List.empty<NewProfileClaim>();
    for (c in old.claims.toArray().values()) {
      claims.add({
        familyId = defaultFamilyId;
        id = c.id;
        personId = c.personId;
        requestingUserId = c.requestingUserId;
        status = c.status;
        submittedDate = c.submittedDate;
        reviewedBy = c.reviewedBy;
        reviewedDate = c.reviewedDate;
      });
    };

    let confirmedRelationships = List.empty<NewRelationship>();
    for (r in old.confirmedRelationships.toArray().values()) {
      confirmedRelationships.add({
        familyId = defaultFamilyId;
        id = r.id;
        fromPersonId = r.fromPersonId;
        toPersonId = r.toPersonId;
        relationshipType = r.relationshipType;
        status = r.status;
      });
    };

    let relationshipRequests = List.empty<NewRelationshipRequest>();
    for (r in old.relationshipRequests.toArray().values()) {
      relationshipRequests.add({
        familyId = defaultFamilyId;
        id = r.id;
        requestingPersonId = r.requestingPersonId;
        relatedPersonId = r.relatedPersonId;
        proposedRelationship = r.proposedRelationship;
        status = r.status;
        submittedDate = r.submittedDate;
        reviewer = r.reviewer;
        reviewedDate = r.reviewedDate;
      });
    };

    let stewards = List.empty<NewStewardRecord>();
    for (s in old.stewards.toArray().values()) {
      stewards.add({
        familyId = defaultFamilyId;
        stewardAccountId = s.stewardAccountId;
        roleStatus = s.roleStatus;
        successorPriority = s.successorPriority;
        assignedBy = s.assignedBy;
        assignedAt = s.assignedAt;
      });
    };

    let archiveItems = List.empty<NewArchiveItem>();
    for (it in old.archiveItems.toArray().values()) {
      archiveItems.add({
        familyId = defaultFamilyId;
        id = it.id;
        title = it.title;
        description = it.description;
        itemType = it.itemType;
        blob = it.blob;
        mimeType = it.mimeType;
        filename = it.filename;
        era = it.era;
        year = it.year;
        tags = it.tags;
        contributor = it.contributor;
        relatedMemberIds = it.relatedMemberIds;
        relatedBranchId = it.relatedBranchId;
        sourceStatus = it.sourceStatus;
        privacyLevel = it.privacyLevel;
        status = it.status;
        createdAt = it.createdAt;
        classification = it.classification;
        primarySpeaker = it.primarySpeaker;
        transcript = it.transcript;
        searchableTranscript = it.searchableTranscript;
        chapterMarkers = it.chapterMarkers;
        aiSummary = it.aiSummary;
        extractedNames = it.extractedNames;
      });
    };

    {
      families;
      profiles;
      claims;
      confirmedRelationships;
      relationshipRequests;
      stewards;
      archiveItems;
    };
  };
};

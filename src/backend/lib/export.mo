import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import ExportTypes "../types/export";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import ArchiveTypes "../types/archive";
import ObjectStorageTypes "../types/object-storage";
import FamilyHistoryTypes "../types/family-history";
import RecipeTypes "../types/recipes";
import RecoveryTypes "../types/recovery";
import ResearchTypes "../types/research-intake";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";
import StewardAuthorityLib "steward-authority";

/// Phase 5A — Data Export / Portability Foundation (logic layer).
///
/// This module is PURE and READ-ONLY. Every function takes the relevant stable
/// collections as parameters (the same style as `lib/tenancy.mo`,
/// `lib/steward-authority.mo`, and `lib/recovery.mo`) and returns a portable
/// projection or a `Result.Result<ExportEnvelope, ExportError>`. It never
/// mutates a collection, never writes an audit entry (the API layer records
/// audit), and never reseeds.
///
/// Design rules enforced here:
///
/// - Every export is family-scoped. A Family A export never includes Family B
///   records, and a caller-supplied person id or other known id never bypasses
///   authorization.
/// - Every record projection carries its `ExportPrivacyClass` and is filtered
///   through `ExportTypes.isExportable`; platform-internal/security data is
///   never emitted.
/// - Relationships between exported records are preserved through stable
///   portable record references (`ExportRecordRef`), never through raw account
///   principals or internal secret ids.
/// - Portable references are assigned from an EXPORT-LOCAL namespace. Each
///   export builds its own reference tables (`RefTables`) that map an internal
///   record id to a sequential, export-local token (`person-1`, `person-2`,
///   `membership-1`, …). The internal id is used only to look up the token
///   inside the export-generation process; it is never serialized or encoded
///   into the portable reference, so the original internal id cannot be
///   recovered from the output. Numbering restarts for every export and is not
///   stable across exports.
/// - Media is metadata/reference only in Phase 5A. No bytes are carried, and
///   the media manifest is kept separate so binary packaging can be added later
///   without breaking the format.
module {
  /// The bounded lifecycle of a generated FamilyArchive export instance, in
  /// nanoseconds (7 days). After this window the instance is expired and its
  /// media bindings are no longer resolvable; retrieval returns a neutral
  /// `#ExportInstanceExpired` rather than rebuilding against current media.
  public let EXPORT_INSTANCE_TTL_NANOS : Int = 604_800_000_000_000;

  // ---------------------------------------------------------------------------
  // Export-local reference tables
  // ---------------------------------------------------------------------------

  /// The export-local reference tables for a single export. Each table maps an
  /// internal record id (as text) to the export-local token assigned to that
  /// record within this export. The internal id is only ever a lookup key here;
  /// it is never emitted into a portable reference.
  public type RefTables = {
    persons : Map.Map<Text, Text>;
    memberships : Map.Map<Text, Text>;
    relationships : Map.Map<Text, Text>;
    archiveItems : Map.Map<Text, Text>;
    stories : Map.Map<Text, Text>;
    sources : Map.Map<Text, Text>;
    recipes : Map.Map<Text, Text>;
    media : Map.Map<Text, Text>;
    recoveryStatuses : Map.Map<Text, Text>;
  };

  /// An empty set of export-local reference tables.
  public func emptyRefTables() : RefTables {
    {
      persons = Map.empty();
      memberships = Map.empty();
      relationships = Map.empty();
      archiveItems = Map.empty();
      stories = Map.empty();
      sources = Map.empty();
      recipes = Map.empty();
      media = Map.empty();
      recoveryStatuses = Map.empty();
    };
  };

  /// Assigns the next sequential export-local token for `table` to `rawId` and
  /// returns it. If `rawId` already has a token, the existing token is returned
  /// unchanged, so every reference to the same internal record within one export
  /// resolves to the same portable id. The token is `prefix # "-" # n`, where
  /// `n` is one greater than the number of records already assigned in this
  /// table (starting at 1). The raw id is used only as a lookup key and is never
  /// part of the returned token.
  func assignRef(table : Map.Map<Text, Text>, prefix : Text, rawId : Text) : Text {
    switch (table.get(rawId)) {
      case (?existing) { existing };
      case null {
        let token = prefix # "-" # (table.size() + 1).toText();
        table.add(rawId, token);
        token;
      };
    };
  };

  /// The export-local reference for a person. The portable id is assigned from
  /// the export-local person table, so the same person always maps to the same
  /// export-local id within an export while no raw internal id (person id or
  /// family id) is ever emitted.
  public func personRef(tables : RefTables, familyId : FamilyTypes.FamilyId, personId : OwnershipTypes.PersonId) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.persons, "person", personId);
    { kind = #Person; portableId = token };
  };

  /// The export-local reference for a membership record.
  public func membershipRef(tables : RefTables, familyId : FamilyTypes.FamilyId, membershipId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.memberships, "membership", membershipId.toText());
    { kind = #Membership; portableId = token };
  };

  /// The export-local reference for a relationship record.
  public func relationshipRef(tables : RefTables, familyId : FamilyTypes.FamilyId, relationshipId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.relationships, "relationship", relationshipId.toText());
    { kind = #Relationship; portableId = token };
  };

  /// The export-local reference for an archive item.
  public func archiveItemRef(tables : RefTables, familyId : FamilyTypes.FamilyId, archiveItemId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.archiveItems, "archive", archiveItemId.toText());
    { kind = #ArchiveItem; portableId = token };
  };

  /// The export-local reference for a story.
  public func storyRef(tables : RefTables, familyId : FamilyTypes.FamilyId, storyId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.stories, "story", storyId.toText());
    { kind = #Story; portableId = token };
  };

  /// The export-local reference for a research source.
  public func sourceRef(tables : RefTables, familyId : FamilyTypes.FamilyId, sourceId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.sources, "source", sourceId.toText());
    { kind = #Source; portableId = token };
  };

  /// The export-local reference for a recipe.
  public func recipeRef(tables : RefTables, familyId : FamilyTypes.FamilyId, recipeId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.recipes, "recipe", recipeId.toText());
    { kind = #Recipe; portableId = token };
  };

  /// The export-local reference for a media record. Media is referenced, never
  /// embedded.
  public func mediaRef(tables : RefTables, familyId : FamilyTypes.FamilyId, archiveItemId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.media, "media", archiveItemId.toText());
    { kind = #Media; portableId = token };
  };

  /// The export-local reference for a media record keyed by an arbitrary
  /// internal media key (an archive item id, or a profile-photo key). The key is
  /// used only as a Map lookup key inside `assignRef`; it is never emitted into
  /// the portable reference.
  public func mediaRefForKey(tables : RefTables, familyId : FamilyTypes.FamilyId, rawKey : Text) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.media, "media", rawKey);
    { kind = #Media; portableId = token };
  };

  /// The export-local reference for the requester's own recovery status record.
  public func recoveryStatusRef(tables : RefTables, familyId : FamilyTypes.FamilyId, recoveryId : Nat) : ExportTypes.ExportRecordRef {
    ignore familyId;
    let token = assignRef(tables.recoveryStatuses, "recovery", recoveryId.toText());
    { kind = #RecoveryStatus; portableId = token };
  };

  // ---------------------------------------------------------------------------
  // Enum-to-text projections (portable, family-facing)
  // ---------------------------------------------------------------------------

  func livingStatusText(status : OwnershipTypes.LivingStatus) : Text {
    switch (status) {
      case (#Living) { "Living" };
      case (#Deceased) { "Deceased" };
    };
  };

  func membershipStatusText(status : MembershipTypes.MembershipStatus) : Text {
    switch (status) {
      case (#Pending) { "Pending" };
      case (#Active) { "Active" };
      case (#Suspended) { "Suspended" };
      case (#Left) { "Left" };
    };
  };

  func relationshipTypeText(relationshipType : OwnershipTypes.RelationshipType) : Text {
    switch (relationshipType) {
      case (#Parent) { "Parent" };
      case (#Child) { "Child" };
      case (#SpousePartner) { "SpousePartner" };
      case (#Sibling) { "Sibling" };
    };
  };

  func relationshipStatusText(status : OwnershipTypes.RelationshipStatus) : Text {
    switch (status) {
      case (#Confirmed) { "Confirmed" };
      case (#Pending) { "Pending" };
      case (#Disputed) { "Disputed" };
    };
  };

  func archiveItemTypeText(itemType : ArchiveTypes.ArchiveItemType) : Text {
    switch (itemType) {
      case (#Photo) { "Photo" };
      case (#Document) { "Document" };
      case (#Audio) { "Audio" };
      case (#Video) { "Video" };
      case (#WrittenStoryNote) { "WrittenStoryNote" };
      case (#Research) { "Research" };
      case (#WorkBusiness) { "WorkBusiness" };
      case (#Other) { "Other" };
    };
  };

  func sourceStatusText(status : ArchiveTypes.SourceStatus) : Text {
    switch (status) {
      case (#Original) { "Original" };
      case (#Copy) { "Copy" };
      case (#Transcribed) { "Transcribed" };
      case (#Unverified) { "Unverified" };
    };
  };

  func privacyLevelText(privacyLevel : ArchiveTypes.PrivacyLevel) : Text {
    switch (privacyLevel) {
      case (#Public) { "Public" };
      case (#FamilyOnly) { "FamilyOnly" };
      case (#Private) { "Private" };
    };
  };

  func archiveItemStatusText(status : ArchiveTypes.ArchiveItemStatus) : Text {
    switch (status) {
      case (#Pending) { "Pending" };
      case (#Approved) { "Approved" };
      case (#Rejected) { "Rejected" };
    };
  };

  func classificationText(classification : ArchiveTypes.ArchiveItemClassification) : Text {
    switch (classification) {
      case (#Standard) { "Standard" };
      case (#OralHistory) { "OralHistory" };
    };
  };

  func evidenceStatusText(status : FamilyHistoryTypes.EvidenceStatus) : Text {
    switch (status) {
      case (#Documented) { "Documented" };
      case (#FamilyHistory) { "FamilyHistory" };
      case (#PersonalMemory) { "PersonalMemory" };
      case (#Unresolved) { "Unresolved" };
    };
  };

  func storyStatusText(status : FamilyHistoryTypes.StoryStatus) : Text {
    switch (status) {
      case (#Pending) { "Pending" };
      case (#Approved) { "Approved" };
      case (#Rejected) { "Rejected" };
    };
  };

  func recipeStatusText(status : RecipeTypes.RecipeStatus) : Text {
    switch (status) {
      case (#Pending) { "Pending" };
      case (#Approved) { "Approved" };
      case (#Rejected) { "Rejected" };
      case (#Archived) { "Archived" };
    };
  };

  func sourceTypeText(sourceType : ResearchTypes.SourceType) : Text {
    switch (sourceType) {
      case (#CensusCitation) { "CensusCitation" };
      case (#DeedPropertyReference) { "DeedPropertyReference" };
      case (#EmailThread) { "EmailThread" };
      case (#ResearchNotes) { "ResearchNotes" };
      case (#CertificateHeadstoneReference) { "CertificateHeadstoneReference" };
      case (#UploadedDocumentImage) { "UploadedDocumentImage" };
    };
  };

  func recoveryStatusText(status : RecoveryTypes.RecoveryStatus) : Text {
    switch (status) {
      case (#Pending) { "Pending" };
      case (#AwaitingVerification) { "AwaitingVerification" };
      case (#ReadyForApproval) { "ReadyForApproval" };
      case (#Approved) { "Approved" };
      case (#Rejected) { "Rejected" };
      case (#Cancelled) { "Cancelled" };
      case (#Expired) { "Expired" };
    };
  };

  // ---------------------------------------------------------------------------
  // Record projections
  // ---------------------------------------------------------------------------

  /// Projects a Person/Profile into its portable export record. The account
  /// principal (`claimedByUserId`) and the free-text `privacySettings` are
  /// deliberately omitted: ownership identity and internal privacy settings are
  /// not portable family data.
  public func projectPerson(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    profile : OwnershipTypes.PersonProfile,
  ) : ExportTypes.ExportPersonRecord {
    {
      ref = personRef(tables, familyId, profile.personId);
      name = profile.name;
      livingStatus = livingStatusText(profile.livingStatus);
      preferredName = profile.preferredName;
      firstName = profile.firstName;
      middleName = profile.middleName;
      lastName = profile.lastName;
      suffix = profile.suffix;
      nickname = profile.nickname;
      story = profile.story;
      shortBio = profile.shortBio;
      longerStory = profile.longerStory;
      occupation = profile.occupation;
      birthInfo = profile.birthInfo;
      birthDate = profile.birthDate;
      birthplace = profile.birthplace;
      currentLocation = profile.currentLocation;
      timeline = profile.timeline ?? [];
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects a family membership into its portable export record. The account
  /// principal is deliberately omitted; the membership is expressed through the
  /// portable person reference only.
  public func projectMembership(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    membership : MembershipTypes.FamilyMembership,
  ) : ExportTypes.ExportMembershipRecord {
    {
      ref = membershipRef(tables, familyId, membership.id);
      personRef = personRef(tables, familyId, membership.personId);
      status = membershipStatusText(membership.status);
      joinedAt = membership.joinedAt;
      createdAt = membership.createdAt;
      updatedAt = membership.updatedAt;
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects a confirmed relationship into its portable export record. Both
  /// endpoints are portable person references, so the relationship stays
  /// representable without exposing internal relationship ids.
  public func projectRelationship(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    relationship : OwnershipTypes.Relationship,
  ) : ExportTypes.ExportRelationshipRecord {
    {
      ref = relationshipRef(tables, familyId, relationship.id);
      fromPersonRef = personRef(tables, familyId, relationship.fromPersonId);
      toPersonRef = personRef(tables, familyId, relationship.toPersonId);
      relationshipType = relationshipTypeText(relationship.relationshipType);
      status = relationshipStatusText(relationship.status);
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects an archive/history item into its portable export record. The
  /// contributor principal and the raw blob are deliberately omitted; media is
  /// referenced by `mediaRef` (metadata only), never embedded as bytes.
  public func projectArchiveItem(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    item : ArchiveTypes.ArchiveItem,
  ) : ExportTypes.ExportArchiveItemRecord {
    {
      ref = archiveItemRef(tables, familyId, item.id);
      title = item.title;
      description = item.description;
      itemType = archiveItemTypeText(item.itemType);
      era = item.era;
      year = item.year;
      tags = item.tags;
      relatedPersonRefs = item.relatedMemberIds.map(func personId = personRef(tables, familyId, personId));
      sourceStatus = sourceStatusText(item.sourceStatus);
      privacyLevel = privacyLevelText(item.privacyLevel);
      status = archiveItemStatusText(item.status);
      classification = classificationText(item.classification);
      primarySpeakerName = switch (item.primarySpeaker) {
        case (?speaker) { ?speaker.name };
        case null { null };
      };
      createdAt = item.createdAt;
      mediaRef = ?mediaRef(tables, familyId, item.id);
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects a family story into its portable export record. The contributor
  /// principal is deliberately omitted.
  public func projectStory(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    story : FamilyHistoryTypes.Story,
  ) : ExportTypes.ExportStoryRecord {
    {
      ref = storyRef(tables, familyId, story.id);
      title = story.title;
      storyText = story.storyText;
      relatedPersonRefs = story.relatedMemberIds.map(func personId = personRef(tables, familyId, personId));
      era = story.era;
      year = story.year;
      location = story.location;
      evidenceStatus = evidenceStatusText(story.evidenceStatus);
      relatedArchiveItemRefs = story.relatedArchiveItemIds.map(func archiveItemId = archiveItemRef(tables, familyId, archiveItemId));
      status = storyStatusText(story.status);
      createdAt = story.createdAt;
      updatedAt = story.updatedAt;
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects a research source into its portable export record. The
  /// contributor principal and the internal review status are deliberately
  /// omitted; only the portable provenance is carried.
  public func projectSource(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    source : ResearchTypes.SourceRecord,
  ) : ExportTypes.ExportSourceRecord {
    {
      ref = sourceRef(tables, familyId, source.id);
      title = source.title;
      sourceType = sourceTypeText(source.sourceType);
      citation = ?source.description;
      url = null;
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects a family recipe / oral-history metadata record into its portable
  /// export record. The contributor principal is deliberately omitted; linked
  /// media is referenced by metadata only.
  public func projectRecipe(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    recipe : RecipeTypes.Recipe,
  ) : ExportTypes.ExportRecipeRecord {
    {
      ref = recipeRef(tables, familyId, recipe.recipeId);
      title = recipe.title;
      shortDescription = recipe.shortDescription;
      originatingPersonRef = if (recipe.originatingPersonId == "") {
        null;
      } else {
        ?personRef(tables, familyId, recipe.originatingPersonId);
      };
      relatedPersonRefs = recipe.relatedPersonIds.map(func personId = personRef(tables, familyId, personId));
      era = recipe.era;
      year = recipe.year;
      location = recipe.location;
      familyBranch = recipe.familyBranch;
      ingredients = recipe.ingredients;
      instructions = recipe.instructions;
      familyStory = recipe.familyStory;
      tags = recipe.tags;
      privacyLevel = privacyLevelText(recipe.privacyLevel);
      evidenceStatus = evidenceStatusText(recipe.evidenceStatus);
      linkedMediaRefs = recipe.linkedMediaIds.map(func archiveItemId = mediaRef(tables, familyId, archiveItemId));
      status = recipeStatusText(recipe.status);
      createdAt = recipe.createdAt;
      updatedAt = recipe.updatedAt;
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects the requester's own recovery request into a portable recovery
  /// status record. Deliberately omits account principals, recovery internal
  /// ids, verifier identities, and private reasons; only the requester's own
  /// family-facing status is carried.
  public func projectRecoveryStatus(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    request : RecoveryTypes.RecoveryRequest,
    targetName : Text,
  ) : ExportTypes.ExportRecoveryStatusRecord {
    {
      ref = recoveryStatusRef(tables, familyId, request.id);
      targetName;
      status = recoveryStatusText(request.status);
      createdAt = request.createdAt;
      updatedAt = request.updatedAt;
      privacyClass = #RequesterOwnedPrivate;
    };
  };

  /// Projects an archive item's media metadata into a portable media reference.
  /// No bytes are carried; `reference` is the media ref's own export-local
  /// portable id. The archive item's own export-local reference is carried as
  /// `relatedArchiveRef`, and every related family member is carried as an
  /// export-local person reference, so the manifest entry resolves through the
  /// same export-local namespace as the rest of the export.
  ///
  /// `availability` is `#Available` when the item carries a stored blob and
  /// `#Unavailable` otherwise; a missing asset is represented neutrally and
  /// never fails the export. `byteSize` is the blob's size when known.
  public func projectMediaRef(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    item : ArchiveTypes.ArchiveItem,
  ) : ExportTypes.ExportMediaRef {
    let ref = mediaRef(tables, familyId, item.id);
    let relatedPersonRef = switch (item.relatedMemberIds.find(func _ = true)) {
      case (?personId) { ?personRef(tables, familyId, personId) };
      case null { null };
    };
    {
      ref;
      mediaKind = #ArchiveItem;
      title = item.title;
      mimeType = item.mimeType;
      filename = item.filename;
      byteSize = ?item.blob.size();
      relatedPersonRef;
      relatedArchiveRef = ?archiveItemRef(tables, familyId, item.id);
      uploadedAt = ?item.createdAt;
      availability = if (item.blob.size() > 0) { #Available } else { #Unavailable };
      reference = ref.portableId;
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// Projects a person's profile photo into a portable media reference. No bytes
  /// are carried; `reference` is the media ref's own export-local portable id.
  /// The owning person is carried as an export-local person reference, so the
  /// manifest entry resolves through the same export-local namespace as the
  /// person's own exported record.
  ///
  /// `availability` is `#Available` when the photo carries a stored blob and
  /// `#Unavailable` otherwise; a missing asset is represented neutrally and
  /// never fails the export. `byteSize` is the blob's size when known.
  public func projectProfilePhotoRef(
    tables : RefTables,
    familyId : FamilyTypes.FamilyId,
    personId : OwnershipTypes.PersonId,
    photo : ObjectStorageTypes.Photo,
  ) : ExportTypes.ExportMediaRef {
    let ref = mediaRefForKey(tables, familyId, profilePhotoMediaKey(personId, photo.id));
    {
      ref;
      mediaKind = #ProfilePhoto;
      title = photo.filename;
      mimeType = ?photo.mimeType;
      filename = ?photo.filename;
      byteSize = ?photo.blob.size();
      relatedPersonRef = ?personRef(tables, familyId, personId);
      relatedArchiveRef = null;
      uploadedAt = ?photo.uploadedAt;
      availability = if (photo.blob.size() > 0) { #Available } else { #Unavailable };
      reference = ref.portableId;
      privacyClass = #PortableFamilyHistory;
    };
  };

  /// The internal lookup key for a profile photo within the export-local media
  /// table. It is used only as a Map key inside `assignRef`; it is never emitted
  /// into a portable reference.
  func profilePhotoMediaKey(personId : OwnershipTypes.PersonId, photoId : ObjectStorageTypes.PhotoId) : Text {
    personId # ":" # photoId.toText();
  };

  /// Builds the portable resource-safety summary of a media manifest: the asset
  /// count, the aggregate known byte size, and the number of unavailable assets.
  /// It carries no per-asset detail and no internal identifier.
  public func mediaManifestSummary(manifest : [ExportTypes.ExportMediaRef]) : ExportTypes.ExportMediaManifestSummary {
    var knownTotalBytes = 0;
    var unavailableCount = 0;
    for (entry in manifest.values()) {
      switch (entry.byteSize) {
        case (?size) { knownTotalBytes += size };
        case null {};
      };
      switch (entry.availability) {
        case (#Unavailable) { unavailableCount += 1 };
        case (#Available) {};
      };
    };
    {
      assetCount = manifest.size();
      knownTotalBytes;
      unavailableCount;
    };
  };

  // ---------------------------------------------------------------------------
  // Family-scoped collection reads
  // ---------------------------------------------------------------------------

  /// Every profile of `familyId` only. A profile carrying another family id is
  /// never included.
  public func profilesForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
  ) : [OwnershipTypes.PersonProfile] {
    profiles.values().toArray().filter(func p = p.familyId == familyId);
  };

  /// Every membership of `familyId` only.
  public func membershipsForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : FamilyTypes.FamilyId,
  ) : [MembershipTypes.FamilyMembership] {
    memberships.toArray().filter(func m = m.familyId == familyId);
  };

  /// Every confirmed relationship of `familyId` only.
  public func relationshipsForFamily(
    relationships : List.List<OwnershipTypes.Relationship>,
    familyId : FamilyTypes.FamilyId,
  ) : [OwnershipTypes.Relationship] {
    relationships.toArray().filter(func r = r.familyId == familyId);
  };

  /// Every archive item of `familyId` only.
  public func archiveItemsForFamily(
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    familyId : FamilyTypes.FamilyId,
  ) : [ArchiveTypes.ArchiveItem] {
    archiveItems.toArray().filter(func a = a.familyId == familyId);
  };

  /// Every profile photo of every person in `familyId` only, paired with the
  /// owning person id. A gallery carrying another family id is never included.
  /// The gallery storage key is family-qualified (or the legacy bare person id
  /// for the default family), so a person id in one family never resolves to a
  /// gallery in another.
  public func profilePhotosForFamily(
    galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
  ) : [(ObjectStorageTypes.PersonId, ObjectStorageTypes.Photo)] {
    let photos = List.empty<(ObjectStorageTypes.PersonId, ObjectStorageTypes.Photo)>();
    for ((storageKey, gallery) in galleries.entries()) {
      let (galleryFamilyId, personId) = splitGalleryKey(storageKey);
      if (galleryFamilyId == familyId) {
        for (photo in gallery.photos.values()) {
          photos.add((personId, photo));
        };
      };
    };
    photos.toArray();
  };

  /// Splits a gallery storage key into its `(familyId, personId)` parts. The
  /// default family's legacy bare key carries no family prefix, so it resolves
  /// to `DEFAULT_FAMILY_ID`.
  func splitGalleryKey(key : Text) : (FamilyTypes.FamilyId, ObjectStorageTypes.PersonId) {
    let parts = key.split(#text "::").toArray();
    if (parts.size() == 2) {
      (parts[0], parts[1]);
    } else {
      (FamilyTypes.DEFAULT_FAMILY_ID, key);
    };
  };

  /// Every story of `familyId` only.
  public func storiesForFamily(
    stories : List.List<FamilyHistoryTypes.Story>,
    familyId : FamilyTypes.FamilyId,
  ) : [FamilyHistoryTypes.Story] {
    stories.toArray().filter(func s = s.familyId == familyId);
  };

  /// Every research source of `familyId` only.
  public func sourcesForFamily(
    sources : List.List<ResearchTypes.SourceRecord>,
    familyId : FamilyTypes.FamilyId,
  ) : [ResearchTypes.SourceRecord] {
    sources.toArray().filter(func s = s.familyId == familyId);
  };

  /// Every recipe of `familyId` only.
  public func recipesForFamily(
    recipes : List.List<RecipeTypes.Recipe>,
    familyId : FamilyTypes.FamilyId,
  ) : [RecipeTypes.Recipe] {
    recipes.toArray().filter(func r = r.familyId == familyId);
  };

  /// Every recovery request of `familyId` only.
  public func recoveryRequestsForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    familyId : FamilyTypes.FamilyId,
  ) : [RecoveryTypes.RecoveryRequest] {
    requests.toArray().filter(func r = r.familyId == familyId);
  };

  // ---------------------------------------------------------------------------
  // Caller identity resolution
  // ---------------------------------------------------------------------------

  /// Resolves the caller's own Person/Profile in `familyId`. A caller owns a
  /// profile when the profile's `claimedByUserId` equals the caller, or when an
  /// `#Approved` profile claim of `familyId` for the caller points at it. A
  /// profile in another family never resolves here, so a known person id alone
  /// never grants access.
  public func resolveCallerProfile(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal,
  ) : ?OwnershipTypes.PersonProfile {
    // Prefer the profile the caller directly owns in this family.
    let owned = profilesForFamily(profiles, familyId).find(func p = p.claimedByUserId == ?caller);
    switch (owned) {
      case (?profile) { return ?profile };
      case null {};
    };
    // Fall back to an approved claim of this family that the caller submitted.
    let claim = claims.toArray().find(func c =
      c.familyId == familyId and c.requestingUserId == caller and c.status == #Approved
    );
    switch (claim) {
      case (?c) { TenancyLib.getProfileForFamily(profiles, familyId, c.personId) };
      case null { null };
    };
  };

  // ---------------------------------------------------------------------------
  // MyData export
  // ---------------------------------------------------------------------------

  /// Builds the requester's own MyData export.
  ///
  /// Authorization: only the authenticated requester's own data is included.
  /// The caller's own Person/Profile is resolved in `familyId` via the
  /// family-scoped profile seam; a caller with no profile in this family gets
  /// `#NotAuthorized`. A caller-supplied person id is never accepted, so a known
  /// id cannot bypass authorization.
  ///
  /// Inclusion: the caller's own profile projection, their family memberships,
  /// relationships involving their Person/Profile, archive/history items
  /// authored by or attached to their profile, their own uploaded media
  /// metadata, and their own recovery history/status.
  ///
  /// Exclusion: other users' account principals, others' private recovery
  /// information, Steward-only governance records, secrets/tokens, and
  /// authentication-provider data.
  public func buildMyDataExport(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    confirmedRelationships : List.List<OwnershipTypes.Relationship>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    stories : List.List<FamilyHistoryTypes.Story>,
    recipes : List.List<RecipeTypes.Recipe>,
    recoveryRequests : List.List<RecoveryTypes.RecoveryRequest>,
    recoveryVerifications : List.List<RecoveryTypes.RecoveryVerification>,
    galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
    families : List.List<FamilyTypes.Family>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Result.Result<ExportTypes.ExportEnvelope, ExportTypes.ExportError> {
    ignore recoveryVerifications;
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let family = switch (families.find(func f = f.id == familyId)) {
      case (?f) { f };
      case null { return #err(#FamilyNotFound) };
    };
    let profile = switch (resolveCallerProfile(profiles, claims, familyId, caller)) {
      case (?p) { p };
      case null { return #err(#NotAuthorized) };
    };
    let personId = profile.personId;
    // The caller's own memberships in this family only.
    let myMemberships = membershipsForFamily(memberships, familyId).filter(func m =
      m.personId == personId
    );
    // Relationships involving the caller's own Person/Profile only.
    let myRelationships = relationshipsForFamily(confirmedRelationships, familyId).filter(func r =
      r.fromPersonId == personId or r.toPersonId == personId
    );
    // Archive/history items authored by or attached to the caller's profile.
    let myArchiveItems = archiveItemsForFamily(archiveItems, familyId).filter(func a =
      a.contributor == caller or a.relatedMemberIds.contains(personId)
    );
    // Stories attached to the caller's profile.
    let myStories = storiesForFamily(stories, familyId).filter(func s =
      s.contributor == caller or s.relatedMemberIds.contains(personId)
    );
    // Recipes attached to the caller's profile.
    let myRecipes = recipesForFamily(recipes, familyId).filter(func r =
      r.contributorAccountId == caller or r.originatingPersonId == personId or r.relatedPersonIds.contains(personId)
    );
    // The caller's own recovery requests only (requester or replacement).
    let myRecoveryRequests = recoveryRequestsForFamily(recoveryRequests, familyId).filter(func r =
      r.requestedByAccountId == caller or r.replacementAccountId == caller
    );
    // Export-local reference tables for this export. The caller's own person is
    // assigned first so it is always `person-1` in a MyData export.
    let tables = emptyRefTables();
    ignore personRef(tables, familyId, personId);
    // The caller's own profile photos only. A gallery in another family never
    // resolves here, so a known person id cannot pull in another family's media.
    let myProfilePhotos = profilePhotosForFamily(galleries, familyId).filter(func ((ownerPersonId, _)) =
      ownerPersonId == personId
    );
    let mediaManifest = myArchiveItems.map(func a = projectMediaRef(tables, familyId, a))
      .concat(myProfilePhotos.map(func ((ownerPersonId, photo)) =
        projectProfilePhotoRef(tables, familyId, ownerPersonId, photo)
      ));
    let payload : ExportTypes.ExportPayload = {
      persons = [projectPerson(tables, familyId, profile)];
      memberships = myMemberships.map(func m = projectMembership(tables, familyId, m));
      relationships = myRelationships.map(func r = projectRelationship(tables, familyId, r));
      archiveItems = myArchiveItems.map(func a = projectArchiveItem(tables, familyId, a));
      stories = myStories.map(func s = projectStory(tables, familyId, s));
      sources = [];
      recipes = myRecipes.map(func r = projectRecipe(tables, familyId, r));
      recoveryStatuses = myRecoveryRequests.map(func r =
        projectRecoveryStatus(tables, familyId, r, profile.name)
      );
      mediaManifest;
      mediaManifestSummary = mediaManifestSummary(mediaManifest);
    };
    #ok(buildEnvelope(family, #MyData, payload));
  };

  // ---------------------------------------------------------------------------
  // FamilyArchive export
  // ---------------------------------------------------------------------------

  /// Builds the portable FamilyArchive export for `familyId`.
  ///
  /// Authorization: requires an active Family Steward for `familyId`
  /// (`StewardAuthorityLib.isActiveStewardForFamily`). A non-Steward, an
  /// anonymous caller, or a Steward of another family gets `#NotSteward`.
  ///
  /// Inclusion: family metadata, Person/Profile records, family relationships,
  /// archive/history entries, family stories, sources, photo/media metadata, and
  /// recipes/oral-history metadata present in that family.
  ///
  /// Exclusion: authentication credentials, invite tokens, recovery secrets,
  /// internal authorization secrets, raw account principals, and platform-only
  /// operational data.
  public func buildFamilyArchiveExport(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    confirmedRelationships : List.List<OwnershipTypes.Relationship>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    stories : List.List<FamilyHistoryTypes.Story>,
    sources : List.List<ResearchTypes.SourceRecord>,
    recipes : List.List<RecipeTypes.Recipe>,
    galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
    families : List.List<FamilyTypes.Family>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Result.Result<ExportTypes.ExportEnvelope, ExportTypes.ExportError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let family = switch (families.find(func f = f.id == familyId)) {
      case (?f) { f };
      case null { return #err(#FamilyNotFound) };
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotSteward);
    };
    let familyProfiles = profilesForFamily(profiles, familyId);
    let familyArchiveItems = archiveItemsForFamily(archiveItems, familyId);
    // Export-local reference tables for this export. Persons are assigned first
    // so every person reference in the export resolves to the same person-N.
    let tables = emptyRefTables();
    for (p in familyProfiles.values()) {
      ignore personRef(tables, familyId, p.personId);
    };
    // Every profile photo of every person in this family only. A gallery in
    // another family never resolves here, so Family A media never includes
    // Family B assets.
    let familyProfilePhotos = profilePhotosForFamily(galleries, familyId);
    let mediaManifest = familyArchiveItems.map(func a = projectMediaRef(tables, familyId, a))
      .concat(familyProfilePhotos.map(func ((ownerPersonId, photo)) =
        projectProfilePhotoRef(tables, familyId, ownerPersonId, photo)
      ));
    let payload : ExportTypes.ExportPayload = {
      persons = familyProfiles.map(func p = projectPerson(tables, familyId, p));
      memberships = membershipsForFamily(memberships, familyId).map(func m = projectMembership(tables, familyId, m));
      relationships = relationshipsForFamily(confirmedRelationships, familyId).map(func r = projectRelationship(tables, familyId, r));
      archiveItems = familyArchiveItems.map(func a = projectArchiveItem(tables, familyId, a));
      stories = storiesForFamily(stories, familyId).map(func s = projectStory(tables, familyId, s));
      sources = sourcesForFamily(sources, familyId).map(func s = projectSource(tables, familyId, s));
      recipes = recipesForFamily(recipes, familyId).map(func r = projectRecipe(tables, familyId, r));
      recoveryStatuses = [];
      mediaManifest;
      mediaManifestSummary = mediaManifestSummary(mediaManifest);
    };
    #ok(buildEnvelope(family, #FamilyArchive, payload));
  };

  // ---------------------------------------------------------------------------
  // Authorized Family Steward media retrieval
  // ---------------------------------------------------------------------------

  /// The export-local media token a given internal media key resolves to within
  /// this export. Used only to match a rebuilt manifest entry back to its source
  /// asset; the token itself carries no internal id.
  func mediaRefFor(tables : RefTables, familyId : FamilyTypes.FamilyId, rawKey : Text) : Text {
    ignore familyId;
    switch (tables.media.get(rawKey)) {
      case (?token) { token };
      case null { "" };
    };
  };

  /// Builds the export-bound media bindings for a generated FamilyArchive
  /// export instance.
  ///
  /// For every media entry in the export's manifest — archive items first, then
  /// profile photos, in the same order `buildFamilyArchiveExport` assigns the
  /// `media-N` tokens — records the export-local media token together with the
  /// exact source asset it came from (an archive item id, or a `personId:photoId`
  /// profile-photo key) and the family it belongs to. The bindings are the
  /// durable mapping that later retrieval resolves against, so an old export's
  /// `media-2` keeps meaning the same asset after family media is added,
  /// deleted, or reordered.
  ///
  /// Only the minimum mapping is stored: no media bytes are copied and no
  /// existing family/archive/media record is mutated.
  public func buildExportMediaBindings(
    exportInstanceRef : ExportTypes.ExportInstanceRef,
    familyId : FamilyTypes.FamilyId,
    archiveItems : [ArchiveTypes.ArchiveItem],
    profilePhotos : [(ObjectStorageTypes.PersonId, ObjectStorageTypes.Photo)],
  ) : [ExportTypes.ExportMediaBinding] {
    // The manifest is built as archive items first, then profile photos, in the
    // same order as the source lists, so the i-th manifest entry corresponds to
    // the i-th source asset. The binding records the exact source key for that
    // entry, so later retrieval never has to rebuild the manifest.
    let bindings = List.empty<ExportTypes.ExportMediaBinding>();
    // One shared media table so tokens are sequential (media-1, media-2, …) in
    // the same order the export manifest assigns them.
    let tables = emptyRefTables();
    for (item in archiveItems.values()) {
      bindings.add({
        exportInstanceRef;
        familyId;
        mediaRef = mediaRefForKey(tables, familyId, item.id.toText()).portableId;
        mediaKind = #ArchiveItem;
        sourceKind = #ArchiveItem;
        sourceKey = item.id.toText();
      });
    };
    for ((personId, photo) in profilePhotos.values()) {
      bindings.add({
        exportInstanceRef;
        familyId;
        mediaRef = mediaRefForKey(tables, familyId, profilePhotoMediaKey(personId, photo.id)).portableId;
        mediaKind = #ProfilePhoto;
        sourceKind = #ProfilePhoto;
        sourceKey = profilePhotoMediaKey(personId, photo.id);
      });
    };
    bindings.toArray();
  };

  /// Removes every expired export instance and the media bindings that belong
  /// to it, in place, from the two export-retrieval mapping lists.
  ///
  /// This is the bounded lazy cleanup for the temporary export-retrieval
  /// mapping state. It is deliberately narrow: it touches ONLY
  /// `exportInstances` and `exportMediaBindings` — the temporary mapping state
  /// created for a generated FamilyArchive export — and never family archive
  /// media, profile photos, archive items, export audit history, or any actual
  /// media bytes. An instance is expired when `now > instance.expiresAt`
  /// (the existing 7-day `EXPORT_INSTANCE_TTL_NANOS` lifecycle).
  ///
  /// It is called from an existing export/retrieval operation (never a
  /// scheduler or background system) and scans only these two lists, so it
  /// never walks unrelated application data. After pruning, a previously
  /// expired ref resolves neutrally as `#ExportInstanceNotFound` (it no longer
  /// exists); an expired instance that has not yet been pruned still resolves
  /// as `#ExportInstanceExpired`. Neither path ever rebuilds against current
  /// media.
  ///
  /// Returns the number of expired instances removed.
  public func pruneExpiredExportInstances(
    exportInstances : List.List<ExportTypes.ExportInstance>,
    exportMediaBindings : List.List<ExportTypes.ExportMediaBinding>,
    now : Int,
  ) : Nat {
    // Collect the refs of every expired instance first, then rebuild both lists
    // from an array snapshot. Rebuilding (rather than removing while iterating)
    // keeps the scan bounded to these two lists and avoids mutating a list
    // during its own iteration.
    let expiredRefs = List.empty<ExportTypes.ExportInstanceRef>();
    for (instance in exportInstances.values()) {
      if (now > instance.expiresAt) {
        expiredRefs.add(instance.ref);
      };
    };
    if (expiredRefs.size() == 0) {
      return 0;
    };
    let instanceSnapshot = exportInstances.toArray();
    exportInstances.clear();
    for (instance in instanceSnapshot.values()) {
      if (not expiredRefs.contains(instance.ref)) {
        exportInstances.add(instance);
      };
    };
    let bindingSnapshot = exportMediaBindings.toArray();
    exportMediaBindings.clear();
    for (binding in bindingSnapshot.values()) {
      if (not expiredRefs.contains(binding.exportInstanceRef)) {
        exportMediaBindings.add(binding);
      };
    };
    expiredRefs.size();
  };

  /// Builds the bounded-lifecycle export-instance record for a generated
  /// FamilyArchive export.
  ///
  /// The instance binds the opaque `exportInstanceRef` to the family it was
  /// generated for and to a creation/expiry window. `familyId` is stored
  /// server-side only and is never emitted to the client.
  public func buildExportInstance(
    exportInstanceRef : ExportTypes.ExportInstanceRef,
    familyId : FamilyTypes.FamilyId,
    createdAt : Int,
  ) : ExportTypes.ExportInstance {
    {
      ref = exportInstanceRef;
      familyId;
      createdAt;
      expiresAt = createdAt + EXPORT_INSTANCE_TTL_NANOS;
    };
  };

  /// Retrieves the bytes of a single asset bound to a specific FamilyArchive
  /// export instance, for an active Family Steward of that instance's family.
  ///
  /// Authorization: requires an authenticated caller and an active Family
  /// Steward of the family recorded on the export instance
  /// (`StewardAuthorityLib.isActiveStewardForFamily`). An anonymous caller gets
  /// `#NotSignedIn`; a non-Steward, or a Steward of another family, gets
  /// `#NotSteward`. Possession of an export-instance reference alone never
  /// bypasses Steward authorization, and a Family A export instance never
  /// retrieves Family B assets.
  ///
  /// Resolution: the requested `mediaRef` (`media-1`, `media-2`, …) is resolved
  /// ONLY against the stored bindings of `exportInstanceRef` — never against a
  /// rebuilt current family-media manifest. An unknown instance gets
  /// `#ExportInstanceNotFound`; an expired instance gets
  /// `#ExportInstanceExpired`; a token not bound to that instance gets
  /// `#MediaNotFound`; a bound asset whose bytes are missing gets
  /// `#MediaUnavailable`.
  ///
  /// The asset's bytes are returned directly to the authorized caller for this
  /// call only. No public or permanent media URL is created and no storage
  /// secret is exposed.
  public func retrieveFamilyArchiveMedia(
    exportInstances : List.List<ExportTypes.ExportInstance>,
    exportMediaBindings : List.List<ExportTypes.ExportMediaBinding>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
    families : List.List<FamilyTypes.Family>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal,
    exportInstanceRef : ExportTypes.ExportInstanceRef,
    mediaRef : Text,
  ) : Result.Result<ExportTypes.ExportMediaRetrieval, ExportTypes.ExportMediaRetrievalError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    // Resolve the export instance first. An unknown instance is neutral and is
    // NEVER resolved against a rebuilt current manifest.
    let instance = switch (exportInstances.find(func i = i.ref == exportInstanceRef)) {
      case (?i) { i };
      case null { return #err(#ExportInstanceNotFound) };
    };
    // The instance's own family is the tenant boundary. A Family A instance can
    // never resolve Family B assets.
    let familyId = instance.familyId;
    if (families.find(func f = f.id == familyId) == null) {
      return #err(#FamilyNotFound);
    };
    // Possession of an export-instance reference never bypasses Steward checks.
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotSteward);
    };
    // An expired instance is neutral: never a rebuild against current media.
    if (Time.now() > instance.expiresAt) {
      return #err(#ExportInstanceExpired);
    };
    // Resolve the export-local token ONLY against this instance's stored
    // bindings. The binding's own family must match the instance's family.
    let binding = switch (exportMediaBindings.find(func b =
      b.exportInstanceRef == exportInstanceRef and b.mediaRef == mediaRef and b.familyId == familyId
    )) {
      case (?b) { b };
      case null { return #err(#MediaNotFound) };
    };
    // Rebuild the export-local reference tables so the retrieval metadata can
    // carry the same related export-local references the manifest entry for the
    // bound asset carried. This is metadata only: the media token itself is
    // resolved from the stored binding, never from these tables.
    let tables = rebuildExportRefs(profiles, archiveItems, familyId);
    switch (binding.sourceKind) {
      case (#ArchiveItem) {
        let item = switch (archiveItems.find(func a = a.id.toText() == binding.sourceKey and a.familyId == familyId)) {
          case (?a) { a };
          case null { return #err(#MediaNotFound) };
        };
        if (item.blob.size() == 0) {
          return #err(#MediaUnavailable);
        };
        let relatedPersonRef = switch (item.relatedMemberIds.find(func _ = true)) {
          case (?personId) { ?personRef(tables, familyId, personId) };
          case null { null };
        };
        #ok({
          ref = { kind = #Media; portableId = binding.mediaRef };
          mediaKind = #ArchiveItem;
          title = item.title;
          mimeType = item.mimeType;
          filename = item.filename;
          byteSize = ?item.blob.size();
          relatedPersonRef;
          relatedArchiveRef = ?archiveItemRef(tables, familyId, item.id);
          uploadedAt = ?item.createdAt;
          availability = #Available;
          bytes = item.blob;
        });
      };
      case (#ProfilePhoto) {
        let photo = switch (findProfilePhoto(galleries, familyId, binding.sourceKey)) {
          case (?p) { p };
          case null { return #err(#MediaNotFound) };
        };
        if (photo.blob.size() == 0) {
          return #err(#MediaUnavailable);
        };
        let personId = switch (binding.sourceKey.split(#text ":").toArray()) {
          case (parts) {
            if (parts.size() == 2) { parts[0] } else { "" };
          };
        };
        #ok({
          ref = { kind = #Media; portableId = binding.mediaRef };
          mediaKind = #ProfilePhoto;
          title = photo.filename;
          mimeType = ?photo.mimeType;
          filename = ?photo.filename;
          byteSize = ?photo.blob.size();
          relatedPersonRef = if (personId == "") { null } else { ?personRef(tables, familyId, personId) };
          relatedArchiveRef = null;
          uploadedAt = ?photo.uploadedAt;
          availability = #Available;
          bytes = photo.blob;
        });
      };
    };
  };

  /// Rebuilds the export-local reference tables for a bound source asset using
  /// the same deterministic assignment order `buildFamilyArchiveExport` uses:
  /// family persons first, then family archive items. This lets retrieval
  /// surface the same `relatedPersonRef`/`relatedArchiveRef` the manifest entry
  /// carried, without storing a second copy of the export tables. The tables
  /// hold only export-local tokens; no internal id is emitted.
  func rebuildExportRefs(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    familyId : FamilyTypes.FamilyId,
  ) : RefTables {
    let tables = emptyRefTables();
    for (p in profilesForFamily(profiles, familyId).values()) {
      ignore personRef(tables, familyId, p.personId);
    };
    for (a in archiveItemsForFamily(archiveItems, familyId).values()) {
      ignore archiveItemRef(tables, familyId, a.id);
    };
    tables;
  };

  /// Resolves a stored profile-photo binding key (`personId:photoId`) to the
  /// exact photo in `familyId` only. The gallery storage key is family-qualified
  /// (or the legacy bare person id for the default family), so a binding from
  /// one family never resolves a photo in another.
  func findProfilePhoto(
    galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    sourceKey : Text,
  ) : ?ObjectStorageTypes.Photo {
    let parts = sourceKey.split(#text ":").toArray();
    if (parts.size() != 2) {
      return null;
    };
    let personId = parts[0];
    let photoId = switch (parts[1].toNat()) {
      case (?id) { id };
      case null { return null };
    };
    let gallery = switch (galleries.get(galleryStorageKey(familyId, personId))) {
      case (?g) { g };
      case null { return null };
    };
    gallery.photos.find(func p = p.id == photoId);
  };

  /// The gallery storage key for a person in a family. The default family uses
  /// the legacy bare person id; every other family is family-qualified.
  func galleryStorageKey(familyId : FamilyTypes.FamilyId, personId : ObjectStorageTypes.PersonId) : Text {
    if (familyId == FamilyTypes.DEFAULT_FAMILY_ID) {
      personId;
    } else {
      familyId # "::" # personId;
    };
  };

  // ---------------------------------------------------------------------------
  // Envelope construction
  // ---------------------------------------------------------------------------

  /// Builds the self-describing, versioned export envelope. `familyRef` is the
  /// portable, non-secret family display name from the Family record — never the
  /// internal family id. The payload is serialized to JSON text separately from
  /// the metadata so the envelope stays stable as the schema evolves.
  public func buildEnvelope(
    family : FamilyTypes.Family,
    scope : ExportTypes.ExportScope,
    payload : ExportTypes.ExportPayload,
  ) : ExportTypes.ExportEnvelope {
    let metadata : ExportTypes.ExportMetadata = {
      schemaVersion = ExportTypes.CURRENT_EXPORT_SCHEMA_VERSION;
      generatedAt = Time.now();
      scope;
      format = #JSON;
      familyRef = family.displayName;
      sourceAppName = ExportTypes.EXPORT_SOURCE_APP_NAME;
      sourceAppVersion = "1.0.0";
    };
    {
      metadata;
      payloadJson = serializePayload(payload);
    };
  };

  // ---------------------------------------------------------------------------
  // JSON serialization
  // ---------------------------------------------------------------------------

  /// Serializes the portable payload to JSON text. Every record carries its
  /// privacy class, and only exportable records are emitted: a record whose
  /// privacy class is not exportable is filtered out before serialization, so
  /// platform-internal/security data can never appear in the output.
  public func serializePayload(payload : ExportTypes.ExportPayload) : Text {
    let persons = payload.persons.filter(func p = ExportTypes.isExportable(p.privacyClass));
    let memberships = payload.memberships.filter(func m = ExportTypes.isExportable(m.privacyClass));
    let relationships = payload.relationships.filter(func r = ExportTypes.isExportable(r.privacyClass));
    let archiveItems = payload.archiveItems.filter(func a = ExportTypes.isExportable(a.privacyClass));
    let stories = payload.stories.filter(func s = ExportTypes.isExportable(s.privacyClass));
    let sources = payload.sources.filter(func s = ExportTypes.isExportable(s.privacyClass));
    let recipes = payload.recipes.filter(func r = ExportTypes.isExportable(r.privacyClass));
    let recoveryStatuses = payload.recoveryStatuses.filter(func r = ExportTypes.isExportable(r.privacyClass));
    let mediaManifest = payload.mediaManifest.filter(func m = ExportTypes.isExportable(m.privacyClass));
    "{" #
    "\"persons\":" # jsonArray(persons.map(personJson)) # "," #
    "\"memberships\":" # jsonArray(memberships.map(membershipJson)) # "," #
    "\"relationships\":" # jsonArray(relationships.map(relationshipJson)) # "," #
    "\"archiveItems\":" # jsonArray(archiveItems.map(archiveItemJson)) # "," #
    "\"stories\":" # jsonArray(stories.map(storyJson)) # "," #
    "\"sources\":" # jsonArray(sources.map(sourceJson)) # "," #
    "\"recipes\":" # jsonArray(recipes.map(recipeJson)) # "," #
    "\"recoveryStatuses\":" # jsonArray(recoveryStatuses.map(recoveryStatusJson)) # "," #
    "\"mediaManifest\":" # jsonArray(mediaManifest.map(mediaRefJson)) # "," #
    "\"mediaManifestSummary\":" # mediaManifestSummaryJson(mediaManifestSummary(mediaManifest)) #
    "}";
  };

  func personJson(p : ExportTypes.ExportPersonRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(p.ref) # "," #
    "\"name\":" # jsonText(p.name) # "," #
    "\"livingStatus\":" # jsonText(p.livingStatus) # "," #
    "\"preferredName\":" # jsonOptText(p.preferredName) # "," #
    "\"firstName\":" # jsonOptText(p.firstName) # "," #
    "\"middleName\":" # jsonOptText(p.middleName) # "," #
    "\"lastName\":" # jsonOptText(p.lastName) # "," #
    "\"suffix\":" # jsonOptText(p.suffix) # "," #
    "\"nickname\":" # jsonOptText(p.nickname) # "," #
    "\"story\":" # jsonOptText(p.story) # "," #
    "\"shortBio\":" # jsonOptText(p.shortBio) # "," #
    "\"longerStory\":" # jsonOptText(p.longerStory) # "," #
    "\"occupation\":" # jsonOptText(p.occupation) # "," #
    "\"birthInfo\":" # jsonOptText(p.birthInfo) # "," #
    "\"birthDate\":" # jsonOptText(p.birthDate) # "," #
    "\"birthplace\":" # jsonOptText(p.birthplace) # "," #
    "\"currentLocation\":" # jsonOptText(p.currentLocation) # "," #
    "\"timeline\":" # jsonArray(p.timeline.map(jsonText)) # "," #
    "\"privacyClass\":" # privacyClassJson(p.privacyClass) #
    "}";
  };

  func membershipJson(m : ExportTypes.ExportMembershipRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(m.ref) # "," #
    "\"personRef\":" # recordRefJson(m.personRef) # "," #
    "\"status\":" # jsonText(m.status) # "," #
    "\"joinedAt\":" # jsonOptInt(m.joinedAt) # "," #
    "\"createdAt\":" # m.createdAt.toText() # "," #
    "\"updatedAt\":" # m.updatedAt.toText() # "," #
    "\"privacyClass\":" # privacyClassJson(m.privacyClass) #
    "}";
  };

  func relationshipJson(r : ExportTypes.ExportRelationshipRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(r.ref) # "," #
    "\"fromPersonRef\":" # recordRefJson(r.fromPersonRef) # "," #
    "\"toPersonRef\":" # recordRefJson(r.toPersonRef) # "," #
    "\"relationshipType\":" # jsonText(r.relationshipType) # "," #
    "\"status\":" # jsonText(r.status) # "," #
    "\"privacyClass\":" # privacyClassJson(r.privacyClass) #
    "}";
  };

  func archiveItemJson(a : ExportTypes.ExportArchiveItemRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(a.ref) # "," #
    "\"title\":" # jsonText(a.title) # "," #
    "\"description\":" # jsonText(a.description) # "," #
    "\"itemType\":" # jsonText(a.itemType) # "," #
    "\"era\":" # jsonText(a.era) # "," #
    "\"year\":" # jsonOptNat(a.year) # "," #
    "\"tags\":" # jsonArray(a.tags.map(jsonText)) # "," #
    "\"relatedPersonRefs\":" # jsonArray(a.relatedPersonRefs.map(recordRefJson)) # "," #
    "\"sourceStatus\":" # jsonText(a.sourceStatus) # "," #
    "\"privacyLevel\":" # jsonText(a.privacyLevel) # "," #
    "\"status\":" # jsonText(a.status) # "," #
    "\"classification\":" # jsonText(a.classification) # "," #
    "\"primarySpeakerName\":" # jsonOptText(a.primarySpeakerName) # "," #
    "\"createdAt\":" # a.createdAt.toText() # "," #
    "\"mediaRef\":" # jsonOptRecordRef(a.mediaRef) # "," #
    "\"privacyClass\":" # privacyClassJson(a.privacyClass) #
    "}";
  };

  func storyJson(s : ExportTypes.ExportStoryRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(s.ref) # "," #
    "\"title\":" # jsonText(s.title) # "," #
    "\"storyText\":" # jsonText(s.storyText) # "," #
    "\"relatedPersonRefs\":" # jsonArray(s.relatedPersonRefs.map(recordRefJson)) # "," #
    "\"era\":" # jsonOptText(s.era) # "," #
    "\"year\":" # jsonOptNat(s.year) # "," #
    "\"location\":" # jsonOptText(s.location) # "," #
    "\"evidenceStatus\":" # jsonText(s.evidenceStatus) # "," #
    "\"relatedArchiveItemRefs\":" # jsonArray(s.relatedArchiveItemRefs.map(recordRefJson)) # "," #
    "\"status\":" # jsonText(s.status) # "," #
    "\"createdAt\":" # s.createdAt.toText() # "," #
    "\"updatedAt\":" # s.updatedAt.toText() # "," #
    "\"privacyClass\":" # privacyClassJson(s.privacyClass) #
    "}";
  };

  func sourceJson(s : ExportTypes.ExportSourceRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(s.ref) # "," #
    "\"title\":" # jsonText(s.title) # "," #
    "\"sourceType\":" # jsonText(s.sourceType) # "," #
    "\"citation\":" # jsonOptText(s.citation) # "," #
    "\"url\":" # jsonOptText(s.url) # "," #
    "\"privacyClass\":" # privacyClassJson(s.privacyClass) #
    "}";
  };

  func recipeJson(r : ExportTypes.ExportRecipeRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(r.ref) # "," #
    "\"title\":" # jsonText(r.title) # "," #
    "\"shortDescription\":" # jsonText(r.shortDescription) # "," #
    "\"originatingPersonRef\":" # jsonOptRecordRef(r.originatingPersonRef) # "," #
    "\"relatedPersonRefs\":" # jsonArray(r.relatedPersonRefs.map(recordRefJson)) # "," #
    "\"era\":" # jsonOptText(r.era) # "," #
    "\"year\":" # jsonOptNat(r.year) # "," #
    "\"location\":" # jsonOptText(r.location) # "," #
    "\"familyBranch\":" # jsonOptText(r.familyBranch) # "," #
    "\"ingredients\":" # jsonArray(r.ingredients.map(jsonText)) # "," #
    "\"instructions\":" # jsonText(r.instructions) # "," #
    "\"familyStory\":" # jsonOptText(r.familyStory) # "," #
    "\"tags\":" # jsonArray(r.tags.map(jsonText)) # "," #
    "\"privacyLevel\":" # jsonText(r.privacyLevel) # "," #
    "\"evidenceStatus\":" # jsonText(r.evidenceStatus) # "," #
    "\"linkedMediaRefs\":" # jsonArray(r.linkedMediaRefs.map(recordRefJson)) # "," #
    "\"status\":" # jsonText(r.status) # "," #
    "\"createdAt\":" # r.createdAt.toText() # "," #
    "\"updatedAt\":" # r.updatedAt.toText() # "," #
    "\"privacyClass\":" # privacyClassJson(r.privacyClass) #
    "}";
  };

  func recoveryStatusJson(r : ExportTypes.ExportRecoveryStatusRecord) : Text {
    "{" #
    "\"ref\":" # recordRefJson(r.ref) # "," #
    "\"targetName\":" # jsonText(r.targetName) # "," #
    "\"status\":" # jsonText(r.status) # "," #
    "\"createdAt\":" # r.createdAt.toText() # "," #
    "\"updatedAt\":" # r.updatedAt.toText() # "," #
    "\"privacyClass\":" # privacyClassJson(r.privacyClass) #
    "}";
  };

  func mediaRefJson(m : ExportTypes.ExportMediaRef) : Text {
    "{" #
    "\"ref\":" # recordRefJson(m.ref) # "," #
    "\"mediaKind\":" # jsonText(mediaKindText(m.mediaKind)) # "," #
    "\"title\":" # jsonText(m.title) # "," #
    "\"mimeType\":" # jsonOptText(m.mimeType) # "," #
    "\"filename\":" # jsonOptText(m.filename) # "," #
    "\"byteSize\":" # jsonOptNat(m.byteSize) # "," #
    "\"relatedPersonRef\":" # jsonOptRecordRef(m.relatedPersonRef) # "," #
    "\"relatedArchiveRef\":" # jsonOptRecordRef(m.relatedArchiveRef) # "," #
    "\"uploadedAt\":" # jsonOptInt(m.uploadedAt) # "," #
    "\"availability\":" # jsonText(mediaAvailabilityText(m.availability)) # "," #
    "\"reference\":" # jsonText(m.reference) # "," #
    "\"privacyClass\":" # privacyClassJson(m.privacyClass) #
    "}";
  };

  func mediaManifestSummaryJson(s : ExportTypes.ExportMediaManifestSummary) : Text {
    "{" #
    "\"assetCount\":" # s.assetCount.toText() # "," #
    "\"knownTotalBytes\":" # s.knownTotalBytes.toText() # "," #
    "\"unavailableCount\":" # s.unavailableCount.toText() #
    "}";
  };

  func mediaKindText(kind : ExportTypes.ExportMediaKind) : Text {
    switch (kind) {
      case (#ProfilePhoto) { "ProfilePhoto" };
      case (#ArchiveItem) { "ArchiveItem" };
    };
  };

  func mediaAvailabilityText(availability : ExportTypes.ExportMediaAvailability) : Text {
    switch (availability) {
      case (#Available) { "Available" };
      case (#Unavailable) { "Unavailable" };
    };
  };

  func recordRefJson(ref : ExportTypes.ExportRecordRef) : Text {
    "{" #
    "\"kind\":" # jsonText(recordKindText(ref.kind)) # "," #
    "\"portableId\":" # jsonText(ref.portableId) #
    "}";
  };

  func recordKindText(kind : ExportTypes.ExportRecordKind) : Text {
    switch (kind) {
      case (#Person) { "Person" };
      case (#Membership) { "Membership" };
      case (#Relationship) { "Relationship" };
      case (#ArchiveItem) { "ArchiveItem" };
      case (#Story) { "Story" };
      case (#Source) { "Source" };
      case (#Media) { "Media" };
      case (#Recipe) { "Recipe" };
      case (#RecoveryStatus) { "RecoveryStatus" };
    };
  };

  func privacyClassJson(privacyClass : ExportTypes.ExportPrivacyClass) : Text {
    switch (privacyClass) {
      case (#PortableFamilyHistory) { jsonText("PortableFamilyHistory") };
      case (#RequesterOwnedPrivate) { jsonText("RequesterOwnedPrivate") };
      case (#StewardGovernance) { jsonText("StewardGovernance") };
      case (#PlatformInternalSecurity) { jsonText("PlatformInternalSecurity") };
    };
  };

  // ---------------------------------------------------------------------------
  // JSON primitives
  // ---------------------------------------------------------------------------

  func jsonArray(items : [Text]) : Text {
    "[" # items.values().join(",") # "]";
  };

  func jsonText(value : Text) : Text {
    "\"" # escapeJson(value) # "\"";
  };

  func jsonOptText(value : ?Text) : Text {
    switch (value) {
      case (?v) { jsonText(v) };
      case null { "null" };
    };
  };

  func jsonOptNat(value : ?Nat) : Text {
    switch (value) {
      case (?v) { v.toText() };
      case null { "null" };
    };
  };

  func jsonOptInt(value : ?Int) : Text {
    switch (value) {
      case (?v) { v.toText() };
      case null { "null" };
    };
  };

  func jsonOptRecordRef(value : ?ExportTypes.ExportRecordRef) : Text {
    switch (value) {
      case (?v) { recordRefJson(v) };
      case null { "null" };
    };
  };

  /// Escapes a text value for JSON: backslash, double quote, and the control
  /// characters that must be escaped. Other characters pass through unchanged.
  func escapeJson(value : Text) : Text {
    var out = "";
    for (c in value.toIter()) {
      let code = c.toNat32().toNat();
      if (c == '\\') {
        out := out # "\\\\";
      } else if (c == '\"') {
        out := out # "\\\"";
      } else if (code == 10) {
        out := out # "\\n";
      } else if (code == 13) {
        out := out # "\\r";
      } else if (code == 9) {
        out := out # "\\t";
      } else if (code < 32) {
        out := out # "\\u" # hex4(code);
      } else {
        out := out # c.toText();
      };
    };
    out;
  };

  /// Renders a code point as a four-digit lowercase hex escape body.
  func hex4(code : Nat) : Text {
    let digits = "0123456789abcdef";
    let d0 = (code / 4096) % 16;
    let d1 = (code / 256) % 16;
    let d2 = (code / 16) % 16;
    let d3 = code % 16;
    digits.toArray()[d0].toText() #
    digits.toArray()[d1].toText() #
    digits.toArray()[d2].toText() #
    digits.toArray()[d3].toText();
  };
};

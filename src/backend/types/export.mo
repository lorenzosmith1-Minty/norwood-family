import Principal "mo:core/Principal";

/// Phase 5A — Data Export / Portability Foundation (types only).
///
/// This module defines the additive, self-describing, versioned export schema
/// for Norwood. It carries NO export logic, NO endpoints, and NO stable state:
/// it is the shared vocabulary the export library and API mixin will use.
///
/// Design rules encoded here:
///
/// - Every export is family-scoped. `ExportMetadata.familyRef` is a portable,
///   non-secret family identifier (the family display name), never an internal
///   family id or secret.
/// - Every exported record carries a `privacyClass` so the serializer can
///   classify a category BEFORE serializing it. Only `#PortableFamilyHistory`
///   and `#RequesterOwnedPrivate` normally appear in a portable export;
///   `#StewardGovernance` only when explicitly necessary for legitimate family
///   portability; `#PlatformInternalSecurity` is never exported.
/// - Relationships between exported records are preserved through stable
///   portable record references (`ExportRecordRef`), not through raw internal
///   ids or account principals.
/// - Media is metadata/reference only in Phase 5A. `ExportMediaRef` carries no
///   bytes, and `ExportEnvelope.mediaManifest` is a separate optional list so
///   binary media can be added later without breaking the format.
module {
  /// The scope of an export request.
  ///
  /// - `#MyData` — the authenticated requester's own Norwood identity data.
  /// - `#FamilyArchive` — the portable family-history dataset; requires active
  ///   Family Steward authorization.
  public type ExportScope = {
    #MyData;
    #FamilyArchive;
  };

  /// The serialization format of an export. JSON is the only supported format
  /// in Phase 5A; the variant is additive so future formats can be added.
  public type ExportFormat = {
    #JSON;
  };

  /// Privacy classification of a data category, applied before serialization.
  ///
  /// - `#PortableFamilyHistory` — portable family/history data.
  /// - `#RequesterOwnedPrivate` — requester-owned private data.
  /// - `#StewardGovernance` — Steward-governance data.
  /// - `#PlatformInternalSecurity` — platform-internal/security data.
  public type ExportPrivacyClass = {
    #PortableFamilyHistory;
    #RequesterOwnedPrivate;
    #StewardGovernance;
    #PlatformInternalSecurity;
  };

  /// Whether a privacy class may appear in a portable export.
  ///
  /// Portable family/history and requester-owned private data are exportable.
  /// Steward-governance data is included only when explicitly necessary for
  /// legitimate family portability, so it is not exportable by default.
  /// Platform-internal/security data is never exportable.
  public func isExportable(privacyClass : ExportPrivacyClass) : Bool {
    switch (privacyClass) {
      case (#PortableFamilyHistory) { true };
      case (#RequesterOwnedPrivate) { true };
      case (#StewardGovernance) { false };
      case (#PlatformInternalSecurity) { false };
    };
  };

  /// The portable kind of an exported record. Used as the `kind` tag of an
  /// `ExportRecordRef` so a relationship can point at another exported record
  /// without exposing an internal id.
  public type ExportRecordKind = {
    #Person;
    #Membership;
    #Relationship;
    #ArchiveItem;
    #Story;
    #Source;
    #Media;
    #Recipe;
    #RecoveryStatus;
  };

  /// A stable, portable reference to another exported record.
  ///
  /// `kind` names the record category and `portableId` is an export-local,
  /// sequential identifier (`person-1`, `person-2`, `membership-1`, …) assigned
  /// from the export's own reference tables. It is scoped to a single export and
  /// is not derived from — and does not permit recovery of — any internal
  /// Norwood id. Numbering restarts for every export, so the same record may
  /// have a different `portableId` in a different export. Relationships between
  /// exported records are expressed with these references so the portable
  /// structure stays self-contained without exposing sensitive backend
  /// identifiers.
  public type ExportRecordRef = {
    kind : ExportRecordKind;
    portableId : Text;
  };

  /// The portable kind of an exportable media asset. It names the family
  /// content category the asset came from (a person's profile photo, or an
  /// archive/history item) without exposing any internal storage identifier.
  public type ExportMediaKind = {
    #ProfilePhoto;
    #ArchiveItem;
  };

  /// Whether an exportable media asset's bytes are currently retrievable.
  ///
  /// - `#Available` — the asset is present and its bytes can be retrieved by an
  ///   authorized Family Steward.
  /// - `#Unavailable` — the asset is referenced by family content but its bytes
  ///   are missing or otherwise not retrievable. A missing asset is represented
  ///   neutrally and never invalidates the rest of the export.
  public type ExportMediaAvailability = {
    #Available;
    #Unavailable;
  };

  /// A portable media metadata/reference record. Phase 5C exports metadata and
  /// references only — never binary bytes. The `reference` field is an opaque,
  /// export-local reference (the media record's own portable id), and the
  /// remaining fields describe the media without carrying its content or any
  /// raw internal storage identifier.
  ///
  /// - `mediaKind` names the portable family-content category.
  /// - `byteSize` is the asset's size in bytes when already known, else `null`.
  /// - `relatedPersonRef` is the export-local Person/Profile reference the asset
  ///   belongs to, when applicable.
  /// - `relatedArchiveRef` is the export-local archive/story/oral-history
  ///   reference the asset belongs to, when applicable.
  /// - `uploadedAt` is the asset's created/uploaded nanosecond timestamp when
  ///   already available, else `null`.
  /// - `availability` is the neutral availability state; a missing asset is
  ///   `#Unavailable` and never fails the export.
  public type ExportMediaRef = {
    ref : ExportRecordRef;
    mediaKind : ExportMediaKind;
    title : Text;
    mimeType : ?Text;
    filename : ?Text;
    byteSize : ?Nat;
    relatedPersonRef : ?ExportRecordRef;
    relatedArchiveRef : ?ExportRecordRef;
    uploadedAt : ?Int;
    availability : ExportMediaAvailability;
    /// Opaque, export-local reference to the stored media. No bytes are included
    /// and no internal storage identifier is recoverable from it.
    reference : Text;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable, resource-safety summary of a media manifest. It records the
  /// asset count, the aggregate known byte size, and how many assets are
  /// unavailable, so later packaging can enforce limits without bundling
  /// arbitrary unlimited data in memory. It carries no per-asset detail and no
  /// internal identifier.
  public type ExportMediaManifestSummary = {
    assetCount : Nat;
    knownTotalBytes : Nat;
    unavailableCount : Nat;
  };

  /// Portable projection of a Person/Profile record.
  public type ExportPersonRecord = {
    ref : ExportRecordRef;
    name : Text;
    livingStatus : Text;
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
    timeline : [Text];
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of a family membership. The account principal is
  /// deliberately omitted; the membership is expressed through the portable
  /// person reference only.
  public type ExportMembershipRecord = {
    ref : ExportRecordRef;
    personRef : ExportRecordRef;
    status : Text;
    joinedAt : ?Int;
    createdAt : Int;
    updatedAt : Int;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of a relationship between two people. Both endpoints
  /// are portable person references, so the relationship stays representable
  /// without exposing internal relationship ids.
  public type ExportRelationshipRecord = {
    ref : ExportRecordRef;
    fromPersonRef : ExportRecordRef;
    toPersonRef : ExportRecordRef;
    relationshipType : Text;
    status : Text;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of an archive/history item. Media is referenced by
  /// `mediaRef` (metadata only), never embedded as bytes.
  public type ExportArchiveItemRecord = {
    ref : ExportRecordRef;
    title : Text;
    description : Text;
    itemType : Text;
    era : Text;
    year : ?Nat;
    tags : [Text];
    relatedPersonRefs : [ExportRecordRef];
    sourceStatus : Text;
    privacyLevel : Text;
    status : Text;
    classification : Text;
    primarySpeakerName : ?Text;
    createdAt : Int;
    mediaRef : ?ExportRecordRef;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of a family story.
  public type ExportStoryRecord = {
    ref : ExportRecordRef;
    title : Text;
    storyText : Text;
    relatedPersonRefs : [ExportRecordRef];
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    evidenceStatus : Text;
    relatedArchiveItemRefs : [ExportRecordRef];
    status : Text;
    createdAt : Int;
    updatedAt : Int;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of a research source.
  public type ExportSourceRecord = {
    ref : ExportRecordRef;
    title : Text;
    sourceType : Text;
    citation : ?Text;
    url : ?Text;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of a family recipe / oral-history metadata record.
  /// Linked media is referenced by metadata only.
  public type ExportRecipeRecord = {
    ref : ExportRecordRef;
    title : Text;
    shortDescription : Text;
    originatingPersonRef : ?ExportRecordRef;
    relatedPersonRefs : [ExportRecordRef];
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    familyBranch : ?Text;
    ingredients : [Text];
    instructions : Text;
    familyStory : ?Text;
    tags : [Text];
    privacyLevel : Text;
    evidenceStatus : Text;
    linkedMediaRefs : [ExportRecordRef];
    status : Text;
    createdAt : Int;
    updatedAt : Int;
    privacyClass : ExportPrivacyClass;
  };

  /// Portable projection of the requester's own recovery status. Deliberately
  /// omits account principals, recovery internal ids, verifier identities, and
  /// private reasons; only the requester's own family-facing status is carried.
  public type ExportRecoveryStatusRecord = {
    ref : ExportRecordRef;
    targetName : Text;
    status : Text;
    createdAt : Int;
    updatedAt : Int;
    privacyClass : ExportPrivacyClass;
  };

  /// The portable payload of an export. Each list is a category of exported
  /// records; a category that is not part of the requested scope is empty.
  /// `mediaManifest` carries media metadata/references only — no bytes — so
  /// binary media can be added later without breaking the format.
  public type ExportPayload = {
    persons : [ExportPersonRecord];
    memberships : [ExportMembershipRecord];
    relationships : [ExportRelationshipRecord];
    archiveItems : [ExportArchiveItemRecord];
    stories : [ExportStoryRecord];
    sources : [ExportSourceRecord];
    recipes : [ExportRecipeRecord];
    recoveryStatuses : [ExportRecoveryStatusRecord];
    mediaManifest : [ExportMediaRef];
    mediaManifestSummary : ExportMediaManifestSummary;
  };

  /// Self-describing, versioned export metadata.
  ///
  /// - `schemaVersion` starts at 1 and is bumped when the portable schema
  ///   changes in a way consumers must know about.
  /// - `generatedAt` is a nanosecond timestamp.
  /// - `scope` is the requested export scope.
  /// - `familyRef` is a portable, non-secret family identifier (the family
  ///   display name), never an internal family id or secret.
  /// - `sourceAppName` / `sourceAppVersion` identify the producing application
  ///   when already available.
  public type ExportMetadata = {
    schemaVersion : Nat;
    generatedAt : Int;
    scope : ExportScope;
    format : ExportFormat;
    familyRef : Text;
    sourceAppName : Text;
    sourceAppVersion : Text;
  };

  /// The current export schema version.
  public let CURRENT_EXPORT_SCHEMA_VERSION : Nat = 1;

  /// The source application name recorded in export metadata.
  public let EXPORT_SOURCE_APP_NAME : Text = "Norwood";

  /// A complete export envelope: self-describing metadata plus the serialized
  /// payload as JSON text. The payload is serialized separately from the
  /// metadata so the envelope stays stable as the schema evolves.
  public type ExportEnvelope = {
    metadata : ExportMetadata;
    payloadJson : Text;
  };

  /// Errors for export authorization and validation. Messages are stable and
  /// family-facing; no technical tag or private reason is exposed.
  public type ExportError = {
    #NotSignedIn;
    #NotAuthorized;
    #NotSteward;
    #FamilyNotFound;
    #UnsupportedScope;
    #UnsupportedFormat;
    #ExportFailed;
  };

  /// A single authorized media-retrieval result for a Family Steward.
  ///
  /// It carries the asset's bytes plus the same portable metadata the manifest
  /// entry exposes. It deliberately carries no public or permanent URL, no
  /// storage secret, and no raw internal storage identifier: the bytes are
  /// returned directly to the authorized caller for this call only.
  public type ExportMediaRetrieval = {
    ref : ExportRecordRef;
    mediaKind : ExportMediaKind;
    title : Text;
    mimeType : ?Text;
    filename : ?Text;
    byteSize : ?Nat;
    relatedPersonRef : ?ExportRecordRef;
    relatedArchiveRef : ?ExportRecordRef;
    uploadedAt : ?Int;
    availability : ExportMediaAvailability;
    /// The asset's bytes, returned only to the authorized caller. Never a URL.
    bytes : Blob;
  };

  /// Errors for authorized media retrieval. Messages are stable and
  /// family-facing; no technical tag or private reason is exposed.
  ///
  /// - `#ExportInstanceNotFound` — the presented export-instance reference is
  ///   unknown (never issued, or already pruned). It is deliberately distinct
  ///   from `#MediaNotFound`: an unknown instance must never fall back to
  ///   resolving `media-N` against a rebuilt current manifest.
  /// - `#ExportInstanceExpired` — the export instance existed but its bounded
  ///   lifecycle has elapsed. Also neutral: no rebuild against current media.
  public type ExportMediaRetrievalError = {
    #NotSignedIn;
    #NotSteward;
    #FamilyNotFound;
    #MediaNotFound;
    #MediaUnavailable;
    #ExportInstanceNotFound;
    #ExportInstanceExpired;
  };

  /// An opaque, export-instance reference returned alongside a generated
  /// FamilyArchive envelope.
  ///
  /// It is a short, export-local token (for example `"export-1"`) assigned from
  /// a per-family counter. It deliberately encodes and reveals NO family id,
  /// media/storage id, internal record id, or storage secret: it is only a
  /// lookup key into the server-side export-instance mapping. Possessing it
  /// grants no authority — retrieval still requires an authenticated active
  /// Family Steward of the instance's own family.
  public type ExportInstanceRef = Text;

  /// A generated FamilyArchive export instance: the bounded-lifecycle record
  /// that binds an opaque `ExportInstanceRef` to the family it was generated
  /// for and to the moment it was created.
  ///
  /// `familyId` is the tenant boundary and is stored server-side only; it is
  /// never emitted to the client. `createdAt` and `expiresAt` are nanosecond
  /// timestamps. Once `expiresAt` has passed the instance is expired and its
  /// media bindings are no longer resolvable.
  public type ExportInstance = {
    ref : ExportInstanceRef;
    familyId : Text;
    createdAt : Int;
    expiresAt : Int;
  };

  /// The portable source category of a bound media asset. It names whether the
  /// asset came from an archive/history item or a person's profile photo,
  /// without exposing any internal storage identifier.
  public type ExportMediaSourceKind = {
    #ArchiveItem;
    #ProfilePhoto;
  };

  /// A single export-bound media mapping entry.
  ///
  /// It binds one export-local media token (`media-N`) within one export
  /// instance to the exact underlying source asset, so an old export's
  /// `media-2` keeps meaning the same asset even after family media is added,
  /// deleted, or reordered.
  ///
  /// - `exportInstanceRef` is the opaque instance this binding belongs to.
  /// - `familyId` is the tenant boundary, stored server-side only and never
  ///   emitted.
  /// - `mediaRef` is the export-local media token (`media-1`, `media-2`, …).
  /// - `mediaKind` is the portable media category carried in the manifest.
  /// - `sourceKind` names whether the asset is an archive item or a profile
  ///   photo.
  /// - `sourceKey` is the internal lookup key used to resolve the asset at
  ///   retrieval time (an archive item id, or a `personId:photoId` key). It is
  ///   stored server-side only and is never emitted to the client.
  ///
  /// No media bytes are stored here; the binding only records where the bytes
  /// already live. Existing family/archive/media records are never mutated.
  public type ExportMediaBinding = {
    exportInstanceRef : ExportInstanceRef;
    familyId : Text;
    mediaRef : Text;
    mediaKind : ExportMediaKind;
    sourceKind : ExportMediaSourceKind;
    sourceKey : Text;
  };

  /// The result of a FamilyArchive export: the existing versioned envelope plus
  /// the opaque export-instance reference the client must present, together
  /// with an export-local media token, to retrieve media later.
  public type ExportFamilyArchiveResult = {
    envelope : ExportEnvelope;
    exportInstanceRef : ExportInstanceRef;
  };

  /// The outcome of an export attempt, recorded in the export audit history.
  ///
  /// - `#Succeeded` — the export was authorized and generated.
  /// - `#Failed` — the export was refused or could not be generated.
  public type ExportAuditStatus = {
    #Succeeded;
    #Failed;
  };

  /// A single export audit history entry.
  ///
  /// Records that an export was generated (or refused): the requested scope,
  /// the family, the requesting account, the timestamp, and the success/failure
  /// status. It deliberately does NOT carry the exported payload, the export
  /// envelope, or any exported record — the audit history never stores the
  /// exported data itself.
  ///
  /// `familyId` is the tenant boundary for the entry. `requesterAccountId` is
  /// the account that requested the export. `timestamp` is a nanosecond
  /// timestamp.
  public type ExportAuditEntry = {
    familyId : Text;
    id : Nat;
    scope : ExportScope;
    requesterAccountId : Principal;
    timestamp : Int;
    status : ExportAuditStatus;
  };
};

import Storage "mo:caffeineai-object-storage/Storage";
import ArchiveTypes "../types/archive";
import ResearchIntakeTypes "../types/research-intake";
import BoardTypes "../types/board";
import FamilyTypes "../types/family";

module {
  /// A single new media upload attached to a board post. Uploading creates one
  /// canonical Archive item (pending) linked to the post; the underlying file is
  /// never duplicated. Existing Archive items are attached by id instead of
  /// re-uploading.
  public type BoardMediaUpload = {
    familyId : FamilyTypes.FamilyId;
    title : Text;
    description : Text;
    itemType : ArchiveTypes.ArchiveItemType;
    /// Caller-declared MIME type of the uploaded bytes. Validated against the
    /// board attachment allowlist before the upload is stored.
    mimeType : Text;
    /// Caller-supplied filename. Sanitized before it is persisted on the
    /// canonical Archive item.
    filename : Text;
    blob : Storage.ExternalBlob;
    era : Text;
    year : ?Nat;
    tags : [Text];
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    sourceStatus : ArchiveTypes.SourceStatus;
    privacyLevel : ArchiveTypes.PrivacyLevel;
    classification : ArchiveTypes.ArchiveItemClassification;
    primarySpeaker : ?ArchiveTypes.OralHistorySpeaker;
  };

  /// Filter for searching/filtering approved archive items. All fields are
  /// optional; when a field is `null`/empty it does not constrain the result.
  /// `searchTerm` matches the item title (case-insensitive substring); `tags`
  /// matches items carrying ALL of the given tags; `itemType`,
  /// `relatedMemberId`, and `era` filter by category, linked family member, and
  /// era respectively.
  public type ArchiveSearchFilter = {
    searchTerm : ?Text;
    tags : [Text];
    itemType : ?ArchiveTypes.ArchiveItemType;
    relatedMemberId : ?Text;
    era : ?Text;
  };

  /// Result of a research source upload: the created Source record plus the
  /// canonical Archive item it links to. The Archive item is created first
  /// (pending) and the Source record links to it via `archiveItemId`, so no
  /// manually typed Archive Item ID is required.
  public type SourceUploadResult = {
    source : ResearchIntakeTypes.SourceRecord;
    archiveItem : ArchiveTypes.ArchiveItem;
  };
};

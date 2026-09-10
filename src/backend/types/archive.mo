import Principal "mo:core/Principal";
import Storage "mo:caffeineai-object-storage/Storage";

module {
  /// Identifier of a single archive item.
  public type ArchiveItemId = Nat;

  /// The kind of material an archive item holds. Each variant maps to one of
  /// the "Add to Our History" contribution choices.
  public type ArchiveItemType = {
    #Photo;
    #Document;
    #Audio;
    #Video;
    #WrittenStoryNote;
    #Research;
    #WorkBusiness;
    #Other;
  };

  /// How well the item's content is backed by evidence. Small enumerated type.
  public type SourceStatus = {
    #Original;
    #Copy;
    #Transcribed;
    #Unverified;
  };

  /// Who may view the item. Small enumerated type.
  public type PrivacyLevel = {
    #Public;
    #FamilyOnly;
    #Private;
  };

  /// Lifecycle of a contributed item: it is submitted pending, then an admin
  /// either approves it (making it visible in the archive) or rejects it.
  public type ArchiveItemStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  /// Classification of an archive item, distinct from `itemType`. Oral History
  /// is a classification that applies to both oral-history video and audio-only
  /// oral history items, so it cannot be expressed as a single `itemType`.
  public type ArchiveItemClassification = {
    #Standard;
    #OralHistory;
  };

  /// A single primary speaker on an Oral History item. Links to a canonical
  /// Person record (`PersonId` = `Text`) when that person exists; otherwise
  /// carries a display name. Exactly one primary speaker is allowed for MVP.
  public type OralHistorySpeaker = {
    /// Link to the canonical Person record when that person exists.
    personId : ?Text;
    /// Display name of the speaker.
    name : Text;
  };

  /// A chapter marker on an Oral History item. Future-ready only — not
  /// populated by any logic yet.
  public type ChapterMarker = {
    title : Text;
    timestamp : Nat;
  };

  /// A single archive item. The original uploaded file's bytes live off-chain
  /// as an external reference; the canister stores the reference plus metadata.
  /// AI-generated summaries, transcripts, tags, and extracted names are kept in
  /// separate fields (reserved, not yet populated) so they never overwrite the
  /// original.
  public type ArchiveItem = {
    id : ArchiveItemId;
    title : Text;
    description : Text;
    itemType : ArchiveItemType;
    blob : Storage.ExternalBlob;
    /// Approximate era as free text (e.g. "early 1900s"), plus an optional year.
    era : Text;
    year : ?Nat;
    tags : [Text];
    contributor : Principal;
    /// Related family member ids (one or many). One item can link to many
    /// members without duplicating the file.
    relatedMemberIds : [Text];
    /// Optional related family branch id.
    relatedBranchId : ?Text;
    sourceStatus : SourceStatus;
    privacyLevel : PrivacyLevel;
    status : ArchiveItemStatus;
    createdAt : Int;
    /// Whether the item is classified as Oral History. Required to distinguish
    /// oral-history video and audio-only oral history from ordinary media.
    classification : ArchiveItemClassification;
    /// The single primary speaker. Required (non-null) when `classification` is
    /// `#OralHistory`; must be `null` otherwise.
    primarySpeaker : ?OralHistorySpeaker;
    /// Reserved future-ready fields. Not populated by any logic yet.
    transcript : ?Text;
    searchableTranscript : ?Text;
    chapterMarkers : ?[ChapterMarker];
    aiSummary : ?Text;
    extractedNames : ?[Text];
  };

  /// Flattened, OQL-exposable view of a single archive item. The raw blob bytes
  /// are excluded (they live off-chain as external references).
  public type ArchiveItemRow = {
    id : ArchiveItemId;
    title : Text;
    itemType : Text;
    era : Text;
    year : ?Nat;
    contributor : Principal;
    sourceStatus : Text;
    privacyLevel : Text;
    status : Text;
    createdAt : Int;
    classification : Text;
    primarySpeakerName : Text;
  };
};

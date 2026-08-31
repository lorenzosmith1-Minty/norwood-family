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

  /// A single archive item. The original uploaded file's bytes live off-chain
  /// as an external reference; the canister stores the reference plus metadata.
  /// AI-generated summaries, transcripts, tags, and extracted names are kept in
  /// separate fields (none yet) so they never overwrite the original.
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
  };
};

import List "mo:core/List";
import Principal "mo:core/Principal";
import Storage "mo:caffeineai-object-storage/Storage";

module {
  /// Identifier of a person in the family tree (e.g. "julia", "clayton").
  public type PersonId = Text;

  /// Identifier of a single uploaded photo within a person's gallery.
  public type PhotoId = Nat;

  /// A single uploaded photo. The file bytes live off-chain; the canister
  /// stores only the external reference plus display metadata.
  public type Photo = {
    id : PhotoId;
    blob : Storage.ExternalBlob;
    filename : Text;
    mimeType : Text;
    uploadedAt : Int;
    uploadedBy : Principal;
  };

  /// Internal per-person gallery state. `photos` is the ordered list of all
  /// uploaded photos; `profilePhotoId` points at the photo used as the
  /// portrait, or `null` when no profile photo is set (initials placeholder).
  public type PhotoGallery = {
    photos : List.List<Photo>;
    var profilePhotoId : ?PhotoId;
  };

  /// Flattened, OQL-exposable view of a single photo. The raw blob bytes are
  /// excluded (they live off-chain as external references); `key` is a
  /// globally-unique identifier (`<personId>:<id>`) because photo ids are only
  /// unique within a person's gallery.
  public type PhotoRow = {
    key : Text;
    personId : Text;
    id : PhotoId;
    filename : Text;
    mimeType : Text;
    uploadedAt : Int;
    uploadedBy : Principal;
    isProfilePhoto : Bool;
  };
};

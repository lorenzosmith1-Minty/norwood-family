import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Types "../types/object-storage";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";

/// Tenancy 1C-A family-scoped photo/gallery storage.
///
/// Galleries are keyed by the family-qualified person key
/// (`familyId::personId`) so an identically keyed person in another family can
/// never collide. The single exception is the default family: its galleries
/// keep the legacy bare `personId` key so existing Norwood data (and the
/// governance paths that still read that key) stay migration-compatible. A bare
/// `personId` is never assumed globally unique.
///
/// The legacy single-family signatures are retained only as TEMPORARY Tenancy
/// 1C compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
module {
  /// The storage key for a person's gallery in `familyId`. The default family
  /// keeps the legacy bare `personId` key so pre-tenancy Norwood galleries are
  /// read and written in place; every other family uses the canonical
  /// family-qualified key from Tenancy 1A.
  func galleryKey(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : Text {
    if (familyId == FamilyTypes.DEFAULT_FAMILY_ID) {
      personId;
    } else {
      TenancyLib.personKey(familyId, personId);
    };
  };

  /// Returns the stored gallery for a person in `familyId`, or `null` when the
  /// person has no gallery in that family.
  func getGallery(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : ?Types.PhotoGallery {
    galleries.get(galleryKey(familyId, personId));
  };

  /// Returns the stored gallery for a person in `familyId`, creating an empty
  /// one when absent.
  func getOrCreateGallery(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : Types.PhotoGallery {
    let key = galleryKey(familyId, personId);
    switch (galleries.get(key)) {
      case (?gallery) { gallery };
      case null {
        let gallery : Types.PhotoGallery = { photos = List.empty(); var profilePhotoId = null };
        galleries.add(key, gallery);
        gallery;
      };
    };
  };

  /// Returns all uploaded photos for a person in `familyId`, in upload order.
  public func listPhotosForFamily(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : [Types.Photo] {
    switch (getGallery(galleries, familyId, personId)) {
      case (?gallery) { gallery.photos.toArray() };
      case null { [] };
    };
  };

  /// Appends a photo to a person's gallery in `familyId` and returns the stored
  /// photo. When the gallery has no profile photo yet, the newly added photo is
  /// automatically set as the profile photo.
  public func addPhotoForFamily(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    photo : Types.Photo,
  ) : Types.Photo {
    let gallery = getOrCreateGallery(galleries, familyId, personId);
    gallery.photos.add(photo);
    if (gallery.profilePhotoId == null) {
      gallery.profilePhotoId := ?photo.id;
    };
    photo;
  };

  /// Marks the photo with `photoId` as the person's profile photo in `familyId`.
  /// Returns the newly selected photo, or `null` when the photo does not exist
  /// in that family's gallery.
  public func setProfilePhotoForFamily(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : ?Types.Photo {
    switch (getGallery(galleries, familyId, personId)) {
      case (?gallery) {
        switch (gallery.photos.find(func p = p.id == photoId)) {
          case (?photo) {
            gallery.profilePhotoId := ?photoId;
            ?photo;
          };
          case null { null };
        };
      };
      case null { null };
    };
  };

  /// Returns the person's current profile photo in `familyId`, or `null` when
  /// none is set. The lookup confirms the profile belongs to the requested
  /// family.
  public func getProfilePhotoForFamily(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : ?Types.Photo {
    switch (getGallery(galleries, familyId, personId)) {
      case (?gallery) {
        switch (gallery.profilePhotoId) {
          case (?photoId) { gallery.photos.find(func p = p.id == photoId) };
          case null { null };
        };
      };
      case null { null };
    };
  };

  /// Removes a photo from a person's gallery in `familyId`. Returns `true` when
  /// a photo was removed. If the removed photo was the profile photo, the
  /// profile photo is cleared.
  public func removePhotoForFamily(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : Bool {
    switch (getGallery(galleries, familyId, personId)) {
      case (?gallery) {
        var removed = false;
        let snapshot = gallery.photos.toArray();
        gallery.photos.clear();
        for (photo in snapshot.values()) {
          if (photo.id == photoId) {
            removed := true;
          } else {
            gallery.photos.add(photo);
          };
        };
        if (removed) {
          switch (gallery.profilePhotoId) {
            case (?current) { if (current == photoId) { gallery.profilePhotoId := null } };
            case null {};
          };
        };
        removed;
      };
      case null { false };
    };
  };

  /// Splits a gallery storage key into its `(familyId, personId)` parts. The
  /// default family's legacy bare key carries no family prefix, so it resolves
  /// to `DEFAULT_FAMILY_ID`.
  func splitGalleryKey(key : Text) : (FamilyTypes.FamilyId, Types.PersonId) {
    let parts = key.split(#text "::").toArray();
    if (parts.size() == 2) {
      (parts[0], parts[1]);
    } else {
      (FamilyTypes.DEFAULT_FAMILY_ID, key);
    };
  };

  /// Flattens every gallery into OQL-exposable photo rows. Each row carries the
  /// photo's display metadata plus a globally-unique `key`
  /// (`familyId::personId:id`) and whether it is the person's current profile
  /// photo.
  public func photoRows(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
  ) : Iter.Iter<Types.PhotoRow> {
    let rows = List.empty<Types.PhotoRow>();
    for ((storageKey, gallery) in galleries.entries()) {
      let (familyId, personId) = splitGalleryKey(storageKey);
      for (photo in gallery.photos.values()) {
        rows.add({
          key = familyId # "::" # personId # ":" # photo.id.toText();
          personId;
          id = photo.id;
          filename = photo.filename;
          mimeType = photo.mimeType;
          uploadedAt = photo.uploadedAt;
          uploadedBy = photo.uploadedBy;
          isProfilePhoto = gallery.profilePhotoId == ?photo.id;
        });
      };
    };
    rows.values();
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once every caller passes an explicit
  // familyId.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listPhotosForFamily`.
  public func listPhotos(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
  ) : [Types.Photo] {
    listPhotosForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `addPhotoForFamily`.
  public func addPhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
    photo : Types.Photo,
  ) : Types.Photo {
    addPhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId, photo);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `setProfilePhotoForFamily`.
  public func setProfilePhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : ?Types.Photo {
    setProfilePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId, photoId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getProfilePhotoForFamily`.
  public func getProfilePhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
  ) : ?Types.Photo {
    getProfilePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `removePhotoForFamily`.
  public func removePhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : Bool {
    removePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId, photoId);
  };
};

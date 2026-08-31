import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Types "../types/object-storage";

module {
  /// Returns all uploaded photos for a person, in upload order.
  public func listPhotos(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
  ) : [Types.Photo] {
    switch (galleries.get(personId)) {
      case (?gallery) { gallery.photos.toArray() };
      case null { [] };
    };
  };

  /// Appends a photo to a person's gallery and returns the stored photo. When
  /// the gallery has no profile photo yet, the newly added photo is
  /// automatically set as the profile photo so the completeness indicator
  /// updates immediately.
  public func addPhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
    photo : Types.Photo,
  ) : Types.Photo {
    switch (galleries.get(personId)) {
      case (?gallery) {
        gallery.photos.add(photo);
        if (gallery.profilePhotoId == null) {
          gallery.profilePhotoId := ?photo.id;
        };
      };
      case null {
        let gallery : Types.PhotoGallery = {
          photos = List.empty();
          var profilePhotoId = ?photo.id;
        };
        gallery.photos.add(photo);
        galleries.add(personId, gallery);
      };
    };
    photo;
  };

  /// Marks the photo with `photoId` as the person's profile photo. Returns
  /// the newly selected photo, or `null` when the photo does not exist.
  public func setProfilePhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : ?Types.Photo {
    switch (galleries.get(personId)) {
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

  /// Returns the person's current profile photo, or `null` when none is set.
  public func getProfilePhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
  ) : ?Types.Photo {
    switch (galleries.get(personId)) {
      case (?gallery) {
        switch (gallery.profilePhotoId) {
          case (?id) { gallery.photos.find(func p = p.id == id) };
          case null { null };
        };
      };
      case null { null };
    };
  };

  /// Removes a photo from a person's gallery. Returns `true` when a photo was
  /// removed. If the removed photo was the profile photo, the profile photo is
  /// cleared.
  public func removePhoto(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : Bool {
    switch (galleries.get(personId)) {
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
            case (?id) {
              if (id == photoId) { gallery.profilePhotoId := null };
            };
            case null {};
          };
        };
        removed;
      };
      case null { false };
    };
  };

  /// Flattens every gallery into OQL-exposable photo rows. Each row carries
  /// the photo's display metadata plus a globally-unique `key` (`personId:id`)
  /// and whether it is the person's current profile photo. The raw blob bytes
  /// are excluded — they live off-chain as external references.
  public func photoRows(
    galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
  ) : Iter.Iter<Types.PhotoRow> {
    let rows = List.empty<Types.PhotoRow>();
    for ((personId, gallery) in galleries.entries()) {
      for (photo in gallery.photos.toArray().values()) {
        rows.add({
          key = personId # ":" # photo.id.toText();
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
    rows.toArray().values();
  };
};

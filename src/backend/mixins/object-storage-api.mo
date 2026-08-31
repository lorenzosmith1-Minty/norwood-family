import Map "mo:core/Map";
import Storage "mo:caffeineai-object-storage/Storage";
import Time "mo:core/Time";
import Types "../types/object-storage";
import ObjectStorageLib "../lib/object-storage";

mixin (galleries : Map.Map<Types.PersonId, Types.PhotoGallery>) {
  /// Computes the next photo id for a person's gallery: one greater than the
  /// largest existing id, or `0` when the gallery is empty or absent.
  func nextPhotoId(personId : Types.PersonId) : Types.PhotoId {
    switch (galleries.get(personId)) {
      case (?gallery) {
        var maxId = 0;
        for (photo in gallery.photos.toArray().values()) {
          if (photo.id >= maxId) { maxId := photo.id + 1 };
        };
        maxId;
      };
      case null { 0 };
    };
  };

  /// Lists all uploaded photos for a person, in upload order.
  public query func listPhotos(personId : Types.PersonId) : async [Types.Photo] {
    ObjectStorageLib.listPhotos(galleries, personId);
  };

  /// Uploads a new photo to a person's gallery. The signed-in caller is
  /// recorded as the uploader. When the gallery has no profile photo yet, the
  /// newly added photo is automatically set as the profile photo. Returns the
  /// stored photo.
  public shared ({ caller }) func addPhoto(
    personId : Types.PersonId,
    filename : Text,
    mimeType : Text,
    blob : Storage.ExternalBlob,
  ) : async Types.Photo {
    let photo : Types.Photo = {
      id = nextPhotoId(personId);
      blob;
      filename;
      mimeType;
      uploadedAt = Time.now();
      uploadedBy = caller;
    };
    ObjectStorageLib.addPhoto(galleries, personId, photo);
  };

  /// Marks the photo with `photoId` as the person's profile photo. Returns the
  /// newly selected photo, or `null` when the photo does not exist.
  public shared ({ caller }) func setProfilePhoto(
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async ?Types.Photo {
    ignore caller;
    ObjectStorageLib.setProfilePhoto(galleries, personId, photoId);
  };

  /// Returns the person's current profile photo, or `null` when none is set.
  public query func getProfilePhoto(personId : Types.PersonId) : async ?Types.Photo {
    ObjectStorageLib.getProfilePhoto(galleries, personId);
  };

  /// Removes a photo from a person's gallery. Returns `true` when a photo was
  /// removed. If the removed photo was the profile photo, the profile photo is
  /// cleared.
  public shared ({ caller }) func removePhoto(
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async Bool {
    ignore caller;
    ObjectStorageLib.removePhoto(galleries, personId, photoId);
  };
};

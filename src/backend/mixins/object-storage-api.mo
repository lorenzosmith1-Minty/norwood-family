import List "mo:core/List";
import Map "mo:core/Map";
import Storage "mo:caffeineai-object-storage/Storage";
import Time "mo:core/Time";
import Types "../types/object-storage";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import ObjectStorageLib "../lib/object-storage";
import FamilyAuthorizationLib "../lib/family-authorization";
import InputValidation "../lib/input-validation";

mixin (
  galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
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

  /// Whether the person profile is unclaimed/historical. An unknown person is
  /// treated as unclaimed so its single portrait stays discoverable.
  func isUnclaimedProfile(personId : Types.PersonId) : Bool {
    switch (profiles.get(personId)) {
      case (?profile) {
        switch (profile.claimedByUserId) {
          case (?_) false;
          case null true;
        };
      };
      case null true;
    };
  };

  /// Lists all uploaded photos for a person, in upload order. Requires an
  /// approved family member or a Family Steward; the full gallery is never
  /// public.
  public shared query ({ caller }) func listPhotos(personId : Types.PersonId) : async [Types.Photo] {
    FamilyAuthorizationLib.requireGalleryReadAuthority(stewards, claims, caller);
    ObjectStorageLib.listPhotos(galleries, personId);
  };

  /// Uploads a new photo to a person's gallery. Requires the approved owner of
  /// that claimed profile or a Family Steward; the caller is recorded as the
  /// uploader. When the gallery has no profile photo yet, the newly added photo
  /// is automatically set as the profile photo. Returns the stored photo.
  public shared ({ caller }) func addPhoto(
    personId : Types.PersonId,
    filename : Text,
    mimeType : Text,
    blob : Storage.ExternalBlob,
  ) : async Types.Photo {
    FamilyAuthorizationLib.requirePhotoMutationAuthority(stewards, profiles, claims, caller, personId);
    InputValidation.requireUpload(#ProfileImage, mimeType, blob);
    let cleanFilename = InputValidation.requireFilename(filename);
    let photo : Types.Photo = {
      id = nextPhotoId(personId);
      blob;
      filename = cleanFilename;
      mimeType = InputValidation.normalizeMimeType(mimeType);
      uploadedAt = Time.now();
      uploadedBy = caller;
    };
    ObjectStorageLib.addPhoto(galleries, personId, photo);
  };

  /// Marks the photo with `photoId` as the person's profile photo. Requires the
  /// approved owner of that claimed profile or a Family Steward. Returns the
  /// newly selected photo, or `null` when the photo does not exist.
  public shared ({ caller }) func setProfilePhoto(
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async ?Types.Photo {
    FamilyAuthorizationLib.requirePhotoMutationAuthority(stewards, profiles, claims, caller, personId);
    ObjectStorageLib.setProfilePhoto(galleries, personId, photoId);
  };

  /// Returns the person's current profile photo, or `null` when none is set.
  /// The single designated portrait of an unclaimed/historical profile stays
  /// readable by guests so Add Myself / claim discovery works; for a claimed
  /// profile only an approved family member or Family Steward may read it.
  public shared query ({ caller }) func getProfilePhoto(personId : Types.PersonId) : async ?Types.Photo {
    if (not isUnclaimedProfile(personId)) {
      FamilyAuthorizationLib.requireGalleryReadAuthority(stewards, claims, caller);
    };
    ObjectStorageLib.getProfilePhoto(galleries, personId);
  };

  /// Removes a photo from a person's gallery. Requires the approved owner of
  /// that claimed profile or a Family Steward. Returns `true` when a photo was
  /// removed. If the removed photo was the profile photo, the profile photo is
  /// cleared.
  public shared ({ caller }) func removePhoto(
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async Bool {
    FamilyAuthorizationLib.requirePhotoMutationAuthority(stewards, profiles, claims, caller, personId);
    ObjectStorageLib.removePhoto(galleries, personId, photoId);
  };
};

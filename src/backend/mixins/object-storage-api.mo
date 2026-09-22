import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Storage "mo:caffeineai-object-storage/Storage";
import Types "../types/object-storage";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import ObjectStorageLib "../lib/object-storage";
import FamilyAuthorizationLib "../lib/family-authorization";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-A family-scoped photo / gallery public API.
///
/// Every endpoint takes the requested `familyId` explicitly. Gallery reads use
/// `requireGalleryReadAuthorityForFamily`; photo mutations use
/// `requirePhotoMutationAuthorityForFamily`. Portrait visibility is preserved:
/// a claimed profile's portrait is family-only, while an unclaimed/historical
/// profile's portrait stays public for claim discovery — and the public lookup
/// confirms the profile belongs to the requested family.
///
/// The legacy single-family endpoints are retained only as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  galleries : Map.Map<Types.PersonId, Types.PhotoGallery>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Computes the next photo id for a person's gallery in `familyId`: one
  /// greater than the largest existing id, or `0` when the gallery is empty or
  /// absent.
  func nextPhotoIdForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : Types.PhotoId {
    var next = 0;
    for (photo in ObjectStorageLib.listPhotosForFamily(galleries, familyId, personId).values()) {
      if (photo.id >= next) {
        next := photo.id + 1;
      };
    };
    next;
  };

  /// Whether the person profile in `familyId` is unclaimed/historical. An
  /// unknown person in that family is treated as unclaimed so its single
  /// portrait stays discoverable. A profile belonging to another family is
  /// never treated as unclaimed here.
  func isUnclaimedProfileForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : Bool {
    switch (profiles.get(personId)) {
      case (?profile) {
        if (profile.familyId != familyId) {
          return false;
        };
        switch (profile.claimedByUserId) {
          case (?_) false;
          case null true;
        };
      };
      case null { true };
    };
  };

  /// Validates the upload, assigns the next per-family photo id, and builds the
  /// stored photo record. Shared by the family-scoped endpoint and its
  /// temporary compatibility wrapper so the two never diverge.
  func buildPhotoForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    filename : Text,
    mimeType : Text,
    blob : Storage.ExternalBlob,
    caller : Principal,
  ) : Types.Photo {
    InputValidation.requireUpload(#ProfileImage, mimeType, blob);
    let cleanFilename = InputValidation.requireFilename(filename);
    {
      id = nextPhotoIdForFamily(familyId, personId);
      blob;
      filename = cleanFilename;
      mimeType = InputValidation.normalizeMimeType(mimeType);
      uploadedAt = Time.now();
      uploadedBy = caller;
    };
  };

  /// Lists all uploaded photos for a person in `familyId`, in upload order.
  /// Requires an approved member or active Steward of `familyId`; the full
  /// gallery is never public.
  public shared query ({ caller }) func listPhotosForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : async [Types.Photo] {
    FamilyAuthorizationLib.requireGalleryReadAuthorityForFamily(stewards, claims, caller, familyId);
    ObjectStorageLib.listPhotosForFamily(galleries, familyId, personId);
  };

  /// Uploads a new photo to a person's gallery in `familyId`. Requires the
  /// approved owner of that claimed profile or a Steward of `familyId`; the
  /// caller is recorded as the uploader.
  public shared ({ caller }) func addPhotoForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    filename : Text,
    mimeType : Text,
    blob : Storage.ExternalBlob,
  ) : async Types.Photo {
    FamilyAuthorizationLib.requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, familyId);
    let photo = buildPhotoForFamily(familyId, personId, filename, mimeType, blob, caller);
    ObjectStorageLib.addPhotoForFamily(galleries, familyId, personId, photo);
  };

  /// Marks the photo with `photoId` as the person's profile photo in `familyId`.
  /// Requires the approved owner of that claimed profile or a Steward of
  /// `familyId`.
  public shared ({ caller }) func setProfilePhotoForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async ?Types.Photo {
    FamilyAuthorizationLib.requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, familyId);
    ObjectStorageLib.setProfilePhotoForFamily(galleries, familyId, personId, photoId);
  };

  /// Returns the person's current profile photo in `familyId`, or `null` when
  /// none is set. The single designated portrait of an unclaimed/historical
  /// profile in `familyId` stays readable by guests so claim discovery works;
  /// for a claimed profile only an approved member or Steward of `familyId` may
  /// read it. The lookup confirms the profile belongs to `familyId`.
  public shared query ({ caller }) func getProfilePhotoForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : async ?Types.Photo {
    if (isUnclaimedProfileForFamily(familyId, personId)) {
      return ObjectStorageLib.getProfilePhotoForFamily(galleries, familyId, personId);
    };
    FamilyAuthorizationLib.requireGalleryReadAuthorityForFamily(stewards, claims, caller, familyId);
    ObjectStorageLib.getProfilePhotoForFamily(galleries, familyId, personId);
  };

  /// Removes a photo from a person's gallery in `familyId`. Requires the
  /// approved owner of that claimed profile or a Steward of `familyId`.
  public shared ({ caller }) func removePhotoForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async Bool {
    FamilyAuthorizationLib.requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, familyId);
    ObjectStorageLib.removePhotoForFamily(galleries, familyId, personId, photoId);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listPhotosForFamily`.
  public shared query ({ caller }) func listPhotos(personId : Types.PersonId) : async [Types.Photo] {
    FamilyAuthorizationLib.requireGalleryReadAuthorityForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ObjectStorageLib.listPhotosForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `addPhotoForFamily`.
  public shared ({ caller }) func addPhoto(
    personId : Types.PersonId,
    filename : Text,
    mimeType : Text,
    blob : Storage.ExternalBlob,
  ) : async Types.Photo {
    FamilyAuthorizationLib.requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, FamilyTypes.DEFAULT_FAMILY_ID);
    let photo = buildPhotoForFamily(FamilyTypes.DEFAULT_FAMILY_ID, personId, filename, mimeType, blob, caller);
    ObjectStorageLib.addPhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId, photo);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `setProfilePhotoForFamily`.
  public shared ({ caller }) func setProfilePhoto(
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async ?Types.Photo {
    FamilyAuthorizationLib.requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, FamilyTypes.DEFAULT_FAMILY_ID);
    ObjectStorageLib.setProfilePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId, photoId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getProfilePhotoForFamily`.
  public shared query ({ caller }) func getProfilePhoto(personId : Types.PersonId) : async ?Types.Photo {
    if (isUnclaimedProfileForFamily(FamilyTypes.DEFAULT_FAMILY_ID, personId)) {
      return ObjectStorageLib.getProfilePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId);
    };
    FamilyAuthorizationLib.requireGalleryReadAuthorityForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ObjectStorageLib.getProfilePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `removePhotoForFamily`.
  public shared ({ caller }) func removePhoto(
    personId : Types.PersonId,
    photoId : Types.PhotoId,
  ) : async Bool {
    FamilyAuthorizationLib.requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, FamilyTypes.DEFAULT_FAMILY_ID);
    ObjectStorageLib.removePhotoForFamily(galleries, FamilyTypes.DEFAULT_FAMILY_ID, personId, photoId);
  };
};

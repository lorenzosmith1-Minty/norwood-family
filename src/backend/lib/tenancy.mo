import Map "mo:core/Map";
import Types "../types/tenancy";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";

/// Tenancy 1C-A family-scope helpers.
///
/// These are the canonical family-scope predicates and lookups used by the
/// profile / claim / relationship domain logic. They re-export the Tenancy 1A
/// `familyPersonKey` helper rather than reimplementing the key format, so
/// existing Norwood data keyed by bare `personId` stays migration-compatible.
module {
  /// Builds the family-qualified storage key for a person id:
  /// `familyId + "::" + personId`. Re-exports the Tenancy 1A helper.
  public func personKey(familyId : Types.FamilyId, personId : OwnershipTypes.PersonId) : Types.FamilyPersonKey {
    FamilyTypes.familyPersonKey(familyId, personId);
  };

  /// Whether a profile belongs to `familyId`. A profile carrying a different
  /// family id is never treated as belonging to the requested family.
  public func profileBelongsToFamily(
    profile : OwnershipTypes.PersonProfile,
    familyId : Types.FamilyId,
  ) : Bool {
    profile.familyId == familyId;
  };

  /// Whether a claim belongs to `familyId`. A claim belongs to exactly one
  /// family; a claim in another family is never treated as belonging here.
  public func claimBelongsToFamily(
    claim : OwnershipTypes.ProfileClaim,
    familyId : Types.FamilyId,
  ) : Bool {
    claim.familyId == familyId;
  };

  /// The storage key for a person's profile in `familyId`. The default family
  /// keeps the legacy bare `personId` key so pre-tenancy Norwood profiles are
  /// read and written in place; every other family uses the canonical
  /// family-qualified key. A bare `personId` is never assumed globally unique.
  public func profileKey(familyId : Types.FamilyId, personId : OwnershipTypes.PersonId) : Text {
    if (familyId == FamilyTypes.DEFAULT_FAMILY_ID) {
      personId;
    } else {
      personKey(familyId, personId);
    };
  };

  /// Returns the profile for `personId` only when it belongs to `familyId`.
  /// A personId in Family A never returns a profile from Family B.
  public func getProfileForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : Types.FamilyId,
    personId : OwnershipTypes.PersonId,
  ) : ?OwnershipTypes.PersonProfile {
    switch (profiles.get(profileKey(familyId, personId))) {
      case (?profile) {
        if (profileBelongsToFamily(profile, familyId)) { ?profile } else { null };
      };
      case null { null };
    };
  };

  /// Stores `profile` under its family-qualified key. The default family keeps
  /// the legacy bare `personId` key so existing Norwood data is updated in
  /// place; every other family writes under the family-qualified key, so an
  /// identically keyed person in another family can never be overwritten.
  public func putProfileForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : Types.FamilyId,
    profile : OwnershipTypes.PersonProfile,
  ) {
    profiles.add(profileKey(familyId, profile.personId), profile);
  };

  /// Removes the profile for `personId` in `familyId` from storage.
  public func removeProfileForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : Types.FamilyId,
    personId : OwnershipTypes.PersonId,
  ) {
    profiles.remove(profileKey(familyId, personId));
  };
};

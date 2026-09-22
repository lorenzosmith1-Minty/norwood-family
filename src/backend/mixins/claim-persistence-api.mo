import List "mo:core/List";
import Map "mo:core/Map";
import Types "../types/claim-persistence";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import ClaimPersistenceLib "../lib/claim-persistence";

/// Tenancy 1C-A family-scoped claim-persistence reads. Duplicate-owner
/// protection applies within the same family only. The legacy single-family
/// endpoints are retained only as TEMPORARY Tenancy 1C compatibility wrappers
/// delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
) {
  /// Whether a profile in `familyId` already has an approved owner. Approved
  /// ownership is authoritative within that family only.
  public query func hasApprovedOwnerForFamily(familyId : FamilyTypes.FamilyId, personId : OwnershipTypes.PersonId) : async Bool {
    ClaimPersistenceLib.hasApprovedOwnerForFamily(profiles, familyId, personId);
  };

  /// Whether the caller may claim a profile in `familyId`, enforcing approved
  /// ownership authority and the no-duplicate-claims rule within that family.
  public query ({ caller }) func canClaimProfileForFamily(familyId : FamilyTypes.FamilyId, personId : OwnershipTypes.PersonId) : async Types.ClaimEligibility {
    ClaimPersistenceLib.checkClaimEligibilityForFamily(profiles, claims, familyId, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `hasApprovedOwnerForFamily`.
  public query func hasApprovedOwner(personId : OwnershipTypes.PersonId) : async Bool {
    ClaimPersistenceLib.hasApprovedOwnerForFamily(profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `canClaimProfileForFamily`.
  public query ({ caller }) func canClaimProfile(personId : OwnershipTypes.PersonId) : async Types.ClaimEligibility {
    ClaimPersistenceLib.checkClaimEligibilityForFamily(profiles, claims, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };
};

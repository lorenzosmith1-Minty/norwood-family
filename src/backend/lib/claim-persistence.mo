import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types/claim-persistence";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";

/// Tenancy 1C-A family-scoped claim-persistence checks. Duplicate-owner
/// protection applies within the same family only: approved ownership in
/// Family A never blocks an independent claim in Family B. The legacy
/// single-family signatures are retained only as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
module {
  /// Whether a profile in `familyId` already has an approved owner. Approved
  /// ownership is authoritative within that family only.
  public func hasApprovedOwnerForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : OwnershipTypes.PersonId,
  ) : Bool {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case (?profile) {
        switch (profile.claimedByUserId) {
          case (?_) { true };
          case null { false };
        };
      };
      case null { false };
    };
  };

  /// Whether the caller already owns the profile in `familyId` or has a pending
  /// claim on it in that family. A claim in another family is not considered.
  public func hasActiveClaimForFamily(
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
    personId : OwnershipTypes.PersonId,
    caller : Principal.Principal,
  ) : Bool {
    claims.toArray().any(func c =
      c.familyId == familyId and c.personId == personId and c.requestingUserId == caller
    );
  };

  /// Checks whether a caller may claim a profile in `familyId`, enforcing
  /// approved ownership authority and the no-duplicate-claims rule within that
  /// family. Returns an eligibility result the caller can act on.
  public func checkClaimEligibilityForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
    personId : OwnershipTypes.PersonId,
    caller : Principal.Principal,
  ) : Types.ClaimEligibility {
    if (caller.isAnonymous()) {
      return { eligible = false; reason = ?#NotSignedIn };
    };
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null {
        return { eligible = false; reason = ?#ProfileNotFound };
      };
      case (?_) {};
    };
    if (hasApprovedOwnerForFamily(profiles, familyId, personId)) {
      return { eligible = false; reason = ?#ApprovedOwnerExists };
    };
    if (hasActiveClaimForFamily(claims, familyId, personId, caller)) {
      return { eligible = false; reason = ?#AlreadyPending };
    };
    { eligible = true; reason = null };
  };

  /// Whether the caller already owns a profile in `familyId` (approved claim)
  /// or has a pending claim in that family. Ownership in another family does
  /// not count.
  public func callerHasActiveOwnershipForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal.Principal,
  ) : Bool {
    let ownsProfile = profiles.entries().any(func ((_, profile)) =
      profile.familyId == familyId and profile.claimedByUserId == ?caller
    );
    if (ownsProfile) {
      return true;
    };
    claims.toArray().any(func c =
      c.familyId == familyId and c.requestingUserId == caller
    );
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `hasApprovedOwnerForFamily`.
  public func hasApprovedOwner(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    personId : OwnershipTypes.PersonId,
  ) : Bool {
    hasApprovedOwnerForFamily(profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `hasActiveClaimForFamily`.
  public func hasActiveClaim(
    claims : List.List<OwnershipTypes.ProfileClaim>,
    personId : OwnershipTypes.PersonId,
    caller : Principal.Principal,
  ) : Bool {
    hasActiveClaimForFamily(claims, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `checkClaimEligibilityForFamily`.
  public func checkClaimEligibility(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    personId : OwnershipTypes.PersonId,
    caller : Principal.Principal,
  ) : Types.ClaimEligibility {
    checkClaimEligibilityForFamily(profiles, claims, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `callerHasActiveOwnershipForFamily`.
  public func callerHasActiveOwnership(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal.Principal,
  ) : Bool {
    callerHasActiveOwnershipForFamily(profiles, claims, FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };
};

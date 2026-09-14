import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types/claim-persistence";
import OwnershipTypes "../types/ownership";

module {
  /// Whether a profile already has an approved owner. Approved ownership is
  /// authoritative: once a profile claim is approved, the approved owner is the
  /// canonical owner and no other claim or Add Myself flow can override or
  /// duplicate it.
  public func hasApprovedOwner(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    personId : OwnershipTypes.PersonId,
  ) : Bool {
    switch (profiles.get(personId)) {
      case (?profile) profile.claimStatus == #Claimed and profile.claimedByUserId != null;
      case null false;
    };
  };

  /// Whether the caller already owns the profile or has a pending claim on it.
  /// A user cannot submit a second claim for a profile they already own or have
  /// a pending claim on.
  public func hasActiveClaim(
    claims : List.List<OwnershipTypes.ProfileClaim>,
    personId : OwnershipTypes.PersonId,
    caller : Principal.Principal,
  ) : Bool {
    claims.toArray().any(func c = c.personId == personId and c.requestingUserId == caller and c.status == #Pending);
  };

  /// Checks whether a caller may claim a profile, enforcing approved ownership
  /// authority and the no-duplicate-claims rule. Returns an eligibility result
  /// the caller can act on.
  public func checkClaimEligibility(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    personId : OwnershipTypes.PersonId,
    caller : Principal.Principal,
  ) : Types.ClaimEligibility {
    if (caller.isAnonymous()) {
      return { eligible = false; reason = ?#NotSignedIn };
    };
    switch (profiles.get(personId)) {
      case null { { eligible = false; reason = ?#ProfileNotFound } };
      case (?profile) {
        if (hasApprovedOwner(profiles, personId)) {
          if (profile.claimedByUserId == ?caller) {
            { eligible = false; reason = ?#AlreadyOwned };
          } else {
            { eligible = false; reason = ?#ApprovedOwnerExists };
          };
        } else if (hasActiveClaim(claims, personId, caller)) {
          { eligible = false; reason = ?#AlreadyPending };
        } else {
          { eligible = true; reason = null };
        };
      };
    };
  };

  /// Whether the caller already owns a profile (approved claim) or has a pending
  /// claim on one. Used to prevent `createMyself` from creating a duplicate when
  /// the caller already has an active ownership path.
  public func callerHasActiveOwnership(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal.Principal,
  ) : Bool {
    var owns = false;
    for ((_, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?caller) { owns := true };
    };
    owns or claims.toArray().any(func c = c.requestingUserId == caller and c.status == #Pending);
  };
};

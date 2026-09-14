import List "mo:core/List";
import Map "mo:core/Map";
import Types "../types/claim-persistence";
import OwnershipTypes "../types/ownership";
import ClaimPersistenceLib "../lib/claim-persistence";

mixin (
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
) {
  /// Whether a profile already has an approved owner. Approved ownership is
  /// authoritative: once a profile claim is approved, the approved owner is the
  /// canonical owner and no other claim or Add Myself flow can override or
  /// duplicate it. Read-only view over the same authoritative state the
  /// ownership flow enforces.
  public query func hasApprovedOwner(personId : OwnershipTypes.PersonId) : async Bool {
    ClaimPersistenceLib.hasApprovedOwner(profiles, personId);
  };

  /// Whether the caller may claim a profile, enforcing approved ownership
  /// authority and the no-duplicate-claims rule. Returns an eligibility result
  /// the caller can act on. Read-only view over the same authoritative state
  /// the ownership flow enforces.
  public query ({ caller }) func canClaimProfile(personId : OwnershipTypes.PersonId) : async Types.ClaimEligibility {
    ClaimPersistenceLib.checkClaimEligibility(profiles, claims, personId, caller);
  };
};

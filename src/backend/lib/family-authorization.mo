import AccessControl "mo:caffeineai-authorization/access-control";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import OwnershipTypes "../types/ownership";

/// Shared approved-family authorization for family-content contribution
/// endpoints. A caller is an approved family member when they are a Family
/// Steward/admin, or when they hold at least one `#Approved` profile claim.
module {
  /// Whether the caller is an approved family member: they are an admin, or
  /// they hold at least one approved profile claim.
  public func isApprovedFamilyMember(
    accessControlState : AccessControl.AccessControlState,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) : Bool {
    if (AccessControl.isAdmin(accessControlState, caller)) {
      return true;
    };
    claims.toArray().any(func c = c.requestingUserId == caller and c.status == #Approved);
  };

  /// Traps unless the caller is an approved family member. Anonymous callers
  /// and signed-in but unapproved callers are both denied.
  public func requireApprovedFamilyMember(
    accessControlState : AccessControl.AccessControlState,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not isApprovedFamilyMember(accessControlState, claims, caller)) {
      Runtime.trap("Unauthorized: Only approved family members can contribute family content");
    };
  };
};

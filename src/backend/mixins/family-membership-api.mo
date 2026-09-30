import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import MembershipTypes "../types/family-membership";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyMembershipLib "../lib/family-membership";
import StewardAuthorityLib "../lib/steward-authority";
import FamilyAuthorizationLib "../lib/family-authorization";

/// Public FamilyMembership API: the canonical account-to-family membership
/// layer. Every endpoint is family-scoped and evaluates authority against the
/// requested `familyId`; a membership in one family never grants access in
/// another.
///
/// Membership is not public directory data. Every read is gated on the caller
/// being the target account or an active Steward of the requested family, and
/// denials are uniform and non-leaking: a caller who is neither the target
/// account nor a Steward of the family receives the same denial whether or not
/// the target account belongs to another family.
///
/// Activation is never self-service: `activateMembershipForFamily` requires an
/// authorized family approval path (Steward authority for now) and records the
/// real authenticated caller as `approvedBy`.
mixin (
  memberships : List.List<MembershipTypes.FamilyMembership>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Returns the account's membership in `familyId` only, or `null` when the
  /// account has no membership in that family. Allowed only when `accountId`
  /// equals the caller, or the caller is an active Steward of `familyId`;
  /// otherwise `#err(#NotAuthorized)` (anonymous callers get
  /// `#err(#NotSignedIn)`). The denial is identical whether or not the target
  /// account belongs to another family.
  public query ({ caller }) func getMembershipForFamily(
    familyId : MembershipTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
  ) : async Result.Result<?MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (accountId != caller and not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    #ok(FamilyMembershipLib.getMembershipForFamily(memberships, familyId, accountId));
  };

  /// Returns the signed-in caller's own membership in `familyId`, or `null`
  /// when the caller has no membership in that family. Anonymous callers are
  /// denied with `#err(#NotSignedIn)`.
  public query ({ caller }) func getMyMembershipForFamily(
    familyId : MembershipTypes.FamilyId,
  ) : async Result.Result<?MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(FamilyMembershipLib.getMyMembershipForFamily(memberships, familyId, caller));
  };

  /// Returns every membership held by `accountId` across all families. Allowed
  /// for self only; anonymous callers get `#err(#NotSignedIn)` and any other
  /// account gets `#err(#NotAuthorized)`. Unrestricted cross-account reads stay
  /// internal to library code and are never exposed as a public endpoint.
  public query ({ caller }) func listMembershipsForAccount(
    accountId : MembershipTypes.AccountId,
  ) : async Result.Result<[MembershipTypes.FamilyMembership], MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (accountId != caller) {
      return #err(#NotAuthorized);
    };
    #ok(FamilyMembershipLib.listMembershipsForAccount(memberships, accountId));
  };

  /// Returns the memberships of one family only. Requires an approved active
  /// family member or an active Steward of `familyId`; anonymous callers get
  /// `#err(#NotSignedIn)` and non-members get `#err(#NotAuthorized)`.
  public query ({ caller }) func listFamilyMembersForFamily(
    familyId : MembershipTypes.FamilyId,
  ) : async Result.Result<[MembershipTypes.FamilyMembership], MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    #ok(FamilyMembershipLib.listFamilyMembersForFamily(memberships, familyId));
  };

  /// Whether `accountId` holds an `#Active` membership in `familyId`. Retained
  /// public for compatibility but restricted to self or an active Steward of
  /// `familyId`; anonymous callers get `#err(#NotSignedIn)` and any other
  /// caller gets `#err(#NotAuthorized)`.
  public query ({ caller }) func hasActiveMembershipForFamily(
    familyId : MembershipTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
  ) : async Result.Result<Bool, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (accountId != caller and not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    #ok(FamilyMembershipLib.hasActiveMembershipForFamily(memberships, familyId, accountId));
  };

  /// Creates a `#Pending` membership for `accountId` linked to `personId` in
  /// `familyId`. Requires an authorized family approval path (Steward authority
  /// for now). Rejects a `personId` that does not belong to `familyId`.
  public shared ({ caller }) func createPendingMembershipForFamily(
    familyId : MembershipTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
    personId : MembershipTypes.PersonId,
  ) : async Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    FamilyMembershipLib.createPendingMembershipForFamily(memberships, profiles, claims, familyId, accountId, personId);
  };

  /// Activates a `#Pending` membership in `familyId` through the authorized
  /// family approval path. Steward of `familyId` only; there is no unrestricted
  /// self-promotion to `#Active`. The persisted `approvedBy` is always the real
  /// authenticated caller (the approving Steward) and `approvedAt` is the
  /// current time; no caller-supplied approver identity is trusted.
  public shared ({ caller }) func activateMembershipForFamily(
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
  ) : async Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    FamilyMembershipLib.activateMembershipForFamily(memberships, familyId, membershipId, caller);
  };

  /// Sets an `#Active` membership in `familyId` to `#Left`. The caller may
  /// leave their own membership; a Steward of `familyId` may also record a
  /// leave for a member of that family.
  public shared ({ caller }) func leaveFamilyMembership(
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
  ) : async Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let membership = switch (FamilyMembershipLib.getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    if (membership.accountId != caller and not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    FamilyMembershipLib.leaveFamilyMembership(memberships, familyId, membershipId);
  };

  /// Sets an `#Active` membership in `familyId` to `#Suspended`. Steward of
  /// `familyId` only.
  public shared ({ caller }) func suspendMembershipForFamily(
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
  ) : async Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    FamilyMembershipLib.suspendMembershipForFamily(memberships, familyId, membershipId);
  };
};

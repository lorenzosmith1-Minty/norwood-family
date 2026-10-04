import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import MembershipTypes "../types/family-membership";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyAuthorizationLib "family-authorization";

/// Canonical FamilyMembership domain logic: account-to-family membership state
/// kept separate from Account, PersonProfile, ProfileClaim, and StewardRecord.
///
/// Every lookup is family-scoped: a membership in Family A never implies
/// membership in Family B, and an `accountId` alone is never treated as global
/// family membership.
///
/// The `*ForFamily` functions below are the unrestricted, internal read
/// primitives. They are library-only and MUST NOT be exposed as public
/// endpoints: the public mixin wraps them with the caller-authorization gate.
module {
  /// INTERNAL (library-only, never a public endpoint). Returns the account's
  /// membership in `familyId` only, or `null` when the account has no
  /// membership in that family. A membership in another family is never
  /// returned.
  public func getMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
  ) : ?MembershipTypes.FamilyMembership {
    memberships.find(func m = m.familyId == familyId and m.accountId == accountId);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns the caller's
  /// membership in `familyId`, or `null` when the caller has no membership in
  /// that family.
  public func getMyMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    caller : Principal,
  ) : ?MembershipTypes.FamilyMembership {
    getMembershipForFamily(memberships, familyId, caller);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns every membership
  /// held by `accountId` across all families. An account may hold memberships
  /// in multiple families.
  public func listMembershipsForAccount(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    accountId : MembershipTypes.AccountId,
  ) : [MembershipTypes.FamilyMembership] {
    memberships.toArray().filter(func m = m.accountId == accountId);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns the memberships
  /// of one family only. Memberships from other families are never included.
  public func listFamilyMembersForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
  ) : [MembershipTypes.FamilyMembership] {
    memberships.toArray().filter(func m = m.familyId == familyId);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns the membership
  /// with `membershipId` only when it belongs to `familyId`; a membership id
  /// from another family never resolves here.
  public func getMembershipByIdForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
  ) : ?MembershipTypes.FamilyMembership {
    memberships.find(func m = m.familyId == familyId and m.id == membershipId);
  };

  /// INTERNAL (library-only, never a public endpoint). Whether `accountId`
  /// holds an `#Active` membership in `familyId`. Returns `false` for
  /// `#Pending`, `#Suspended`, and `#Left` memberships, and for a membership in
  /// another family.
  public func hasActiveMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
  ) : Bool {
    memberships.toArray().any(func m =
      m.familyId == familyId and m.accountId == accountId and m.status == #Active
    );
  };

  /// Creates a `#Pending` membership for `accountId` linked to `personId` in
  /// `familyId`. Rejects a `personId` that does not belong to `familyId`, a
  /// duplicate membership for the same account in the same family, and a
  /// person profile already owned by another active membership in that family.
  public func createPendingMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : MembershipTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
    personId : MembershipTypes.PersonId,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    if (not personBelongsToFamily(profiles, claims, personId, familyId)) {
      return #err(#PersonNotInFamily);
    };
    if (getMembershipForFamily(memberships, familyId, accountId) != null) {
      return #err(#AlreadyMember);
    };
    if (hasActiveOwnerForPersonInFamily(memberships, familyId, personId)) {
      return #err(#ProfileAlreadyOwned);
    };
    let now = Time.now();
    let membership : MembershipTypes.FamilyMembership = {
      id = nextMembershipId(memberships);
      familyId;
      accountId;
      personId;
      status = #Pending;
      joinedAt = null;
      approvedBy = null;
      approvedAt = null;
      createdAt = now;
      updatedAt = now;
    };
    memberships.add(membership);
    #ok(membership);
  };

  /// Activates a `#Pending` membership in `familyId`. `approvedBy` is the real
  /// authenticated approver (the Steward who performed the approval), never a
  /// caller-supplied identity. Rejects a membership that does not belong to
  /// `familyId`, a non-`#Pending` status, and a person profile already owned by
  /// another `#Active` membership in the same family.
  public func activateMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
    approvedBy : Principal,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    let membership = switch (getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    if (membership.status != #Pending) {
      return #err(#InvalidTransition);
    };
    if (hasActiveOwnerForPersonInFamily(memberships, familyId, membership.personId)) {
      return #err(#ProfileAlreadyOwned);
    };
    let now = Time.now();
    let updated : MembershipTypes.FamilyMembership = {
      id = membership.id;
      familyId = membership.familyId;
      accountId = membership.accountId;
      personId = membership.personId;
      status = #Active;
      joinedAt = ?now;
      approvedBy = ?approvedBy;
      approvedAt = ?now;
      createdAt = membership.createdAt;
      updatedAt = now;
    };
    replaceMembership(memberships, updated);
    #ok(updated);
  };

  /// Sets an `#Active` membership in `familyId` to `#Left`. Rejects a
  /// membership that does not belong to `familyId` or is not `#Active`.
  public func leaveFamilyMembership(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    transitionActiveMembership(memberships, familyId, membershipId, #Left);
  };

  /// Sets an `#Active` membership in `familyId` to `#Suspended`. Rejects a
  /// membership that does not belong to `familyId` or is not `#Active`.
  public func suspendMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    transitionActiveMembership(memberships, familyId, membershipId, #Suspended);
  };

  /// INTERNAL (library-only, never a public endpoint). Restores a `#Suspended`
  /// membership in `familyId` back to `#Active`. This is the narrow
  /// reactivation path used ONLY by the MembershipConfirmation domain when a
  /// Steward approves a case whose membership was suspended by that same
  /// confirmation dispute. It is deliberately not a general reactivation: it
  /// rejects a membership that does not belong to `familyId`, is not
  /// `#Suspended`, or whose person profile is already owned by another
  /// `#Active` membership in the same family. `approvedBy` is the real
  /// authenticated approver.
  ///
  /// This helper checks only the membership status; the CALLER
  /// (`resolveConfirmationForFamily`) is responsible for confirming that the
  /// suspension is attributable to the confirmation case being resolved (the
  /// case is open at `#StewardReviewRequired` or `#RejectedByRelative` with a
  /// recorded `#Disputed` decision and no prior Steward resolution). Do not call
  /// it for a suspension that did not originate from that confirmation dispute.
  public func restoreConfirmationSuspendedMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
    approvedBy : Principal,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    let membership = switch (getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    if (membership.status != #Suspended) {
      return #err(#InvalidTransition);
    };
    if (hasActiveOwnerForPersonInFamily(memberships, familyId, membership.personId)) {
      return #err(#ProfileAlreadyOwned);
    };
    let now = Time.now();
    let updated : MembershipTypes.FamilyMembership = {
      id = membership.id;
      familyId = membership.familyId;
      accountId = membership.accountId;
      personId = membership.personId;
      status = #Active;
      joinedAt = ?(membership.joinedAt ?? now);
      approvedBy = ?approvedBy;
      approvedAt = ?now;
      createdAt = membership.createdAt;
      updatedAt = now;
    };
    replaceMembership(memberships, updated);
    #ok(updated);
  };

  /// Whether `personId` belongs to `familyId`, using the canonical family
  /// person predicate. Used to enforce the membership invariant that a
  /// membership's `personId` must belong to its `familyId`.
  public func personBelongsToFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    personId : OwnershipTypes.PersonId,
    familyId : MembershipTypes.FamilyId,
  ) : Bool {
    FamilyAuthorizationLib.isPersonInFamily(profiles, claims, personId, familyId);
  };

  /// Whether an `#Active` membership in `familyId` already owns `personId`.
  /// Enforces the invariant that at most one active membership may own a given
  /// person profile within a family.
  public func hasActiveOwnerForPersonInFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    personId : MembershipTypes.PersonId,
  ) : Bool {
    memberships.toArray().any(func m =
      m.familyId == familyId and m.personId == personId and m.status == #Active
    );
  };

  /// Builds the OQL-exposable rows for every membership.
  public func membershipRows(
    memberships : List.List<MembershipTypes.FamilyMembership>,
  ) : [MembershipTypes.MembershipRow] {
    memberships.toArray().map(func m = {
      familyId = m.familyId;
      id = m.id;
      accountId = m.accountId.toText();
      personId = m.personId;
      status = statusText(m.status);
      joinedAt = m.joinedAt ?? 0;
      approvedBy = switch (m.approvedBy) { case (?p) p.toText(); case null "" };
      approvedAt = m.approvedAt ?? 0;
      createdAt = m.createdAt;
      updatedAt = m.updatedAt;
    });
  };

  /// Computes the next membership id: one greater than the largest existing id,
  /// or `0` when there are no memberships.
  func nextMembershipId(memberships : List.List<MembershipTypes.FamilyMembership>) : Nat {
    var maxId = 0;
    for (m in memberships.toArray().values()) {
      if (m.id >= maxId) { maxId := m.id + 1 };
    };
    maxId;
  };

  /// Replaces the stored membership with the same id, preserving list order.
  func replaceMembership(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    updated : MembershipTypes.FamilyMembership,
  ) {
    let snapshot = memberships.toArray();
    memberships.clear();
    for (m in snapshot.values()) {
      if (m.id == updated.id) {
        memberships.add(updated);
      } else {
        memberships.add(m);
      };
    };
  };

  /// Shared `#Active` -> target transition used by leave and suspend. Rejects a
  /// membership that does not belong to `familyId` or is not `#Active`.
  func transitionActiveMembership(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : MembershipTypes.FamilyId,
    membershipId : Nat,
    target : MembershipTypes.MembershipStatus,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    let membership = switch (getMembershipByIdForFamily(memberships, familyId, membershipId)) {
      case (?m) m;
      case null { return #err(#MembershipNotFound) };
    };
    if (membership.status != #Active) {
      return #err(#InvalidTransition);
    };
    let updated : MembershipTypes.FamilyMembership = {
      id = membership.id;
      familyId = membership.familyId;
      accountId = membership.accountId;
      personId = membership.personId;
      status = target;
      joinedAt = membership.joinedAt;
      approvedBy = membership.approvedBy;
      approvedAt = membership.approvedAt;
      createdAt = membership.createdAt;
      updatedAt = Time.now();
    };
    replaceMembership(memberships, updated);
    #ok(updated);
  };

  /// Renders a membership status variant as its tag text for OQL rows.
  func statusText(status : MembershipTypes.MembershipStatus) : Text {
    switch (status) {
      case (#Pending) "Pending";
      case (#Active) "Active";
      case (#Suspended) "Suspended";
      case (#Left) "Left";
    };
  };
};

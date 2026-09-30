import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import GovernanceTypes "../types/governance";
import FoundingTypes "../types/founding-steward";
import FamilyMembershipLib "family-membership";
import StewardAuthorityLib "steward-authority";
import TenancyLib "tenancy";

/// Onboarding Phase 1B-2: founding-Steward decision domain logic.
///
/// This module owns the family-scoped onboarding PROGRESS state and the
/// nomination records. It never becomes a second authorization system:
/// `StewardRecord` remains the single source of Steward authority, and the
/// helpers here only create/read those records through the existing
/// `stewards` list.
///
/// Every function takes the persisted collections as parameters, matching the
/// existing lib style, and never consults `AccessControl.isAdmin`.
///
/// Invariants enforced here:
/// - Every `StewardRecord` carries its own `familyId`; a call for one family
///   never creates or mutates a record in another.
/// - A family is never left with zero active Stewards: nomination ensures the
///   founder holds a temporary founding `StewardRecord` while a nomination is
///   pending, and decline/cancel leave the founder in place.
/// - The default Norwood family is never initialized into the onboarding state
///   and its founding logic is never re-run.
module {
  /// Reads the onboarding status of `familyId`: the current state plus the
  /// active pending nomination, when one exists. A family with no recorded
  /// state reads as `#Undecided`.
  public func getStatusForFamily(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    familyId : FamilyTypes.FamilyId,
  ) : Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    #ok(buildStatus(states, nominations, familyId));
  };

  /// Whether `familyId` has a recorded onboarding state. Used to distinguish a
  /// newly created family (`#Undecided`) from the default Norwood family, which
  /// is never initialized into this state.
  public func hasStateForFamily(
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    states.get(familyId) != null;
  };

  /// Whether `caller` is the founder (creator) of `familyId`.
  public func isFounderOfFamily(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    switch (families.get(familyId)) {
      case (?family) family.createdBy == caller;
      case null false;
    };
  };

  /// Whether `familyId` currently has no active Steward.
  public func hasNoActiveStewardForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    not StewardAuthorityLib.hasActiveStewardForFamily(stewards, familyId);
  };

  /// Whether `caller` already holds an active StewardRecord in `familyId`.
  public func isActiveStewardForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Whether `personId` belongs to `familyId`, using the canonical family person
  /// predicate. A nominee from another family is never accepted.
  public func nomineeBelongsToFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    personId : OwnershipTypes.PersonId,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    FamilyMembershipLib.personBelongsToFamily(profiles, claims, personId, familyId);
  };

  /// Whether `accountId` holds an `#Active` FamilyMembership in `familyId`.
  public func hasActiveMembershipForFamily(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : FamilyTypes.FamilyId,
    accountId : MembershipTypes.AccountId,
  ) : Bool {
    FamilyMembershipLib.hasActiveMembershipForFamily(memberships, familyId, accountId);
  };

  /// The account that owns `personId` in `familyId`, when the profile is
  /// claimed. Returns `null` for an unclaimed nominee.
  public func nomineeAccountForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : OwnershipTypes.PersonId,
  ) : ?Principal.Principal {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case (?profile) profile.claimedByUserId;
      case null null;
    };
  };

  /// The pending nomination of `familyId` with `nominationId`, or `null` when no
  /// pending nomination with that id belongs to `familyId`.
  public func getPendingNominationForFamily(
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    familyId : FamilyTypes.FamilyId,
    nominationId : Nat,
  ) : ?FoundingTypes.FoundingStewardNomination {
    nominations.find(func n =
      n.familyId == familyId and n.id == nominationId and n.status == #Pending
    );
  };

  /// The active (pending) nomination of `familyId`, or `null` when none exists.
  public func getActiveNominationForFamily(
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    familyId : FamilyTypes.FamilyId,
  ) : ?FoundingTypes.FoundingStewardNomination {
    nominations.find(func n = n.familyId == familyId and n.status == #Pending);
  };

  /// The founder accepts founding Stewardship for their own family: creates an
  /// active `StewardRecord` for the caller and sets the onboarding state to
  /// `#FounderAccepted`. Idempotent — a repeat call returns the current state
  /// and never creates a duplicate StewardRecord. While a nomination is pending
  /// the call is rejected with `#InvalidTransition`: the founder must cancel the
  /// pending nomination first.
  public func acceptFoundingStewardship(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    if (not isFounderOfFamily(families, caller, familyId)) {
      return #err(#NotFounder);
    };
    if (not hasActiveMembershipForFamily(memberships, familyId, caller)) {
      return #err(#NotAuthorized);
    };
    // A pending nomination must be resolved first. The founder holds a
    // temporary founding StewardRecord while the nomination is pending, so this
    // guard must fire BEFORE the idempotent-active-steward branch below, which
    // would otherwise swallow the call as a replay. The founder must cancel the
    // pending nomination before accepting Stewardship.
    if ((states.get(familyId) ?? #Undecided) == #NominationPending) {
      return #err(#InvalidTransition);
    };
    // Idempotent replay: the caller already holds the active StewardRecord for
    // this family, so return the current status without creating a duplicate.
    if (isActiveStewardForFamily(stewards, caller, familyId)) {
      return #ok(buildStatus(states, emptyNominations(), familyId));
    };
    // A family that already has a different active Steward cannot be claimed
    // through the founding path.
    if (not hasNoActiveStewardForFamily(stewards, familyId)) {
      return #err(#AlreadySteward);
    };
    let now = Time.now();
    stewards.add({
      familyId;
      stewardAccountId = caller;
      roleStatus = #Active;
      successorPriority = null;
      assignedBy = caller;
      assignedAt = now;
      founding = true;
    });
    states.add(familyId, #FounderAccepted);
    #ok(buildStatus(states, emptyNominations(), familyId));
  };

  /// The founder nominates another member of their own family as founding
  /// Steward. Persists a `#Pending` nomination and ensures the founder holds a
  /// temporary founding `StewardRecord` so the family is never left with zero
  /// active Stewards. The nominee is NOT made Steward here.
  public func nominateFoundingSteward(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
    nomineePersonId : OwnershipTypes.PersonId,
    nomineeEmail : ?Text,
    nextNominationId : Nat,
  ) : Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    if (not isFounderOfFamily(families, caller, familyId)) {
      return #err(#NotFounder);
    };
    if (not hasActiveMembershipForFamily(memberships, familyId, caller)) {
      return #err(#NotAuthorized);
    };
    if (nomineePersonId.trim(#predicate (func ch = ch.isWhitespace())) == "") {
      return #err(#InvalidInput);
    };
    // Cross-family guard: the nominee profile must belong to THIS family.
    if (not nomineeBelongsToFamily(profiles, claims, nomineePersonId, familyId)) {
      return #err(#NomineeNotInFamily);
    };
    // Only one pending nomination per family at a time.
    if (getActiveNominationForFamily(nominations, familyId) != null) {
      return #err(#InvalidTransition);
    };
    // Safety: the family must never be left with zero active Stewards. If the
    // founder is not already an active Steward, create a temporary founding
    // record for them before the nomination is stored.
    if (not isActiveStewardForFamily(stewards, caller, familyId)) {
      let now = Time.now();
      stewards.add({
        familyId;
        stewardAccountId = caller;
        roleStatus = #Active;
        successorPriority = null;
        assignedBy = caller;
        assignedAt = now;
        founding = true;
      });
    };
    let now = Time.now();
    let nomination : FoundingTypes.FoundingStewardNomination = {
      id = nextNominationId;
      familyId;
      founderAccountId = caller;
      nomineePersonId;
      nomineeAccountId = nomineeAccountForFamily(profiles, familyId, nomineePersonId);
      nomineeEmail;
      status = #Pending;
      createdAt = now;
      updatedAt = now;
    };
    nominations.add(nomination);
    states.add(familyId, #NominationPending);
    #ok(buildStatus(states, nominations, familyId));
  };

  /// The authenticated nominee accepts a pending nomination: activates a
  /// `StewardRecord` for the nominee, marks the nomination `#Accepted`, and
  /// advances the onboarding state to `#Transferred`. The founder is NOT
  /// automatically removed.
  public func acceptFoundingStewardNomination(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
    nominationId : Nat,
  ) : Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    let nomination = switch (getPendingNominationForFamily(nominations, familyId, nominationId)) {
      case (?n) n;
      case null { return #err(#NominationNotFound) };
    };
    // The caller must be the nominee: the nominated profile's owning account
    // must equal the caller, and the caller must hold an Active membership in
    // this family.
    let nomineeAccount = nomineeAccountForFamily(profiles, familyId, nomination.nomineePersonId);
    switch (nomineeAccount) {
      case (?account) {
        if (account != caller) {
          return #err(#NotAuthorized);
        };
      };
      case null { return #err(#NomineeNotActiveMember) };
    };
    if (not hasActiveMembershipForFamily(memberships, familyId, caller)) {
      return #err(#NomineeNotActiveMember);
    };
    // Activate the nominee as a full Steward (founding = false). The founder's
    // record is left untouched.
    if (not isActiveStewardForFamily(stewards, caller, familyId)) {
      let now = Time.now();
      stewards.add({
        familyId;
        stewardAccountId = caller;
        roleStatus = #Active;
        successorPriority = null;
        assignedBy = caller;
        assignedAt = now;
        founding = false;
      });
    };
    replaceNomination(nominations, { nomination with status = #Accepted; updatedAt = Time.now() });
    states.add(familyId, #Transferred);
    #ok(buildStatus(states, nominations, familyId));
  };

  /// The nominee declines a pending nomination: the nomination becomes
  /// `#Declined`, the founder remains Steward, and the founder may nominate
  /// someone else.
  public func declineFoundingStewardNomination(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
    nominationId : Nat,
  ) : Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    let nomination = switch (getPendingNominationForFamily(nominations, familyId, nominationId)) {
      case (?n) n;
      case null { return #err(#NominationNotFound) };
    };
    let nomineeAccount = nomineeAccountForFamily(profiles, familyId, nomination.nomineePersonId);
    switch (nomineeAccount) {
      case (?account) {
        if (account != caller) {
          return #err(#NotAuthorized);
        };
      };
      case null { return #err(#NomineeNotActiveMember) };
    };
    if (not hasActiveMembershipForFamily(memberships, familyId, caller)) {
      return #err(#NomineeNotActiveMember);
    };
    replaceNomination(nominations, { nomination with status = #Declined; updatedAt = Time.now() });
    // The founder remains Steward (their temporary founding StewardRecord is
    // left untouched), but they did NOT explicitly accept permanent
    // Stewardship, so the onboarding conversation returns to #Undecided and the
    // founder may choose again: accept Stewardship or nominate someone else.
    states.add(familyId, #Undecided);
    #ok(buildStatus(states, nominations, familyId));
  };

  /// The founder cancels a pending nomination: the nomination becomes
  /// `#Cancelled` and the founder remains Steward.
  public func cancelFoundingStewardNomination(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
    nominationId : Nat,
  ) : Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    if (not isFounderOfFamily(families, caller, familyId)) {
      return #err(#NotFounder);
    };
    let nomination = switch (getPendingNominationForFamily(nominations, familyId, nominationId)) {
      case (?n) n;
      case null { return #err(#NominationNotFound) };
    };
    replaceNomination(nominations, { nomination with status = #Cancelled; updatedAt = Time.now() });
    // The founder remains Steward (their temporary founding StewardRecord is
    // left untouched), but they did NOT explicitly accept permanent
    // Stewardship, so the onboarding conversation returns to #Undecided and the
    // founder may choose again: accept Stewardship or nominate someone else.
    states.add(familyId, #Undecided);
    #ok(buildStatus(states, nominations, familyId));
  };

  /// Builds the read view for `familyId`: the stored state (or `#Undecided`
  /// when none is recorded) plus the active pending nomination, if any.
  ///
  /// The `#NominationPending` state and a present active nomination are
  /// reconciled here so the pair can never be emitted inconsistently: if the
  /// recorded state says `#NominationPending` but no pending nomination exists,
  /// the state falls back to `#Undecided` rather than reporting a pending
  /// nomination that is not there.
  func buildStatus(
    states : Map.Map<Text, FoundingTypes.FoundingStewardState>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    familyId : FamilyTypes.FamilyId,
  ) : FoundingTypes.FoundingStewardStatus {
    let recorded = states.get(familyId) ?? #Undecided;
    let activeNomination = getActiveNominationForFamily(nominations, familyId);
    let state = switch (recorded, activeNomination) {
      case (#NominationPending, null) #Undecided;
      case (s, _) s;
    };
    {
      familyId;
      state;
      activeNomination;
    };
  };

  /// Replaces the stored nomination with the same id, preserving list order.
  func replaceNomination(
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    updated : FoundingTypes.FoundingStewardNomination,
  ) {
    let snapshot = nominations.toArray();
    nominations.clear();
    for (n in snapshot.values()) {
      if (n.id == updated.id and n.familyId == updated.familyId) {
        nominations.add(updated);
      } else {
        nominations.add(n);
      };
    };
  };

  /// An empty nomination list for the accept path, which never reads
  /// nominations. Kept as a helper so the status builder has one shape.
  func emptyNominations() : List.List<FoundingTypes.FoundingStewardNomination> {
    List.empty();
  };
};

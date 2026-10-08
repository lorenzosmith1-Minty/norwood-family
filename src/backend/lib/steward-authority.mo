import List "mo:core/List";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/governance";
import FamilyTypes "../types/family";
import StewardAuthorityTypes "../types/steward-authority";

/// Canonical Norwood Family Steward authority. The `stewards` stable list is
/// the single source of truth: a caller is a Family Steward only when they
/// match an ACTIVE persisted `StewardRecord` for the requested family. The
/// platform admin role (`AccessControl.isAdmin`) is never consulted here.
///
/// Tenancy 1B: the family-scoped helpers below are the canonical source of
/// truth. The legacy single-family helpers are temporary compatibility
/// wrappers that delegate to them with `FamilyTypes.DEFAULT_FAMILY_ID`.
module {
  /// Whether the caller is an active Steward of `familyId`. Returns `true`
  /// only when the caller matches a persisted `StewardRecord` whose
  /// `roleStatus == #Active` AND whose `familyId == familyId`. Authority in
  /// one family never grants authority in another. Never consults the platform
  /// admin role.
  public func isActiveStewardForFamily(
    stewards : List.List<Types.StewardRecord>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    stewards.toArray().any(func s =
      s.stewardAccountId == caller and s.roleStatus == #Active and s.familyId == familyId
    );
  };

  /// Whether `familyId` has at least one active Steward. One family's active
  /// Steward never satisfies another family's check, so Family A having a
  /// Steward does not prevent Family B from bootstrapping its own first
  /// Steward later.
  public func hasActiveStewardForFamily(
    stewards : List.List<Types.StewardRecord>,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    stewards.toArray().any(func s = s.roleStatus == #Active and s.familyId == familyId);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper. Deprecated single-family
  /// form: delegates to `isActiveStewardForFamily` with the default family id.
  /// Tenancy 1C will migrate remaining callers to the family-scoped helper.
  public func isActiveSteward(
    stewards : List.List<Types.StewardRecord>,
    caller : Principal,
  ) : Bool {
    isActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper. Deprecated single-family
  /// form: delegates to `hasActiveStewardForFamily` with the default family
  /// id. Tenancy 1C will migrate remaining callers to the family-scoped helper.
  public func hasActiveSteward(
    stewards : List.List<Types.StewardRecord>,
  ) : Bool {
    hasActiveStewardForFamily(stewards, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Performs the one-time "Claim Family Steward" bootstrap for `familyId`.
  /// Succeeds only while THAT family has no active Steward, creating an ACTIVE
  /// `StewardRecord` for the claimer and recording the assignment. Once the
  /// family has any active Steward the claim permanently refuses. One family's
  /// active Steward does not block another family's first-Steward bootstrap.
  public func claimStewardForFamily(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Result.Result<StewardAuthorityTypes.StewardClaimResult, StewardAuthorityTypes.StewardClaimError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (hasActiveStewardForFamily(stewards, familyId)) {
      if (isActiveStewardForFamily(stewards, caller, familyId)) {
        return #err(#AlreadySteward);
      };
      return #err(#StewardAlreadyExists);
    };
    let now = Time.now();
    let record : Types.StewardRecord = {
      familyId;
      stewardAccountId = caller;
      roleStatus = #Active;
      successorPriority = null;
      assignedBy = caller;
      assignedAt = now;
      founding = false;
    };
    stewards.add(record);
    auditLog.add({
      familyId;
      id = nextAuditId(auditLog);
      actionType = #StewardPromoted;
      actorAccountId = caller;
      affectedPersonIds = [];
      timestamp = now;
      summary = "Claimed the Family Steward role (bootstrap)";
    });
    #ok({
      stewardAccountId = caller;
      claimedBy = caller;
      claimedAt = now;
    });
  };

  /// Retargets an EXISTING active `StewardRecord` of `familyId` from
  /// `oldAccountId` to `replacementAccountId`, preserving the record itself
  /// (same `familyId`, `roleStatus`, `successorPriority`, `assignedBy`,
  /// `assignedAt`, and `founding`) rather than creating a duplicate. Used by
  /// recovery to move Steward authority atomically with profile ownership.
  ///
  /// When the replacement already holds an active StewardRecord in `familyId`,
  /// the old account's record is NOT retargeted (that would duplicate the
  /// replacement's authority). Instead the old record is deactivated
  /// (`roleStatus = #Removed`), preserving the record and its governance fields,
  /// so the old account loses active Steward authority and no duplicate is
  /// created.
  ///
  /// Returns `true` when a matching active record was retargeted or deactivated.
  /// Returns `false` when `oldAccountId` holds no active StewardRecord in
  /// `familyId` (nothing to transfer). A record in another family is never
  /// touched.
  public func reassignStewardForFamily(
    stewards : List.List<Types.StewardRecord>,
    familyId : FamilyTypes.FamilyId,
    oldAccountId : Principal,
    replacementAccountId : Principal,
  ) : Bool {
    if (oldAccountId == replacementAccountId) {
      return false;
    };
    switch (stewards.find(func s =
      s.stewardAccountId == oldAccountId and s.roleStatus == #Active and s.familyId == familyId
    )) {
      case null { false };
      case (?record) {
        // Never create a duplicate: when the replacement already holds an active
        // StewardRecord in this family, deactivate the old account's record
        // instead of retargeting it, so the old account loses active authority
        // and the replacement's existing record is left untouched.
        let updated : Types.StewardRecord = if (isActiveStewardForFamily(stewards, replacementAccountId, familyId)) {
          { record with roleStatus = #Removed };
        } else {
          { record with stewardAccountId = replacementAccountId };
        };
        // Rewrite the record in place, matching on the OLD principal, the family,
        // and `#Active` so a principal holding StewardRecords in several families
        // never has another family's record overwritten, and a preserved
        // `#Removed` record for the same principal is never turned into a
        // duplicate `#Active` replacement record. The predicate mirrors the
        // preceding `find` exactly.
        let snapshot = stewards.toArray();
        stewards.clear();
        for (s in snapshot.values()) {
          if (s.stewardAccountId == oldAccountId and s.roleStatus == #Active and s.familyId == familyId) { stewards.add(updated) } else { stewards.add(s) };
        };
        true;
      };
    };
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper. Deprecated single-family
  /// form: delegates to `claimStewardForFamily` with the default family id so
  /// the current Norwood bootstrap behavior is unchanged. Tenancy 1C will
  /// migrate remaining callers to the family-scoped helper.
  public func claimSteward(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    caller : Principal,
  ) : Result.Result<StewardAuthorityTypes.StewardClaimResult, StewardAuthorityTypes.StewardClaimError> {
    claimStewardForFamily(stewards, auditLog, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Computes the next audit entry id: one greater than the largest existing
  /// id, or `0` when the log is empty.
  func nextAuditId(auditLog : List.List<Types.AuditEntry>) : Nat {
    var maxId = 0;
    for (entry in auditLog.toArray().values()) {
      if (entry.id >= maxId) { maxId := entry.id + 1 };
    };
    maxId;
  };
};

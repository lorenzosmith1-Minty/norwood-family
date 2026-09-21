import List "mo:core/List";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/governance";
import FamilyTypes "../types/family";
import StewardAuthorityTypes "../types/steward-authority";

/// Canonical Norwood Family Steward authority. The `stewards` stable list is
/// the single source of truth: a caller is a Family Steward only when they
/// match an ACTIVE persisted `StewardRecord`. The platform admin role
/// (`AccessControl.isAdmin`) is never consulted here.
module {
  /// Whether the caller is an active Norwood Family Steward. Returns `true`
  /// only when the caller matches a persisted `StewardRecord` whose
  /// `roleStatus == #Active`. Never consults the platform admin role.
  public func isActiveSteward(
    stewards : List.List<Types.StewardRecord>,
    caller : Principal,
  ) : Bool {
    stewards.toArray().any(func s =
      s.stewardAccountId == caller and s.roleStatus == #Active
    );
  };

  /// Whether any active Family Steward exists. Used to gate the one-time claim.
  public func hasActiveSteward(
    stewards : List.List<Types.StewardRecord>,
  ) : Bool {
    stewards.toArray().any(func s = s.roleStatus == #Active);
  };

  /// Performs the one-time "Claim Family Steward" bootstrap. Succeeds only
  /// while no active Steward exists, creating an ACTIVE `StewardRecord` for the
  /// claimer and recording the assignment. Once any active Steward exists the
  /// claim permanently refuses.
  public func claimSteward(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    caller : Principal,
  ) : Result.Result<StewardAuthorityTypes.StewardClaimResult, StewardAuthorityTypes.StewardClaimError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (hasActiveSteward(stewards)) {
      if (isActiveSteward(stewards, caller)) {
        return #err(#AlreadySteward);
      };
      return #err(#StewardAlreadyExists);
    };
    let now = Time.now();
    let record : Types.StewardRecord = {
      familyId = FamilyTypes.DEFAULT_FAMILY_ID;
      stewardAccountId = caller;
      roleStatus = #Active;
      successorPriority = null;
      assignedBy = caller;
      assignedAt = now;
    };
    stewards.add(record);
    auditLog.add({
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

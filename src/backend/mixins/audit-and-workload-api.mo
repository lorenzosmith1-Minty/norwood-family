import List "mo:core/List";
import Map "mo:core/Map";
import AccessControl "mo:caffeineai-authorization/access-control";
import GovernanceTypes "../types/governance";
import ResearchIntakeTypes "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import Types "../types/audit-and-workload";
import AuditWorkloadLib "../lib/audit-and-workload";
import FamilyAuthorizationLib "../lib/family-authorization";

/// Public API for the merged Family Steward Audit History. The existing
/// `listAuditHistory` (governance) is preserved unchanged; this mixin adds the
/// combined view that surfaces conflict-resolution actions alongside governance
/// audit entries in one chronological list.
///
/// Tenancy 1C: the family-scoped read `getStewardAuditHistoryForFamily` is the
/// canonical source of truth. The legacy `getStewardAuditHistory` is a temporary
/// compatibility wrapper that delegates to it with the default family id.
mixin (
  accessControlState : AccessControl.AccessControlState,
  governanceLog : List.List<GovernanceTypes.AuditEntry>,
  researchLog : List.List<ResearchIntakeTypes.ResearchAuditEntry>,
  conflicts : List.List<ResearchIntakeTypes.ConflictReviewItem>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Returns the merged Family Steward Audit History for `familyId`: every
  /// governance audit entry belonging to `familyId` plus every
  /// conflict-resolution action (Keep Existing, Replace Existing, Preserve
  /// Both/Unresolved, Needs Research) belonging to `familyId`, merged
  /// chronologically, newest first, without duplicating records. Each
  /// conflict-resolution entry carries person, field, existing value, proposed
  /// value, resolution, steward notes, steward identity, timestamp, and
  /// provenance/source refs where available.
  ///
  /// Requires an active Steward of `familyId`; a Steward of one family can never
  /// read another family's audit history. Only entries belonging to `familyId`
  /// are returned, so Family A audit activity is never exposed through Family B.
  /// This is the canonical family-scoped audit read.
  public query ({ caller }) func getStewardAuditHistoryForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.StewardAuditEntry] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    AuditWorkloadLib.mergeAuditHistoryForFamily(
      governanceLog,
      researchLog,
      conflicts,
      stewards,
      profiles,
      claims,
      familyId,
    );
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getStewardAuditHistoryForFamily`. Deprecated single-family form: delegates
  /// with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior for
  /// familyId "norwood" is unchanged. Contains no duplicated merge logic and
  /// will be removed once the frontend passes an explicit familyId everywhere.
  public query ({ caller }) func getStewardAuditHistory() : async [Types.StewardAuditEntry] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    AuditWorkloadLib.mergeAuditHistoryForFamily(
      governanceLog,
      researchLog,
      conflicts,
      stewards,
      profiles,
      claims,
      FamilyTypes.DEFAULT_FAMILY_ID,
    );
  };
};

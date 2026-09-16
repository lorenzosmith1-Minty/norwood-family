import List "mo:core/List";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import GovernanceTypes "../types/governance";
import ResearchIntakeTypes "../types/research-intake";
import Types "../types/audit-and-workload";
import AuditWorkloadLib "../lib/audit-and-workload";

/// Public API for the merged Family Steward Audit History. The existing
/// `listAuditHistory` (governance) is preserved unchanged; this mixin adds the
/// combined view that surfaces conflict-resolution actions alongside governance
/// audit entries in one chronological list.
mixin (
  accessControlState : AccessControl.AccessControlState,
  governanceLog : List.List<GovernanceTypes.AuditEntry>,
  researchLog : List.List<ResearchIntakeTypes.ResearchAuditEntry>,
  conflicts : List.List<ResearchIntakeTypes.ConflictReviewItem>,
) {
  /// Returns the merged Family Steward Audit History: every governance audit
  /// entry plus every conflict-resolution action (Keep Existing, Replace
  /// Existing, Preserve Both/Unresolved, Needs Research) merged
  /// chronologically, newest first, without duplicating records. Each
  /// conflict-resolution entry carries person, field, existing value, proposed
  /// value, resolution, steward notes, steward identity, timestamp, and
  /// provenance/source refs where available. Family Steward only.
  public query ({ caller }) func getStewardAuditHistory() : async [Types.StewardAuditEntry] {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view audit history");
    };
    AuditWorkloadLib.mergeAuditHistory(governanceLog, researchLog, conflicts);
  };
};

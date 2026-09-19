import List "mo:core/List";
import Result "mo:core/Result";
import AccessControl "mo:caffeineai-authorization/access-control";
import GovernanceTypes "../types/governance";
import StewardAuthorityTypes "../types/steward-authority";
import StewardAuthorityLib "../lib/steward-authority";

mixin (
  accessControlState : AccessControl.AccessControlState,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  auditLog : List.List<GovernanceTypes.AuditEntry>,
) {
  /// Whether the caller is an active Norwood Family Steward. Public so the
  /// frontend can ask "am I an active Norwood Family Steward?". Returns `false`
  /// for an anonymous caller and for an account holding only the platform admin
  /// role.
  public query ({ caller }) func isCallerSteward() : async Bool {
    ignore accessControlState;
    StewardAuthorityLib.isActiveSteward(stewards, caller);
  };

  /// Whether any active Family Steward exists. Public so the frontend can show
  /// or hide the one-time "Claim Family Steward" control.
  public query func hasActiveSteward() : async Bool {
    StewardAuthorityLib.hasActiveSteward(stewards);
  };

  /// One-time "Claim Family Steward" bootstrap. Any signed-in account may claim
  /// while no active Steward exists; no approved family profile is required.
  /// Succeeds only when no active Steward exists, creating an ACTIVE
  /// `StewardRecord` for the claimer. Once any active Steward exists the claim
  /// permanently refuses.
  public shared ({ caller }) func claimSteward() : async Result.Result<StewardAuthorityTypes.StewardClaimResult, StewardAuthorityTypes.StewardClaimError> {
    StewardAuthorityLib.claimSteward(stewards, auditLog, caller);
  };
};

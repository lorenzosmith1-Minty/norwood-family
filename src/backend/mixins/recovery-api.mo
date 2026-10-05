import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import RecoveryTypes "../types/recovery";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import MembershipTypes "../types/family-membership";
import RecoveryLib "../lib/recovery";
import StewardAuthorityLib "../lib/steward-authority";

/// Public Phase 4A Recovery API.
///
/// Every endpoint is family-scoped and evaluates authority against the
/// requested `familyId`. A person id, membership id, recovery request id, or
/// family id from one family never grants access in another: a lookup that
/// finds a record belonging to another family behaves exactly like a lookup
/// that found nothing.
///
/// Recovery restores control of an EXISTING Person/Profile. It never creates a
/// duplicate Person or membership and never copies family data to a new
/// profile. A successful recovery transfers ownership of the existing profile
/// from the current owner account to the replacement account, atomically.
///
/// This is the backend foundation only: there is no recovery UI, no
/// forgot-password logic, and no authentication-provider recovery. Norwood
/// recovery begins only after the user can authenticate with a valid
/// replacement account.
mixin (
  recoveryRequests : List.List<RecoveryTypes.RecoveryRequest>,
  recoveryVerifications : List.List<RecoveryTypes.RecoveryVerification>,
  recoveryAudit : List.List<RecoveryTypes.RecoveryAuditEntry>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  memberships : List.List<MembershipTypes.FamilyMembership>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Creates a family-scoped recovery request for an existing Person/Profile.
  ///
  /// Self-service requester model: the caller is the replacement/new
  /// authenticated account, and `replacementAccountId` MUST equal the caller, so
  /// a caller can never nominate an arbitrary third-party replacement account.
  /// The caller does NOT need an existing family membership, profile claim, or
  /// second Person/Profile: a brand-new authenticated account that lost access
  /// to its old account can request recovery of its existing claimed
  /// Person/Profile. The request is only a pending claim — it grants no profile
  /// ownership, no family membership, and no Steward authority, and reveals no
  /// private family data.
  ///
  /// The old/current owner account is derived from the existing target profile,
  /// never supplied by the caller. The target must be an existing CLAIMED
  /// profile under family scope, so knowing a personId or familyId alone can
  /// never cause an ownership transfer. The Steward approval / Steward Recovery
  /// quorum remains the security boundary that authorizes the actual transfer.
  ///
  /// Idempotency: a second request for the same person while an earlier request
  /// is still open is rejected with `#err(#AlreadyPending)`, so
  /// near-simultaneous duplicate requests cannot both proceed.
  ///
  /// The recovery type is derived from the family's current Steward state:
  /// `#AccountRecovery` when a usable active Steward exists, otherwise
  /// `#StewardRecovery` (2-member quorum). Errors: `#NotSignedIn`,
  /// `#NotAuthorized` (replacement is not the caller), `#PersonNotFound`,
  /// `#AlreadyPending`.
  public shared ({ caller }) func requestRecoveryForFamily(
    familyId : RecoveryTypes.FamilyId,
    personId : RecoveryTypes.PersonId,
    replacementAccountId : RecoveryTypes.AccountId,
  ) : async Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    RecoveryLib.requestRecoveryForFamily(
      recoveryRequests,
      recoveryAudit,
      profiles,
      claims,
      memberships,
      stewards,
      familyId,
      personId,
      replacementAccountId,
      caller,
    );
  };

  /// Approves an ordinary `#AccountRecovery` request. Active Steward of
  /// `familyId` only; anonymous callers get `#err(#NotSignedIn)` and
  /// non-Stewards get `#err(#NotSteward)`.
  ///
  /// A Steward can never approve their own recovery request (`#err(#SelfApproval)`),
  /// whether they are the requester, the current owner, or the replacement
  /// account. When another active Steward exists, that other Steward may approve
  /// a Steward's recovery.
  ///
  /// On success the ownership transfer is performed atomically and the request
  /// becomes `#Approved`. A request that is already resolved is rejected with
  /// `#err(#AlreadyResolved)`, so a completed recovery can never execute the
  /// transfer twice. Errors: `#NotSignedIn`, `#RequestNotFound`, `#NotSteward`,
  /// `#SelfApproval`, `#InvalidTransition`, `#AlreadyResolved`.
  public shared ({ caller }) func approveAccountRecoveryForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    RecoveryLib.approveAccountRecoveryForFamily(
      recoveryRequests,
      recoveryAudit,
      profiles,
      claims,
      memberships,
      stewards,
      familyId,
      recoveryId,
      caller,
    );
  };

  /// Records one approved family member's verification decision on a
  /// `#StewardRecovery` request.
  ///
  /// The candidate cannot verify their own request (`#err(#SelfVerification)`)
  /// and does not count toward quorum. The same verifier can never count twice
  /// (`#err(#AlreadyVerifier)`). A `#Reject` decision resolves the request as
  /// `#Rejected`. A `#Confirm` decision moves the request to
  /// `#AwaitingVerification`; once 2 distinct confirmations from accounts that
  /// differ from the candidate and from each other are recorded, the request
  /// becomes `#ReadyForApproval` and the ownership transfer is performed
  /// atomically. Errors: `#NotSignedIn`, `#RequestNotFound`, `#NotAuthorized`,
  /// `#SelfVerification`, `#AlreadyVerifier`, `#InvalidTransition`,
  /// `#AlreadyResolved`.
  public shared ({ caller }) func verifyStewardRecoveryForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
    decision : RecoveryTypes.RecoveryVerificationDecision,
  ) : async Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    RecoveryLib.verifyStewardRecoveryForFamily(
      recoveryRequests,
      recoveryVerifications,
      recoveryAudit,
      profiles,
      claims,
      memberships,
      stewards,
      familyId,
      recoveryId,
      decision,
      caller,
    );
  };

  /// Rejects an open recovery request. Allowed for an active Steward of
  /// `familyId` or the requester themselves (withdrawal). A resolved request is
  /// rejected with `#err(#AlreadyResolved)`. Errors: `#NotSignedIn`,
  /// `#RequestNotFound`, `#NotAuthorized`, `#AlreadyResolved`.
  public shared ({ caller }) func rejectRecoveryForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    RecoveryLib.rejectRecoveryForFamily(
      recoveryRequests,
      recoveryAudit,
      stewards,
      familyId,
      recoveryId,
      caller,
    );
  };

  /// Returns the recovery request with `recoveryId` only when it belongs to
  /// `familyId`. Allowed only when the caller is an active Steward of
  /// `familyId`, the requester, the current owner, or the replacement account;
  /// otherwise `#err(#NotAuthorized)` (anonymous callers get
  /// `#err(#NotSignedIn)`). A request id from another family is never returned.
  public query ({ caller }) func getRecoveryRequestForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<?RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let request = RecoveryLib.getRequestForFamily(recoveryRequests, familyId, recoveryId);
    switch (request) {
      case (?r) {
        if (not canViewRequest(r, caller)) {
          return #err(#NotAuthorized);
        };
      };
      case null {};
    };
    #ok(request);
  };

  /// Returns every recovery request of `familyId`. Active Steward of `familyId`
  /// only; anonymous callers get `#err(#NotSignedIn)` and any other caller gets
  /// `#err(#NotAuthorized)`. Requests from other families are never returned.
  public query ({ caller }) func listRecoveryRequestsForFamily(
    familyId : RecoveryTypes.FamilyId,
  ) : async Result.Result<[RecoveryTypes.RecoveryRequest], RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    #ok(RecoveryLib.listRequestsForFamily(recoveryRequests, familyId));
  };

  /// Returns the verification decisions recorded for `recoveryId` in
  /// `familyId`. Allowed only when the caller is an active Steward of
  /// `familyId`, the requester, the current owner, or the replacement account;
  /// otherwise `#err(#NotAuthorized)` (anonymous callers get
  /// `#err(#NotSignedIn)`). Verifications from other families are never
  /// returned.
  public query ({ caller }) func listRecoveryVerificationsForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<[RecoveryTypes.RecoveryVerification], RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (RecoveryLib.getRequestForFamily(recoveryRequests, familyId, recoveryId)) {
      case (?r) {
        if (not canViewRequest(r, caller)) {
          return #err(#NotAuthorized);
        };
      };
      case null { return #err(#RequestNotFound) };
    };
    #ok(RecoveryLib.listVerificationsForFamily(recoveryVerifications, familyId, recoveryId));
  };

  /// Returns the recovery audit history for `recoveryId` in `familyId`. Active
  /// Steward of `familyId` only; anonymous callers get `#err(#NotSignedIn)` and
  /// any other caller gets `#err(#NotAuthorized)`. Audit entries from other
  /// families are never returned.
  public query ({ caller }) func listRecoveryAuditForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<[RecoveryTypes.RecoveryAuditEntry], RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    #ok(RecoveryLib.listAuditForFamily(recoveryAudit, familyId, recoveryId));
  };

  /// Whether the caller may view a specific recovery request: an active Steward
  /// of the request's family, the requester, the current owner, or the
  /// replacement account. Evaluated against the request's own `familyId`, so a
  /// Steward of one family never reads another family's request.
  func canViewRequest(
    request : RecoveryTypes.RecoveryRequest,
    caller : Principal,
  ) : Bool {
    if (StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, request.familyId)) {
      return true;
    };
    caller == request.requestedByAccountId or caller == request.ownerAccountId or caller == request.replacementAccountId;
  };
};

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
  notifications : List.List<OwnershipTypes.Notification>,
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
      notifications,
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
      notifications,
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
      notifications,
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
      notifications,
      stewards,
      familyId,
      recoveryId,
      caller,
    );
  };

  /// Phase 4B-H1 dedicated recovery discovery read.
  ///
  /// Family-scoped name search that returns ONLY the minimum recovery-safe data
  /// needed to select a recovery target: an opaque target person identifier and
  /// the display name (`RecoveryTargetMatch`). It never returns family
  /// relationships, parents, siblings, profile story/history, photos, account
  /// principals, membership ids, or Steward data, and it never consults the
  /// relationship graph. Only claimed profiles of `familyId` are discoverable;
  /// a personId from another family never resolves here.
  ///
  /// This is the ONLY discovery read the recovery flow may use. The generic
  /// `searchPossibleMatchesForFamily` (which returns `PersonMatch` with
  /// `parents`) must not be used by recovery.
  ///
  /// Errors: `#NotSignedIn` for anonymous callers. An empty query returns an
  /// empty array (not an error).
  public query ({ caller }) func searchRecoveryTargetsForFamily(
    familyId : RecoveryTypes.FamilyId,
    searchTerm : Text,
  ) : async Result.Result<[RecoveryTypes.RecoveryTargetMatch], RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(RecoveryLib.searchRecoveryTargetsForFamily(profiles, familyId, searchTerm));
  };

  /// Phase 4B-H1 caller-scoped recovery status read.
  ///
  /// Returns only the recovery requests of `familyId` where the signed-in
  /// caller is the requester/replacement account, projected to the minimum
  /// caller-facing view (`MyRecoveryRequestView`: target display name, status,
  /// timestamps, and — for a Steward Recovery request — the backend-derived
  /// quorum progress `confirmationsReceived`/`confirmationsRequired`). For an
  /// ordinary Account Recovery request both quorum fields are `null`. It never
  /// exposes another account's recovery requests, verifier identities, verifier
  /// principals, membership ids, Steward ids, audit details, or unrelated family
  /// data, and a request from another family never appears. This is the
  /// authoritative source of truth for the replacement account's recovery-status
  /// page, so status survives a fresh browser session or another device.
  ///
  /// Errors: `#NotSignedIn` for anonymous callers. A caller with no requests in
  /// `familyId` gets an empty array (not an error).
  public query ({ caller }) func listMyRecoveryRequestsForFamily(
    familyId : RecoveryTypes.FamilyId,
  ) : async Result.Result<[RecoveryTypes.MyRecoveryRequestView], RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(RecoveryLib.listMyRecoveryRequestsForFamily(recoveryRequests, recoveryVerifications, profiles, familyId, caller));
  };

  /// Phase 4C eligible-verifier read for Steward Recovery.
  ///
  /// Returns the family-safe verification context for every OPEN
  /// `#StewardRecovery` request of `familyId` that the signed-in caller is
  /// eligible to verify: the caller must be an approved family member of
  /// `familyId` and must NOT be the recovery candidate (the requester, the
  /// current owner, or the replacement account). The candidate never receives an
  /// entry for their own request and never counts toward quorum.
  ///
  /// Each entry carries ONLY family-safe fields (`candidateName`, `status`,
  /// `confirmationsReceived`, `confirmationsRequired`, `callerHasVerified`,
  /// `callerDecision`). It never exposes account principals, recovery request
  /// ids, membership ids, verifier identities, or unrelated private family data.
  /// A caller who is not an approved family member, or a request from another
  /// family, yields an empty array (existence is never leaked).
  ///
  /// Errors: `#NotSignedIn` for anonymous callers. A caller with no eligible
  /// request gets an empty array (not an error).
  public query ({ caller }) func listStewardRecoveryVerificationsForFamily(
    familyId : RecoveryTypes.FamilyId,
  ) : async Result.Result<[RecoveryTypes.StewardRecoveryVerificationView], RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    #ok(RecoveryLib.listStewardRecoveryVerificationsForFamily(
      recoveryRequests,
      recoveryVerifications,
      profiles,
      claims,
      stewards,
      familyId,
      caller,
    ));
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

  /// Returns the recovery audit history for `recoveryId` in `familyId`.
  ///
  /// Phase 4D minimum authorized audit read: allowed for the same parties that
  /// may view the request itself — an active Steward of `familyId`, the
  /// requester, the current owner, or the replacement account. Anonymous
  /// callers get `#err(#NotSignedIn)`; any other caller gets
  /// `#err(#NotAuthorized)`; a request id that does not belong to `familyId`
  /// gets `#err(#RequestNotFound)`. Audit entries from other families are never
  /// returned.
  public query ({ caller }) func listRecoveryAuditForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<[RecoveryTypes.RecoveryAuditEntry], RecoveryTypes.RecoveryError> {
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
    #ok(RecoveryLib.listAuditForFamily(recoveryAudit, familyId, recoveryId));
  };

  /// Phase 4D authorized recovery audit read.
  ///
  /// Returns the recovery audit history for `recoveryId` in `familyId` to a
  /// caller permitted to view that specific request: an active Steward of the
  /// request's own family, the requester, the current owner, or the replacement
  /// account (the same authorization as `getRecoveryRequestForFamily`). Each
  /// entry carries ONLY family-facing fields (`actionLabel`,
  /// `actorDisplayLabel`, `affectedDisplayNames`, `timestamp`); the internal
  /// audit id, the recovery request id, the family id, the raw actor account
  /// principal, the raw affected person ids, and the free-text summary are never
  /// exposed, so no private reason, technical error tag, account principal, or
  /// internal identifier is returned. The backend resolves the display labels,
  /// so the client never needs the raw account identifier to derive them.
  ///
  /// Errors: `#NotSignedIn` for anonymous callers, `#RequestNotFound` when the
  /// request does not exist in `familyId`, and `#NotAuthorized` when the caller
  /// is not permitted to view the request. A request id from another family is
  /// never returned.
  public query ({ caller }) func listAuthorizedRecoveryAuditForFamily(
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : async Result.Result<[RecoveryTypes.RecoveryAuditView], RecoveryTypes.RecoveryError> {
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
    #ok(RecoveryLib.listAuthorizedAuditForFamily(recoveryRequests, recoveryAudit, profiles, stewards, familyId, recoveryId, caller));
  };

  /// Whether the caller may view a specific recovery request: an active Steward
  /// of the request's family, the requester, the current owner, or the
  /// replacement account. Evaluated against the request's own `familyId`, so a
  /// Steward of one family never reads another family's request.
  func canViewRequest(
    request : RecoveryTypes.RecoveryRequest,
    caller : Principal,
  ) : Bool {
    RecoveryLib.canViewRequestForFamily(stewards, request, caller);
  };
};

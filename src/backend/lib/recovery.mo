import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import RecoveryTypes "../types/recovery";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import MembershipTypes "../types/family-membership";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";
import StewardAuthorityLib "steward-authority";
import FamilyAuthorizationLib "family-authorization";
import FamilyMembershipLib "family-membership";
import NotificationsScopeLib "notifications-scope";

/// Phase 4A Recovery Foundation domain logic.
///
/// A recovery request restores control of an EXISTING `PersonProfile` to a
/// replacement account. It never creates a duplicate Person or membership and
/// never copies family data to a new profile: a successful recovery transfers
/// ownership of the existing profile from the current owner account to the
/// replacement account, atomically.
///
/// Every function below takes the requested `familyId` explicitly and evaluates
/// authority and data access against it. A person id, membership id, recovery
/// request id, or family id from one family never grants access in another.
///
/// The `*ForFamily` functions are the unrestricted, internal read primitives.
/// They are library-only and MUST NOT be exposed as public endpoints: the public
/// mixin wraps them with the caller-authorization gate.
module {
  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  /// INTERNAL (library-only, never a public endpoint). Returns the recovery
  /// request with `recoveryId` only when it belongs to `familyId`; a request id
  /// from another family never resolves here.
  public func getRequestForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : ?RecoveryTypes.RecoveryRequest {
    requests.find(func r = r.familyId == familyId and r.id == recoveryId);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns every recovery
  /// request of one family only. Requests from other families are never
  /// included.
  public func listRequestsForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    familyId : RecoveryTypes.FamilyId,
  ) : [RecoveryTypes.RecoveryRequest] {
    requests.toArray().filter(func r = r.familyId == familyId);
  };

  /// INTERNAL (library-only, never a public endpoint). Returns every
  /// verification decision recorded for `recoveryId` in `familyId`.
  public func listVerificationsForFamily(
    verifications : List.List<RecoveryTypes.RecoveryVerification>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : [RecoveryTypes.RecoveryVerification] {
    verifications.toArray().filter(func v =
      v.familyId == familyId and v.recoveryId == recoveryId
    );
  };

  /// INTERNAL (library-only, never a public endpoint). Returns the recovery
  /// audit history for `recoveryId` in `familyId`, in insertion order.
  public func listAuditForFamily(
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
  ) : [RecoveryTypes.RecoveryAuditEntry] {
    audit.toArray().filter(func a =
      a.familyId == familyId and a.recoveryId == recoveryId
    );
  };

  /// Phase 4D authorized recovery audit read (INTERNAL, library-only).
  ///
  /// Returns the recovery audit history for `recoveryId` in `familyId` projected
  /// to the family-safe `RecoveryAuditView` (plain-language action label, actor
  /// display label, affected display names, timestamp) — never the internal
  /// audit id, the recovery request id, the family id, the raw actor account
  /// principal, the raw affected person ids, or the free-text `summary`, so no
  /// private reason, technical error tag, account principal, or internal
  /// identifier is exposed.
  ///
  /// Display labels are resolved here on the backend: the actor is labelled
  /// relative to the caller ("You" when the caller performed the action, else
  /// "Family Steward" for an active Steward of the family, else "Family
  /// member"), and each affected person id is resolved to its family-scoped
  /// display name. The client never receives the raw account identifier or the
  /// raw person ids merely to derive these labels.
  ///
  /// Authorization reuses the same predicate as the single-request read: the
  /// caller must be an active Steward of the request's own family, the
  /// requester, the current owner, or the replacement account. A caller who is
  /// not authorized, or a request id from another family, yields an empty array
  /// (existence is never leaked).
  public func listAuthorizedAuditForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
    caller : Principal,
  ) : [RecoveryTypes.RecoveryAuditView] {
    let request = switch (getRequestForFamily(requests, familyId, recoveryId)) {
      case (?r) { r };
      case null { return [] };
    };
    if (not canViewRequestForFamily(stewards, request, caller)) {
      return [];
    };
    listAuditForFamily(audit, familyId, recoveryId).map(func a = {
      actionLabel = auditActionLabel(a.actionType);
      actorDisplayLabel = auditActorDisplayLabel(stewards, familyId, a.actorAccountId, caller);
      affectedDisplayNames = a.affectedPersonIds.map(func personId =
        switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
          case (?p) { p.name };
          case null { "Family member" };
        }
      );
      timestamp = a.timestamp;
    });
  };

  /// Whether `caller` may view a specific recovery request: an active Steward of
  /// the request's own family, the requester, the current owner, or the
  /// replacement account. Evaluated against the request's own `familyId`, so a
  /// Steward of one family never reads another family's request.
  public func canViewRequestForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    request : RecoveryTypes.RecoveryRequest,
    caller : Principal,
  ) : Bool {
    if (StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, request.familyId)) {
      return true;
    };
    caller == request.requestedByAccountId or caller == request.ownerAccountId or caller == request.replacementAccountId;
  };

  /// Phase 4B-H1 dedicated recovery discovery read (INTERNAL, library-only).
  ///
  /// Family-scoped name search over CLAIMED profiles of `familyId` only,
  /// returning the minimum recovery-safe data: an opaque target person
  /// identifier and the display name. It never returns family relationships,
  /// parents, siblings, profile story/history, photos, account principals,
  /// membership ids, or Steward data, and it never consults the relationship
  /// graph. A personId from another family never resolves here.
  ///
  /// Only claimed profiles are discoverable: recovery restores control of a
  /// profile that already has an owner, so an unclaimed profile is not a valid
  /// recovery target. An empty query returns no matches.
  public func searchRecoveryTargetsForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : RecoveryTypes.FamilyId,
    searchTerm : Text,
  ) : [RecoveryTypes.RecoveryTargetMatch] {
    let term = searchTerm.toLower();
    if (term == "") {
      return [];
    };
    profiles.values().toArray().filter(func p =
      p.familyId == familyId and
      p.claimedByUserId != null and
      p.name.toLower().contains(#text term)
    ).map(func p = {
      personId = p.personId;
      name = p.name;
    });
  };

  /// Phase 4B-H1 caller-scoped recovery status read (INTERNAL, library-only).
  ///
  /// Returns only the recovery requests of `familyId` where `caller` is the
  /// requester/replacement account, projected to the minimum caller-facing view
  /// (target display name, status, timestamps). It never returns another
  /// account's requests, and a request from another family never appears.
  ///
  /// For a `#StewardRecovery` request the view also carries the backend-derived
  /// quorum progress: `confirmationsReceived` is the number of distinct
  /// `#Confirm` verifications recorded for that request, and
  /// `confirmationsRequired` is the required quorum count (2). Both are `null`
  /// for an ordinary `#AccountRecovery` request, where the quorum does not
  /// apply. The counts are computed here from the request's own confirmations;
  /// the client never derives or supplies them. The view still exposes no
  /// verifier identities, verifier principals, membership ids, Steward ids,
  /// audit details, or unrelated family data.
  public func listMyRecoveryRequestsForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    verifications : List.List<RecoveryTypes.RecoveryVerification>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : RecoveryTypes.FamilyId,
    caller : Principal,
  ) : [RecoveryTypes.MyRecoveryRequestView] {
    requests.toArray().filter(func r =
      r.familyId == familyId and
      (r.requestedByAccountId == caller or r.replacementAccountId == caller)
    ).map(func r = {
      targetName = switch (TenancyLib.getProfileForFamily(profiles, familyId, r.personId)) {
        case (?p) { p.name };
        case null { "" };
      };
      status = r.status;
      createdAt = r.createdAt;
      updatedAt = r.updatedAt;
      // Quorum progress is meaningful only for a Steward Recovery request; an
      // ordinary Account Recovery request carries both counts as null.
      confirmationsReceived = switch (r.recoveryType) {
        case (#StewardRecovery) {
          ?verifications.toArray().filter(func v =
            v.familyId == familyId and v.recoveryId == r.id and v.decision == #Confirm
          ).size();
        };
        case (#AccountRecovery) { null };
      };
      confirmationsRequired = switch (r.recoveryType) {
        case (#StewardRecovery) { ?2 };
        case (#AccountRecovery) { null };
      };
    });
  };

  /// Phase 4C eligible-verifier read (INTERNAL, library-only).
  ///
  /// Returns the family-safe Steward Recovery verification context for every
  /// OPEN `#StewardRecovery` request of `familyId` that `caller` is eligible to
  /// verify. `caller` must be an approved family member of `familyId` (active
  /// Steward or `#Approved` profile claim) and must NOT be the recovery
  /// candidate (the requester, the current owner, or the replacement account).
  /// A request the caller has already verified is still returned, with
  /// `callerHasVerified = true` and `callerDecision` set, so the UI can show the
  /// recorded decision and suppress further actions; the candidate never
  /// receives an entry for their own request.
  ///
  /// The projection carries ONLY family-safe fields: the candidate's display
  /// name, the recovery status, the distinct confirmation count, the required
  /// quorum, and the caller's own verification state. It never returns account
  /// principals, recovery request ids, membership ids, verifier identities, or
  /// unrelated private family data. A caller who is not an approved family
  /// member, or a request from another family, yields no entry (existence is
  /// never leaked).
  public func listStewardRecoveryVerificationsForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    verifications : List.List<RecoveryTypes.RecoveryVerification>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    caller : Principal,
  ) : [RecoveryTypes.StewardRecoveryVerificationView] {
    // Only an approved family member of this family may discover or verify a
    // Steward Recovery request. An unaffiliated principal or a principal in
    // another family gets no entry, so existence is never leaked.
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return [];
    };
    requests.toArray().filter(func r =
      r.familyId == familyId and
      r.recoveryType == #StewardRecovery and
      isOpen(r.status) and
      // The candidate (requester / current owner / replacement account) never
      // receives a verifier entry for their own request and never counts toward
      // quorum.
      caller != r.requestedByAccountId and
      caller != r.ownerAccountId and
      caller != r.replacementAccountId
    ).map(func r = do {
      let confirmations = verifications.toArray().filter(func v =
        v.familyId == familyId and v.recoveryId == r.id and v.decision == #Confirm
      );
      let callerVerification = verifications.toArray().find(func v =
        v.familyId == familyId and v.recoveryId == r.id and v.verifierAccountId == caller
      );
      {
        recoveryId = r.id;
        candidateName = switch (TenancyLib.getProfileForFamily(profiles, familyId, r.personId)) {
          case (?p) { p.name };
          case null { "" };
        };
        status = r.status;
        confirmationsReceived = confirmations.size();
        confirmationsRequired = 2;
        callerHasVerified = callerVerification != null;
        callerDecision = switch (callerVerification) {
          case (?v) { ?v.decision };
          case null { null };
        };
      };
    });
  };

  // ---------------------------------------------------------------------------
  // Request creation
  // ---------------------------------------------------------------------------

  /// Creates a family-scoped recovery request for an existing Person/Profile.
  ///
  /// Self-service requester model: the caller is the replacement/new
  /// authenticated account. `replacementAccountId` MUST equal the caller, so a
  /// caller can never nominate an arbitrary third-party replacement account
  /// through this path. The caller does NOT need an existing family membership,
  /// profile claim, or second Person/Profile: a brand-new authenticated account
  /// that lost access to its old account can request recovery of its existing
  /// claimed Person/Profile. The request is only a pending claim — it grants no
  /// profile ownership, no family membership, and no Steward authority, and
  /// reveals no private family data.
  ///
  /// The old/current owner account (`ownerAccountId`) is derived from the
  /// existing target profile (`profile.claimedByUserId`), never supplied by the
  /// caller. The target must be an existing CLAIMED profile under family scope
  /// (`TenancyLib.getProfileForFamily`), so knowing a personId or familyId alone
  /// can never cause an ownership transfer.
  ///
  /// Idempotency: a second request for the same person while an earlier request
  /// is still open (`#Pending`, `#AwaitingVerification`, or `#ReadyForApproval`)
  /// is rejected with `#AlreadyPending`, so near-simultaneous duplicate requests
  /// cannot both proceed.
  ///
  /// The `recoveryType` is derived from the family's current Steward state: when
  /// the family has a usable active Steward the request is an ordinary
  /// `#AccountRecovery`; when no usable active Steward remains it is a
  /// `#StewardRecovery` requiring the 2-member quorum.
  public func requestRecoveryForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    notifications : List.List<OwnershipTypes.Notification>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    personId : RecoveryTypes.PersonId,
    replacementAccountId : RecoveryTypes.AccountId,
    caller : Principal,
  ) : Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    // Self-service path: the caller is the replacement account. A caller must
    // not be able to nominate an arbitrary third-party replacement account, so
    // the requested replacement must be the caller themselves.
    if (replacementAccountId != caller) {
      return #err(#NotAuthorized);
    };
    // The target must be an existing family-scoped profile. A personId from
    // another family never resolves here.
    let profile = switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case (?p) { p };
      case null { return #err(#PersonNotFound) };
    };
    // The target must be an existing CLAIMED profile: recovery restores control
    // of a profile that already has an owner. An unclaimed profile has no owner
    // to recover from, so it is not a valid recovery target.
    if (profile.claimedByUserId == null) {
      return #err(#PersonNotFound);
    };
    // Idempotency: reject a duplicate while an earlier request for the same
    // person is still open.
    let alreadyOpen = requests.toArray().any(func r =
      r.familyId == familyId and r.personId == personId and isOpen(r.status)
    );
    if (alreadyOpen) {
      return #err(#AlreadyPending);
    };
    let now = Time.now();
    let ownerAccountId = profile.claimedByUserId ?? caller;
    // A usable Steward is an active Steward other than the candidate. The
    // candidate is the requester, the current owner, or the replacement account;
    // a Steward who is any of those cannot approve this recovery (self-approval
    // is refused), so they must not count as a usable approver. When the only
    // active Steward is the candidate, the request is a #StewardRecovery and the
    // 2-member quorum path applies.
    let hasUsableSteward =
      stewards.toArray().any(func s =
        s.roleStatus == #Active and s.familyId == familyId and
        s.stewardAccountId != caller and
        s.stewardAccountId != ownerAccountId and
        s.stewardAccountId != replacementAccountId
      );
    let recoveryType : RecoveryTypes.RecoveryType =
      if (hasUsableSteward) {
        #AccountRecovery;
      } else {
        #StewardRecovery;
      };
    let request : RecoveryTypes.RecoveryRequest = {
      familyId;
      id = nextRequestId(requests);
      recoveryType;
      personId;
      ownerAccountId;
      replacementAccountId;
      status = #Pending;
      requestedByAccountId = caller;
      createdAt = now;
      updatedAt = now;
      decidedByAccountId = null;
      decidedAt = null;
      transferredAt = null;
    };
    requests.add(request);
    recordAudit(
      audit,
      familyId,
      request.id,
      #RequestCreated,
      caller,
      [personId],
      now,
      "Recovery request created",
    );
    // Phase 4D: notify the family members who must act on the new request
    // (the Steward for an Account Recovery, the eligible verifiers for a
    // Steward Recovery). Deduplicated per family/recipient/type/message, so a
    // repeated creation never spams a recipient.
    notifyReviewers(notifications, stewards, claims, familyId, request, now);
    #ok(request);
  };

  // ---------------------------------------------------------------------------
  // Account Recovery: Steward approval
  // ---------------------------------------------------------------------------

  /// Approves an ordinary `#AccountRecovery` request. Requires an active Steward
  /// of `familyId`. A Steward can never approve their own recovery request
  /// (`#SelfApproval`), and a Steward cannot approve a request whose replacement
  /// account is the Steward's own account. When another active Steward exists,
  /// that other Steward may approve a Steward's recovery.
  ///
  /// On success the ownership transfer is performed atomically and the request
  /// becomes `#Approved`. A request that is already resolved (`#Approved`,
  /// `#Rejected`, `#Cancelled`, or `#Expired`) is rejected with
  /// `#AlreadyResolved`, so a completed recovery can never execute the transfer
  /// twice.
  public func approveAccountRecoveryForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    notifications : List.List<OwnershipTypes.Notification>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
    caller : Principal,
  ) : Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let request = switch (getRequestForFamily(requests, familyId, recoveryId)) {
      case (?r) { r };
      case null { return #err(#RequestNotFound) };
    };
    if (isResolved(request.status)) {
      return #err(#AlreadyResolved);
    };
    if (request.recoveryType != #AccountRecovery) {
      return #err(#InvalidTransition);
    };
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      return #err(#NotSteward);
    };
    // Self-approval prevention: a Steward may never approve their own recovery,
    // whether they are the requester, the current owner, or the replacement.
    if (caller == request.requestedByAccountId or caller == request.ownerAccountId or caller == request.replacementAccountId) {
      return #err(#SelfApproval);
    };
    // Re-verify the replacement account's eligibility at approval time, not
    // only at request creation. The self-service replacement is the request's
    // own `replacementAccountId` (the caller who created the request), so it is
    // accepted even without a pre-existing family membership: the replacement
    // must not have to create a second membership first. A replacement that is
    // not the request's own replacement account still has to be a valid,
    // family-scoped account, so a principal with no relationship to the family
    // is refused.
    if (not isEligibleReplacementForRequest(stewards, claims, memberships, request, familyId)) {
      return #err(#ReplacementNotMember);
    };
    let now = Time.now();
    let updated = transferOwnership(
      requests,
      audit,
      notifications,
      profiles,
      memberships,
      stewards,
      familyId,
      request,
      caller,
      now,
    );
    #ok(updated);
  };

  // ---------------------------------------------------------------------------
  // Steward Recovery: 2-member quorum
  // ---------------------------------------------------------------------------

  /// Records one approved family member's verification decision on a
  /// `#StewardRecovery` request.
  ///
  /// The candidate (the requester / current owner / replacement account) cannot
  /// verify their own request (`#SelfVerification`), and the same verifier can
  /// never count twice (`#AlreadyVerifier`). A `#Reject` decision immediately
  /// resolves the request as `#Rejected`. A `#Confirm` decision moves the
  /// request to `#AwaitingVerification`; once 2 distinct confirmations from
  /// accounts that differ from the candidate and from each other are recorded,
  /// the request becomes `#ReadyForApproval` and the ownership transfer is
  /// performed atomically.
  public func verifyStewardRecoveryForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    verifications : List.List<RecoveryTypes.RecoveryVerification>,
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    notifications : List.List<OwnershipTypes.Notification>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
    decision : RecoveryTypes.RecoveryVerificationDecision,
    caller : Principal,
  ) : Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let request = switch (getRequestForFamily(requests, familyId, recoveryId)) {
      case (?r) { r };
      case null { return #err(#RequestNotFound) };
    };
    if (isResolved(request.status)) {
      return #err(#AlreadyResolved);
    };
    if (request.recoveryType != #StewardRecovery) {
      return #err(#InvalidTransition);
    };
    // Only an approved family member of this family may verify.
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    // The candidate cannot verify their own request and does not count toward
    // quorum.
    if (caller == request.requestedByAccountId or caller == request.ownerAccountId or caller == request.replacementAccountId) {
      return #err(#SelfVerification);
    };
    // The same verifier can never count twice.
    let alreadyVerified = verifications.toArray().any(func v =
      v.familyId == familyId and v.recoveryId == recoveryId and v.verifierAccountId == caller
    );
    if (alreadyVerified) {
      return #err(#AlreadyVerifier);
    };
    let now = Time.now();
    verifications.add({
      familyId;
      id = nextVerificationId(verifications);
      recoveryId;
      verifierAccountId = caller;
      decision;
      decidedAt = now;
    });
    recordAudit(
      audit,
      familyId,
      recoveryId,
      #VerificationRecorded,
      caller,
      [request.personId],
      now,
      "Recovery verification recorded",
    );
    switch (decision) {
      case (#Reject) {
        let rejected = setStatus(requests, request, #Rejected, caller, now);
        recordAudit(
          audit,
          familyId,
          recoveryId,
          #ResolutionRecorded,
          caller,
          [request.personId],
          now,
          "Recovery request rejected",
        );
        // Phase 4D: tell the candidate their recovery was not approved.
        notifyCandidate(
          notifications,
          familyId,
          request,
          #RecoveryRejected,
          "A profile recovery request was not approved.",
          now,
        );
        #ok(rejected);
      };
      case (#Confirm) {
        let confirmations = verifications.toArray().filter(func v =
          v.familyId == familyId and v.recoveryId == recoveryId and v.decision == #Confirm
        );
        if (confirmations.size() >= 2) {
          // Re-verify the replacement account's eligibility at resolution time,
          // not only at request creation. The self-service replacement is the
          // request's own `replacementAccountId` (the caller who created the
          // request), so it is accepted even without a pre-existing family
          // membership: the replacement must not have to create a second
          // membership first. A replacement that is not the request's own
          // replacement account still has to be a valid, family-scoped account,
          // so a principal with no relationship to the family is refused.
          if (not isEligibleReplacementForRequest(stewards, claims, memberships, request, familyId)) {
            return #err(#ReplacementNotMember);
          };
          // Quorum met: mark ready, then transfer ownership atomically.
          let ready = setStatus(requests, request, #ReadyForApproval, caller, now);
          let transferred = transferOwnership(
            requests,
            audit,
            notifications,
            profiles,
            memberships,
            stewards,
            familyId,
            ready,
            caller,
            now,
          );
          #ok(transferred);
        } else {
          let awaiting = setStatus(requests, request, #AwaitingVerification, caller, now);
          // Phase 4D: tell the candidate a family member recorded a
          // verification. Deduplicated, so multiple confirmations collapse to
          // one notification.
          notifyCandidate(
            notifications,
            familyId,
            request,
            #RecoveryVerificationRecorded,
            "A family member recorded a verification for a profile recovery request.",
            now,
          );
          #ok(awaiting);
        };
      };
    };
  };

  /// Rejects an open recovery request. Allowed for an active Steward of
  /// `familyId` (Account Recovery) or the requester themselves (withdrawal).
  /// A resolved request is rejected with `#AlreadyResolved`.
  public func rejectRecoveryForFamily(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    notifications : List.List<OwnershipTypes.Notification>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
    caller : Principal,
  ) : Result.Result<RecoveryTypes.RecoveryRequest, RecoveryTypes.RecoveryError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let request = switch (getRequestForFamily(requests, familyId, recoveryId)) {
      case (?r) { r };
      case null { return #err(#RequestNotFound) };
    };
    if (isResolved(request.status)) {
      return #err(#AlreadyResolved);
    };
    let isSteward = StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId);
    if (not isSteward and caller != request.requestedByAccountId) {
      return #err(#NotAuthorized);
    };
    let now = Time.now();
    let rejected = setStatus(requests, request, #Rejected, caller, now);
    recordAudit(
      audit,
      familyId,
      recoveryId,
      #ResolutionRecorded,
      caller,
      [request.personId],
      now,
      "Recovery request rejected",
    );
    // Phase 4D: tell the candidate their recovery was not approved.
    notifyCandidate(
      notifications,
      familyId,
      request,
      #RecoveryRejected,
      "A profile recovery request was not approved.",
      now,
    );
    #ok(rejected);
  };

  // ---------------------------------------------------------------------------
  // Ownership transfer
  // ---------------------------------------------------------------------------

  /// Performs the atomic ownership transfer for an approved recovery.
  ///
  /// In one step it removes ownership from the old account and grants it to the
  /// replacement account on the EXISTING profile, preserving the profile,
  /// memberships, relationships, archive/history, photos/media, and family data.
  /// It never creates a duplicate Person or membership and never deletes the old
  /// account record. The request is marked `#Approved` with `transferredAt` set,
  /// so a completed recovery can never execute the transfer twice.
  ///
  /// The transfer is idempotent at the request level: a request that already has
  /// `transferredAt` set is returned unchanged.
  func transferOwnership(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    notifications : List.List<OwnershipTypes.Notification>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    request : RecoveryTypes.RecoveryRequest,
    decider : Principal,
    now : Int,
  ) : RecoveryTypes.RecoveryRequest {
    switch (request.transferredAt) {
      case (?_) { return request };
      case null {};
    };
    // Re-read the profile under the family scope so a cross-family person id can
    // never be transferred. The profile's CURRENT owner is captured here rather
    // than trusting the request-time `request.ownerAccountId`: an already-claimed
    // profile can be reassigned to a new claimant while the recovery request is
    // open, so the Steward authority retarget below must follow the principal
    // that actually owns the profile at transfer time.
    var currentOwnerAccountId = request.ownerAccountId;
    switch (TenancyLib.getProfileForFamily(profiles, familyId, request.personId)) {
      case (?profile) {
        currentOwnerAccountId := profile.claimedByUserId ?? request.ownerAccountId;
        // Remove ownership from the old account and grant it to the replacement
        // account on the SAME profile record. No new Person is created.
        let updatedProfile : OwnershipTypes.PersonProfile = {
          familyId = profile.familyId;
          personId = profile.personId;
          name = profile.name;
          livingStatus = profile.livingStatus;
          claimStatus = #Claimed;
          claimedByUserId = ?request.replacementAccountId;
          preferredName = profile.preferredName;
          firstName = profile.firstName;
          middleName = profile.middleName;
          lastName = profile.lastName;
          suffix = profile.suffix;
          nickname = profile.nickname;
          story = profile.story;
          shortBio = profile.shortBio;
          longerStory = profile.longerStory;
          occupation = profile.occupation;
          birthInfo = profile.birthInfo;
          birthDate = profile.birthDate;
          birthplace = profile.birthplace;
          currentLocation = profile.currentLocation;
          timeline = profile.timeline;
          privacySettings = profile.privacySettings;
        };
        TenancyLib.putProfileForFamily(profiles, familyId, updatedProfile);
      };
      case null {};
    };
    // Move the active membership for this person from the old account to the
    // replacement account, preserving the membership record (no duplicate).
    transferMembershipForPerson(memberships, familyId, request.personId, request.replacementAccountId, now);
    // If the recovered profile's owner currently holds active Steward authority
    // in this family, retarget that EXISTING StewardRecord to the replacement
    // account as part of the same atomic transfer. The record is preserved (same
    // familyId, roleStatus, successorPriority, assignedBy, assignedAt, founding)
    // rather than duplicated, and governance history is untouched. After a
    // completed recovery the old principal holds no active Steward authority for
    // this family and the replacement holds the corresponding authority. This
    // runs inside the `transferredAt` guard above, so a replayed recovery can
    // never transfer authority twice.
    let stewardTransferred = StewardAuthorityLib.reassignStewardForFamily(
      stewards,
      familyId,
      currentOwnerAccountId,
      request.replacementAccountId,
    );
    let updated : RecoveryTypes.RecoveryRequest = {
      familyId = request.familyId;
      id = request.id;
      recoveryType = request.recoveryType;
      personId = request.personId;
      ownerAccountId = request.ownerAccountId;
      replacementAccountId = request.replacementAccountId;
      status = #Approved;
      requestedByAccountId = request.requestedByAccountId;
      createdAt = request.createdAt;
      updatedAt = now;
      decidedByAccountId = ?decider;
      decidedAt = ?now;
      transferredAt = ?now;
    };
    replaceRequest(requests, updated);
    recordAudit(
      audit,
      familyId,
      request.id,
      #StewardDecisionRecorded,
      decider,
      [request.personId],
      now,
      "Recovery decision recorded",
    );
    // Record the final resolution of a successful recovery, so the
    // final-resolution event is present in successful histories in addition to
    // the Steward decision and the ownership transfer.
    recordAudit(
      audit,
      familyId,
      request.id,
      #ResolutionRecorded,
      decider,
      [request.personId],
      now,
      "Recovery request approved",
    );
    recordAudit(
      audit,
      familyId,
      request.id,
      #OwnershipTransferred,
      decider,
      [request.personId],
      now,
      "Profile ownership transferred",
    );
    // Record the Steward authority transfer in the recovery history when the
    // recovered profile's owner held active Steward authority. The existing
    // audit model is reused; no public API shape changes.
    if (stewardTransferred) {
      recordAudit(
        audit,
        familyId,
        request.id,
        #StewardDecisionRecorded,
        decider,
        [request.personId],
        now,
        "Steward authority transferred to replacement account",
      );
    };
    // Phase 4D: tell the candidate their recovery was approved. This runs
    // inside the `transferredAt` guard above, so a replayed recovery never
    // emits a second approval notification.
    notifyCandidate(
      notifications,
      familyId,
      request,
      #RecoveryApproved,
      "A profile recovery request was approved.",
      now,
    );
    updated;
  };

  /// Moves ownership of `personId` in `familyId` to `replacementAccountId`,
  /// preserving membership records and their ids. Exactly one `#Active`
  /// membership owns the person afterwards: the old owner's `#Active`
  /// membership for the person is deactivated (set to `#Left`, never deleted)
  /// before the replacement's membership is activated, so no state ever has two
  /// accounts owning the same Person/Profile. No duplicate membership is
  /// created.
  func transferMembershipForPerson(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : RecoveryTypes.FamilyId,
    personId : RecoveryTypes.PersonId,
    replacementAccountId : RecoveryTypes.AccountId,
    now : Int,
  ) {
    // The membership that currently owns the person in this family, if any.
    let ownerMembership = memberships.find(func m =
      m.familyId == familyId and m.personId == personId and m.status == #Active
    );
    // The replacement account's own membership in this family, if any.
    let replacementMembership = memberships.find(func m =
      m.familyId == familyId and m.accountId == replacementAccountId
    );
    switch (replacementMembership) {
      case (?m) {
        // The replacement already holds a membership. If it is already the
        // active owner of this person there is nothing to move; otherwise
        // deactivate the old owner's active membership first, then activate the
        // replacement's membership for the person. The two records are distinct,
        // so the old owner's membership is preserved as `#Left` rather than
        // deleted.
        let alreadyOwner = switch (ownerMembership) {
          case (?owner) { owner.id == m.id };
          case null { false };
        };
        if (not alreadyOwner) {
          switch (ownerMembership) {
            case (?owner) { deactivateMembership(memberships, owner, now) };
            case null {};
          };
          let updated : MembershipTypes.FamilyMembership = {
            id = m.id;
            familyId = m.familyId;
            accountId = m.accountId;
            personId;
            status = #Active;
            joinedAt = ?(m.joinedAt ?? now);
            approvedBy = ?replacementAccountId;
            approvedAt = ?now;
            createdAt = m.createdAt;
            updatedAt = now;
          };
          replaceMembership(memberships, updated);
        };
      };
      case null {
        // The replacement has no membership yet: retarget the existing active
        // owner membership to the replacement account, preserving its id.
        switch (ownerMembership) {
          case (?m) {
            let updated : MembershipTypes.FamilyMembership = {
              id = m.id;
              familyId = m.familyId;
              accountId = replacementAccountId;
              personId = m.personId;
              status = #Active;
              joinedAt = m.joinedAt;
              approvedBy = ?replacementAccountId;
              approvedAt = ?now;
              createdAt = m.createdAt;
              updatedAt = now;
            };
            replaceMembership(memberships, updated);
          };
          case null {};
        };
      };
    };
  };

  /// Deactivates a membership by setting it to `#Left`, preserving the record
  /// and its id. Used by the ownership transfer to release the old owner's
  /// active membership before the replacement's is activated, so at most one
  /// `#Active` membership owns a person at any time.
  func deactivateMembership(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    membership : MembershipTypes.FamilyMembership,
    now : Int,
  ) {
    let updated : MembershipTypes.FamilyMembership = {
      id = membership.id;
      familyId = membership.familyId;
      accountId = membership.accountId;
      personId = membership.personId;
      status = #Left;
      joinedAt = membership.joinedAt;
      approvedBy = membership.approvedBy;
      approvedAt = membership.approvedAt;
      createdAt = membership.createdAt;
      updatedAt = now;
    };
    replaceMembership(memberships, updated);
  };

  // ---------------------------------------------------------------------------
  // OQL rows
  // ---------------------------------------------------------------------------

  /// Flattens every recovery request into OQL-exposable rows.
  public func requestRows(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
  ) : [RecoveryTypes.RecoveryRequestRow] {
    requests.toArray().map(func r = {
      familyId = r.familyId;
      id = r.id;
      recoveryType = recoveryTypeText(r.recoveryType);
      personId = r.personId;
      ownerAccountId = r.ownerAccountId.toText();
      replacementAccountId = r.replacementAccountId.toText();
      status = statusText(r.status);
      requestedByAccountId = r.requestedByAccountId.toText();
      createdAt = r.createdAt;
      updatedAt = r.updatedAt;
      decidedByAccountId = switch (r.decidedByAccountId) { case (?p) p.toText(); case null "" };
      decidedAt = r.decidedAt ?? 0;
      transferredAt = r.transferredAt ?? 0;
    });
  };

  /// Flattens every recovery verification into OQL-exposable rows.
  public func verificationRows(
    verifications : List.List<RecoveryTypes.RecoveryVerification>,
  ) : [RecoveryTypes.RecoveryVerificationRow] {
    verifications.toArray().map(func v = {
      familyId = v.familyId;
      id = v.id;
      recoveryId = v.recoveryId;
      verifierAccountId = v.verifierAccountId.toText();
      decision = verificationDecisionText(v.decision);
      decidedAt = v.decidedAt;
    });
  };

  /// Flattens every recovery audit entry into OQL-exposable rows.
  public func auditRows(
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
  ) : [RecoveryTypes.RecoveryAuditRow] {
    audit.toArray().map(func a = {
      familyId = a.familyId;
      id = a.id;
      recoveryId = a.recoveryId;
      actionType = auditActionText(a.actionType);
      actorAccountId = a.actorAccountId.toText();
      affectedPersonCount = a.affectedPersonIds.size();
      timestamp = a.timestamp;
      summary = a.summary;
    });
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /// Phase 4D: notifies the family members who must act on a newly created
  /// recovery request. For an ordinary `#AccountRecovery` those are the family's
  /// active Stewards; for a `#StewardRecovery` (no usable active Steward) they
  /// are the eligible verifiers: the family's active Stewards and approved
  /// profile claimants. The candidate (requester / current owner / replacement
  /// account) is never notified about their own request. Every notification is
  /// family-scoped and deduplicated per family/recipient/type/message, so a
  /// repeated creation never spams a recipient.
  func notifyReviewers(
    notifications : List.List<OwnershipTypes.Notification>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : RecoveryTypes.FamilyId,
    request : RecoveryTypes.RecoveryRequest,
    now : Int,
  ) {
    let recipients = switch (request.recoveryType) {
      case (#AccountRecovery) {
        stewards.toArray().filter(func s =
          s.familyId == familyId and s.roleStatus == #Active
        ).map(func s = s.stewardAccountId);
      };
      case (#StewardRecovery) {
        let stewardAccounts = stewards.toArray().filter(func s =
          s.familyId == familyId and s.roleStatus == #Active
        ).map(func s = s.stewardAccountId);
        let claimAccounts = claims.toArray().filter(func c =
          c.familyId == familyId and c.status == #Approved
        ).map(func c = c.requestingUserId);
        stewardAccounts.concat(claimAccounts);
      };
    };
    for (recipient in recipients.values()) {
      if (recipient != request.requestedByAccountId and recipient != request.ownerAccountId and recipient != request.replacementAccountId) {
        ignore NotificationsScopeLib.createUniqueForFamily(
          notifications,
          familyId,
          recipient,
          #RecoveryRequestSubmitted,
          "A profile recovery request needs your review.",
          now,
        );
      };
    };
  };

  /// Phase 4D: notifies the recovery candidate (the replacement account that
  /// will own the recovered profile) of a lifecycle transition. Family-scoped
  /// and deduplicated per family/recipient/type/message, so a repeated
  /// transition never creates a duplicate notification.
  func notifyCandidate(
    notifications : List.List<OwnershipTypes.Notification>,
    familyId : RecoveryTypes.FamilyId,
    request : RecoveryTypes.RecoveryRequest,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
    now : Int,
  ) {
    ignore NotificationsScopeLib.createUniqueForFamily(
      notifications,
      familyId,
      request.replacementAccountId,
      notificationType,
      message,
      now,
    );
  };

  /// Whether `accountId` is a valid, family-scoped replacement account for a
  /// recovery in `familyId`: an approved family member (active Steward or
  /// `#Approved` profile claim) OR an `#Active` membership holder. A principal
  /// with no relationship to the family is never eligible, so a recovery can
  /// never hand a profile to an account outside the family. A replacement that
  /// can authenticate but has not yet created a second family profile is
  /// eligible, which is the Account Recovery case.
  func isEligibleReplacement(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    accountId : Principal,
    familyId : RecoveryTypes.FamilyId,
  ) : Bool {
    FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, accountId, familyId) or
    FamilyMembershipLib.hasActiveMembershipForFamily(memberships, familyId, accountId);
  };

  /// Whether the replacement account of `request` is eligible at approval or
  /// quorum-resolution time. The self-service replacement is the request's own
  /// `replacementAccountId` (the caller who created the request), so it is
  /// accepted even without a pre-existing family membership: the replacement
  /// must not have to create a second membership first. Any other replacement
  /// account must still be a valid, family-scoped account via
  /// `isEligibleReplacement`, so a principal with no relationship to the family
  /// is refused and a recovery can never hand a profile to an account outside
  /// the family.
  func isEligibleReplacementForRequest(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    request : RecoveryTypes.RecoveryRequest,
    familyId : RecoveryTypes.FamilyId,
  ) : Bool {
    // The self-service replacement is the request's own replacement account.
    // It was validated at request creation (it equals the caller and the target
    // is an existing claimed profile), so it is accepted here without requiring
    // a family membership.
    if (request.replacementAccountId == request.requestedByAccountId) {
      return true;
    };
    isEligibleReplacement(stewards, claims, memberships, request.replacementAccountId, familyId);
  };

  /// Whether a recovery status is still open (not finally resolved).
  func isOpen(status : RecoveryTypes.RecoveryStatus) : Bool {
    switch (status) {
      case (#Pending) true;
      case (#AwaitingVerification) true;
      case (#ReadyForApproval) true;
      case (#Approved) false;
      case (#Rejected) false;
      case (#Cancelled) false;
      case (#Expired) false;
    };
  };

  /// Whether a recovery status is finally resolved.
  func isResolved(status : RecoveryTypes.RecoveryStatus) : Bool {
    not isOpen(status);
  };

  /// Replaces the stored request with the same id, preserving list order.
  func replaceRequest(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    updated : RecoveryTypes.RecoveryRequest,
  ) {
    let snapshot = requests.toArray();
    requests.clear();
    for (r in snapshot.values()) {
      if (r.id == updated.id) { requests.add(updated) } else { requests.add(r) };
    };
  };

  /// Replaces the stored membership with the same id, preserving list order.
  func replaceMembership(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    updated : MembershipTypes.FamilyMembership,
  ) {
    let snapshot = memberships.toArray();
    memberships.clear();
    for (m in snapshot.values()) {
      if (m.id == updated.id) { memberships.add(updated) } else { memberships.add(m) };
    };
  };

  /// Returns a copy of `request` with a new status, updated timestamp, and the
  /// deciding account recorded.
  func setStatus(
    requests : List.List<RecoveryTypes.RecoveryRequest>,
    request : RecoveryTypes.RecoveryRequest,
    status : RecoveryTypes.RecoveryStatus,
    decider : Principal,
    now : Int,
  ) : RecoveryTypes.RecoveryRequest {
    let updated : RecoveryTypes.RecoveryRequest = {
      familyId = request.familyId;
      id = request.id;
      recoveryType = request.recoveryType;
      personId = request.personId;
      ownerAccountId = request.ownerAccountId;
      replacementAccountId = request.replacementAccountId;
      status;
      requestedByAccountId = request.requestedByAccountId;
      createdAt = request.createdAt;
      updatedAt = now;
      decidedByAccountId = ?decider;
      decidedAt = ?now;
      transferredAt = request.transferredAt;
    };
    replaceRequest(requests, updated);
    updated;
  };

  /// Appends a recovery audit entry with a fresh id.
  func recordAudit(
    audit : List.List<RecoveryTypes.RecoveryAuditEntry>,
    familyId : RecoveryTypes.FamilyId,
    recoveryId : Nat,
    actionType : RecoveryTypes.RecoveryAuditActionType,
    decider : Principal,
    affectedPersonIds : [RecoveryTypes.PersonId],
    timestamp : Int,
    summary : Text,
  ) {
    audit.add({
      familyId;
      id = nextAuditId(audit);
      recoveryId;
      actionType;
      actorAccountId = decider;
      affectedPersonIds;
      timestamp;
      summary;
    });
  };

  /// The next recovery request id: one greater than the largest existing id, or
  /// `0` when there are no requests.
  func nextRequestId(requests : List.List<RecoveryTypes.RecoveryRequest>) : Nat {
    var maxId = 0;
    for (r in requests.toArray().values()) {
      if (r.id >= maxId) { maxId := r.id + 1 };
    };
    maxId;
  };

  /// The next recovery audit id: one greater than the largest existing id, or
  /// `0` when the log is empty.
  func nextAuditId(audit : List.List<RecoveryTypes.RecoveryAuditEntry>) : Nat {
    var maxId = 0;
    for (a in audit.toArray().values()) {
      if (a.id >= maxId) { maxId := a.id + 1 };
    };
    maxId;
  };

  /// The next recovery verification id: one greater than the largest existing
  /// id, or `0` when there are no verifications.
  func nextVerificationId(verifications : List.List<RecoveryTypes.RecoveryVerification>) : Nat {
    var maxId = 0;
    for (v in verifications.toArray().values()) {
      if (v.id >= maxId) { maxId := v.id + 1 };
    };
    maxId;
  };

  /// Renders a recovery type variant as its tag text for OQL rows.
  func recoveryTypeText(t : RecoveryTypes.RecoveryType) : Text {
    switch (t) {
      case (#AccountRecovery) "AccountRecovery";
      case (#StewardRecovery) "StewardRecovery";
    };
  };

  /// Renders a recovery status variant as its tag text for OQL rows.
  func statusText(s : RecoveryTypes.RecoveryStatus) : Text {
    switch (s) {
      case (#Pending) "Pending";
      case (#AwaitingVerification) "AwaitingVerification";
      case (#ReadyForApproval) "ReadyForApproval";
      case (#Approved) "Approved";
      case (#Rejected) "Rejected";
      case (#Cancelled) "Cancelled";
      case (#Expired) "Expired";
    };
  };

  /// Renders a verification decision variant as its tag text for OQL rows.
  func verificationDecisionText(d : RecoveryTypes.RecoveryVerificationDecision) : Text {
    switch (d) {
      case (#Confirm) "Confirm";
      case (#Reject) "Reject";
    };
  };

  /// Renders a recovery audit action variant as its tag text for OQL rows.
  func auditActionText(a : RecoveryTypes.RecoveryAuditActionType) : Text {
    switch (a) {
      case (#RequestCreated) "RequestCreated";
      case (#VerificationRecorded) "VerificationRecorded";
      case (#StewardDecisionRecorded) "StewardDecisionRecorded";
      case (#ResolutionRecorded) "ResolutionRecorded";
      case (#OwnershipTransferred) "OwnershipTransferred";
    };
  };

  /// Renders a recovery audit action variant as plain family-facing language for
  /// the authorized audit view. Never a technical tag or error code.
  func auditActionLabel(a : RecoveryTypes.RecoveryAuditActionType) : Text {
    switch (a) {
      case (#RequestCreated) "Recovery requested";
      case (#VerificationRecorded) "Verification recorded";
      case (#StewardDecisionRecorded) "Steward decision recorded";
      case (#ResolutionRecorded) "Recovery resolved";
      case (#OwnershipTransferred) "Profile ownership transferred";
    };
  };

  /// Resolves the family-facing display label for the account that performed an
  /// audit action, relative to `caller`: "You" when the caller performed the
  /// action, "Family Steward" when the actor is an active Steward of `familyId`,
  /// otherwise "Family member". The raw account principal is never returned.
  func auditActorDisplayLabel(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    familyId : RecoveryTypes.FamilyId,
    actorAccountId : Principal,
    caller : Principal,
  ) : Text {
    if (actorAccountId == caller) {
      return "You";
    };
    if (StewardAuthorityLib.isActiveStewardForFamily(stewards, actorAccountId, familyId)) {
      return "Family Steward";
    };
    "Family member";
  };
};

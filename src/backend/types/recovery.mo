import Principal "mo:core/Principal";

/// Recovery domain types (Phase 4A — Recovery Foundation).
///
/// A `RecoveryRequest` restores control of an EXISTING `PersonProfile` to a
/// replacement account. It is deliberately separate from `ProfileClaim`,
/// `FamilyMembership`, and `StewardRecord`:
///
/// - `ProfileClaim` is the legacy first-time ownership workflow.
/// - `FamilyMembership` is the canonical account-to-family membership link.
/// - `StewardRecord` is the single source of Family Steward authority.
///
/// Recovery NEVER creates a duplicate Person or membership and NEVER copies
/// family data to a new profile: a successful recovery transfers ownership of
/// the existing profile from the current owner account to the replacement
/// account, atomically.
///
/// Every record carries `familyId` as the tenant boundary. Knowing a person id,
/// membership id, recovery request id, or family id never permits cross-family
/// recovery access.
module {
  /// Identifier of a family in the multi-family tenancy model.
  public type FamilyId = Text;

  /// Identifier of a person in the family tree (e.g. "julia", "clayton").
  public type PersonId = Text;

  /// Stable internal account identifier (an ICP Principal).
  public type AccountId = Principal;

  /// The kind of recovery being requested.
  ///
  /// - `#AccountRecovery` — restores control of an existing Person/Profile to a
  ///   replacement account. Requires an active Family Steward to approve.
  /// - `#StewardRecovery` — recovery when no usable active Steward remains;
  ///   requires confirmation from 2 distinct approved family members.
  public type RecoveryType = {
    #AccountRecovery;
    #StewardRecovery;
  };

  /// Lifecycle of a recovery request.
  ///
  /// - `#Pending` — created; no verification/approval recorded yet.
  /// - `#AwaitingVerification` — Steward Recovery collecting the 2-member
  ///   quorum of independent verifications.
  /// - `#ReadyForApproval` — verification quorum satisfied; awaiting the final
  ///   Steward decision (Account Recovery) or resolution (Steward Recovery).
  /// - `#Approved` — approved; ownership transfer is authorized.
  /// - `#Rejected` — denied; no ownership transfer.
  /// - `#Cancelled` — withdrawn by the requester before resolution.
  /// - `#Expired` — lapsed before resolution.
  public type RecoveryStatus = {
    #Pending;
    #AwaitingVerification;
    #ReadyForApproval;
    #Approved;
    #Rejected;
    #Cancelled;
    #Expired;
  };

  /// A single verification decision on a recovery request.
  ///
  /// Used for the 2-member quorum required by Steward Recovery. The candidate
  /// cannot verify their own request and does not count toward quorum; both
  /// verifiers must differ from the candidate and from each other, and the same
  /// verifier can never count twice.
  public type RecoveryVerificationDecision = {
    #Confirm;
    #Reject;
  };

  /// A persisted verification decision by one approved family member.
  ///
  /// `familyId` is the tenant boundary; `verifierAccountId` must be an approved
  /// family member of `familyId` and must differ from the candidate. A verifier
  /// may record at most one decision per recovery request. `id` is a
  /// family-unique verification id used as the OQL row key.
  public type RecoveryVerification = {
    familyId : FamilyId;
    id : Nat;
    recoveryId : Nat;
    verifierAccountId : AccountId;
    decision : RecoveryVerificationDecision;
    decidedAt : Int;
  };

  /// The kind of recovery audit event recorded in the recovery history.
  ///
  /// Covers request creation, verification decisions, the Steward decision, the
  /// final resolution, and the ownership transfer.
  public type RecoveryAuditActionType = {
    #RequestCreated;
    #VerificationRecorded;
    #StewardDecisionRecorded;
    #ResolutionRecorded;
    #OwnershipTransferred;
  };

  /// A single recovery audit history entry.
  ///
  /// `familyId` is the tenant boundary for the entry. `actorAccountId` is the
  /// account that performed the action (the requester, a verifier, or the
  /// deciding Steward). `affectedPersonIds` carries the profile whose ownership
  /// is at stake. `timestamp` is a nanosecond timestamp.
  public type RecoveryAuditEntry = {
    familyId : FamilyId;
    id : Nat;
    recoveryId : Nat;
    actionType : RecoveryAuditActionType;
    actorAccountId : AccountId;
    affectedPersonIds : [PersonId];
    timestamp : Int;
    summary : Text;
  };

  /// A family-scoped recovery request.
  ///
  /// References exactly one existing Person/Profile (`personId`), the current
  /// owner account identity (`ownerAccountId`), and the requested replacement
  /// account identity (`replacementAccountId`). `personId` must belong to
  /// `familyId`, and both accounts must be members of `familyId`.
  ///
  /// `status` is the lifecycle state; `createdAt`/`updatedAt` are nanosecond
  /// timestamps. `decidedByAccountId`/`decidedAt` record the final Steward
  /// decision (Account Recovery) or resolution (Steward Recovery).
  /// `transferredAt` is set once ownership has been transferred, so a completed
  /// recovery can never execute the transfer twice.
  public type RecoveryRequest = {
    familyId : FamilyId;
    id : Nat;
    recoveryType : RecoveryType;
    personId : PersonId;
    ownerAccountId : AccountId;
    replacementAccountId : AccountId;
    status : RecoveryStatus;
    requestedByAccountId : AccountId;
    createdAt : Int;
    updatedAt : Int;
    decidedByAccountId : ?AccountId;
    decidedAt : ?Int;
    transferredAt : ?Int;
  };

  /// Phase 4B-H1 dedicated recovery discovery result.
  ///
  /// The MINIMUM recovery-safe data needed to select a recovery target: an
  /// opaque target person identifier (used to submit the recovery request) and
  /// the display name. It deliberately does NOT reuse `PersonMatch`, which
  /// carries `parents` and therefore leaks family relationships.
  ///
  /// This type must never grow relationship, parent, sibling, story/history,
  /// photo, account-principal, membership-id, or Steward fields: an
  /// unaffiliated replacement account must not be able to browse or enumerate
  /// the family tree during recovery.
  public type RecoveryTargetMatch = {
    personId : PersonId;
    name : Text;
  };

  /// Phase 4B-H1 caller-facing recovery status view.
  ///
  /// The MINIMUM data a signed-in replacement account may see about its OWN
  /// recovery requests: the target's display name, the plain-language recovery
  /// status, the relevant timestamps, and — for a Steward Recovery request — the
  /// backend-derived quorum progress. It deliberately omits the old owner
  /// principal, the replacement principal, the recovery internal id, membership
  /// ids, verifier identities, Steward ids, audit details, and every other
  /// family datum.
  ///
  /// `confirmationsReceived`/`confirmationsRequired` are populated ONLY for a
  /// `#StewardRecovery` request, where they carry the number of distinct family
  /// confirmations recorded so far and the required quorum count. For an
  /// ordinary `#AccountRecovery` request both are `null`, because the 2-member
  /// quorum does not apply. The client never derives or supplies these counts.
  public type MyRecoveryRequestView = {
    targetName : Text;
    status : RecoveryStatus;
    createdAt : Int;
    updatedAt : Int;
    confirmationsReceived : ?Nat;
    confirmationsRequired : ?Nat;
  };

  /// Phase 4C family-safe Steward Recovery verification view.
  ///
  /// The MINIMUM data an eligible approved family member needs to independently
  /// verify a pending Steward Recovery request when no usable active Steward
  /// remains: the candidate's display name, the plain-language-able recovery
  /// status, the number of distinct family confirmations received, the required
  /// quorum count, whether the caller has already submitted a verification (and
  /// which decision), and the opaque recovery request reference the verification
  /// action needs.
  ///
  /// `recoveryId` is the request reference required to call
  /// `verifyStewardRecoveryForFamily`; it is an opaque handle, not a private
  /// family datum, and it is only ever returned to a caller already authorized
  /// to see the request. The view deliberately omits account principals,
  /// membership ids, verifier account identities, and every other internal or
  /// private family datum. The recovery candidate never receives an entry for
  /// their own request, and the candidate never counts toward quorum.
  public type StewardRecoveryVerificationView = {
    recoveryId : Nat;
    candidateName : Text;
    status : RecoveryStatus;
    confirmationsReceived : Nat;
    confirmationsRequired : Nat;
    callerHasVerified : Bool;
    callerDecision : ?RecoveryVerificationDecision;
  };

  /// Phase 4D family-safe recovery audit view.
  ///
  /// The MINIMUM audit data a caller authorized to view a specific recovery
  /// request may read: a plain-language action label, a display label for the
  /// actor, the display names of the affected people, and the timestamp. It
  /// deliberately omits the internal audit id, the recovery request id, the
  /// family id, the raw actor account principal, the raw affected person ids,
  /// and the free-text `summary` (which can carry private reasons), so no
  /// private reason, technical error tag, account principal, or internal
  /// identifier is ever exposed. The backend resolves the display labels, so the
  /// client never needs the raw account identifier to derive them.
  public type RecoveryAuditView = {
    actionLabel : Text;
    actorDisplayLabel : Text;
    affectedDisplayNames : [Text];
    timestamp : Int;
  };

  /// Errors for recovery request creation, verification, approval, and
  /// resolution. Messages are stable and non-technical.
  public type RecoveryError = {
    #NotSignedIn;
    #FamilyNotFound;
    #PersonNotFound;
    #NotAuthorized;
    #NotOwner;
    #NotSteward;
    #SelfApproval;
    #SelfVerification;
    #AlreadyVerifier;
    #AlreadyPending;
    #RequestNotFound;
    #InvalidTransition;
    #QuorumNotMet;
    #AlreadyResolved;
    #ReplacementNotMember;
  };

  /// Flattened, OQL-exposable view of a recovery request. Enumerated variants
  /// are rendered as their tag text; optional fields render as empty text / `0`
  /// when absent.
  public type RecoveryRequestRow = {
    familyId : Text;
    id : Nat;
    recoveryType : Text;
    personId : Text;
    ownerAccountId : Text;
    replacementAccountId : Text;
    status : Text;
    requestedByAccountId : Text;
    createdAt : Int;
    updatedAt : Int;
    decidedByAccountId : Text;
    decidedAt : Int;
    transferredAt : Int;
  };

  /// Flattened, OQL-exposable view of a recovery verification decision.
  public type RecoveryVerificationRow = {
    familyId : Text;
    id : Nat;
    recoveryId : Nat;
    verifierAccountId : Text;
    decision : Text;
    decidedAt : Int;
  };

  /// Flattened, OQL-exposable view of a recovery audit history entry.
  public type RecoveryAuditRow = {
    familyId : Text;
    id : Nat;
    recoveryId : Nat;
    actionType : Text;
    actorAccountId : Text;
    affectedPersonCount : Nat;
    timestamp : Int;
    summary : Text;
  };
};

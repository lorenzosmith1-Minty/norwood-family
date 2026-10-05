import List "mo:core/List";

module {
  // ---------------------------------------------------------------------------
  // Phase 4A: Recovery Foundation.
  //
  // Introduces three new stable collections that back Account Recovery and
  // Steward Recovery:
  //
  //   recoveryRequests      : List.List<RecoveryRequest>
  //   recoveryVerifications : List.List<RecoveryVerification>
  //   recoveryAudit         : List.List<RecoveryAuditEntry>
  //
  // This migration is additive only. No existing family, member, profile,
  // relationship, invitation, notification, confirmation, Steward resolution,
  // archive, board, messaging, or research data is read, reseeded, migrated,
  // reset, or renamed. The three new collections start empty; every other
  // pre-existing stable collection carries through unchanged (subset form).
  //
  // `OldActor` is the `NewActor` of the preceding migration
  // (20261007_000000.mo), which declared `confirmations`; none of the existing
  // fields change here, so only the new fields are declared.
  // ---------------------------------------------------------------------------

  type RecoveryType = {
    #AccountRecovery;
    #StewardRecovery;
  };

  type RecoveryStatus = {
    #Pending;
    #AwaitingVerification;
    #ReadyForApproval;
    #Approved;
    #Rejected;
    #Cancelled;
    #Expired;
  };

  type RecoveryVerificationDecision = {
    #Confirm;
    #Reject;
  };

  type RecoveryVerification = {
    familyId : Text;
    id : Nat;
    recoveryId : Nat;
    verifierAccountId : Principal;
    decision : RecoveryVerificationDecision;
    decidedAt : Int;
  };

  type RecoveryAuditActionType = {
    #RequestCreated;
    #VerificationRecorded;
    #StewardDecisionRecorded;
    #ResolutionRecorded;
    #OwnershipTransferred;
  };

  type RecoveryAuditEntry = {
    familyId : Text;
    id : Nat;
    recoveryId : Nat;
    actionType : RecoveryAuditActionType;
    actorAccountId : Principal;
    affectedPersonIds : [Text];
    timestamp : Int;
    summary : Text;
  };

  type RecoveryRequest = {
    familyId : Text;
    id : Nat;
    recoveryType : RecoveryType;
    personId : Text;
    ownerAccountId : Principal;
    replacementAccountId : Principal;
    status : RecoveryStatus;
    requestedByAccountId : Principal;
    createdAt : Int;
    updatedAt : Int;
    decidedByAccountId : ?Principal;
    decidedAt : ?Int;
    transferredAt : ?Int;
  };

  type OldActor = {};

  type NewActor = {
    recoveryRequests : List.List<RecoveryRequest>;
    recoveryVerifications : List.List<RecoveryVerification>;
    recoveryAudit : List.List<RecoveryAuditEntry>;
  };

  public func migration(old : OldActor) : NewActor {
    ignore old;
    {
      recoveryRequests = List.empty();
      recoveryVerifications = List.empty();
      recoveryAudit = List.empty();
    };
  };
};

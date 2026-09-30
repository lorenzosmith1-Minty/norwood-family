import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-E: family-scope profile removal, archived profiles, and duplicate
  // profile review/merge.
  //
  // Adds a `familyId` field to every `ProfileRemovalRequest`, `AuditEntry`,
  // `MergeConflict`, and `DismissedPair`. Every pre-existing record migrates to
  // familyId = "norwood", matching the default family that owns all pre-tenancy
  // data. Existing ids, person ids, requesters, reasons, statuses, timestamps,
  // reviewers, audit action types, actors, affected person ids, summaries,
  // conflict fields/values, and dismissed pairs are preserved as-is. No reset,
  // no reseed, and no duplicate entries: each list is rebuilt exactly once from
  // the old list, so a repeated upgrade is idempotent. No other stable
  // collection changes shape — every other collection carries through unchanged.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldProfileRemovalRequest = {
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    reason : Text;
    status : {
      #Pending;
      #Approved;
      #Rejected;
    };
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type NewProfileRemovalRequest = {
    familyId : FamilyId;
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    reason : Text;
    status : {
      #Pending;
      #Approved;
      #Rejected;
    };
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type AuditActionType = {
    #ClaimApproved;
    #ClaimRejected;
    #RelationshipRequestApproved;
    #RelationshipRequestRejected;
    #RelationshipRequestPending;
    #StewardPromoted;
    #StewardRemoved;
    #SuccessorDesignated;
    #SuccessorActivated;
    #ProfileArchived;
    #ProfileRestored;
    #ProfilePermanentlyDeleted;
    #ProfileRemovalRequested;
    #ProfileRemovalReviewed;
    #DuplicateMerged;
    #RelationshipAdded;
    #RelationshipRemoved;
    #RelationshipTypeCorrected;
    #BoardPostArchived;
    #BoardPostRestored;
    #BoardReplyRemoved;
  };

  type OldAuditEntry = {
    id : Nat;
    actionType : AuditActionType;
    actorAccountId : Principal;
    affectedPersonIds : [Text];
    timestamp : Int;
    summary : Text;
  };

  type NewAuditEntry = {
    familyId : FamilyId;
    id : Nat;
    actionType : AuditActionType;
    actorAccountId : Principal;
    affectedPersonIds : [Text];
    timestamp : Int;
    summary : Text;
  };

  type OldMergeConflict = {
    id : Nat;
    field : Text;
    canonicalValue : Text;
    alternateValue : Text;
    status : {
      #Pending;
      #Resolved;
    };
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  type NewMergeConflict = {
    familyId : FamilyId;
    id : Nat;
    field : Text;
    canonicalValue : Text;
    alternateValue : Text;
    status : {
      #Pending;
      #Resolved;
    };
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  type OldDismissedPair = {
    personIdA : Text;
    personIdB : Text;
  };

  type NewDismissedPair = {
    familyId : FamilyId;
    personIdA : Text;
    personIdB : Text;
  };

  // Subset form: only the collections whose element type changed are listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    removalRequests : List.List<OldProfileRemovalRequest>;
    auditLog : List.List<OldAuditEntry>;
    mergeConflicts : List.List<OldMergeConflict>;
    dismissedDuplicates : List.List<OldDismissedPair>;
  };

  type NewActor = {
    removalRequests : List.List<NewProfileRemovalRequest>;
    auditLog : List.List<NewAuditEntry>;
    mergeConflicts : List.List<NewMergeConflict>;
    dismissedDuplicates : List.List<NewDismissedPair>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let removalRequests = List.empty<NewProfileRemovalRequest>();
    for (r in old.removalRequests.toArray().values()) {
      removalRequests.add({
        familyId = defaultFamilyId;
        id = r.id;
        personId = r.personId;
        requestingUserId = r.requestingUserId;
        reason = r.reason;
        status = r.status;
        submittedDate = r.submittedDate;
        reviewedBy = r.reviewedBy;
        reviewedDate = r.reviewedDate;
      });
    };

    let auditLog = List.empty<NewAuditEntry>();
    for (e in old.auditLog.toArray().values()) {
      auditLog.add({
        familyId = defaultFamilyId;
        id = e.id;
        actionType = e.actionType;
        actorAccountId = e.actorAccountId;
        affectedPersonIds = e.affectedPersonIds;
        timestamp = e.timestamp;
        summary = e.summary;
      });
    };

    let mergeConflicts = List.empty<NewMergeConflict>();
    for (c in old.mergeConflicts.toArray().values()) {
      mergeConflicts.add({
        familyId = defaultFamilyId;
        id = c.id;
        field = c.field;
        canonicalValue = c.canonicalValue;
        alternateValue = c.alternateValue;
        status = c.status;
        resolvedBy = c.resolvedBy;
        resolvedAt = c.resolvedAt;
      });
    };

    let dismissedDuplicates = List.empty<NewDismissedPair>();
    for (p in old.dismissedDuplicates.toArray().values()) {
      dismissedDuplicates.add({
        familyId = defaultFamilyId;
        personIdA = p.personIdA;
        personIdB = p.personIdB;
      });
    };

    { removalRequests; auditLog; mergeConflicts; dismissedDuplicates };
  };
};

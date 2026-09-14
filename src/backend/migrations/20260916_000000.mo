import List "mo:core/List";

module {
  type EvidenceLabel = {
    #Documented;
    #FamilyHistoryOralHistory;
    #PersonalMemory;
    #Hypothesis;
    #Conflicting;
    #NeedsResearch;
  };

  type ReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
    #NeedsResearch;
  };

  // Old ConflictReviewItem: no personId / provenance / evidence / notes fields.
  type OldConflictReviewItem = {
    id : Nat;
    findingId : Nat;
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    status : ReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  // New ConflictReviewItem: adds the affected Person, existing/proposed source
  // provenance, the proposed finding's evidence label, and steward notes.
  type NewConflictReviewItem = {
    id : Nat;
    findingId : Nat;
    personId : ?Text;
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    existingSourceId : ?Nat;
    proposedSourceId : ?Nat;
    evidenceLabel : EvidenceLabel;
    stewardNotes : Text;
    status : ReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  // Subset form: only the collection whose element type gained fields is
  // listed; all other pre-existing stable collections carry through unchanged.
  type OldActor = {
    conflictReviewItems : List.List<OldConflictReviewItem>;
  };

  type NewActor = {
    conflictReviewItems : List.List<NewConflictReviewItem>;
  };

  public func migration(old : OldActor) : NewActor {
    let conflictReviewItems = List.empty<NewConflictReviewItem>();
    for (i in old.conflictReviewItems.toArray().values()) {
      conflictReviewItems.add({
        id = i.id;
        findingId = i.findingId;
        personId = null;
        field = i.field;
        canonicalValue = i.canonicalValue;
        proposedValue = i.proposedValue;
        existingSourceId = null;
        proposedSourceId = null;
        evidenceLabel = #Conflicting;
        stewardNotes = "";
        status = i.status;
        resolvedBy = i.resolvedBy;
        resolvedAt = i.resolvedAt;
      });
    };
    { conflictReviewItems };
  };
};

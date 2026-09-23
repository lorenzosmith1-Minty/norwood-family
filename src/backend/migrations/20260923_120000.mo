import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-B2-B1: family-scope Proposed Findings.
  //
  // Adds a `familyId` field to every `ProposedFinding` and to every
  // `ConflictReviewItem`. Every pre-existing finding and conflict migrates to
  // familyId = "norwood", matching the default family that owns all
  // pre-tenancy data. Existing ids, titles, evidence labels, finding types,
  // content, source links, person/candidate links, statuses, conflict links,
  // submitters, and timestamps are preserved as-is. No other stable collection
  // changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type SourceType = {
    #CensusCitation;
    #DeedPropertyReference;
    #EmailThread;
    #ResearchNotes;
    #CertificateHeadstoneReference;
    #UploadedDocumentImage;
  };

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

  type FindingType = {
    #PersonFact;
    #Relationship;
    #TimelineEvent;
    #Story;
    #Mystery;
    #Source;
  };

  type FindingContent = {
    #PersonFact : {
      personId : Text;
      field : Text;
      value : Text;
    };
    #Relationship : {
      fromPersonId : Text;
      toPersonId : Text;
      relationshipType : Text;
    };
    #TimelineEvent : {
      personId : Text;
      title : Text;
      date : ?Text;
      description : Text;
    };
    #Story : {
      title : Text;
      storyText : Text;
      relatedPersonIds : [Text];
    };
    #Mystery : {
      title : Text;
      description : Text;
      relatedPersonIds : [Text];
    };
    #Source : {
      title : Text;
      sourceType : SourceType;
      description : Text;
      archiveItemId : ?Nat;
    };
  };

  type OldProposedFinding = {
    id : Nat;
    title : Text;
    evidenceLabel : EvidenceLabel;
    findingType : FindingType;
    content : FindingContent;
    sourceId : Nat;
    personId : ?Text;
    newPersonCandidateId : ?Nat;
    status : ReviewStatus;
    conflictReviewId : ?Nat;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
    updatedAt : Int;
  };

  type NewProposedFinding = {
    familyId : FamilyId;
    id : Nat;
    title : Text;
    evidenceLabel : EvidenceLabel;
    findingType : FindingType;
    content : FindingContent;
    sourceId : Nat;
    personId : ?Text;
    newPersonCandidateId : ?Nat;
    status : ReviewStatus;
    conflictReviewId : ?Nat;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
    updatedAt : Int;
  };

  // Subset form: only the collections whose element type changed are listed.
  // All other pre-existing stable collections carry through unchanged.
  type OldConflictReviewItem = {
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

  type NewConflictReviewItem = {
    familyId : FamilyId;
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

  type OldActor = {
    proposedFindings : List.List<OldProposedFinding>;
    conflictReviewItems : List.List<OldConflictReviewItem>;
  };

  type NewActor = {
    proposedFindings : List.List<NewProposedFinding>;
    conflictReviewItems : List.List<NewConflictReviewItem>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let proposedFindings = List.empty<NewProposedFinding>();
    for (f in old.proposedFindings.toArray().values()) {
      proposedFindings.add({
        familyId = defaultFamilyId;
        id = f.id;
        title = f.title;
        evidenceLabel = f.evidenceLabel;
        findingType = f.findingType;
        content = f.content;
        sourceId = f.sourceId;
        personId = f.personId;
        newPersonCandidateId = f.newPersonCandidateId;
        status = f.status;
        conflictReviewId = f.conflictReviewId;
        submittedBy = f.submittedBy;
        submittedAt = f.submittedAt;
        reviewedBy = f.reviewedBy;
        reviewedAt = f.reviewedAt;
        updatedAt = f.updatedAt;
      });
    };
    let conflictReviewItems = List.empty<NewConflictReviewItem>();
    for (c in old.conflictReviewItems.toArray().values()) {
      conflictReviewItems.add({
        familyId = defaultFamilyId;
        id = c.id;
        findingId = c.findingId;
        personId = c.personId;
        field = c.field;
        canonicalValue = c.canonicalValue;
        proposedValue = c.proposedValue;
        existingSourceId = c.existingSourceId;
        proposedSourceId = c.proposedSourceId;
        evidenceLabel = c.evidenceLabel;
        stewardNotes = c.stewardNotes;
        status = c.status;
        resolvedBy = c.resolvedBy;
        resolvedAt = c.resolvedAt;
      });
    };
    { proposedFindings; conflictReviewItems };
  };
};

import List "mo:core/List";
import Principal "mo:core/Principal";

module {
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
  };

  type FindingType = {
    #PersonFact;
    #Relationship;
    #TimelineEvent;
    #Story;
    #Mystery;
    #Source;
  };

  type SourceRecord = {
    id : Nat;
    title : Text;
    sourceType : SourceType;
    description : Text;
    archiveItemId : ?Nat;
    contributor : Principal;
    status : ReviewStatus;
    createdAt : Int;
    updatedAt : Int;
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

  type ProposedFinding = {
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

  type NewPersonCandidate = {
    id : Nat;
    name : Text;
    details : Text;
    sourceId : Nat;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type RelationshipProposal = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : Text;
    sourceId : Nat;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type ConflictReviewItem = {
    id : Nat;
    findingId : Nat;
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    status : ReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  type ResearchAuditEntry = {
    id : Nat;
    action : Text;
    findingId : ?Nat;
    sourceId : ?Nat;
    actorId : Principal;
    timestamp : Int;
    summary : Text;
  };

  // Subset form: only the new research-intake stable fields are listed. All
  // pre-existing stable collections carry through unchanged. This migration
  // introduces the Historical Research Intake collections without touching or
  // resetting any existing stable-storage collection.
  type OldActor = {};

  type NewActor = {
    researchSources : List.List<SourceRecord>;
    proposedFindings : List.List<ProposedFinding>;
    newPersonCandidates : List.List<NewPersonCandidate>;
    relationshipProposals : List.List<RelationshipProposal>;
    conflictReviewItems : List.List<ConflictReviewItem>;
    researchAuditLog : List.List<ResearchAuditEntry>;
    researchState : {
      var nextSourceId : Nat;
      var nextFindingId : Nat;
      var nextCandidateId : Nat;
      var nextProposalId : Nat;
      var nextConflictId : Nat;
      var nextAuditId : Nat;
    };
  };

  public func migration(_old : OldActor) : NewActor {
    {
      researchSources = List.empty();
      proposedFindings = List.empty();
      newPersonCandidates = List.empty();
      relationshipProposals = List.empty();
      conflictReviewItems = List.empty();
      researchAuditLog = List.empty();
      researchState = {
        var nextSourceId = 0;
        var nextFindingId = 0;
        var nextCandidateId = 0;
        var nextProposalId = 0;
        var nextConflictId = 0;
        var nextAuditId = 0;
      };
    };
  };
};

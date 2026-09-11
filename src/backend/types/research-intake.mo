import Principal "mo:core/Principal";

module {
  /// Identifier of a single research source record.
  public type SourceId = Nat;

  /// Identifier of a single proposed finding.
  public type FindingId = Nat;

  /// The kind of material a research source holds. Each variant maps to one of
  /// the supported source types.
  public type SourceType = {
    #CensusCitation;
    #DeedPropertyReference;
    #EmailThread;
    #ResearchNotes;
    #CertificateHeadstoneReference;
    #UploadedDocumentImage;
  };

  /// The evidence label carried by a proposed finding. Exactly one label is
  /// assigned per finding.
  public type EvidenceLabel = {
    #Documented;
    #FamilyHistoryOralHistory;
    #PersonalMemory;
    #Hypothesis;
    #Conflicting;
    #NeedsResearch;
  };

  /// Lifecycle of a reviewable item in the research intake queue. Everything
  /// enters as `#Pending` and is only ever promoted by an explicit steward
  /// action; canonical family data is never changed automatically.
  public type ReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
  };

  /// Where an approved finding routes in the app.
  public type FindingType = {
    #PersonFact;
    #Relationship;
    #TimelineEvent;
    #Story;
    #Mystery;
    #Source;
  };

  /// A lightweight source record so every fact retains provenance. Optionally
  /// links to an Archive item (`archiveItemId`) without requiring one.
  public type SourceRecord = {
    id : SourceId;
    title : Text;
    sourceType : SourceType;
    description : Text;
    archiveItemId : ?Nat;
    contributor : Principal;
    status : ReviewStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  /// The content of a proposed finding, keyed by where it routes on approval.
  public type FindingContent = {
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

  /// A proposed finding carrying one evidence label and a required source link.
  /// It may match an existing canonical Person (`personId`) or reference a New
  /// Person Candidate (`newPersonCandidateId`). Everything enters as proposed
  /// and reviewable first.
  public type ProposedFinding = {
    id : FindingId;
    title : Text;
    evidenceLabel : EvidenceLabel;
    findingType : FindingType;
    content : FindingContent;
    sourceId : SourceId;
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

  /// A candidate for a Person not yet in the canonical set. Approved candidates
  /// become canonical Person records.
  public type NewPersonCandidate = {
    id : Nat;
    name : Text;
    details : Text;
    sourceId : SourceId;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  /// A proposed relationship between two Persons. Approved proposals route to
  /// the family graph.
  public type RelationshipProposal = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : Text;
    sourceId : SourceId;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  /// A review item for a finding that contradicts existing canonical data.
  /// Created instead of silently overwriting conflicting data.
  public type ConflictReviewItem = {
    id : Nat;
    findingId : FindingId;
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    status : ReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  /// A single audit entry recording provenance and approval actions for every
  /// finding and its review lifecycle.
  public type ResearchAuditEntry = {
    id : Nat;
    action : Text;
    findingId : ?FindingId;
    sourceId : ?SourceId;
    actorId : Principal;
    timestamp : Int;
    summary : Text;
  };

  /// Aggregated counts for the review queue badges (pending, approved,
  /// rejected, conflicting).
  public type ReviewQueue = {
    pending : Nat;
    approved : Nat;
    rejected : Nat;
    conflicting : Nat;
  };

  /// Error variants for research intake operations.
  public type ResearchError = {
    #notAuthorized;
    #notFound : Nat;
    #invalidState : Text;
  };
};

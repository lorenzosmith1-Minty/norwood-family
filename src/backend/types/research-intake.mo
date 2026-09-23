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
    #NeedsResearch;
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
  ///
  /// Tenancy 1C-B2: `familyId` is the tenant boundary for a source. Every
  /// family-scoped read and review requires `SourceRecord.familyId` to equal the
  /// requested `familyId`; a `sourceId` alone never crosses a family boundary.
  /// Records created before this field existed are migrated to
  /// `FamilyTypes.DEFAULT_FAMILY_ID` ("norwood").
  public type SourceRecord = {
    familyId : Text;
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
  ///
  /// Tenancy 1C-B2-B1: `familyId` is the tenant boundary for a finding. Every
  /// family-scoped read and review requires `ProposedFinding.familyId` to equal
  /// the requested `familyId`; a `findingId` alone never crosses a family
  /// boundary. Records created before this field existed are migrated to
  /// `FamilyTypes.DEFAULT_FAMILY_ID` ("norwood").
  public type ProposedFinding = {
    familyId : Text;
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
  ///
  /// Tenancy 1C-B2-B2: `familyId` is the tenant boundary for a candidate. Every
  /// family-scoped read and review requires `NewPersonCandidate.familyId` to
  /// equal the requested `familyId`; a `candidateId` alone never crosses a
  /// family boundary. Records created before this field existed are migrated to
  /// `FamilyTypes.DEFAULT_FAMILY_ID` ("norwood").
  public type NewPersonCandidate = {
    familyId : Text;
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
  ///
  /// Tenancy 1C-B2-B3: `familyId` is the tenant boundary for a proposal. Every
  /// family-scoped read and review requires `RelationshipProposal.familyId` to
  /// equal the requested `familyId`; a `proposalId` alone never crosses a family
  /// boundary. Records created before this field existed are migrated to
  /// `FamilyTypes.DEFAULT_FAMILY_ID` ("norwood").
  public type RelationshipProposal = {
    familyId : Text;
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
  /// Created instead of silently overwriting conflicting data. It captures the
  /// affected Person, the disputed field, both the existing canonical value and
  /// the proposed value, the provenance/source of each side when available, the
  /// proposed finding's evidence label, and any steward notes. Canonical data is
  /// never altered at creation — the item enters as `#Conflicting` (unresolved)
  /// and only an explicit steward resolution action changes canonical data.
  ///
  /// Tenancy 1C-B2-B1: `familyId` is the tenant boundary for a conflict. A
  /// conflict generated by finding approval carries the same `familyId` as the
  /// finding, and its Source / Finding / Person references all remain in that
  /// family. Records created before this field existed are migrated to
  /// `FamilyTypes.DEFAULT_FAMILY_ID` ("norwood").
  public type ConflictReviewItem = {
    familyId : Text;
    id : Nat;
    findingId : FindingId;
    /// The affected canonical Person, when the finding targets one.
    personId : ?Text;
    /// The disputed field/fact type (e.g. "birthDate").
    field : Text;
    /// The existing canonical value being contradicted.
    canonicalValue : Text;
    /// The proposed value from the finding.
    proposedValue : Text;
    /// The source of the existing canonical value, when known.
    existingSourceId : ?Nat;
    /// The source of the proposed finding.
    proposedSourceId : ?Nat;
    /// The evidence label carried by the proposed finding.
    evidenceLabel : EvidenceLabel;
    /// Free-text notes recorded by the steward during resolution.
    stewardNotes : Text;
    status : ReviewStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  /// The explicit decision a Family Steward makes when resolving a Conflict
  /// Review item. Keep Existing and Replace Existing resolve the conflict;
  /// Preserve Both and Needs Research leave it unresolved.
  public type ConflictResolutionAction = {
    #KeepExisting;
    #ReplaceExisting;
    #PreserveBoth;
    #NeedsResearch;
  };

  /// A single fact on a Person Profile that has an unresolved conflict, exposed
  /// so the Person Profile can show a subtle disputed indicator on that fact.
  /// `canonicalValue` may be blank when no canonical value exists yet and only a
  /// proposed value is present. `status` is `#Conflicting` or `#NeedsResearch`
  /// (both unresolved); resolved conflicts are never exposed here.
  public type DisputedFact = {
    field : Text;
    canonicalValue : Text;
    proposedValue : Text;
    status : ReviewStatus;
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

  /// The kind of a reviewable research intake item in the Research Review
  /// Queue.
  public type ReviewItemKind = {
    #Source;
    #Finding;
    #NewPersonCandidate;
    #RelationshipProposal;
    #ConflictReview;
  };

  /// An action a Family Steward may take on a review queue item.
  public type ReviewAction = {
    #Approve;
    #Reject;
    #NeedsResearch;
  };

  /// A single reviewable item in the Research Review Queue. Every pending
  /// research intake record (Source, Proposed Finding, New Person Candidate,
  /// Relationship Proposal, or Conflict Review item) appears here with the
  /// metadata a steward needs to decide.
  public type ReviewQueueItem = {
    id : Nat;
    kind : ReviewItemKind;
    title : Text;
    summary : Text;
    contributor : ?Principal;
    provenance : Text;
    createdAt : Int;
    evidenceLabel : ?EvidenceLabel;
    status : ReviewStatus;
    actions : [ReviewAction];
  };

  /// Aggregated counts for the review queue badges plus the full list of
  /// reviewable items. `pending` counts every item still awaiting steward
  /// review (including pending Sources); `needsResearch` counts items marked
  /// `#NeedsResearch`.
  public type ReviewQueue = {
    pending : Nat;
    approved : Nat;
    rejected : Nat;
    conflicting : Nat;
    needsResearch : Nat;
    items : [ReviewQueueItem];
  };

  /// Error variants for research intake operations.
  public type ResearchError = {
    #notAuthorized;
    #notFound : Nat;
    #invalidState : Text;
  };
};

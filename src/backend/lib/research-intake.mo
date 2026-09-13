import List "mo:core/List";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Types "../types/research-intake";

/// Domain logic for the Historical Research Intake feature. All functions are
/// pure helpers over the injected collections; the API mixin owns authorization
/// and state wiring.
module {
  /// Creates a new source record and appends it to the collection. The source
  /// enters as `#Pending` and is never auto-approved.
  public func createSource(
    sources : List.List<Types.SourceRecord>,
    nextId : { var next : Nat },
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
    contributor : Principal,
    now : Int,
  ) : Types.SourceRecord {
    let id = nextId.next;
    nextId.next += 1;
    let source : Types.SourceRecord = {
      id;
      title;
      sourceType;
      description;
      archiveItemId;
      contributor;
      status = #Pending;
      createdAt = now;
      updatedAt = now;
    };
    sources.add(source);
    source;
  };

  /// Creates a new proposed finding and appends it to the collection. The
  /// finding enters as `#Pending` and is never auto-approved.
  public func createFinding(
    findings : List.List<Types.ProposedFinding>,
    nextId : { var next : Nat },
    title : Text,
    evidenceLabel : Types.EvidenceLabel,
    findingType : Types.FindingType,
    content : Types.FindingContent,
    sourceId : Types.SourceId,
    personId : ?Text,
    newPersonCandidateId : ?Nat,
    submittedBy : Principal,
    now : Int,
  ) : Types.ProposedFinding {
    let id = nextId.next;
    nextId.next += 1;
    let finding : Types.ProposedFinding = {
      id;
      title;
      evidenceLabel;
      findingType;
      content;
      sourceId;
      personId;
      newPersonCandidateId;
      status = #Pending;
      conflictReviewId = null;
      submittedBy;
      submittedAt = now;
      reviewedBy = null;
      reviewedAt = null;
      updatedAt = now;
    };
    findings.add(finding);
    finding;
  };

  /// Creates a new Person candidate and appends it to the collection. The
  /// candidate enters as `#Pending`.
  public func createNewPersonCandidate(
    candidates : List.List<Types.NewPersonCandidate>,
    nextId : { var next : Nat },
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
    submittedBy : Principal,
    now : Int,
  ) : Types.NewPersonCandidate {
    let id = nextId.next;
    nextId.next += 1;
    let candidate : Types.NewPersonCandidate = {
      id;
      name;
      details;
      sourceId;
      status = #Pending;
      submittedBy;
      submittedAt = now;
      reviewedBy = null;
      reviewedAt = null;
    };
    candidates.add(candidate);
    candidate;
  };

  /// Creates a new relationship proposal and appends it to the collection. The
  /// proposal enters as `#Pending`.
  public func createRelationshipProposal(
    proposals : List.List<Types.RelationshipProposal>,
    nextId : { var next : Nat },
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
    submittedBy : Principal,
    now : Int,
  ) : Types.RelationshipProposal {
    let id = nextId.next;
    nextId.next += 1;
    let proposal : Types.RelationshipProposal = {
      id;
      fromPersonId;
      toPersonId;
      relationshipType;
      sourceId;
      status = #Pending;
      submittedBy;
      submittedAt = now;
      reviewedBy = null;
      reviewedAt = null;
    };
    proposals.add(proposal);
    proposal;
  };

  /// Approves a pending finding, routing it to its target surface. Returns the
  /// updated finding, or `null` when it does not exist or is not pending.
  public func approveFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id and f.status == #Pending) {
        let approved : Types.ProposedFinding = {
          f with
          status = #Approved;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
          updatedAt = now;
        };
        findings.add(approved);
        updated := ?approved;
      } else {
        findings.add(f);
      };
    };
    updated;
  };

  /// Rejects a pending finding. Returns the updated finding, or `null` when it
  /// does not exist or is not pending.
  public func rejectFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id and f.status == #Pending) {
        let rejected : Types.ProposedFinding = {
          f with
          status = #Rejected;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
          updatedAt = now;
        };
        findings.add(rejected);
        updated := ?rejected;
      } else {
        findings.add(f);
      };
    };
    updated;
  };

  /// Creates a conflict review item for a finding that contradicts canonical
  /// data, instead of silently overwriting it. The item enters as `#Pending`.
  public func createConflictReviewItem(
    conflicts : List.List<Types.ConflictReviewItem>,
    nextId : { var next : Nat },
    findingId : Types.FindingId,
    field : Text,
    canonicalValue : Text,
    proposedValue : Text,
  ) : Types.ConflictReviewItem {
    let id = nextId.next;
    nextId.next += 1;
    let item : Types.ConflictReviewItem = {
      id;
      findingId;
      field;
      canonicalValue;
      proposedValue;
      status = #Pending;
      resolvedBy = null;
      resolvedAt = null;
    };
    conflicts.add(item);
    item;
  };

  /// Resolves a conflict review item. Returns the updated item, or `null` when
  /// it does not exist.
  public func resolveConflict(
    conflicts : List.List<Types.ConflictReviewItem>,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ConflictReviewItem {
    var updated : ?Types.ConflictReviewItem = null;
    let snapshot = conflicts.toArray();
    conflicts.clear();
    for (c in snapshot.values()) {
      if (c.id == id) {
        let resolved : Types.ConflictReviewItem = {
          c with
          status = #Approved;
          resolvedBy = ?reviewer;
          resolvedAt = ?now;
        };
        conflicts.add(resolved);
        updated := ?resolved;
      } else {
        conflicts.add(c);
      };
    };
    updated;
  };

  /// The steward actions available for an item in a given review status. Only
  /// pending items are actionable; resolved items carry no actions.
  func actionsFor(status : Types.ReviewStatus) : [Types.ReviewAction] {
    switch (status) {
      case (#Pending) [#Approve, #Reject, #NeedsResearch];
      case _ [];
    };
  };

  /// Renders a source type variant as its display text for the queue's
  /// provenance field.
  func sourceTypeText(t : Types.SourceType) : Text {
    switch (t) {
      case (#CensusCitation) "Census Citation";
      case (#DeedPropertyReference) "Deed Property Reference";
      case (#EmailThread) "Email Thread";
      case (#ResearchNotes) "Research Notes";
      case (#CertificateHeadstoneReference) "Certificate/Headstone Reference";
      case (#UploadedDocumentImage) "Uploaded Document Image";
    };
  };

  /// Renders a finding's content as a short summary for the queue.
  func findingSummary(f : Types.ProposedFinding) : Text {
    switch (f.content) {
      case (#PersonFact pf) pf.field # ": " # pf.value;
      case (#Relationship r) r.fromPersonId # " - " # r.relationshipType # " - " # r.toPersonId;
      case (#TimelineEvent t) t.title;
      case (#Story s) s.title;
      case (#Mystery m) m.title;
      case (#Source s) s.title;
    };
  };

  /// Computes the review queue badge counts and the full list of reviewable
  /// items across the given collections, including pending Sources. Every
  /// pending research intake record appears in `items` with its type, title/
  /// summary, contributor, provenance, created date, evidence label, and the
  /// actions a steward may take.
  public func computeQueue(
    sources : List.List<Types.SourceRecord>,
    findings : List.List<Types.ProposedFinding>,
    candidates : List.List<Types.NewPersonCandidate>,
    proposals : List.List<Types.RelationshipProposal>,
    conflicts : List.List<Types.ConflictReviewItem>,
  ) : Types.ReviewQueue {
    let items = List.empty<Types.ReviewQueueItem>();
    for (s in sources.toArray().values()) {
      items.add({
        id = s.id;
        kind = #Source;
        title = s.title;
        summary = s.description;
        contributor = ?s.contributor;
        provenance = sourceTypeText(s.sourceType);
        createdAt = s.createdAt;
        evidenceLabel = null;
        status = s.status;
        actions = actionsFor(s.status);
      });
    };
    for (f in findings.toArray().values()) {
      items.add({
        id = f.id;
        kind = #Finding;
        title = f.title;
        summary = findingSummary(f);
        contributor = ?f.submittedBy;
        provenance = "Source #" # f.sourceId.toText();
        createdAt = f.submittedAt;
        evidenceLabel = ?f.evidenceLabel;
        status = f.status;
        actions = actionsFor(f.status);
      });
    };
    for (c in candidates.toArray().values()) {
      items.add({
        id = c.id;
        kind = #NewPersonCandidate;
        title = c.name;
        summary = c.details;
        contributor = ?c.submittedBy;
        provenance = "Source #" # c.sourceId.toText();
        createdAt = c.submittedAt;
        evidenceLabel = null;
        status = c.status;
        actions = actionsFor(c.status);
      });
    };
    for (p in proposals.toArray().values()) {
      items.add({
        id = p.id;
        kind = #RelationshipProposal;
        title = p.fromPersonId # " - " # p.relationshipType # " - " # p.toPersonId;
        summary = p.relationshipType;
        contributor = ?p.submittedBy;
        provenance = "Source #" # p.sourceId.toText();
        createdAt = p.submittedAt;
        evidenceLabel = null;
        status = p.status;
        actions = actionsFor(p.status);
      });
    };
    for (c in conflicts.toArray().values()) {
      items.add({
        id = c.id;
        kind = #ConflictReview;
        title = "Conflict: " # c.field;
        summary = "Canonical: " # c.canonicalValue # " | Proposed: " # c.proposedValue;
        contributor = null;
        provenance = "Finding #" # c.findingId.toText();
        createdAt = 0;
        evidenceLabel = null;
        status = c.status;
        actions = actionsFor(c.status);
      });
    };
    var pending = 0;
    var approved = 0;
    var rejected = 0;
    var conflicting = 0;
    var needsResearch = 0;
    for (item in items.toArray().values()) {
      switch (item.status) {
        case (#Pending) pending += 1;
        case (#Approved) approved += 1;
        case (#Rejected) rejected += 1;
        case (#Conflicting) conflicting += 1;
        case (#NeedsResearch) needsResearch += 1;
      };
    };
    {
      pending;
      approved;
      rejected;
      conflicting;
      needsResearch;
      items = items.toArray();
    };
  };

  /// Approves a pending source (steward action), transitioning it to
  /// `#Approved` so it becomes usable by Proposed Findings. The linked Archive
  /// item remains canonical and provenance stays intact. Returns the updated
  /// source, or `null` when it does not exist or is not pending.
  public func approveSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.SourceRecord {
    ignore reviewer;
    var updated : ?Types.SourceRecord = null;
    let snapshot = sources.toArray();
    sources.clear();
    for (s in snapshot.values()) {
      if (s.id == id and s.status == #Pending) {
        let approved : Types.SourceRecord = {
          s with
          status = #Approved;
          updatedAt = now;
        };
        sources.add(approved);
        updated := ?approved;
      } else {
        sources.add(s);
      };
    };
    updated;
  };

  /// Rejects a pending source (steward action), transitioning it to
  /// `#Rejected`. The original Archive item is not deleted. Returns the updated
  /// source, or `null` when it does not exist or is not pending.
  public func rejectSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.SourceRecord {
    ignore reviewer;
    var updated : ?Types.SourceRecord = null;
    let snapshot = sources.toArray();
    sources.clear();
    for (s in snapshot.values()) {
      if (s.id == id and s.status == #Pending) {
        let rejected : Types.SourceRecord = {
          s with
          status = #Rejected;
          updatedAt = now;
        };
        sources.add(rejected);
        updated := ?rejected;
      } else {
        sources.add(s);
      };
    };
    updated;
  };

  /// Marks a pending source as needing research (steward action), transitioning
  /// it to `#NeedsResearch` while preserving the source and its notes. Returns
  /// the updated source, or `null` when it does not exist or is not pending.
  public func needsResearchSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.SourceRecord {
    ignore reviewer;
    var updated : ?Types.SourceRecord = null;
    let snapshot = sources.toArray();
    sources.clear();
    for (s in snapshot.values()) {
      if (s.id == id and s.status == #Pending) {
        let needsResearch : Types.SourceRecord = {
          s with
          status = #NeedsResearch;
          updatedAt = now;
        };
        sources.add(needsResearch);
        updated := ?needsResearch;
      } else {
        sources.add(s);
      };
    };
    updated;
  };

  /// Marks a pending finding as needing research (steward action),
  /// transitioning it to `#NeedsResearch` while preserving the finding and its
  /// content. Returns the updated finding, or `null` when it does not exist or
  /// is not pending.
  public func needsResearchFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    ignore reviewer;
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id and f.status == #Pending) {
        let needsResearch : Types.ProposedFinding = {
          f with
          status = #NeedsResearch;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
          updatedAt = now;
        };
        findings.add(needsResearch);
        updated := ?needsResearch;
      } else {
        findings.add(f);
      };
    };
    updated;
  };

  /// Appends an audit entry recording a provenance or approval action.
  public func appendAudit(
    auditLog : List.List<Types.ResearchAuditEntry>,
    nextId : { var next : Nat },
    action : Text,
    findingId : ?Types.FindingId,
    sourceId : ?Types.SourceId,
    actorId : Principal,
    now : Int,
    summary : Text,
  ) : Types.ResearchAuditEntry {
    let id = nextId.next;
    nextId.next += 1;
    let entry : Types.ResearchAuditEntry = {
      id;
      action;
      findingId;
      sourceId;
      actorId;
      timestamp = now;
      summary;
    };
    auditLog.add(entry);
    entry;
  };
};

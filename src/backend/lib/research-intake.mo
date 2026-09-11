import List "mo:core/List";
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

  /// Computes the review queue badge counts across the given collections.
  public func computeQueue(
    findings : List.List<Types.ProposedFinding>,
    candidates : List.List<Types.NewPersonCandidate>,
    proposals : List.List<Types.RelationshipProposal>,
    conflicts : List.List<Types.ConflictReviewItem>,
  ) : Types.ReviewQueue {
    var pending = 0;
    var approved = 0;
    var rejected = 0;
    var conflicting = 0;

    for (f in findings.toArray().values()) {
      switch (f.status) {
        case (#Pending) { pending += 1 };
        case (#Approved) { approved += 1 };
        case (#Rejected) { rejected += 1 };
        case (#Conflicting) { conflicting += 1 };
      };
    };
    for (c in candidates.toArray().values()) {
      switch (c.status) {
        case (#Pending) { pending += 1 };
        case (#Approved) { approved += 1 };
        case (#Rejected) { rejected += 1 };
        case (#Conflicting) { conflicting += 1 };
      };
    };
    for (p in proposals.toArray().values()) {
      switch (p.status) {
        case (#Pending) { pending += 1 };
        case (#Approved) { approved += 1 };
        case (#Rejected) { rejected += 1 };
        case (#Conflicting) { conflicting += 1 };
      };
    };
    for (c in conflicts.toArray().values()) {
      switch (c.status) {
        case (#Pending) { pending += 1 };
        case (#Approved) { approved += 1 };
        case (#Rejected) { rejected += 1 };
        case (#Conflicting) { conflicting += 1 };
      };
    };

    { pending; approved; rejected; conflicting };
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

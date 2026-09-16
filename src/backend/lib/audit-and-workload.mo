import List "mo:core/List";
import Int "mo:core/Int";
import Text "mo:core/Text";
import GovernanceTypes "../types/governance";
import ResearchIntakeTypes "../types/research-intake";
import Types "../types/audit-and-workload";

/// Domain logic for the merged Family Steward Audit History and steward
/// workload visibility. Pure helpers over the injected collections; the API
/// mixin owns authorization and state wiring.
module {
  /// Renders a governance audit action type variant as its tag text.
  func auditActionText(a : GovernanceTypes.AuditActionType) : Text {
    switch (a) {
      case (#ClaimApproved) "ClaimApproved";
      case (#ClaimRejected) "ClaimRejected";
      case (#RelationshipRequestApproved) "RelationshipRequestApproved";
      case (#RelationshipRequestRejected) "RelationshipRequestRejected";
      case (#RelationshipRequestPending) "RelationshipRequestPending";
      case (#StewardPromoted) "StewardPromoted";
      case (#StewardRemoved) "StewardRemoved";
      case (#SuccessorDesignated) "SuccessorDesignated";
      case (#SuccessorActivated) "SuccessorActivated";
      case (#ProfileArchived) "ProfileArchived";
      case (#ProfileRestored) "ProfileRestored";
      case (#ProfilePermanentlyDeleted) "ProfilePermanentlyDeleted";
      case (#ProfileRemovalRequested) "ProfileRemovalRequested";
      case (#ProfileRemovalReviewed) "ProfileRemovalReviewed";
      case (#DuplicateMerged) "DuplicateMerged";
      case (#RelationshipAdded) "RelationshipAdded";
      case (#RelationshipRemoved) "RelationshipRemoved";
      case (#RelationshipTypeCorrected) "RelationshipTypeCorrected";
      case (#BoardPostArchived) "BoardPostArchived";
      case (#BoardPostRestored) "BoardPostRestored";
      case (#BoardReplyRemoved) "BoardReplyRemoved";
    };
  };

  /// Extracts the resolution action text from a ConflictResolved research audit
  /// summary of the form "Conflict Review item #<id> resolved (<action>)".
  /// Returns `null` when the summary does not carry a parenthesized action.
  func resolutionFromSummary(summary : Text) : ?Text {
    let parts = summary.split(#text "(").toArray();
    if (parts.size() == 0) {
      return null;
    };
    let last = parts[parts.size() - 1];
    switch (last.stripEnd(#text ")")) {
      case (?res) { ?res };
      case null { null };
    };
  };

  /// Maps a governance audit entry to a `#Governance` StewardAuditEntry. The
  /// conflict-specific fields are left `null`/empty.
  func governanceEntry(e : GovernanceTypes.AuditEntry) : Types.StewardAuditEntry {
    {
      id = e.id;
      kind = #Governance;
      actionType = auditActionText(e.actionType);
      actorAccountId = e.actorAccountId;
      timestamp = e.timestamp;
      summary = e.summary;
      affectedPersonIds = e.affectedPersonIds;
      personId = null;
      field = null;
      existingValue = null;
      proposedValue = null;
      resolution = null;
      stewardNotes = null;
      existingSourceId = null;
      proposedSourceId = null;
    };
  };

  /// Maps a ConflictResolved research audit entry to a `#ConflictResolution`
  /// StewardAuditEntry, enriched from the linked ConflictReviewItem when one is
  /// found (matched by `findingId`). When no linked item exists the entry is
  /// still surfaced with the conflict-specific fields left `null`.
  func conflictEntry(
    e : ResearchIntakeTypes.ResearchAuditEntry,
    conflict : ?ResearchIntakeTypes.ConflictReviewItem,
  ) : Types.StewardAuditEntry {
    let affected = switch (conflict) {
      case (?c) {
        switch (c.personId) {
          case (?p) [p];
          case null [];
        };
      };
      case null [];
    };
    {
      id = e.id;
      kind = #ConflictResolution;
      actionType = "ConflictResolved";
      actorAccountId = e.actorId;
      timestamp = e.timestamp;
      summary = e.summary;
      affectedPersonIds = affected;
      personId = switch (conflict) { case (?c) c.personId; case null null };
      field = switch (conflict) { case (?c) ?c.field; case null null };
      existingValue = switch (conflict) { case (?c) ?c.canonicalValue; case null null };
      proposedValue = switch (conflict) { case (?c) ?c.proposedValue; case null null };
      resolution = resolutionFromSummary(e.summary);
      stewardNotes = switch (conflict) {
        case (?c) { if (c.stewardNotes == "") { null } else { ?c.stewardNotes } };
        case null null;
      };
      existingSourceId = switch (conflict) { case (?c) c.existingSourceId; case null null };
      proposedSourceId = switch (conflict) { case (?c) c.proposedSourceId; case null null };
    };
  };

  /// Merges the governance audit log with the conflict-resolution entries from
  /// the research audit log into a single chronological `[StewardAuditEntry]`
  /// list, newest first. Each governance `AuditEntry` maps to a `#Governance`
  /// entry; each research `ResearchAuditEntry` whose `action == "ConflictResolved"`
  /// maps to a `#ConflictResolution` entry enriched from the linked
  /// `ConflictReviewItem` (matched by `findingId`): `personId`, `field`,
  /// `existingValue` (canonicalValue), `proposedValue`, `stewardNotes`,
  /// `existingSourceId`, `proposedSourceId`, and `resolution` (the resolution
  /// action text carried in the research audit summary). Conflict-resolution
  /// entries appear exactly once — no duplication with governance entries.
  public func mergeAuditHistory(
    governanceLog : List.List<GovernanceTypes.AuditEntry>,
    researchLog : List.List<ResearchIntakeTypes.ResearchAuditEntry>,
    conflicts : List.List<ResearchIntakeTypes.ConflictReviewItem>,
  ) : [Types.StewardAuditEntry] {
    let merged = List.empty<Types.StewardAuditEntry>();
    for (e in governanceLog.toArray().values()) {
      merged.add(governanceEntry(e));
    };
    for (e in researchLog.toArray().values()) {
      if (e.action == "ConflictResolved") {
        switch (e.findingId) {
          case (?fid) {
            let linked = conflicts.find(func c = c.findingId == fid);
            merged.add(conflictEntry(e, linked));
          };
          case null {};
        };
      };
    };
    merged.toArray().sort(func (a, b) = Int.compare(b.timestamp, a.timestamp));
  };
};

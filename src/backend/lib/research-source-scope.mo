import List "mo:core/List";
import Set "mo:core/Set";
import Types "../types/research-intake";
import ArchiveTypes "../types/archive";
import FamilyTypes "../types/family";

/// Tenancy 1C-B2 canonical family-scoped Research Source domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `SourceRecord` whose `familyId` equals it. A `sourceId` alone is never a
/// tenant boundary: a lookup that finds a record belonging to another family
/// behaves exactly like a lookup that found nothing. The API mixin owns
/// authorization and state wiring; this module is pure over the injected
/// collections.
module {
  /// Whether a source record belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped source read and review funnels through.
  public func belongsToFamily(source : Types.SourceRecord, familyId : Text) : Bool {
    source.familyId == familyId;
  };

  /// Lists every source record in `familyId`. A source whose `familyId` differs
  /// is never returned, so Family A sources never appear in a Family B call.
  public func listForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
  ) : [Types.SourceRecord] {
    sources.toArray().filter(func s = belongsToFamily(s, familyId));
  };

  /// Returns the source with `id` when it belongs to `familyId`, or `null`
  /// otherwise. A record that exists under another family is never returned.
  public func getForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
    id : Types.SourceId,
  ) : ?Types.SourceRecord {
    sources.find(func s = s.id == id and belongsToFamily(s, familyId));
  };

  /// Approves the pending source with `id` in `familyId`, transitioning it to
  /// `#Approved`. Returns the updated source, or `null` when no pending source
  /// with that id belongs to `familyId`.
  public func approveForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
    id : Types.SourceId,
    now : Int,
  ) : ?Types.SourceRecord {
    transitionForFamily(sources, familyId, id, #Approved, now);
  };

  /// Rejects the pending source with `id` in `familyId`, transitioning it to
  /// `#Rejected`. Returns the updated source, or `null` when no pending source
  /// with that id belongs to `familyId`.
  public func rejectForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
    id : Types.SourceId,
    now : Int,
  ) : ?Types.SourceRecord {
    transitionForFamily(sources, familyId, id, #Rejected, now);
  };

  /// Marks the pending source with `id` in `familyId` as `#NeedsResearch`.
  /// Returns the updated source, or `null` when no pending source with that id
  /// belongs to `familyId`.
  public func needsResearchForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
    id : Types.SourceId,
    now : Int,
  ) : ?Types.SourceRecord {
    transitionForFamily(sources, familyId, id, #NeedsResearch, now);
  };

  /// Transitions the pending source with `id` in `familyId` to `status`,
  /// updating `updatedAt`. A source whose `familyId` differs is never touched,
  /// so a `sourceId` alone cannot cross a family boundary. Returns the updated
  /// source, or `null` when no pending source with that id belongs to
  /// `familyId`.
  func transitionForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
    id : Types.SourceId,
    status : Types.ReviewStatus,
    now : Int,
  ) : ?Types.SourceRecord {
    var updated : ?Types.SourceRecord = null;
    let snapshot = sources.toArray();
    sources.clear();
    for (s in snapshot.values()) {
      if (s.id == id and belongsToFamily(s, familyId) and s.status == #Pending) {
        let transitioned : Types.SourceRecord = { s with status; updatedAt = now };
        sources.add(transitioned);
        updated := ?transitioned;
      } else {
        sources.add(s);
      };
    };
    updated;
  };

  /// The linked Archive item id to cascade to, but only when the source belongs
  /// to `familyId` AND the linked Archive item also belongs to `familyId`. A
  /// source in Family A whose `archiveItemId` points at a Family B item yields
  /// `null`, so the cascade never follows an id across a family boundary.
  public func linkedArchiveItemIdInFamily(
    source : Types.SourceRecord,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    familyId : Text,
  ) : ?ArchiveTypes.ArchiveItemId {
    if (not belongsToFamily(source, familyId)) {
      return null;
    };
    switch (source.archiveItemId) {
      case (?aid) {
        switch (archiveItems.find(func it = it.id == aid and it.familyId == familyId)) {
          case (?_) { ?aid };
          case null { null };
        };
      };
      case null { null };
    };
  };

  /// Builds the set of Archive item ids that are referenced by a Research
  /// Source **in `familyId`**. Only a source whose `familyId` equals `familyId`
  /// contributes its `archiveItemId`, so a Research Source in Family A
  /// suppresses only its linked Archive A item and leaves Family B items
  /// unaffected. Used by the family-scoped Pending Contributions paths.
  public func researchLinkedArchiveIdsForFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
  ) : Set.Set<ArchiveTypes.ArchiveItemId> {
    let ids = Set.empty<ArchiveTypes.ArchiveItemId>();
    for (s in sources.toArray().values()) {
      if (belongsToFamily(s, familyId)) {
        switch (s.archiveItemId) {
          case (?aid) { ids.add(aid) };
          case null {};
        };
      };
    };
    ids;
  };

  /// Computes the family-scoped Review Queue: the Sources section and every
  /// source-derived count are restricted to sources whose `familyId` equals
  /// `familyId`, while the non-source categories (Findings, Candidates,
  /// Relationships, Conflicts) keep their existing behavior unchanged in this
  /// build. The returned `ReviewQueue` therefore never mixes source counts
  /// across families.
  public func computeQueueForFamily(
    sources : List.List<Types.SourceRecord>,
    findings : List.List<Types.ProposedFinding>,
    candidates : List.List<Types.NewPersonCandidate>,
    proposals : List.List<Types.RelationshipProposal>,
    conflicts : List.List<Types.ConflictReviewItem>,
    familyId : Text,
  ) : Types.ReviewQueue {
    let items = List.empty<Types.ReviewQueueItem>();
    // Sources: family-scoped. Only a source whose `familyId` equals `familyId`
    // contributes to the Sources section or to any source-derived count.
    for (s in sources.toArray().values()) {
      if (belongsToFamily(s, familyId)) {
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
    };
    // Non-source categories: unchanged aggregation behavior in this build.
    for (f in findings.toArray().values()) {
      // A finding that has a linked conflict review item is represented in the
      // queue by that conflict item. Skip it here so each unresolved conflict is
      // counted exactly once (the conflict item carries the status) instead of
      // double-counting both the finding and its linked conflict item.
      if (f.conflictReviewId == null) {
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

  /// The steward actions available for an item in a given review status. Pending
  /// items can be approved, rejected, or marked as needing research. Items
  /// already marked `#NeedsResearch` remain actionable — a steward can approve
  /// or reject them to resolve the item — so they never become stranded.
  /// Resolved items carry no actions.
  func actionsFor(status : Types.ReviewStatus) : [Types.ReviewAction] {
    switch (status) {
      case (#Pending) [#Approve, #Reject, #NeedsResearch];
      case (#NeedsResearch) [#Approve, #Reject];
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID` so
  /// current Norwood behavior is unchanged. Contains no duplicated logic.
  public func listSources(
    sources : List.List<Types.SourceRecord>,
  ) : [Types.SourceRecord] {
    listForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func getSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
  ) : ?Types.SourceRecord {
    getForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func approveSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
    now : Int,
  ) : ?Types.SourceRecord {
    approveForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID, id, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func rejectSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
    now : Int,
  ) : ?Types.SourceRecord {
    rejectForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID, id, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `needsResearchForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func needsResearchSource(
    sources : List.List<Types.SourceRecord>,
    id : Types.SourceId,
    now : Int,
  ) : ?Types.SourceRecord {
    needsResearchForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID, id, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `researchLinkedArchiveIdsForFamily`. Deprecated single-family form:
  /// delegates with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func researchLinkedArchiveIds(
    sources : List.List<Types.SourceRecord>,
  ) : Set.Set<ArchiveTypes.ArchiveItemId> {
    researchLinkedArchiveIdsForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `computeQueueForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func computeQueue(
    sources : List.List<Types.SourceRecord>,
    findings : List.List<Types.ProposedFinding>,
    candidates : List.List<Types.NewPersonCandidate>,
    proposals : List.List<Types.RelationshipProposal>,
    conflicts : List.List<Types.ConflictReviewItem>,
  ) : Types.ReviewQueue {
    computeQueueForFamily(
      sources,
      findings,
      candidates,
      proposals,
      conflicts,
      FamilyTypes.DEFAULT_FAMILY_ID,
    );
  };
};

import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";
import RelationshipProposalScopeLib "relationship-proposal-scope";
import ConflictScopeLib "conflict-scope";

/// Tenancy 1C-B2-B1 canonical family-scoped Proposed Finding domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `ProposedFinding` whose `familyId` equals it. A `findingId` alone is never a
/// tenant boundary: a lookup that finds a finding belonging to another family
/// behaves exactly like a lookup that found nothing. The API mixin owns
/// authorization and state wiring; this module is pure over the injected
/// collections.
module {
  /// Whether a proposed finding belongs to `familyId`. The single
  /// family-boundary predicate every family-scoped finding read and review
  /// funnels through.
  public func belongsToFamily(finding : Types.ProposedFinding, familyId : Text) : Bool {
    finding.familyId == familyId;
  };

  /// Lists every proposed finding in `familyId`. A finding whose `familyId`
  /// differs is never returned, so Family A findings never appear in a Family B
  /// call.
  public func listForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
  ) : [Types.ProposedFinding] {
    findings.toArray().filter(func f = belongsToFamily(f, familyId));
  };

  /// Returns the finding with `id` when it belongs to `familyId`, or `null`
  /// otherwise. A record that exists under another family is never returned.
  public func getForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
  ) : ?Types.ProposedFinding {
    findings.find(func f = f.id == id and belongsToFamily(f, familyId));
  };

  /// Creates a new proposed finding in `familyId` and appends it to the
  /// collection. The finding enters as `#Pending` and is never auto-approved.
  /// The stored record's `familyId` is the requested `familyId`.
  public func createForFamily(
    findings : List.List<Types.ProposedFinding>,
    nextId : { var next : Nat },
    familyId : Text,
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
      familyId;
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

  /// Approves the pending finding with `id` in `familyId`, transitioning it to
  /// `#Approved`. Returns the updated finding, or `null` when no pending finding
  /// with that id belongs to `familyId`.
  public func approveForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    transitionForFamily(findings, familyId, id, #Approved, reviewer, now);
  };

  /// Rejects the pending finding with `id` in `familyId`, transitioning it to
  /// `#Rejected`. Returns the updated finding, or `null` when no pending finding
  /// with that id belongs to `familyId`.
  public func rejectForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    transitionForFamily(findings, familyId, id, #Rejected, reviewer, now);
  };

  /// Marks the pending finding with `id` in `familyId` as `#NeedsResearch`.
  /// Returns the updated finding, or `null` when no pending finding with that id
  /// belongs to `familyId`.
  public func needsResearchForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    transitionForFamily(findings, familyId, id, #NeedsResearch, reviewer, now);
  };

  /// Transitions the pending finding with `id` in `familyId` to `status`,
  /// recording the reviewer and timestamp. A finding whose `familyId` differs is
  /// never touched, so a `findingId` alone cannot cross a family boundary.
  /// Returns the updated finding, or `null` when no pending finding with that id
  /// belongs to `familyId`.
  func transitionForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
    status : Types.ReviewStatus,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id and belongsToFamily(f, familyId) and f.status == #Pending) {
        let transitioned : Types.ProposedFinding = {
          f with
          status;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
          updatedAt = now;
        };
        findings.add(transitioned);
        updated := ?transitioned;
      } else {
        findings.add(f);
      };
    };
    updated;
  };

  /// Marks the finding with `id` in `familyId` as `#Conflicting` and links it to
  /// the given conflict review item. Returns the updated finding, or `null` when
  /// no finding with that id belongs to `familyId`.
  public func markConflictingForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
    conflictId : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id and belongsToFamily(f, familyId)) {
        let conflicted : Types.ProposedFinding = {
          f with
          status = #Conflicting;
          conflictReviewId = ?conflictId;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
          updatedAt = now;
        };
        findings.add(conflicted);
        updated := ?conflicted;
      } else {
        findings.add(f);
      };
    };
    updated;
  };

  /// Updates the review status of the finding with `id` in `familyId` (used to
  /// reflect a conflict resolution outcome on the linked finding). Returns the
  /// updated finding, or `null` when no finding with that id belongs to
  /// `familyId`.
  public func updateStatusForFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    id : Types.FindingId,
    status : Types.ReviewStatus,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id and belongsToFamily(f, familyId)) {
        let updatedFinding : Types.ProposedFinding = {
          f with
          status;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
          updatedAt = now;
        };
        findings.add(updatedFinding);
        updated := ?updatedFinding;
      } else {
        findings.add(f);
      };
    };
    updated;
  };

  /// Computes the family-scoped Review Queue: the Findings section and every
  /// finding-derived count are restricted to findings whose `familyId` equals
  /// `familyId`, the Sources section keeps the Tenancy 1C-B2-A family-scoped
  /// behavior, the New Person Candidates section is restricted to candidates
  /// whose `familyId` equals `familyId` (Tenancy 1C-B2-B2), and the
  /// Relationships section is restricted to proposals whose `familyId` equals
  /// `familyId` (Tenancy 1C-B2-B3-B), and the Conflicts section is restricted to
  /// conflicts whose `familyId` equals `familyId` (Tenancy 1C-B2-B4). The
  /// returned `ReviewQueue` therefore never mixes source, finding, candidate,
  /// relationship-proposal, or conflict counts across families.
  public func computeQueueForFamily(
    sources : List.List<Types.SourceRecord>,
    findings : List.List<Types.ProposedFinding>,
    candidates : List.List<Types.NewPersonCandidate>,
    proposals : List.List<Types.RelationshipProposal>,
    conflicts : List.List<Types.ConflictReviewItem>,
    familyId : Text,
  ) : Types.ReviewQueue {
    let items = List.empty<Types.ReviewQueueItem>();
    // Sources: family-scoped, matching Tenancy 1C-B2-A.
    for (s in sources.toArray().values()) {
      if (s.familyId == familyId) {
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
    // Findings: family-scoped. Only a finding whose `familyId` equals
    // `familyId` contributes to the Findings section or to any finding-derived
    // count.
    for (f in findings.toArray().values()) {
      // A finding that has a linked conflict review item is represented in the
      // queue by that conflict item. Skip it here so each unresolved conflict is
      // counted exactly once (the conflict item carries the status) instead of
      // double-counting both the finding and its linked conflict item.
      if (belongsToFamily(f, familyId) and f.conflictReviewId == null) {
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
    // New Person Candidates: family-scoped, matching Tenancy 1C-B2-B2. Only a
    // candidate whose `familyId` equals `familyId` contributes to the
    // Candidates section or to any candidate-derived count.
    for (c in candidates.toArray().values()) {
      if (c.familyId == familyId) {
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
    };
    // Relationships: family-scoped (Tenancy 1C-B2-B3-B). Only a proposal whose
    // `familyId` equals `familyId` contributes to the Relationships section or
    // to any relationship-derived count. The filter is the canonical
    // `RelationshipProposalScopeLib.listForFamily` helper — the same
    // family-boundary predicate the family-scoped proposal endpoints use — so
    // there is exactly one family-filter implementation.
    for (p in RelationshipProposalScopeLib.listForFamily(proposals, familyId).values()) {
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
    // Conflicts: family-scoped (Tenancy 1C-B2-B4). Only a conflict whose
    // `familyId` equals `familyId` contributes to the Conflicts section or to
    // any conflict-derived count. The filter is the canonical
    // `ConflictScopeLib.listForFamily` helper — the same family-boundary
    // predicate the family-scoped conflict endpoints use — so there is exactly
    // one family-filter implementation.
    for (c in ConflictScopeLib.listForFamily(conflicts, familyId).values()) {
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

  // ---------------------------------------------------------------------------
  // Canonical family-scoped profile promotion.
  //
  // Shared by the family-scoped finding endpoints and the conflict-resolution
  // path so both promote an approved finding through the same family-qualified
  // profile lookup. A Family A finding never mutates a same-personId profile in
  // Family B: every read and write goes through `TenancyLib` and verifies
  // `profile.familyId == familyId` before writing.
  // ---------------------------------------------------------------------------

  /// Normalizes a free-text Person Fact field label into a canonical internal
  /// key. Trims whitespace, ignores capitalization, and tolerates spaces,
  /// hyphens, and underscores. Returns `null` when the label cannot be mapped to
  /// a known canonical Person field.
  public func normalizePersonFactField(field : Text) : ?Text {
    switch (normalizeFieldLabel(field)) {
      case "birthplace" { ?"birthplace" };
      case "birthdate" { ?"birthDate" };
      case "currentlocation" { ?"currentLocation" };
      case "location" { ?"currentLocation" };
      case "preferredname" { ?"preferredName" };
      case "displayname" { ?"preferredName" };
      case "firstname" { ?"firstName" };
      case "middlename" { ?"middleName" };
      case "lastname" { ?"lastName" };
      case "knownas" { ?"nickname" };
      case "nickname" { ?"nickname" };
      case "shortbio" { ?"shortBio" };
      case "longerstory" { ?"longerStory" };
      case "occupation" { ?"occupation" };
      case "profession" { ?"occupation" };
      case "story" { ?"story" };
      case "suffix" { ?"suffix" };
      case "birthinfo" { ?"birthInfo" };
      case "privacysettings" { ?"privacySettings" };
      case _ { null };
    };
  };

  /// Lowercases a field label and removes whitespace, hyphens, and underscores
  /// so equivalent human labels compare equal.
  func normalizeFieldLabel(field : Text) : Text {
    var out = "";
    for (ch in field.toLower().chars()) {
      if (not (ch.isWhitespace() or ch == '-' or ch == '_')) {
        out := out # ch.toText();
      };
    };
    out;
  };

  /// Routes an approved finding's content into its canonical area, scoped to
  /// `familyId`. Called on explicit steward approval. Canonical family data is
  /// never changed automatically — this only runs from an explicit steward
  /// action. A Family A finding never mutates a same-personId profile in
  /// Family B: every profile read and write goes through the family-qualified
  /// lookup and verifies `profile.familyId == familyId`.
  public func routeToCanonicalForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    f : Types.ProposedFinding,
    familyId : FamilyTypes.FamilyId,
  ) {
    switch (f.content) {
      case (#PersonFact pf) {
        applyPersonFactForFamily(profiles, pf.personId, pf.field, pf.value, familyId);
      };
      case (#TimelineEvent t) {
        appendTimelineEventForFamily(profiles, t.personId, t.title, familyId);
      };
      case _ {};
    };
  };

  /// Applies an approved Person fact to the canonical profile in `familyId`,
  /// mapping the finding's free-text field name to the matching profile field.
  /// The profile is read and written through the family-qualified lookup, and
  /// `profile.familyId == familyId` is verified before any write, so a Family A
  /// finding never mutates a same-personId profile in Family B. Unknown field
  /// names are ignored (no-op) rather than corrupting the profile.
  public func applyPersonFactForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    personId : Text,
    field : Text,
    value : Text,
    familyId : FamilyTypes.FamilyId,
  ) {
    switch (normalizePersonFactField(field)) {
      case (?key) {
        switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
          case (?profile) {
            if (profile.familyId != familyId) {
              return;
            };
            let updated : OwnershipTypes.PersonProfile = switch (key) {
              case "birthDate" { { profile with birthDate = ?value } };
              case "birthplace" { { profile with birthplace = ?value } };
              case "occupation" { { profile with occupation = ?value } };
              case "story" { { profile with story = ?value } };
              case "shortBio" { { profile with shortBio = ?value } };
              case "longerStory" { { profile with longerStory = ?value } };
              case "currentLocation" { { profile with currentLocation = ?value } };
              case "preferredName" { { profile with preferredName = ?value } };
              case "firstName" { { profile with firstName = ?value } };
              case "middleName" { { profile with middleName = ?value } };
              case "lastName" { { profile with lastName = ?value } };
              case "suffix" { { profile with suffix = ?value } };
              case "nickname" { { profile with nickname = ?value } };
              case "birthInfo" { { profile with birthInfo = ?value } };
              case "privacySettings" { { profile with privacySettings = ?value } };
              case _ { profile };
            };
            TenancyLib.putProfileForFamily(profiles, familyId, updated);
          };
          case null {};
        };
      };
      case null {};
    };
  };

  /// Appends a timeline event title to a person's canonical timeline in
  /// `familyId`, through the family-qualified profile lookup.
  public func appendTimelineEventForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    personId : Text,
    title : Text,
    familyId : FamilyTypes.FamilyId,
  ) {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case (?profile) {
        if (profile.familyId != familyId) {
          return;
        };
        let current = profile.timeline ?? [];
        let updated : OwnershipTypes.PersonProfile = { profile with timeline = ?(current.concat([title])) };
        TenancyLib.putProfileForFamily(profiles, familyId, updated);
      };
      case null {};
    };
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func listFindings(
    findings : List.List<Types.ProposedFinding>,
  ) : [Types.ProposedFinding] {
    listForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func getFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
  ) : ?Types.ProposedFinding {
    getForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `createForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
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
    createForFamily(
      findings,
      nextId,
      FamilyTypes.DEFAULT_FAMILY_ID,
      title,
      evidenceLabel,
      findingType,
      content,
      sourceId,
      personId,
      newPersonCandidateId,
      submittedBy,
      now,
    );
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func approveFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    approveForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID, id, reviewer, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func rejectFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    rejectForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID, id, reviewer, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `needsResearchForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func needsResearchFinding(
    findings : List.List<Types.ProposedFinding>,
    id : Types.FindingId,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    needsResearchForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID, id, reviewer, now);
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

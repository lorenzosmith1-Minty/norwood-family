import Result "mo:core/Result";
import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyHistoryTypes "../types/family-history";
import ArchiveTypes "../types/archive";
import GovernanceTypes "../types/governance";
import ResearchLib "../lib/research-intake";
import FamilyAuthorizationLib "../lib/family-authorization";
import StewardAuthorityLib "../lib/steward-authority";
import InputValidation "../lib/input-validation";

/// Public API for the Historical Research Intake feature. Everything enters as
/// proposed/reviewable information first; canonical family data is only ever
/// changed by an explicit steward approval action.
mixin (
  sources : List.List<Types.SourceRecord>,
  findings : List.List<Types.ProposedFinding>,
  candidates : List.List<Types.NewPersonCandidate>,
  proposals : List.List<Types.RelationshipProposal>,
  conflicts : List.List<Types.ConflictReviewItem>,
  auditLog : List.List<Types.ResearchAuditEntry>,
  state : {
    var nextSourceId : Nat;
    var nextFindingId : Nat;
    var nextCandidateId : Nat;
    var nextProposalId : Nat;
    var nextConflictId : Nat;
    var nextAuditId : Nat;
  },
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  confirmedRelationships : List.List<OwnershipTypes.Relationship>,
  stories : List.List<FamilyHistoryTypes.Story>,
  mysteries : List.List<FamilyHistoryTypes.Mystery>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  notifications : List.List<OwnershipTypes.Notification>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Traps unless the caller is a signed-in Family Steward.
  func requireSteward(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
  };

  /// Returns `true` when a source with the given id exists.
  func sourceExists(id : Types.SourceId) : Bool {
    sources.find(func s = s.id == id) != null;
  };

  /// Validates the user-controlled text inside a proposed finding's content,
  /// trapping with a clear message when any field exceeds its limit. The
  /// content variant is not trusted on its own — every text field it carries is
  /// bounded before the finding is stored.
  func requireFindingContent(content : Types.FindingContent) {
    switch (content) {
      case (#PersonFact pf) {
        ignore InputValidation.requireText("personId", pf.personId, InputValidation.MAX_LOCATION_CHARS);
        ignore InputValidation.requireText("field", pf.field, InputValidation.MAX_LOCATION_CHARS);
        ignore InputValidation.requireText("value", pf.value, InputValidation.MAX_DESCRIPTION_CHARS);
      };
      case (#Relationship r) {
        ignore InputValidation.requireText("fromPersonId", r.fromPersonId, InputValidation.MAX_LOCATION_CHARS);
        ignore InputValidation.requireText("toPersonId", r.toPersonId, InputValidation.MAX_LOCATION_CHARS);
        ignore InputValidation.requireText("relationshipType", r.relationshipType, InputValidation.MAX_LOCATION_CHARS);
      };
      case (#TimelineEvent t) {
        ignore InputValidation.requireText("personId", t.personId, InputValidation.MAX_LOCATION_CHARS);
        ignore InputValidation.requireText("title", t.title, InputValidation.MAX_TITLE_CHARS);
        ignore InputValidation.requireOptionalText("date", t.date, InputValidation.MAX_LOCATION_CHARS);
        ignore InputValidation.requireText("description", t.description, InputValidation.MAX_DESCRIPTION_CHARS);
      };
      case (#Story s) {
        ignore InputValidation.requireText("title", s.title, InputValidation.MAX_TITLE_CHARS);
        ignore InputValidation.requireText("storyText", s.storyText, InputValidation.MAX_DESCRIPTION_CHARS);
        ignore InputValidation.requireRelatedPersonIds(s.relatedPersonIds);
      };
      case (#Mystery m) {
        ignore InputValidation.requireText("title", m.title, InputValidation.MAX_TITLE_CHARS);
        ignore InputValidation.requireText("description", m.description, InputValidation.MAX_DESCRIPTION_CHARS);
        ignore InputValidation.requireRelatedPersonIds(m.relatedPersonIds);
      };
      case (#Source s) {
        ignore InputValidation.requireText("title", s.title, InputValidation.MAX_TITLE_CHARS);
        ignore InputValidation.requireText("description", s.description, InputValidation.MAX_DESCRIPTION_CHARS);
      };
    };
  };

  /// Creates a new source record. Requires an approved family member; the caller
  /// is recorded as the contributor. The source enters as `#Pending`.
  public shared ({ caller }) func createSource(
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
  ) : async Result.Result<Types.SourceRecord, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller)) {
      return #err(#notAuthorized);
    };
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    let source = ResearchLib.createSource(
      sources,
      { var next = state.nextSourceId },
      cleanTitle,
      sourceType,
      cleanDescription,
      archiveItemId,
      caller,
      Time.now(),
    );
    state.nextSourceId := state.nextSourceId + 1;
    ignore ResearchLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      "SourceCreated",
      null,
      ?source.id,
      caller,
      Time.now(),
      "Source '" # cleanTitle # "' created",
    );
    state.nextAuditId := state.nextAuditId + 1;
    addResearchNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(source);
  };

  /// Lists all source records (steward only).
  public query ({ caller }) func listSources() : async [Types.SourceRecord] {
    requireSteward(caller);
    sources.toArray();
  };

  /// Returns a single source record by id (Family Steward only). The source
  /// record carries the contributor principal and description, so it is not
  /// readable by anonymous or non-steward callers.
  public query ({ caller }) func getSource(id : Types.SourceId) : async ?Types.SourceRecord {
    requireSteward(caller);
    sources.find(func s = s.id == id);
  };

  /// Creates a new proposed finding. Requires an approved family member; the
  /// caller is recorded as the submitter. The finding enters as `#Pending`.
  public shared ({ caller }) func createFinding(
    title : Text,
    evidenceLabel : Types.EvidenceLabel,
    findingType : Types.FindingType,
    content : Types.FindingContent,
    sourceId : Types.SourceId,
    personId : ?Text,
    newPersonCandidateId : ?Nat,
  ) : async Result.Result<Types.ProposedFinding, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller)) {
      return #err(#notAuthorized);
    };
    if (not sourceExists(sourceId)) {
      return #err(#notFound(sourceId));
    };
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanPersonId = InputValidation.requireOptionalText("personId", personId, InputValidation.MAX_LOCATION_CHARS);
    requireFindingContent(content);
    let finding = ResearchLib.createFinding(
      findings,
      { var next = state.nextFindingId },
      cleanTitle,
      evidenceLabel,
      findingType,
      content,
      sourceId,
      cleanPersonId,
      newPersonCandidateId,
      caller,
      Time.now(),
    );
    state.nextFindingId := state.nextFindingId + 1;
    ignore ResearchLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      "FindingSubmitted",
      ?finding.id,
      ?sourceId,
      caller,
      Time.now(),
      "Finding '" # cleanTitle # "' submitted",
    );
    state.nextAuditId := state.nextAuditId + 1;
    addResearchNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(finding);
  };

  /// Lists all proposed findings (steward only).
  public query ({ caller }) func listFindings() : async [Types.ProposedFinding] {
    requireSteward(caller);
    findings.toArray();
  };

  /// Returns a single proposed finding by id (Family Steward only). The finding
  /// carries its content, submitter principal, and review metadata, so it is not
  /// readable by anonymous or non-steward callers.
  public query ({ caller }) func getFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    requireSteward(caller);
    findings.find(func f = f.id == id);
  };

  /// Approves a pending finding (steward only), routing it to its target
  /// surface. A finding labelled `#Conflicting` is never approved directly —
  /// it is routed to a Conflict Review item instead of silently overwriting
  /// canonical data. Returns the updated finding, or `null` when it does not
  /// exist or is not pending.
  public shared ({ caller }) func approveFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    requireSteward(caller);
    let now = Time.now();
    switch (findings.find(func f = f.id == id)) {
      case null { null };
      case (?f) {
        if (f.status != #Pending) {
          null;
        } else if (f.evidenceLabel == #Conflicting) {
          // Route to Conflict Review instead of silently overwriting.
          let conflict = ResearchLib.createConflictReviewItem(
            conflicts,
            { var next = state.nextConflictId },
            f.id,
            conflictPersonId(f),
            conflictField(f),
            canonicalValueFor(f),
            conflictProposedValue(f),
            null,
            ?f.sourceId,
            f.evidenceLabel,
          );
          state.nextConflictId := state.nextConflictId + 1;
          let updated = markFindingConflicting(id, conflict.id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "FindingRoutedToConflict",
            ?f.id,
            ?f.sourceId,
            caller,
            now,
            "Finding '" # f.title # "' routed to Conflict Review",
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        } else {
          let updated = ResearchLib.approveFinding(findings, id, caller, now);
          routeToCanonical(f, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "FindingApproved",
            ?id,
            ?f.sourceId,
            caller,
            now,
            "Finding '" # f.title # "' approved and routed to " # routingTarget(f.findingType),
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        };
      };
    };
  };

  /// Rejects a pending finding (steward only). Returns the updated finding, or
  /// `null` when it does not exist or is not pending.
  public shared ({ caller }) func rejectFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    requireSteward(caller);
    let now = Time.now();
    switch (findings.find(func f = f.id == id)) {
      case null { null };
      case (?f) {
        if (f.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.rejectFinding(findings, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "FindingRejected",
            ?id,
            ?f.sourceId,
            caller,
            now,
            "Finding '" # f.title # "' rejected",
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        };
      };
    };
  };

  /// Creates a new Person candidate. Requires an approved family member; the
  /// caller is recorded as the submitter. The candidate enters as `#Pending`.
  public shared ({ caller }) func createNewPersonCandidate(
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.NewPersonCandidate, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller)) {
      return #err(#notAuthorized);
    };
    if (not sourceExists(sourceId)) {
      return #err(#notFound(sourceId));
    };
    let cleanName = InputValidation.requireText("name", name, InputValidation.MAX_TITLE_CHARS);
    let cleanDetails = InputValidation.requireText("details", details, InputValidation.MAX_DESCRIPTION_CHARS);
    let candidate = ResearchLib.createNewPersonCandidate(
      candidates,
      { var next = state.nextCandidateId },
      cleanName,
      cleanDetails,
      sourceId,
      caller,
      Time.now(),
    );
    state.nextCandidateId := state.nextCandidateId + 1;
    ignore ResearchLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      "NewPersonCandidateSubmitted",
      null,
      ?sourceId,
      caller,
      Time.now(),
      "New Person Candidate '" # cleanName # "' submitted",
    );
    state.nextAuditId := state.nextAuditId + 1;
    addResearchNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(candidate);
  };

  /// Lists all New Person candidates (steward only).
  public query ({ caller }) func listNewPersonCandidates() : async [Types.NewPersonCandidate] {
    requireSteward(caller);
    candidates.toArray();
  };

  /// Creates a new relationship proposal. Requires an approved family member;
  /// the caller is recorded as the submitter. The proposal enters as `#Pending`.
  public shared ({ caller }) func createRelationshipProposal(
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.RelationshipProposal, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller)) {
      return #err(#notAuthorized);
    };
    if (not sourceExists(sourceId)) {
      return #err(#notFound(sourceId));
    };
    let cleanFrom = InputValidation.requireText("fromPersonId", fromPersonId, InputValidation.MAX_LOCATION_CHARS);
    let cleanTo = InputValidation.requireText("toPersonId", toPersonId, InputValidation.MAX_LOCATION_CHARS);
    let cleanType = InputValidation.requireText("relationshipType", relationshipType, InputValidation.MAX_LOCATION_CHARS);
    let proposal = ResearchLib.createRelationshipProposal(
      proposals,
      { var next = state.nextProposalId },
      cleanFrom,
      cleanTo,
      cleanType,
      sourceId,
      caller,
      Time.now(),
    );
    state.nextProposalId := state.nextProposalId + 1;
    ignore ResearchLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      "RelationshipProposalSubmitted",
      null,
      ?sourceId,
      caller,
      Time.now(),
      "Relationship proposal '" # cleanFrom # " - " # cleanType # " - " # cleanTo # "' submitted",
    );
    state.nextAuditId := state.nextAuditId + 1;
    addResearchNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(proposal);
  };

  /// Lists all relationship proposals (steward only).
  public query ({ caller }) func listRelationshipProposals() : async [Types.RelationshipProposal] {
    requireSteward(caller);
    proposals.toArray();
  };

  /// Lists all conflict review items (steward only).
  public query ({ caller }) func listConflictReviewItems() : async [Types.ConflictReviewItem] {
    requireSteward(caller);
    conflicts.toArray();
  };

  /// Lists the unresolved conflict review items (`#Conflicting` and
  /// `#NeedsResearch`) affecting a given Person, so the frontend can surface
  /// them alongside canonical values on the person profile and source history
  /// views. Requires a signed-in (non-anonymous) caller; anonymous callers
  /// receive `[]`. Resolved conflicts are never returned.
  public query ({ caller }) func listConflictsForPerson(personId : Text) : async [Types.ConflictReviewItem] {
    if (caller.isAnonymous()) {
      return [];
    };
    conflicts.toArray().filter(func c =
      c.personId == ?personId and
      (c.status == #Conflicting or c.status == #NeedsResearch)
    );
  };

  /// Returns the facts on a Person Profile that have an unresolved conflict, so
  /// the Person Profile can show a subtle disputed indicator on each disputed
  /// fact. Includes conflicts where the canonical value is blank but a proposed
  /// value exists. Requires a signed-in (non-anonymous) caller; anonymous
  /// callers receive `[]`. Resolved conflicts are never returned.
  public query ({ caller }) func listDisputedFactsForPerson(personId : Text) : async [Types.DisputedFact] {
    if (caller.isAnonymous()) {
      return [];
    };
    ResearchLib.disputedFactsForPerson(conflicts, personId);
  };

  /// Resolves a conflict review item (steward only) with an explicit decision.
  /// `#KeepExisting` leaves canonical data unchanged and resolves the conflict;
  /// `#ReplaceExisting` writes the proposed value into canonical data exactly
  /// once (preserving the old value and its provenance in the conflict/audit
  /// history and the new Source); `#PreserveBoth` keeps both values visible as an
  /// unresolved `#Conflicting` conflict; `#NeedsResearch` leaves canonical data
  /// unchanged and retains the conflict with `#NeedsResearch` status. Every
  /// resolution records an audit entry. Returns the updated item, or `null` when
  /// it does not exist.
  public shared ({ caller }) func resolveConflict(
    id : Nat,
    action : Types.ConflictResolutionAction,
    notes : Text,
  ) : async Result.Result<Types.ConflictReviewItem, Types.ResearchError> {
    requireSteward(caller);
    let cleanNotes = InputValidation.requireText("notes", notes, InputValidation.MAX_DESCRIPTION_CHARS);
    let now = Time.now();
    switch (conflicts.find(func c = c.id == id)) {
      case null { #err(#notFound(id)) };
      case (?c) {
        // Only Replace Existing writes the proposed value into canonical data.
        // Keep Existing, Preserve Both, and Needs Research leave canonical data
        // unchanged — no silent overwrite.
        if (action == #ReplaceExisting) {
          switch (findings.find(func f = f.id == c.findingId)) {
            case (?f) {
              // Unknown Person Fact fields must not silently resolve Replace
              // Existing as successful. Return a clear unsupported-field error,
              // leave the conflict unresolved, and do not alter canonical data.
              switch (f.content) {
                case (#PersonFact pf) {
                  switch (normalizePersonFactField(pf.field)) {
                    case null {
                      return #err(#invalidState("Unsupported Person Fact field: '" # pf.field # "'"));
                    };
                    case (?_) {};
                  };
                };
                case _ {};
              };
              routeToCanonical(f, caller, now);
            };
            case null {};
          };
        };
        let updated = ResearchLib.resolveConflict(conflicts, id, action, cleanNotes, caller, now)
          ?? Runtime.trap("Conflict not found");
        // Reflect the resolution outcome on the linked finding so it no longer
        // counts as an unresolved conflict after Keep/Replace, and so Preserve
        // Both / Needs Research keep it visible as unresolved.
        switch (action) {
          case (#KeepExisting) {
            ignore ResearchLib.updateFindingStatus(findings, c.findingId, #Rejected, caller, now);
          };
          case (#ReplaceExisting) {
            ignore ResearchLib.updateFindingStatus(findings, c.findingId, #Approved, caller, now);
          };
          case (#PreserveBoth) {};
          case (#NeedsResearch) {
            ignore ResearchLib.updateFindingStatus(findings, c.findingId, #NeedsResearch, caller, now);
          };
        };
        ignore ResearchLib.appendAudit(
          auditLog,
          { var next = state.nextAuditId },
          "ConflictResolved",
          ?c.findingId,
          null,
          caller,
          now,
          "Conflict Review item #" # id.toText() # " resolved (" # conflictActionText(action) # ")",
        );
        state.nextAuditId := state.nextAuditId + 1;
        #ok(updated);
      };
    };
  };

  /// Returns the review queue badge counts (pending, approved, rejected,
  /// conflicting, needs-research) and the full list of reviewable items across
  /// all research intake records, including pending Sources. Every pending item
  /// appears with its type, title/summary, contributor, provenance, created
  /// date, evidence label, and available steward actions. Family Steward only —
  /// the queue exposes contributor principals, proposed findings content, and
  /// provenance, so it is not readable by anonymous or non-steward callers.
  public query ({ caller }) func getReviewQueue() : async Types.ReviewQueue {
    requireSteward(caller);
    ResearchLib.computeQueue(sources, findings, candidates, proposals, conflicts);
  };

  /// Approves a pending source (Family Steward only), transitioning it to
  /// `#Approved` so it becomes usable by Proposed Findings. The linked Archive
  /// item remains canonical and provenance stays intact. Records a
  /// `#ResearchApproved` notification to the contributor. Returns the updated
  /// source, or `null` when it does not exist or is not pending.
  public shared ({ caller }) func approveSource(id : Types.SourceId) : async ?Types.SourceRecord {
    requireSteward(caller);
    let now = Time.now();
    switch (sources.find(func s = s.id == id)) {
      case null { null };
      case (?s) {
        if (s.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.approveSource(sources, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "SourceApproved",
            null,
            ?id,
            caller,
            now,
            "Source '" # s.title # "' approved",
          );
          state.nextAuditId := state.nextAuditId + 1;
          addResearchNotification(s.contributor, #ResearchApproved, "Your research submission was approved.");
          updated;
        };
      };
    };
  };

  /// Rejects a pending source (Family Steward only), transitioning it to
  /// `#Rejected`. The original Archive item is not deleted. Records a
  /// `#ResearchRejected` notification to the contributor. Returns the updated
  /// source, or `null` when it does not exist or is not pending.
  public shared ({ caller }) func rejectSource(id : Types.SourceId) : async ?Types.SourceRecord {
    requireSteward(caller);
    let now = Time.now();
    switch (sources.find(func s = s.id == id)) {
      case null { null };
      case (?s) {
        if (s.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.rejectSource(sources, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "SourceRejected",
            null,
            ?id,
            caller,
            now,
            "Source '" # s.title # "' rejected",
          );
          state.nextAuditId := state.nextAuditId + 1;
          addResearchNotification(s.contributor, #ResearchRejected, "Your research submission was not approved.");
          updated;
        };
      };
    };
  };

  /// Marks a pending source as needing research (Family Steward only),
  /// transitioning it to `#NeedsResearch` while preserving the source and its
  /// notes. Returns the updated source, or `null` when it does not exist or is
  /// not pending.
  public shared ({ caller }) func needsResearchSource(id : Types.SourceId) : async ?Types.SourceRecord {
    requireSteward(caller);
    let now = Time.now();
    switch (sources.find(func s = s.id == id)) {
      case null { null };
      case (?s) {
        if (s.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.needsResearchSource(sources, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "SourceNeedsResearch",
            null,
            ?id,
            caller,
            now,
            "Source '" # s.title # "' marked as needing research",
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        };
      };
    };
  };

  /// Marks a pending finding as needing research (Family Steward only),
  /// transitioning it to `#NeedsResearch` while preserving the finding and its
  /// content. Records a `FindingNeedsResearch` audit entry. Returns the updated
  /// finding, or `null` when it does not exist or is not pending.
  public shared ({ caller }) func needsResearchFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    requireSteward(caller);
    let now = Time.now();
    switch (findings.find(func f = f.id == id)) {
      case null { null };
      case (?f) {
        if (f.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.needsResearchFinding(findings, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "FindingNeedsResearch",
            ?id,
            ?f.sourceId,
            caller,
            now,
            "Finding '" # f.title # "' marked as needing research",
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        };
      };
    };
  };

  /// Approves a pending New Person candidate (Family Steward only), creating
  /// exactly one canonical Person record (PersonProfile) that preserves the
  /// candidate's Source/provenance, recording the approval in Audit History,
  /// and marking the candidate `#Approved`. Approving a candidate never
  /// auto-creates relationships — a relationship is only added when a separately
  /// approved Relationship Proposal exists. Returns the updated candidate, or
  /// `null` when it does not exist or is not pending.
  public shared ({ caller }) func approveNewPersonCandidate(id : Nat) : async ?Types.NewPersonCandidate {
    requireSteward(caller);
    let now = Time.now();
    switch (candidates.find(func c = c.id == id)) {
      case null { null };
      case (?c) {
        if (c.status != #Pending) {
          null;
        } else {
          createCanonicalPerson(c);
          let updated = ResearchLib.approveNewPersonCandidate(candidates, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "NewPersonCandidateApproved",
            null,
            ?c.sourceId,
            caller,
            now,
            "New Person Candidate '" # c.name # "' approved and created as a canonical Person",
          );
          state.nextAuditId := state.nextAuditId + 1;
          addResearchNotification(c.submittedBy, #ResearchApproved, "Your research submission was approved.");
          updated;
        };
      };
    };
  };

  /// Rejects a pending New Person candidate (Family Steward only), marking it
  /// `#Rejected`. No canonical Person is created; the candidate and its audit
  /// trail are preserved. Returns the updated candidate, or `null` when it does
  /// not exist or is not pending.
  public shared ({ caller }) func rejectNewPersonCandidate(id : Nat) : async ?Types.NewPersonCandidate {
    requireSteward(caller);
    let now = Time.now();
    switch (candidates.find(func c = c.id == id)) {
      case null { null };
      case (?c) {
        if (c.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.rejectNewPersonCandidate(candidates, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "NewPersonCandidateRejected",
            null,
            ?c.sourceId,
            caller,
            now,
            "New Person Candidate '" # c.name # "' rejected",
          );
          state.nextAuditId := state.nextAuditId + 1;
          addResearchNotification(c.submittedBy, #ResearchRejected, "Your research submission was not approved.");
          updated;
        };
      };
    };
  };

  /// Marks a pending New Person candidate as needing research (Family Steward
  /// only), transitioning it to `#NeedsResearch` while preserving the candidate.
  /// No canonical Person is created. Returns the updated candidate, or `null`
  /// when it does not exist or is not pending.
  public shared ({ caller }) func needsResearchNewPersonCandidate(id : Nat) : async ?Types.NewPersonCandidate {
    requireSteward(caller);
    let now = Time.now();
    switch (candidates.find(func c = c.id == id)) {
      case null { null };
      case (?c) {
        if (c.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.needsResearchNewPersonCandidate(candidates, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "NewPersonCandidateNeedsResearch",
            null,
            ?c.sourceId,
            caller,
            now,
            "New Person Candidate '" # c.name # "' marked as needing research",
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        };
      };
    };
  };

  /// Approves a pending Relationship proposal (Family Steward only), creating or
  /// updating the canonical relationship exactly once, preserving
  /// Source/provenance, updating the family graph, recording the approval in
  /// Audit History, and marking the proposal `#Approved`. Duplicate canonical
  /// relationships are prevented: when an identical confirmed relationship
  /// already exists, no second relationship is added. Returns the updated
  /// proposal, or `null` when it does not exist or is not pending.
  public shared ({ caller }) func approveRelationshipProposal(id : Nat) : async ?Types.RelationshipProposal {
    requireSteward(caller);
    let now = Time.now();
    switch (proposals.find(func p = p.id == id)) {
      case null { null };
      case (?p) {
        if (p.status != #Pending) {
          null;
        } else {
          switch (relationshipTypeFromText(p.relationshipType)) {
            case (?rt) { addConfirmedRelationship(p.fromPersonId, p.toPersonId, rt) };
            case null {};
          };
          let updated = ResearchLib.approveRelationshipProposal(proposals, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "RelationshipProposalApproved",
            null,
            ?p.sourceId,
            caller,
            now,
            "Relationship proposal '" # p.fromPersonId # " - " # p.relationshipType # " - " # p.toPersonId # "' approved and added to the family graph",
          );
          state.nextAuditId := state.nextAuditId + 1;
          addResearchNotification(p.submittedBy, #ResearchApproved, "Your research submission was approved.");
          updated;
        };
      };
    };
  };

  /// Rejects a pending Relationship proposal (Family Steward only), marking it
  /// `#Rejected`. The family graph is left unchanged; the proposal and its audit
  /// trail are preserved. Returns the updated proposal, or `null` when it does
  /// not exist or is not pending.
  public shared ({ caller }) func rejectRelationshipProposal(id : Nat) : async ?Types.RelationshipProposal {
    requireSteward(caller);
    let now = Time.now();
    switch (proposals.find(func p = p.id == id)) {
      case null { null };
      case (?p) {
        if (p.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.rejectRelationshipProposal(proposals, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "RelationshipProposalRejected",
            null,
            ?p.sourceId,
            caller,
            now,
            "Relationship proposal '" # p.fromPersonId # " - " # p.relationshipType # " - " # p.toPersonId # "' rejected",
          );
          state.nextAuditId := state.nextAuditId + 1;
          addResearchNotification(p.submittedBy, #ResearchRejected, "Your research submission was not approved.");
          updated;
        };
      };
    };
  };

  /// Marks a pending Relationship proposal as needing research (Family Steward
  /// only), transitioning it to `#NeedsResearch` while preserving the proposal.
  /// The canonical graph is left unchanged. Returns the updated proposal, or
  /// `null` when it does not exist or is not pending.
  public shared ({ caller }) func needsResearchRelationshipProposal(id : Nat) : async ?Types.RelationshipProposal {
    requireSteward(caller);
    let now = Time.now();
    switch (proposals.find(func p = p.id == id)) {
      case null { null };
      case (?p) {
        if (p.status != #Pending) {
          null;
        } else {
          let updated = ResearchLib.needsResearchRelationshipProposal(proposals, id, caller, now);
          ignore ResearchLib.appendAudit(
            auditLog,
            { var next = state.nextAuditId },
            "RelationshipProposalNeedsResearch",
            null,
            ?p.sourceId,
            caller,
            now,
            "Relationship proposal '" # p.fromPersonId # " - " # p.relationshipType # " - " # p.toPersonId # "' marked as needing research",
          );
          state.nextAuditId := state.nextAuditId + 1;
          updated;
        };
      };
    };
  };

  /// Returns the full research intake audit history. Family Steward only — the
  /// audit log records provenance and approval actions, so it is not readable by
  /// anonymous or non-steward callers.
  public query ({ caller }) func getResearchAuditLog() : async [Types.ResearchAuditEntry] {
    requireSteward(caller);
    auditLog.toArray();
  };

  /// Marks a finding as `#Conflicting` and links it to the given conflict
  /// review item. Returns the updated finding, or `null` when it does not exist.
  func markFindingConflicting(
    id : Types.FindingId,
    conflictId : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ProposedFinding {
    var updated : ?Types.ProposedFinding = null;
    let snapshot = findings.toArray();
    findings.clear();
    for (f in snapshot.values()) {
      if (f.id == id) {
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

  /// The field name to record on a conflict review item for a finding.
  func conflictField(f : Types.ProposedFinding) : Text {
    switch (f.content) {
      case (#PersonFact pf) pf.field;
      case (#Relationship _) "relationship";
      case (#TimelineEvent _) "timeline";
      case (#Story _) "story";
      case (#Mystery _) "mystery";
      case (#Source _) "source";
    };
  };

  /// The affected canonical Person to record on a conflict review item for a
  /// finding. Prefers the person embedded in the finding content (PersonFact /
  /// TimelineEvent), falling back to the finding's `personId`.
  func conflictPersonId(f : Types.ProposedFinding) : ?Text {
    switch (f.content) {
      case (#PersonFact pf) { ?pf.personId };
      case (#TimelineEvent t) { ?t.personId };
      case _ { f.personId };
    };
  };

  /// Renders a conflict resolution action variant as its tag text for audit
  /// summaries.
  func conflictActionText(a : Types.ConflictResolutionAction) : Text {
    switch (a) {
      case (#KeepExisting) "KeepExisting";
      case (#ReplaceExisting) "ReplaceExisting";
      case (#PreserveBoth) "PreserveBoth";
      case (#NeedsResearch) "NeedsResearch";
    };
  };

  /// The proposed value to record on a conflict review item for a finding.
  func conflictProposedValue(f : Types.ProposedFinding) : Text {
    switch (f.content) {
      case (#PersonFact pf) pf.value;
      case (#Relationship r) r.relationshipType;
      case (#TimelineEvent t) t.title;
      case (#Story s) s.title;
      case (#Mystery m) m.title;
      case (#Source s) s.title;
    };
  };

  /// The canonical surface an approved finding routes to.
  func routingTarget(t : Types.FindingType) : Text {
    switch (t) {
      case (#PersonFact) "Profile";
      case (#Relationship) "family graph";
      case (#TimelineEvent) "Timeline / Travel Through Time";
      case (#Story) "Family Stories";
      case (#Mystery) "Family Mysteries";
      case (#Source) "Profile Sources / Archive";
    };
  };

  /// Routes an approved finding's content into its canonical area. Called on
  /// explicit steward approval (approveFinding) and on conflict resolution
  /// (resolveConflict). Canonical family data is never changed automatically —
  /// this only runs from an explicit steward action.
  func routeToCanonical(f : Types.ProposedFinding, caller : Principal, now : Int) {
    switch (f.content) {
      case (#PersonFact pf) {
        applyPersonFact(pf.personId, pf.field, pf.value);
      };
      case (#Relationship r) {
        switch (relationshipTypeFromText(r.relationshipType)) {
          case (?rt) {
            confirmedRelationships.add({
              id = nextRelationshipId();
              fromPersonId = r.fromPersonId;
              toPersonId = r.toPersonId;
              relationshipType = rt;
              status = #Confirmed;
            });
          };
          case null {};
        };
      };
      case (#TimelineEvent t) {
        appendTimelineEvent(t.personId, t.title);
      };
      case (#Story s) {
        stories.add({
          id = researchNextStoryId();
          title = s.title;
          storyText = s.storyText;
          relatedMemberIds = s.relatedPersonIds;
          era = null;
          year = null;
          location = null;
          contributor = caller;
          evidenceStatus = evidenceStatusFor(f.evidenceLabel);
          relatedArchiveItemIds = [];
          createdAt = now;
          updatedAt = now;
          status = #Approved;
        });
      };
      case (#Mystery m) {
        mysteries.add({
          id = researchNextMysteryId();
          title = m.title;
          description = m.description;
          relatedMemberIds = m.relatedPersonIds;
          relatedBranchId = null;
          knownFacts = [];
          possibilities = [];
          relatedSourceIds = [];
          relatedArchiveItemIds = [];
          status = #Open;
          contributor = caller;
          createdAt = now;
          updatedAt = now;
          resolution = null;
        });
      };
      case (#Source src) {
        // Create a canonical Source record (Profile Sources linkage) and
        // approve the linked archive item (Archive linkage). The source enters
        // the canonical source store as `#Approved` so it is immediately part
        // of the Profile Sources surface.
        ignore createApprovedSource(
          src.title,
          src.sourceType,
          src.description,
          src.archiveItemId,
          caller,
          now,
        );
        switch (src.archiveItemId) {
          case (?aid) { approveArchiveItemById(aid) };
          case null {};
        };
      };
    };
  };

  /// Normalizes a free-text Person Fact field label into a canonical internal
  /// key. Trims whitespace, ignores capitalization, and tolerates spaces,
  /// hyphens, and underscores. Returns `null` when the label cannot be mapped to
  /// a known canonical Person field. Both `canonicalValueFor` and
  /// `applyPersonFact` use this same function so Conflict Review reads and
  /// writes the same canonical field, and previously saved free-text findings
  /// (e.g. "Birth Place") keep mapping correctly.
  func normalizePersonFactField(field : Text) : ?Text {
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
  /// so equivalent human labels compare equal (e.g. "Birth Place",
  /// "birth-place", and "birth_place" all normalize to "birthplace").
  func normalizeFieldLabel(field : Text) : Text {
    var out = "";
    for (ch in field.toLower().chars()) {
      if (not (ch.isWhitespace() or ch == '-' or ch == '_')) {
        out := out # ch.toText();
      };
    };
    out;
  };

  /// The actual canonical value being contradicted by a finding, used to
  /// populate a Conflict Review item so the steward can compare it against the
  /// proposed value. Returns empty text when no canonical value exists.
  func canonicalValueFor(f : Types.ProposedFinding) : Text {
    switch (f.content) {
      case (#PersonFact pf) {
        switch (normalizePersonFactField(pf.field)) {
          case (?key) {
            switch (profiles.get(pf.personId)) {
              case (?profile) {
                switch (key) {
                  case "birthDate" { profile.birthDate ?? "" };
                  case "birthplace" { profile.birthplace ?? "" };
                  case "occupation" { profile.occupation ?? "" };
                  case "story" { profile.story ?? "" };
                  case "shortBio" { profile.shortBio ?? "" };
                  case "longerStory" { profile.longerStory ?? "" };
                  case "currentLocation" { profile.currentLocation ?? "" };
                  case "preferredName" { profile.preferredName ?? "" };
                  case "firstName" { profile.firstName ?? "" };
                  case "middleName" { profile.middleName ?? "" };
                  case "lastName" { profile.lastName ?? "" };
                  case "suffix" { profile.suffix ?? "" };
                  case "nickname" { profile.nickname ?? "" };
                  case "birthInfo" { profile.birthInfo ?? "" };
                  case "privacySettings" { profile.privacySettings ?? "" };
                  case _ { "" };
                };
              };
              case null { "" };
            };
          };
          case null { "" };
        };
      };
      case (#Relationship r) {
        switch (confirmedRelationships.find(func rel = rel.fromPersonId == r.fromPersonId and rel.toPersonId == r.toPersonId)) {
          case (?rel) { relationshipTypeText(rel.relationshipType) };
          case null { "" };
        };
      };
      case (#TimelineEvent t) {
        switch (profiles.get(t.personId)) {
          case (?profile) {
            switch (profile.timeline) {
              case (?entries) { entries.values().join("; ") };
              case null { "" };
            };
          };
          case null { "" };
        };
      };
      case (#Story s) {
        switch (stories.find(func st = st.title == s.title)) {
          case (?st) { st.title # ": " # st.storyText };
          case null { "" };
        };
      };
      case (#Mystery m) {
        switch (mysteries.find(func my = my.title == m.title)) {
          case (?my) { my.title # ": " # my.description };
          case null { "" };
        };
      };
      case (#Source src) {
        switch (src.archiveItemId) {
          case (?aid) {
            switch (archiveItems.find(func it = it.id == aid)) {
              case (?it) { it.title };
              case null { "" };
            };
          };
          case null { "" };
        };
      };
    };
  };

  /// Applies an approved Person fact to the canonical profile, mapping the
  /// finding's free-text field name to the matching profile field. Unknown
  /// field names are ignored (no-op) rather than corrupting the profile.
  func applyPersonFact(personId : Text, field : Text, value : Text) {
    switch (normalizePersonFactField(field)) {
      case (?key) {
        switch (profiles.get(personId)) {
          case (?profile) {
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
            profiles.add(personId, updated);
          };
          case null {};
        };
      };
      case null {};
    };
  };

  /// Appends a timeline event title to a person's canonical timeline.
  func appendTimelineEvent(personId : Text, title : Text) {
    switch (profiles.get(personId)) {
      case (?profile) {
        let current = profile.timeline ?? [];
        let updated : OwnershipTypes.PersonProfile = { profile with timeline = ?(current.concat([title])) };
        profiles.add(personId, updated);
      };
      case null {};
    };
  };

  /// Approves the archive item with the given id (used to route an approved
  /// Source finding into the Archive).
  func approveArchiveItemById(id : Nat) {
    let snapshot = archiveItems.toArray();
    archiveItems.clear();
    for (item in snapshot.values()) {
      if (item.id == id) {
        archiveItems.add({ item with status = #Approved });
      } else {
        archiveItems.add(item);
      };
    };
  };

  /// Creates a canonical Source record in the research source store with
  /// `#Approved` status, linking it into the Profile Sources surface. Used when
  /// an approved `#Source` finding is routed to canonical data.
  func createApprovedSource(
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
    contributor : Principal,
    now : Int,
  ) : Types.SourceRecord {
    let id = state.nextSourceId;
    state.nextSourceId += 1;
    let source : Types.SourceRecord = {
      id;
      title;
      sourceType;
      description;
      archiveItemId;
      contributor;
      status = #Approved;
      createdAt = now;
      updatedAt = now;
    };
    sources.add(source);
    source;
  };

  /// Maps a finding's evidence label to a family-history evidence status.
  func evidenceStatusFor(l : Types.EvidenceLabel) : FamilyHistoryTypes.EvidenceStatus {
    switch (l) {
      case (#Documented) #Documented;
      case (#FamilyHistoryOralHistory) #FamilyHistory;
      case (#PersonalMemory) #PersonalMemory;
      case (#Hypothesis) #Unresolved;
      case (#Conflicting) #Unresolved;
      case (#NeedsResearch) #Unresolved;
    };
  };

  /// Maps a free-text relationship type to the canonical relationship variant.
  /// The UI relationship form accepts common free-text labels (Daughter, Son,
  /// Aunt, Uncle, Cousin, Grandparent, etc.), so this normalizes case and maps
  /// each to one of the four canonical graph relationship types. A recognized
  /// type is written into the family graph on approval; unrecognized text
  /// returns `null` and is left out of the graph rather than guessed.
  func relationshipTypeFromText(t : Text) : ?OwnershipTypes.RelationshipType {
    switch (t.toLower()) {
      case "parent" { ?#Parent };
      case "mother" { ?#Parent };
      case "father" { ?#Parent };
      case "grandparent" { ?#Parent };
      case "grandmother" { ?#Parent };
      case "grandfather" { ?#Parent };
      case "child" { ?#Child };
      case "daughter" { ?#Child };
      case "son" { ?#Child };
      case "granddaughter" { ?#Child };
      case "grandson" { ?#Child };
      case "spousepartner" { ?#SpousePartner };
      case "spouse" { ?#SpousePartner };
      case "partner" { ?#SpousePartner };
      case "husband" { ?#SpousePartner };
      case "wife" { ?#SpousePartner };
      case "sibling" { ?#Sibling };
      case "brother" { ?#Sibling };
      case "sister" { ?#Sibling };
      case "aunt" { ?#Sibling };
      case "uncle" { ?#Sibling };
      case "cousin" { ?#Sibling };
      case _ { null };
    };
  };

  /// Renders a canonical relationship type variant as its tag text.
  func relationshipTypeText(t : OwnershipTypes.RelationshipType) : Text {
    switch (t) {
      case (#Parent) "Parent";
      case (#Child) "Child";
      case (#SpousePartner) "SpousePartner";
      case (#Sibling) "Sibling";
    };
  };

  /// Computes the next confirmed relationship id.
  func nextRelationshipId() : Nat {
    var maxId = 0;
    for (r in confirmedRelationships.toArray().values()) {
      if (r.id >= maxId) { maxId := r.id + 1 };
    };
    maxId;
  };

  /// Computes the next story id.
  func researchNextStoryId() : Nat {
    var maxId = 0;
    for (s in stories.toArray().values()) {
      if (s.id >= maxId) { maxId := s.id + 1 };
    };
    maxId;
  };

  /// Computes the next mystery id.
  func researchNextMysteryId() : Nat {
    var maxId = 0;
    for (m in mysteries.toArray().values()) {
      if (m.id >= maxId) { maxId := m.id + 1 };
    };
    maxId;
  };

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func researchNextNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Appends a research notification for the given recipient, avoiding
  /// duplicates. Used for submission (awaiting review), approval, and rejection
  /// of research intake items. A notification is only added when no identical
  /// (same recipient, type, and message) notification already exists.
  func addResearchNotification(recipient : Principal, notificationType : OwnershipTypes.NotificationType, message : Text) {
    let exists = notifications.toArray().any(func n = n.recipient == recipient and n.notificationType == notificationType and n.message == message);
    if (not exists) {
      notifications.add({
        id = researchNextNotificationId();
        recipient;
        notificationType;
        message;
        createdAt = Time.now();
        read = false;
      });
    };
  };

  /// Derives a deterministic personId from a candidate's name: lower-cases,
  /// keeps only alphanumeric characters, and concatenates the words (e.g.
  /// "Lorenzo Smith Jr." -> "lorenzosmithjr").
  func personIdFromName(name : Text) : Text {
    let words = List.empty<Text>();
    for (word in name.toLower().tokens(#predicate (func ch = ch.isWhitespace()))) {
      var clean = "";
      for (ch in word.chars()) {
        if (ch.isAlphabetic() or ch.isDigit()) {
          clean := clean # ch.toText();
        };
      };
      if (clean.size() > 0) {
        words.add(clean);
      };
    };
    words.toArray().values().join("");
  };

  /// Returns a personId derived from the candidate's name that is guaranteed not
  /// to collide with an existing canonical Person record. When the base slug
  /// already exists, a numeric suffix is appended until a free id is found.
  func uniquePersonId(name : Text) : Text {
    let base = personIdFromName(name);
    var candidate = base;
    var suffix = 1;
    while (profiles.get(candidate) != null) {
      candidate := base # suffix.toText();
      suffix += 1;
    };
    candidate;
  };

  /// Creates exactly one canonical Person record (PersonProfile) from an
  /// approved New Person candidate. The candidate's Source/provenance is
  /// preserved on the candidate record (`sourceId`) and recorded in the audit
  /// entry. The new profile is unclaimed and living by default. Approving a
  /// candidate never auto-creates relationships — a relationship is only added
  /// when a separately approved Relationship Proposal exists.
  func createCanonicalPerson(c : Types.NewPersonCandidate) {
    let personId = uniquePersonId(c.name);
    let profile : OwnershipTypes.PersonProfile = {
      personId;
      name = c.name;
      livingStatus = #Living;
      claimStatus = #Unclaimed;
      claimedByUserId = null;
      preferredName = null;
      firstName = null;
      middleName = null;
      lastName = null;
      suffix = null;
      nickname = null;
      story = null;
      shortBio = null;
      longerStory = null;
      occupation = null;
      birthInfo = null;
      birthDate = null;
      birthplace = null;
      currentLocation = null;
      timeline = null;
      privacySettings = null;
    };
    profiles.add(personId, profile);
  };

  /// Adds a confirmed relationship to the shared family graph exactly once,
  /// preventing duplicate canonical relationships. When an identical confirmed
  /// relationship (same fromPersonId, toPersonId, and relationshipType) already
  /// exists, no second relationship is added.
  func addConfirmedRelationship(fromPersonId : Text, toPersonId : Text, relationshipType : OwnershipTypes.RelationshipType) {
    let exists = confirmedRelationships.toArray().any(func r = r.fromPersonId == fromPersonId and r.toPersonId == toPersonId and r.relationshipType == relationshipType);
    if (not exists) {
      confirmedRelationships.add({
        id = nextRelationshipId();
        fromPersonId;
        toPersonId;
        relationshipType;
        status = #Confirmed;
      });
    };
  };
};

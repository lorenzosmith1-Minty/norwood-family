import Result "mo:core/Result";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyHistoryTypes "../types/family-history";
import ArchiveTypes "../types/archive";
import FamilyTypes "../types/family";
import GovernanceTypes "../types/governance";
import ResearchLib "../lib/research-intake";
import FindingScopeLib "../lib/finding-scope";
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
      FamilyTypes.DEFAULT_FAMILY_ID,
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

  // NOTE: `createRelationshipProposal` and `listRelationshipProposals` moved to
  // `mixins/relationship-proposal-scope-api.mo` as TEMPORARY Tenancy 1C
  // compatibility wrappers delegating to the canonical family-scoped endpoints
  // with `FamilyTypes.DEFAULT_FAMILY_ID`. Exactly one implementation exists.

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
                  switch (FindingScopeLib.normalizePersonFactField(pf.field)) {
                    case null {
                      return #err(#invalidState("Unsupported Person Fact field: '" # pf.field # "'"));
                    };
                    case (?_) {};
                  };
                };
                case _ {};
              };
              // Canonical promotion is family-scoped: the conflict carries the
              // finding's familyId, so the profile read/write is qualified by
              // that family and a Family A finding never mutates a Family B
              // profile. Delegates to the shared promotion helper so the
              // conflict path and the finding endpoints promote identically.
              FindingScopeLib.routeToCanonicalForFamily(profiles, f, c.familyId);
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

  /// Computes the next confirmed relationship id.
  func nextRelationshipId() : Nat {
    var maxId = 0;
    for (r in confirmedRelationships.toArray().values()) {
      if (r.id >= maxId) { maxId := r.id + 1 };
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

  /// Adds a confirmed relationship to the shared family graph exactly once,
  /// preventing duplicate canonical relationships. When an identical confirmed
  /// relationship (same fromPersonId, toPersonId, and relationshipType) already
  /// exists, no second relationship is added.
  func addConfirmedRelationship(fromPersonId : Text, toPersonId : Text, relationshipType : OwnershipTypes.RelationshipType) {
    let exists = confirmedRelationships.toArray().any(func r = r.fromPersonId == fromPersonId and r.toPersonId == toPersonId and r.relationshipType == relationshipType);
    if (not exists) {
      confirmedRelationships.add({
        familyId = FamilyTypes.DEFAULT_FAMILY_ID;
        id = nextRelationshipId();
        fromPersonId;
        toPersonId;
        relationshipType;
        status = #Confirmed;
      });
    };
  };
};

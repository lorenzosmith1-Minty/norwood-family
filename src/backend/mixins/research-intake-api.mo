import Result "mo:core/Result";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyHistoryTypes "../types/family-history";
import ArchiveTypes "../types/archive";
import ResearchLib "../lib/research-intake";

/// Public API for the Historical Research Intake feature. Everything enters as
/// proposed/reviewable information first; canonical family data is only ever
/// changed by an explicit steward approval action.
mixin (
  accessControlState : AccessControl.AccessControlState,
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
) {
  /// Traps unless the caller is a signed-in Family Steward.
  func requireSteward(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
  };

  /// Returns `true` when a source with the given id exists.
  func sourceExists(id : Types.SourceId) : Bool {
    sources.find(func s = s.id == id) != null;
  };

  /// Creates a new source record. Requires sign-in; the signed-in caller is
  /// recorded as the contributor. The source enters as `#Pending`.
  public shared ({ caller }) func createSource(
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
  ) : async Result.Result<Types.SourceRecord, Types.ResearchError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthorized);
    };
    let source = ResearchLib.createSource(
      sources,
      { var next = state.nextSourceId },
      title,
      sourceType,
      description,
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
      "Source '" # title # "' created",
    );
    state.nextAuditId := state.nextAuditId + 1;
    #ok(source);
  };

  /// Lists all source records (steward only).
  public query ({ caller }) func listSources() : async [Types.SourceRecord] {
    requireSteward(caller);
    sources.toArray();
  };

  /// Returns a single source record by id.
  public query func getSource(id : Types.SourceId) : async ?Types.SourceRecord {
    sources.find(func s = s.id == id);
  };

  /// Creates a new proposed finding. Requires sign-in; the signed-in caller is
  /// recorded as the submitter. The finding enters as `#Pending`.
  public shared ({ caller }) func createFinding(
    title : Text,
    evidenceLabel : Types.EvidenceLabel,
    findingType : Types.FindingType,
    content : Types.FindingContent,
    sourceId : Types.SourceId,
    personId : ?Text,
    newPersonCandidateId : ?Nat,
  ) : async Result.Result<Types.ProposedFinding, Types.ResearchError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthorized);
    };
    if (not sourceExists(sourceId)) {
      return #err(#notFound(sourceId));
    };
    let finding = ResearchLib.createFinding(
      findings,
      { var next = state.nextFindingId },
      title,
      evidenceLabel,
      findingType,
      content,
      sourceId,
      personId,
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
      "Finding '" # title # "' submitted",
    );
    state.nextAuditId := state.nextAuditId + 1;
    #ok(finding);
  };

  /// Lists all proposed findings (steward only).
  public query ({ caller }) func listFindings() : async [Types.ProposedFinding] {
    requireSteward(caller);
    findings.toArray();
  };

  /// Returns a single proposed finding by id.
  public query func getFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
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
            conflictField(f),
            canonicalValueFor(f),
            conflictProposedValue(f),
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

  /// Creates a new Person candidate. Requires sign-in; the signed-in caller is
  /// recorded as the submitter. The candidate enters as `#Pending`.
  public shared ({ caller }) func createNewPersonCandidate(
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.NewPersonCandidate, Types.ResearchError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthorized);
    };
    if (not sourceExists(sourceId)) {
      return #err(#notFound(sourceId));
    };
    let candidate = ResearchLib.createNewPersonCandidate(
      candidates,
      { var next = state.nextCandidateId },
      name,
      details,
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
      "New Person Candidate '" # name # "' submitted",
    );
    state.nextAuditId := state.nextAuditId + 1;
    #ok(candidate);
  };

  /// Lists all New Person candidates (steward only).
  public query ({ caller }) func listNewPersonCandidates() : async [Types.NewPersonCandidate] {
    requireSteward(caller);
    candidates.toArray();
  };

  /// Creates a new relationship proposal. Requires sign-in; the signed-in
  /// caller is recorded as the submitter. The proposal enters as `#Pending`.
  public shared ({ caller }) func createRelationshipProposal(
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.RelationshipProposal, Types.ResearchError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthorized);
    };
    if (not sourceExists(sourceId)) {
      return #err(#notFound(sourceId));
    };
    let proposal = ResearchLib.createRelationshipProposal(
      proposals,
      { var next = state.nextProposalId },
      fromPersonId,
      toPersonId,
      relationshipType,
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
      "Relationship proposal '" # fromPersonId # " - " # relationshipType # " - " # toPersonId # "' submitted",
    );
    state.nextAuditId := state.nextAuditId + 1;
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

  /// Resolves a conflict review item (steward only). Returns the updated item,
  /// or `null` when it does not exist.
  public shared ({ caller }) func resolveConflict(id : Nat) : async ?Types.ConflictReviewItem {
    requireSteward(caller);
    let now = Time.now();
    switch (conflicts.find(func c = c.id == id)) {
      case null { null };
      case (?c) {
        // Resolving a conflict writes the proposed value into canonical data.
        switch (findings.find(func f = f.id == c.findingId)) {
          case (?f) { routeToCanonical(f, caller, now) };
          case null {};
        };
        let updated = ResearchLib.resolveConflict(conflicts, id, caller, now);
        ignore ResearchLib.appendAudit(
          auditLog,
          { var next = state.nextAuditId },
          "ConflictResolved",
          ?c.findingId,
          null,
          caller,
          now,
          "Conflict Review item #" # id.toText() # " resolved",
        );
        state.nextAuditId := state.nextAuditId + 1;
        updated;
      };
    };
  };

  /// Returns the review queue badge counts (pending, approved, rejected,
  /// conflicting) across all reviewable research intake items.
  public query func getReviewQueue() : async Types.ReviewQueue {
    ResearchLib.computeQueue(findings, candidates, proposals, conflicts);
  };

  /// Returns the full research intake audit history.
  public query func getResearchAuditLog() : async [Types.ResearchAuditEntry] {
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

  /// The actual canonical value being contradicted by a finding, used to
  /// populate a Conflict Review item so the steward can compare it against the
  /// proposed value. Returns empty text when no canonical value exists.
  func canonicalValueFor(f : Types.ProposedFinding) : Text {
    switch (f.content) {
      case (#PersonFact pf) {
        switch (profiles.get(pf.personId)) {
          case (?profile) {
            switch (pf.field) {
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
    switch (profiles.get(personId)) {
      case (?profile) {
        let updated : OwnershipTypes.PersonProfile = switch (field) {
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
};

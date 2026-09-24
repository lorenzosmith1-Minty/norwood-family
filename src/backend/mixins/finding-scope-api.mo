import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import FindingScopeLib "../lib/finding-scope";
import FamilyAuthorizationLib "../lib/family-authorization";
import TenancyLib "../lib/tenancy";
import ResearchAuditLib "../lib/research-intake";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-B2-B1 canonical family-scoped Proposed Finding public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Steward
/// review access resolves through `requireFindingStewardForFamily`, which uses
/// the existing Steward-access denial behavior evaluated for that family. Every
/// returned or mutated finding must carry `ProposedFinding.familyId == familyId`,
/// and the linked Source and referenced PersonProfile must both belong to the
/// same family, so a `findingId` alone never crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  findings : List.List<Types.ProposedFinding>,
  sources : List.List<Types.SourceRecord>,
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
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  notifications : List.List<OwnershipTypes.Notification>,
) {
  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the existing Steward-access denial behavior. A Steward of one family can
  /// never review another family's finding.
  func requireFindingStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
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

  /// The linked SourceRecord for `sourceId` when it belongs to `familyId`, or
  /// `null` otherwise. A source in another family is never returned, so a
  /// Source in Family A can never back a Finding in Family B.
  func sourceInFamily(sourceId : Types.SourceId, familyId : FamilyTypes.FamilyId) : ?Types.SourceRecord {
    sources.find(func s = s.id == sourceId and s.familyId == familyId);
  };

  /// Whether `personId` belongs to `familyId`, using the canonical
  /// family-qualified person predicate from Tenancy 1C-A.
  func personInFamily(personId : Text, familyId : FamilyTypes.FamilyId) : Bool {
    FamilyAuthorizationLib.isPersonInFamily(profiles, claims, personId, familyId);
  };

  /// Internal implementation of `createFindingForFamily` that takes the caller
  /// explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createFindingForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    evidenceLabel : Types.EvidenceLabel,
    findingType : Types.FindingType,
    content : Types.FindingContent,
    sourceId : Types.SourceId,
    personId : ?Text,
    newPersonCandidateId : ?Nat,
    caller : Principal,
  ) : Result.Result<Types.ProposedFinding, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return #err(#notAuthorized);
    };
    if (sourceInFamily(sourceId, familyId) == null) {
      return #err(#notFound(sourceId));
    };
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanPersonId = InputValidation.requireOptionalText("personId", personId, InputValidation.MAX_LOCATION_CHARS);
    switch (cleanPersonId) {
      case (?pid) {
        if (not personInFamily(pid, familyId)) {
          return #err(#notAuthorized);
        };
      };
      case null {};
    };
    requireFindingContent(content);
    let now = Time.now();
    let finding = FindingScopeLib.createForFamily(
      findings,
      { var next = state.nextFindingId },
      familyId,
      cleanTitle,
      evidenceLabel,
      findingType,
      content,
      sourceId,
      cleanPersonId,
      newPersonCandidateId,
      caller,
      now,
    );
    state.nextFindingId := state.nextFindingId + 1;
    ignore appendFindingAudit(
      familyId,
      "FindingSubmitted",
      ?finding.id,
      ?sourceId,
      caller,
      now,
      "Finding '" # cleanTitle # "' submitted",
    );
    addFindingNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(finding);
  };

  /// Internal implementation of `approveFindingForFamily` that takes the caller
  /// explicitly. See `createFindingForFamilyInternal`.
  func approveFindingForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
    caller : Principal,
  ) : ?Types.ProposedFinding {
    requireFindingStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (FindingScopeLib.getForFamily(findings, familyId, findingId)) {
      case null { null };
      case (?f) {
        if (f.status != #Pending) {
          return null;
        };
        // The linked Source must belong to the same family as the finding.
        if (sourceInFamily(f.sourceId, familyId) == null) {
          return null;
        };
        // The referenced PersonProfile must belong to the same family.
        switch (f.personId) {
          case (?pid) {
            if (not personInFamily(pid, familyId)) {
              return null;
            };
          };
          case null {};
        };
        if (f.evidenceLabel == #Conflicting) {
          // Route to Conflict Review instead of silently overwriting. The
          // generated conflict carries the same familyId as the finding.
          let conflict = createConflictReviewItemForFamily(f, familyId);
          let updated = FindingScopeLib.markConflictingForFamily(findings, familyId, findingId, conflict.id, caller, now);
          ignore appendFindingAudit(
            familyId,
            "FindingRoutedToConflict",
            ?f.id,
            ?f.sourceId,
            caller,
            now,
            "Finding '" # f.title # "' routed to Conflict Review",
          );
          updated;
        } else {
          let updated = FindingScopeLib.approveForFamily(findings, familyId, findingId, caller, now);
          FindingScopeLib.routeToCanonicalForFamily(profiles, f, familyId);
          ignore appendFindingAudit(
            familyId,
            "FindingApproved",
            ?findingId,
            ?f.sourceId,
            caller,
            now,
            "Finding '" # f.title # "' approved and routed to " # routingTarget(f.findingType),
          );
          updated;
        };
      };
    };
  };

  /// Internal implementation of `rejectFindingForFamily` that takes the caller
  /// explicitly. See `createFindingForFamilyInternal`.
  func rejectFindingForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
    caller : Principal,
  ) : ?Types.ProposedFinding {
    requireFindingStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (FindingScopeLib.getForFamily(findings, familyId, findingId)) {
      case null { null };
      case (?f) {
        if (f.status != #Pending) {
          return null;
        };
        let updated = FindingScopeLib.rejectForFamily(findings, familyId, findingId, caller, now);
        ignore appendFindingAudit(
          familyId,
          "FindingRejected",
          ?findingId,
          ?f.sourceId,
          caller,
          now,
          "Finding '" # f.title # "' rejected",
        );
        updated;
      };
    };
  };

  /// Internal implementation of `needsResearchFindingForFamily` that takes the
  /// caller explicitly. See `createFindingForFamilyInternal`.
  func needsResearchFindingForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
    caller : Principal,
  ) : ?Types.ProposedFinding {
    requireFindingStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (FindingScopeLib.getForFamily(findings, familyId, findingId)) {
      case null { null };
      case (?f) {
        if (f.status != #Pending) {
          return null;
        };
        let updated = FindingScopeLib.needsResearchForFamily(findings, familyId, findingId, caller, now);
        ignore appendFindingAudit(
          familyId,
          "FindingNeedsResearch",
          ?findingId,
          ?f.sourceId,
          caller,
          now,
          "Finding '" # f.title # "' marked as needing research",
        );
        updated;
      };
    };
  };

  /// Creates a new proposed finding in `familyId`. Requires an approved member
  /// of `familyId`; the caller is recorded as the submitter. The linked
  /// SourceRecord must belong to `familyId` and the referenced PersonProfile must
  /// belong to `familyId`, so a Source in Family A can never create a Finding
  /// against a profile in Family B. The finding enters as `#Pending` and its
  /// `familyId` is the requested `familyId`.
  public shared ({ caller }) func createFindingForFamily(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    evidenceLabel : Types.EvidenceLabel,
    findingType : Types.FindingType,
    content : Types.FindingContent,
    sourceId : Types.SourceId,
    personId : ?Text,
    newPersonCandidateId : ?Nat,
  ) : async Result.Result<Types.ProposedFinding, Types.ResearchError> {
    createFindingForFamilyInternal(familyId, title, evidenceLabel, findingType, content, sourceId, personId, newPersonCandidateId, caller);
  };

  /// Lists every proposed finding in `familyId`. Requires an active Steward of
  /// `familyId`, matching the pre-tenancy Steward-only finding-read behavior. A
  /// finding whose `familyId` differs is never returned, so Family A findings
  /// never appear in a Family B call.
  public query ({ caller }) func listFindingsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.ProposedFinding] {
    requireFindingStewardForFamily(caller, familyId);
    FindingScopeLib.listForFamily(findings, familyId);
  };

  /// Returns the finding with `findingId` when it belongs to `familyId`, or
  /// `null` otherwise. Requires an active Steward of `familyId`, matching the
  /// pre-tenancy Steward-only finding-read behavior. A record that exists under
  /// another family is never returned, so a `findingId` alone cannot cross the
  /// family boundary.
  public query ({ caller }) func getFindingForFamily(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
  ) : async ?Types.ProposedFinding {
    requireFindingStewardForFamily(caller, familyId);
    FindingScopeLib.getForFamily(findings, familyId, findingId);
  };

  /// Approves the pending finding with `findingId` in `familyId`. Requires an
  /// active Steward of `familyId`. The linked Source and referenced
  /// PersonProfile must both belong to `familyId`. A finding labelled
  /// `#Conflicting` is routed to a Conflict Review item carrying the same
  /// `familyId` instead of silently overwriting canonical data. An approved
  /// finding promotes into the canonical profile through the family-qualified
  /// profile lookup, verifying `profile.familyId == familyId` and updating only
  /// that family's profile. Returns the updated finding, or `null` when no
  /// pending finding with that id belongs to `familyId`.
  public shared ({ caller }) func approveFindingForFamily(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
  ) : async ?Types.ProposedFinding {
    approveFindingForFamilyInternal(familyId, findingId, caller);
  };

  /// Rejects the pending finding with `findingId` in `familyId`. Requires an
  /// active Steward of `familyId`. Returns the updated finding, or `null` when
  /// no pending finding with that id belongs to `familyId`.
  public shared ({ caller }) func rejectFindingForFamily(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
  ) : async ?Types.ProposedFinding {
    rejectFindingForFamilyInternal(familyId, findingId, caller);
  };

  /// Marks the pending finding with `findingId` in `familyId` as needing
  /// research. Requires an active Steward of `familyId`. Returns the updated
  /// finding, or `null` when no pending finding with that id belongs to
  /// `familyId`.
  public shared ({ caller }) func needsResearchFindingForFamily(
    familyId : FamilyTypes.FamilyId,
    findingId : Types.FindingId,
  ) : async ?Types.ProposedFinding {
    needsResearchFindingForFamilyInternal(familyId, findingId, caller);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `createFindingForFamily`.
  public shared ({ caller }) func createFinding(
    title : Text,
    evidenceLabel : Types.EvidenceLabel,
    findingType : Types.FindingType,
    content : Types.FindingContent,
    sourceId : Types.SourceId,
    personId : ?Text,
    newPersonCandidateId : ?Nat,
  ) : async Result.Result<Types.ProposedFinding, Types.ResearchError> {
    createFindingForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, evidenceLabel, findingType, content, sourceId, personId, newPersonCandidateId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listFindingsForFamily`.
  public query ({ caller }) func listFindings() : async [Types.ProposedFinding] {
    requireFindingStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    FindingScopeLib.listForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getFindingForFamily`.
  public query ({ caller }) func getFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    requireFindingStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    FindingScopeLib.getForFamily(findings, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveFindingForFamily`.
  public shared ({ caller }) func approveFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    approveFindingForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectFindingForFamily`.
  public shared ({ caller }) func rejectFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    rejectFindingForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `needsResearchFindingForFamily`.
  public shared ({ caller }) func needsResearchFinding(id : Types.FindingId) : async ?Types.ProposedFinding {
    needsResearchFindingForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Appends a research audit entry for a finding action in `familyId`,
  /// advancing the shared audit id counter. The entry is written to the same
  /// family as the finding action, never inferred from the default family.
  func appendFindingAudit(
    familyId : FamilyTypes.FamilyId,
    action : Text,
    findingId : ?Types.FindingId,
    sourceId : ?Types.SourceId,
    actorId : Principal,
    now : Int,
    summary : Text,
  ) : Types.ResearchAuditEntry {
    let entry = ResearchAuditLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      familyId,
      action,
      findingId,
      sourceId,
      actorId,
      now,
      summary,
    );
    state.nextAuditId := state.nextAuditId + 1;
    entry;
  };

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextFindingNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Appends a research notification for the given recipient, avoiding
  /// duplicates. Shared by the family-scoped finding endpoints and their
  /// temporary compatibility wrappers so notification behavior never diverges.
  func addFindingNotification(
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    let exists = notifications.toArray().any(func n = n.recipient == recipient and n.notificationType == notificationType and n.message == message);
    if (not exists) {
      notifications.add({
        id = nextFindingNotificationId();
        recipient;
        notificationType;
        message;
        createdAt = Time.now();
        read = false;
      });
    };
  };

  /// Creates a Conflict Review item for a finding that contradicts canonical
  /// data, carrying the same `familyId` as the finding. The item enters as
  /// `#Conflicting` (unresolved, awaiting the steward's decision) and captures
  /// the affected Person, the disputed field, both values, and the proposed
  /// finding's evidence label. Canonical data is never altered here.
  func createConflictReviewItemForFamily(
    f : Types.ProposedFinding,
    familyId : FamilyTypes.FamilyId,
  ) : Types.ConflictReviewItem {
    let id = state.nextConflictId;
    state.nextConflictId += 1;
    let item : Types.ConflictReviewItem = {
      familyId;
      id;
      findingId = f.id;
      personId = conflictPersonId(f);
      field = conflictField(f);
      canonicalValue = canonicalValueForFamily(f, familyId);
      proposedValue = conflictProposedValue(f);
      existingSourceId = null;
      proposedSourceId = ?f.sourceId;
      evidenceLabel = f.evidenceLabel;
      stewardNotes = "";
      status = #Conflicting;
      resolvedBy = null;
      resolvedAt = null;
    };
    conflicts.add(item);
    item;
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

  /// The actual canonical value being contradicted by a finding, read through
  /// the family-qualified profile lookup so a Family A finding never reads a
  /// Family B profile's value.
  func canonicalValueForFamily(f : Types.ProposedFinding, familyId : FamilyTypes.FamilyId) : Text {
    switch (f.content) {
      case (#PersonFact pf) {
        switch (FindingScopeLib.normalizePersonFactField(pf.field)) {
          case (?key) {
            switch (TenancyLib.getProfileForFamily(profiles, familyId, pf.personId)) {
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
      case (#TimelineEvent t) {
        switch (TenancyLib.getProfileForFamily(profiles, familyId, t.personId)) {
          case (?profile) {
            switch (profile.timeline) {
              case (?entries) { entries.values().join("; ") };
              case null { "" };
            };
          };
          case null { "" };
        };
      };
      case _ { "" };
    };
  };
};

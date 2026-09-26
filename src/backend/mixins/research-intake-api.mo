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
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import NotificationsScopeLib "../lib/notifications-scope";
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

  /// Internal implementation of `createSourceForFamily` that takes the caller
  /// explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createSourceForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
    caller : Principal,
  ) : Result.Result<Types.SourceRecord, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return #err(#notAuthorized);
    };
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    // A linked Archive item, when supplied, must belong to `familyId`: an
    // `archiveItemId` alone is never a tenant boundary, so Family A may never
    // link Family B's Archive item. The denial message carries no family id or
    // principal.
    switch (archiveItemId) {
      case (?aid) {
        if (archiveItems.find(func it = it.id == aid and ArchiveLib.belongsToFamily(it, familyId)) == null) {
          Runtime.trap("Unauthorized: Linked archive item must belong to the same family");
        };
      };
      case null {};
    };
    let now = Time.now();
    let source = ResearchLib.createSource(
      sources,
      { var next = state.nextSourceId },
      familyId,
      cleanTitle,
      sourceType,
      cleanDescription,
      archiveItemId,
      caller,
      now,
    );
    state.nextSourceId := state.nextSourceId + 1;
    ignore ResearchLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      familyId,
      "SourceCreated",
      null,
      ?source.id,
      caller,
      now,
      "Source '" # cleanTitle # "' created",
    );
    state.nextAuditId := state.nextAuditId + 1;
    addResearchNotification(familyId, caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(source);
  };

  /// Creates a new source record in `familyId`. Requires an approved member or
  /// Steward of `familyId`; the caller is recorded as the contributor. The
  /// source enters as `#Pending`. The stored `SourceRecord.familyId` is
  /// `familyId`, the Research audit entry is written to `familyId`, and the
  /// submission notification is scoped to `familyId`. A linked Archive item,
  /// when supplied, must belong to `familyId`. This is the canonical
  /// family-scoped non-upload Source creation path and never relies on the
  /// default family.
  public shared ({ caller }) func createSourceForFamily(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
  ) : async Result.Result<Types.SourceRecord, Types.ResearchError> {
    createSourceForFamilyInternal(familyId, title, sourceType, description, archiveItemId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `createSourceForFamily`.
  /// Deprecated single-family form: delegates to the canonical family-scoped
  /// endpoint with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior
  /// for familyId "norwood" is unchanged. Contains no duplicated business logic
  /// and will be removed once the frontend passes an explicit familyId
  /// everywhere.
  public shared ({ caller }) func createSource(
    title : Text,
    sourceType : Types.SourceType,
    description : Text,
    archiveItemId : ?Nat,
  ) : async Result.Result<Types.SourceRecord, Types.ResearchError> {
    createSourceForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, sourceType, description, archiveItemId, caller);
  };

  // NOTE: `createRelationshipProposal` and `listRelationshipProposals` moved to
  // `mixins/relationship-proposal-scope-api.mo` as TEMPORARY Tenancy 1C
  // compatibility wrappers delegating to the canonical family-scoped endpoints
  // with `FamilyTypes.DEFAULT_FAMILY_ID`. Exactly one implementation exists.

  // NOTE: the Conflict Review endpoints (`listConflictReviewItems`,
  // `listConflictsForPerson`, `listDisputedFactsForPerson`, `resolveConflict`)
  // moved to `mixins/conflict-scope-api.mo` as TEMPORARY Tenancy 1C
  // compatibility wrappers delegating to the canonical family-scoped endpoints
  // with `FamilyTypes.DEFAULT_FAMILY_ID`. Exactly one implementation exists.

  // NOTE: `approveRelationshipProposal` and `rejectRelationshipProposal` moved
  // to `mixins/relationship-proposal-scope-api.mo` as TEMPORARY Tenancy 1C
  // compatibility wrappers delegating to the canonical family-scoped endpoints
  // with `FamilyTypes.DEFAULT_FAMILY_ID`. Exactly one implementation exists;
  // declaring them here too would be a duplicate definition (M0051).

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
            FamilyTypes.DEFAULT_FAMILY_ID,
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

  /// Returns the research intake audit history for `familyId`. Requires an
  /// active Steward of `familyId`, using the existing Steward-access denial
  /// behavior evaluated for that family. Only entries whose `familyId` equals
  /// `familyId` are returned, so Family A audit activity is never listed or
  /// exposed through Family B. This is the canonical family-scoped audit read.
  public query ({ caller }) func getResearchAuditLogForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.ResearchAuditEntry] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    ResearchLib.listAuditForFamily(auditLog, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getResearchAuditLogForFamily`. Deprecated single-family form: delegates
  /// with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior for
  /// familyId "norwood" is unchanged. Contains no duplicated business logic and
  /// will be removed once the frontend passes an explicit familyId everywhere.
  public query ({ caller }) func getResearchAuditLog() : async [Types.ResearchAuditEntry] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ResearchLib.listAuditForFamily(auditLog, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Appends a research notification for the given recipient in `familyId`,
  /// avoiding duplicates. Delegates to the canonical family-scoped notification
  /// helper, so the stored `familyId` is always the action's family.
  func addResearchNotification(
    familyId : FamilyTypes.FamilyId,
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    ignore NotificationsScopeLib.createUniqueForFamily(notifications, familyId, recipient, notificationType, message, Time.now());
  };
};
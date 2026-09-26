import List "mo:core/List";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Types "../types/research-intake";
import ArchiveTypes "../types/archive";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import ResearchSourceScopeLib "../lib/research-source-scope";
import FindingScopeLib "../lib/finding-scope";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import NotificationsScopeLib "../lib/notifications-scope";
import ResearchAuditLib "../lib/research-intake";

/// Tenancy 1C-B2 canonical family-scoped Research Source public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Member
/// access resolves through `isApprovedFamilyMemberForFamily`; Steward review
/// access resolves through `requireActiveStewardForFamily`. Every returned or
/// mutated source must carry `SourceRecord.familyId == familyId`, and a linked
/// Archive item is only cascaded to when it belongs to the same family, so a
/// `sourceId` or `archiveItemId` alone never crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
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
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  notifications : List.List<OwnershipTypes.Notification>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the existing Steward-access denial behavior. A Steward of one family can
  /// never review another family's source.
  func requireSourceStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Appends a research notification for the given recipient in `familyId`,
  /// avoiding duplicates. Delegates to the canonical family-scoped notification
  /// helper, so the stored `familyId` is always the action's family.
  func addSourceNotification(
    familyId : FamilyTypes.FamilyId,
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    ignore NotificationsScopeLib.createUniqueForFamily(notifications, familyId, recipient, notificationType, message, Time.now());
  };

  /// Cascades a source review decision to its linked Archive item, but only when
  /// the source belongs to `familyId` AND the linked Archive item also belongs
  /// to `familyId`. The transition uses `ArchiveLib.transitionStatus`, which
  /// emits NO notification, so a single source approval/rejection never produces
  /// an Archive notification. An `archiveItemId` pointing at another family's
  /// item is never followed.
  func cascadeLinkedArchiveForFamily(
    source : Types.SourceRecord,
    familyId : FamilyTypes.FamilyId,
    status : ArchiveTypes.ArchiveItemStatus,
  ) {
    switch (ResearchSourceScopeLib.linkedArchiveItemIdInFamily(source, archiveItems, familyId)) {
      case (?aid) { ignore ArchiveLib.transitionStatus(archiveItems, aid, status) };
      case null {};
    };
  };

  /// Appends a research audit entry for a source review action in `familyId`,
  /// advancing the shared audit id counter. The entry is written to the same
  /// family as the source action, never inferred from the default family.
  func appendSourceAudit(
    familyId : FamilyTypes.FamilyId,
    action : Text,
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
      null,
      sourceId,
      actorId,
      now,
      summary,
    );
    state.nextAuditId := state.nextAuditId + 1;
    entry;
  };

  /// Internal implementation of `approveSourceForFamily` that takes the caller
  /// explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the Steward gate
  /// always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func approveSourceForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
    caller : Principal,
  ) : ?Types.SourceRecord {
    requireSourceStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (ResearchSourceScopeLib.approveForFamily(sources, familyId, sourceId, now)) {
      case (?updated) {
        cascadeLinkedArchiveForFamily(updated, familyId, #Approved);
        addSourceNotification(familyId, updated.contributor, #ResearchApproved, "Your research submission was approved.");
        ignore appendSourceAudit(
          familyId,
          "SourceApproved",
          ?updated.id,
          caller,
          now,
          "Source '" # updated.title # "' approved",
        );
        ?updated;
      };
      case null { null };
    };
  };

  /// Internal implementation of `rejectSourceForFamily` that takes the caller
  /// explicitly. See `approveSourceForFamilyInternal`.
  func rejectSourceForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
    caller : Principal,
  ) : ?Types.SourceRecord {
    requireSourceStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (ResearchSourceScopeLib.rejectForFamily(sources, familyId, sourceId, now)) {
      case (?updated) {
        cascadeLinkedArchiveForFamily(updated, familyId, #Rejected);
        addSourceNotification(familyId, updated.contributor, #ResearchRejected, "Your research submission was not approved.");
        ignore appendSourceAudit(
          familyId,
          "SourceRejected",
          ?updated.id,
          caller,
          now,
          "Source '" # updated.title # "' rejected",
        );
        ?updated;
      };
      case null { null };
    };
  };

  /// Internal implementation of `needsResearchSourceForFamily` that takes the
  /// caller explicitly. See `approveSourceForFamilyInternal`.
  func needsResearchSourceForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
    caller : Principal,
  ) : ?Types.SourceRecord {
    requireSourceStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (ResearchSourceScopeLib.needsResearchForFamily(sources, familyId, sourceId, now)) {
      case (?updated) {
        ignore appendSourceAudit(
          familyId,
          "SourceNeedsResearch",
          ?updated.id,
          caller,
          now,
          "Source '" # updated.title # "' marked as needing research",
        );
        ?updated;
      };
      case null { null };
    };
  };

  /// Lists every source record in `familyId`. Requires an active Steward of
  /// `familyId`, matching the pre-tenancy Steward-only source-read behavior. A
  /// source whose `familyId` differs is never returned, so Family A sources
  /// never appear in a Family B call.
  public query ({ caller }) func listSourcesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.SourceRecord] {
    requireSourceStewardForFamily(caller, familyId);
    ResearchSourceScopeLib.listForFamily(sources, familyId);
  };

  /// Returns the source with `sourceId` when it belongs to `familyId`, or `null`
  /// otherwise. Requires an active Steward of `familyId`, matching the
  /// pre-tenancy Steward-only source-read behavior. A record that exists under
  /// another family is never returned, so a `sourceId` alone cannot cross the
  /// family boundary.
  public query ({ caller }) func getSourceForFamily(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
  ) : async ?Types.SourceRecord {
    requireSourceStewardForFamily(caller, familyId);
    ResearchSourceScopeLib.getForFamily(sources, familyId, sourceId);
  };

  /// Approves the pending source with `sourceId` in `familyId`. Requires an
  /// active Steward of `familyId`. When the source links an Archive item that
  /// belongs to the same family, that item is transitioned from `#Pending` to
  /// `#Approved` in the same action with no Archive notification; exactly one
  /// `#ResearchApproved` notification is recorded to the contributor. Returns
  /// the updated source, or `null` when no pending source with that id belongs
  /// to `familyId`.
  public shared ({ caller }) func approveSourceForFamily(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
  ) : async ?Types.SourceRecord {
    approveSourceForFamilyInternal(familyId, sourceId, caller);
  };

  /// Rejects the pending source with `sourceId` in `familyId`. Requires an
  /// active Steward of `familyId`. When the source links an Archive item that
  /// belongs to the same family, that item is transitioned from `#Pending` to
  /// `#Rejected` in the same action with no Archive notification; exactly one
  /// `#ResearchRejected` notification is recorded to the contributor. Returns
  /// the updated source, or `null` when no pending source with that id belongs
  /// to `familyId`.
  public shared ({ caller }) func rejectSourceForFamily(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
  ) : async ?Types.SourceRecord {
    rejectSourceForFamilyInternal(familyId, sourceId, caller);
  };

  /// Marks the pending source with `sourceId` in `familyId` as needing research.
  /// Requires an active Steward of `familyId`. Returns the updated source, or
  /// `null` when no pending source with that id belongs to `familyId`.
  public shared ({ caller }) func needsResearchSourceForFamily(
    familyId : FamilyTypes.FamilyId,
    sourceId : Types.SourceId,
  ) : async ?Types.SourceRecord {
    needsResearchSourceForFamilyInternal(familyId, sourceId, caller);
  };

  /// Returns the review queue for `familyId`. Requires an active Steward of
  /// `familyId`. The Sources section and every source-derived count are
  /// restricted to sources whose `familyId` equals `familyId` (byte-identical to
  /// Tenancy 1C-B2-A), the Findings section and every finding-derived count are
  /// restricted to findings whose `familyId` equals `familyId`, and the New
  /// Person Candidates section and every candidate-derived count are restricted
  /// to candidates whose `familyId` equals `familyId` (Tenancy 1C-B2-B2), so the
  /// returned queue never mixes source, finding, or candidate counts across
  /// families. The Relationships and Conflicts categories keep their existing
  /// behavior unchanged in this build.
  public query ({ caller }) func getReviewQueueForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async Types.ReviewQueue {
    requireSourceStewardForFamily(caller, familyId);
    FindingScopeLib.computeQueueForFamily(sources, findings, candidates, proposals, conflicts, familyId);
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listSourcesForFamily`.
  public query ({ caller }) func listSources() : async [Types.SourceRecord] {
    requireSourceStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ResearchSourceScopeLib.listForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getSourceForFamily`.
  public query ({ caller }) func getSource(id : Types.SourceId) : async ?Types.SourceRecord {
    requireSourceStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ResearchSourceScopeLib.getForFamily(sources, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveSourceForFamily`.
  public shared ({ caller }) func approveSource(id : Types.SourceId) : async ?Types.SourceRecord {
    approveSourceForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectSourceForFamily`.
  public shared ({ caller }) func rejectSource(id : Types.SourceId) : async ?Types.SourceRecord {
    rejectSourceForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `needsResearchSourceForFamily`.
  public shared ({ caller }) func needsResearchSource(id : Types.SourceId) : async ?Types.SourceRecord {
    needsResearchSourceForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getReviewQueueForFamily`.
  public query ({ caller }) func getReviewQueue() : async Types.ReviewQueue {
    requireSourceStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    FindingScopeLib.computeQueueForFamily(sources, findings, candidates, proposals, conflicts, FamilyTypes.DEFAULT_FAMILY_ID);
  };
};

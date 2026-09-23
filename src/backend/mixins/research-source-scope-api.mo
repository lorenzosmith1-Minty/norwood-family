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

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextSourceNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Appends a research notification for the given recipient, avoiding
  /// duplicates. Shared by the family-scoped source review endpoints and their
  /// temporary compatibility wrappers so notification behavior never diverges.
  func addSourceNotification(
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    let exists = notifications.toArray().any(func n = n.recipient == recipient and n.notificationType == notificationType and n.message == message);
    if (not exists) {
      notifications.add({
        id = nextSourceNotificationId();
        recipient;
        notificationType;
        message;
        createdAt = Time.now();
        read = false;
      });
    };
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
    switch (ResearchSourceScopeLib.approveForFamily(sources, familyId, sourceId, Time.now())) {
      case (?updated) {
        cascadeLinkedArchiveForFamily(updated, familyId, #Approved);
        addSourceNotification(updated.contributor, #ResearchApproved, "Your research submission was approved.");
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
    switch (ResearchSourceScopeLib.rejectForFamily(sources, familyId, sourceId, Time.now())) {
      case (?updated) {
        cascadeLinkedArchiveForFamily(updated, familyId, #Rejected);
        addSourceNotification(updated.contributor, #ResearchRejected, "Your research submission was not approved.");
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
    ResearchSourceScopeLib.needsResearchForFamily(sources, familyId, sourceId, Time.now());
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
  /// Tenancy 1C-B2-A), and the Findings section and every finding-derived count
  /// are restricted to findings whose `familyId` equals `familyId`, so the
  /// returned queue never mixes source or finding counts across families. The
  /// non-source, non-finding categories (Candidates, Relationships, Conflicts)
  /// keep their existing behavior unchanged in this build.
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

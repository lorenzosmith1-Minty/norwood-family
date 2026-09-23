import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import RelationshipProposalScopeLib "../lib/relationship-proposal-scope";
import FamilyAuthorizationLib "../lib/family-authorization";
import ResearchAuditLib "../lib/research-intake";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-B2-B3 canonical family-scoped Relationship Proposal public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Member
/// access resolves through `isApprovedFamilyMemberForFamily`; Steward review
/// access resolves through `requireRelationshipProposalStewardForFamily`. Every
/// returned or created proposal must carry `RelationshipProposal.familyId ==
/// familyId`, both referenced people must belong to `familyId`, and a linked
/// Source must belong to `familyId`, so a `proposalId`, `personId`, or
/// `sourceId` alone never crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  proposals : List.List<Types.RelationshipProposal>,
  sources : List.List<Types.SourceRecord>,
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
  /// never review another family's proposal.
  func requireRelationshipProposalStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// The linked SourceRecord for `sourceId` when it belongs to `familyId`, or
  /// `null` otherwise. A source in another family is never returned, so a Source
  /// in Family A can never back a Proposal in Family B.
  func relationshipProposalSourceInFamily(sourceId : Types.SourceId, familyId : FamilyTypes.FamilyId) : ?Types.SourceRecord {
    sources.find(func s = s.id == sourceId and s.familyId == familyId);
  };

  /// Whether `personId` belongs to `familyId`, using the canonical
  /// family-qualified person predicate from Tenancy 1C-A.
  func relationshipProposalPersonInFamily(personId : Text, familyId : FamilyTypes.FamilyId) : Bool {
    FamilyAuthorizationLib.isPersonInFamily(profiles, claims, personId, familyId);
  };

  /// Internal implementation of `createRelationshipProposalForFamily` that takes
  /// the caller explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createRelationshipProposalForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
    caller : Principal,
  ) : Result.Result<Types.RelationshipProposal, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return #err(#notAuthorized);
    };
    // The linked Source must belong to the same family as the proposal.
    if (relationshipProposalSourceInFamily(sourceId, familyId) == null) {
      return #err(#notFound(sourceId));
    };
    let cleanFrom = InputValidation.requireText("fromPersonId", fromPersonId, InputValidation.MAX_LOCATION_CHARS);
    let cleanTo = InputValidation.requireText("toPersonId", toPersonId, InputValidation.MAX_LOCATION_CHARS);
    let cleanType = InputValidation.requireText("relationshipType", relationshipType, InputValidation.MAX_LOCATION_CHARS);
    // Both people must belong to the requested family, so a Family A person can
    // never be paired with a Family B person and a reference that resolves by id
    // in another family is rejected.
    if (not relationshipProposalPersonInFamily(cleanFrom, familyId)) {
      return #err(#notAuthorized);
    };
    if (not relationshipProposalPersonInFamily(cleanTo, familyId)) {
      return #err(#notAuthorized);
    };
    let now = Time.now();
    let proposal = RelationshipProposalScopeLib.createForFamily(
      proposals,
      { var next = state.nextProposalId },
      familyId,
      cleanFrom,
      cleanTo,
      cleanType,
      sourceId,
      caller,
      now,
    );
    state.nextProposalId := state.nextProposalId + 1;
    ignore appendRelationshipProposalAudit(
      "RelationshipProposalSubmitted",
      ?sourceId,
      caller,
      now,
      "Relationship proposal '" # cleanFrom # " - " # cleanType # " - " # cleanTo # "' submitted",
    );
    addRelationshipProposalNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(proposal);
  };

  /// Creates a new relationship proposal in `familyId`. Requires an approved
  /// member of `familyId`; the caller is recorded as the submitter. Both
  /// referenced people must belong to `familyId` and the linked SourceRecord must
  /// belong to `familyId`, so a Source or person in Family A can never create a
  /// Proposal in Family B. The proposal enters as `#Pending` and its `familyId`
  /// is the requested `familyId`. No approval or confirmed relationship is
  /// created by this flow.
  public shared ({ caller }) func createRelationshipProposalForFamily(
    familyId : FamilyTypes.FamilyId,
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.RelationshipProposal, Types.ResearchError> {
    createRelationshipProposalForFamilyInternal(familyId, fromPersonId, toPersonId, relationshipType, sourceId, caller);
  };

  /// Lists every relationship proposal in `familyId`. Requires an active Steward
  /// of `familyId`, matching the pre-tenancy Steward-only proposal-read
  /// behavior. A proposal whose `familyId` differs is never returned, so Family A
  /// proposals never appear in a Family B call.
  public query ({ caller }) func listRelationshipProposalsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.RelationshipProposal] {
    requireRelationshipProposalStewardForFamily(caller, familyId);
    RelationshipProposalScopeLib.listForFamily(proposals, familyId);
  };

  /// Returns the proposal with `proposalId` when it belongs to `familyId`, or
  /// `null` otherwise. Requires an active Steward of `familyId`, matching the
  /// pre-tenancy Steward-only proposal-read behavior. A record that exists under
  /// another family is never returned, so a `proposalId` alone cannot cross the
  /// family boundary.
  public query ({ caller }) func getRelationshipProposalForFamily(
    familyId : FamilyTypes.FamilyId,
    proposalId : Nat,
  ) : async ?Types.RelationshipProposal {
    requireRelationshipProposalStewardForFamily(caller, familyId);
    RelationshipProposalScopeLib.getForFamily(proposals, familyId, proposalId);
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `createRelationshipProposalForFamily`.
  public shared ({ caller }) func createRelationshipProposal(
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.RelationshipProposal, Types.ResearchError> {
    createRelationshipProposalForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, fromPersonId, toPersonId, relationshipType, sourceId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listRelationshipProposalsForFamily`.
  public query ({ caller }) func listRelationshipProposals() : async [Types.RelationshipProposal] {
    requireRelationshipProposalStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    RelationshipProposalScopeLib.listForFamily(proposals, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Appends a research audit entry for a relationship proposal action,
  /// advancing the shared audit id counter.
  func appendRelationshipProposalAudit(
    action : Text,
    sourceId : ?Types.SourceId,
    actorId : Principal,
    now : Int,
    summary : Text,
  ) : Types.ResearchAuditEntry {
    let entry = ResearchAuditLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
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

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextRelationshipProposalNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Appends a research notification for the given recipient, avoiding
  /// duplicates. Shared by the family-scoped proposal endpoints and their
  /// temporary compatibility wrappers so notification behavior never diverges.
  func addRelationshipProposalNotification(
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    let exists = notifications.toArray().any(func n = n.recipient == recipient and n.notificationType == notificationType and n.message == message);
    if (not exists) {
      notifications.add({
        id = nextRelationshipProposalNotificationId();
        recipient;
        notificationType;
        message;
        createdAt = Time.now();
        read = false;
      });
    };
  };
};

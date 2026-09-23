import List "mo:core/List";
import Principal "mo:core/Principal";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";

/// Tenancy 1C-B2-B3 canonical family-scoped Relationship Proposal domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `RelationshipProposal` whose `familyId` equals it. A `proposalId` alone is
/// never a tenant boundary: a lookup that finds a proposal belonging to another
/// family behaves exactly like a lookup that found nothing. The API mixin owns
/// authorization and state wiring; this module is pure over the injected
/// collections.
module {
  /// Whether a relationship proposal belongs to `familyId`. The single
  /// family-boundary predicate every family-scoped proposal read funnels
  /// through.
  public func belongsToFamily(proposal : Types.RelationshipProposal, familyId : Text) : Bool {
    proposal.familyId == familyId;
  };

  /// Lists every relationship proposal in `familyId`. A proposal whose
  /// `familyId` differs is never returned, so Family A proposals never appear in
  /// a Family B call.
  public func listForFamily(
    proposals : List.List<Types.RelationshipProposal>,
    familyId : Text,
  ) : [Types.RelationshipProposal] {
    proposals.toArray().filter(func p = belongsToFamily(p, familyId));
  };

  /// Returns the proposal with `id` when it belongs to `familyId`, or `null`
  /// otherwise. A record that exists under another family is never returned, so
  /// a `proposalId` alone cannot cross the family boundary.
  public func getForFamily(
    proposals : List.List<Types.RelationshipProposal>,
    familyId : Text,
    id : Nat,
  ) : ?Types.RelationshipProposal {
    proposals.find(func p = p.id == id and belongsToFamily(p, familyId));
  };

  /// Creates a new relationship proposal in `familyId` and appends it to the
  /// collection. The proposal enters as `#Pending` and its stored `familyId` is
  /// the requested `familyId`. The caller is responsible for having validated
  /// that both people and the linked Source belong to `familyId`; this helper
  /// only persists the record.
  public func createForFamily(
    proposals : List.List<Types.RelationshipProposal>,
    nextId : { var next : Nat },
    familyId : Text,
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : Text,
    sourceId : Types.SourceId,
    submittedBy : Principal,
    now : Int,
  ) : Types.RelationshipProposal {
    let id = nextId.next;
    nextId.next += 1;
    let proposal : Types.RelationshipProposal = {
      familyId;
      id;
      fromPersonId;
      toPersonId;
      relationshipType;
      sourceId;
      status = #Pending;
      submittedBy;
      submittedAt = now;
      reviewedBy = null;
      reviewedAt = null;
    };
    proposals.add(proposal);
    proposal;
  };

  /// Approves the pending relationship proposal with `id` in `familyId`,
  /// transitioning it to `#Approved` and recording the reviewer and timestamp.
  /// A proposal whose `familyId` differs is never touched, so a `proposalId`
  /// alone cannot cross a family boundary. Returns the updated proposal, or
  /// `null` when no pending proposal with that id belongs to `familyId`.
  public func approveForFamily(
    proposals : List.List<Types.RelationshipProposal>,
    familyId : Text,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.RelationshipProposal {
    transitionForFamily(proposals, familyId, id, #Approved, reviewer, now);
  };

  /// Rejects the pending relationship proposal with `id` in `familyId`,
  /// transitioning it to `#Rejected`. No confirmed relationship is created by
  /// this helper. A proposal whose `familyId` differs is never touched. Returns
  /// the updated proposal, or `null` when no pending proposal with that id
  /// belongs to `familyId`.
  public func rejectForFamily(
    proposals : List.List<Types.RelationshipProposal>,
    familyId : Text,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.RelationshipProposal {
    transitionForFamily(proposals, familyId, id, #Rejected, reviewer, now);
  };

  /// Transitions the pending relationship proposal with `id` in `familyId` to
  /// `status`, recording the reviewer and timestamp. A proposal whose `familyId`
  /// differs is never touched, so a `proposalId` alone cannot cross a family
  /// boundary. Returns the updated proposal, or `null` when no pending proposal
  /// with that id belongs to `familyId`.
  func transitionForFamily(
    proposals : List.List<Types.RelationshipProposal>,
    familyId : Text,
    id : Nat,
    status : Types.ReviewStatus,
    reviewer : Principal,
    now : Int,
  ) : ?Types.RelationshipProposal {
    var updated : ?Types.RelationshipProposal = null;
    let snapshot = proposals.toArray();
    proposals.clear();
    for (p in snapshot.values()) {
      // Only a pending proposal that belongs to `familyId` is transitioned. A
      // proposal whose `familyId` differs is re-added untouched, so a
      // `proposalId` alone can never cross a family boundary.
      if (p.id == id and p.status == #Pending and belongsToFamily(p, familyId)) {
        let transitioned : Types.RelationshipProposal = {
          p with
          status;
          reviewedBy = ?reviewer;
          reviewedAt = ?now;
        };
        proposals.add(transitioned);
        updated := ?transitioned;
      } else {
        proposals.add(p);
      };
    };
    updated;
  };

  /// Maps a free-text relationship type to the canonical relationship variant.
  /// The UI relationship form accepts common free-text labels (Daughter, Son,
  /// Aunt, Uncle, Cousin, Grandparent, etc.), so this normalizes case and maps
  /// each to one of the four canonical graph relationship types. A recognized
  /// type is written into the family graph on approval; unrecognized text
  /// returns `null` and is left out of the graph rather than guessed.
  public func relationshipTypeFromText(t : Text) : ?OwnershipTypes.RelationshipType {
    switch (t.trim(#predicate (func ch = ch.isWhitespace())).toLower()) {
      case ("parent" or "mother" or "father" or "mom" or "mum" or "dad" or "stepmother" or "stepfather" or "grandmother" or "grandfather" or "grandparent" or "grandma" or "grandpa" or "great-grandmother" or "great-grandfather" or "great-grandparent") { ?#Parent };
      case ("child" or "daughter" or "son" or "stepdaughter" or "stepson" or "granddaughter" or "grandson" or "grandchild" or "great-granddaughter" or "great-grandson" or "great-grandchild") { ?#Child };
      case ("spouse" or "spousepartner" or "spouse/partner" or "partner" or "husband" or "wife") { ?#SpousePartner };
      case ("sibling" or "brother" or "sister" or "half-brother" or "half-sister" or "stepbrother" or "stepsister") { ?#Sibling };
      case _ { null };
    };
  };

  /// Computes the next confirmed relationship id: one greater than the largest
  /// existing id, or `0` when there are no confirmed relationships.
  public func nextRelationshipId(
    confirmed : List.List<OwnershipTypes.Relationship>,
  ) : Nat {
    var maxId = 0;
    for (r in confirmed.toArray().values()) {
      if (r.id >= maxId) { maxId := r.id + 1 };
    };
    maxId;
  };

  /// Adds a confirmed relationship to the shared family graph in `familyId`
  /// exactly once, preventing duplicate canonical relationships. When an
  /// identical confirmed relationship (same `familyId`, `fromPersonId`,
  /// `toPersonId`, and `relationshipType`) already exists, no second
  /// relationship is added. The stored record's `familyId` is the requested
  /// `familyId`, so no cross-family graph edge is ever created.
  public func addConfirmedRelationshipForFamily(
    confirmed : List.List<OwnershipTypes.Relationship>,
    familyId : Text,
    fromPersonId : Text,
    toPersonId : Text,
    relationshipType : OwnershipTypes.RelationshipType,
  ) : ?OwnershipTypes.Relationship {
    let duplicate = confirmed.toArray().any(func r =
      r.familyId == familyId and
      r.fromPersonId == fromPersonId and
      r.toPersonId == toPersonId and
      r.relationshipType == relationshipType
    );
    if (duplicate) {
      return null;
    };
    let relationship : OwnershipTypes.Relationship = {
      familyId;
      id = nextRelationshipId(confirmed);
      fromPersonId;
      toPersonId;
      relationshipType;
      status = #Confirmed;
    };
    confirmed.add(relationship);
    ?relationship;
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID` so
  /// current Norwood behavior is unchanged. Contains no duplicated logic.
  public func listProposals(
    proposals : List.List<Types.RelationshipProposal>,
  ) : [Types.RelationshipProposal] {
    listForFamily(proposals, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`. Contains no duplicated logic.
  public func approveRelationshipProposalLegacy(
    proposals : List.List<Types.RelationshipProposal>,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.RelationshipProposal {
    approveForFamily(proposals, FamilyTypes.DEFAULT_FAMILY_ID, id, reviewer, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`. Contains no duplicated logic.
  public func rejectRelationshipProposalLegacy(
    proposals : List.List<Types.RelationshipProposal>,
    id : Nat,
    reviewer : Principal,
    now : Int,
  ) : ?Types.RelationshipProposal {
    rejectForFamily(proposals, FamilyTypes.DEFAULT_FAMILY_ID, id, reviewer, now);
  };
};

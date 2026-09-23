import List "mo:core/List";
import Principal "mo:core/Principal";
import Types "../types/research-intake";
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID` so
  /// current Norwood behavior is unchanged. Contains no duplicated logic.
  public func listProposals(
    proposals : List.List<Types.RelationshipProposal>,
  ) : [Types.RelationshipProposal] {
    listForFamily(proposals, FamilyTypes.DEFAULT_FAMILY_ID);
  };
};

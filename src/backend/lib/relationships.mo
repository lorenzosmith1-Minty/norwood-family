import List "mo:core/List";
import Types "../types/relationships";
import FamilyTypes "../types/family";

/// Tenancy 1C-A family-scoped relationship reads. Every read takes the
/// requested `familyId` and returns only records belonging to it. The legacy
/// single-family signatures are retained only as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
module {
  /// Whether a confirmed relationship belongs to `familyId`. A relationship
  /// carrying a different family id is never treated as belonging here, so an
  /// identically keyed person in another family can never surface a
  /// cross-family edge.
  public func relationshipBelongsToFamily(
    relationship : Types.Relationship,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    relationship.familyId == familyId;
  };

  /// Whether a relationship request belongs to `familyId`. A request belongs
  /// to exactly one family; a request in another family is never treated as
  /// belonging here.
  public func relationshipRequestBelongsToFamily(
    request : Types.RelationshipRequest,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    request.familyId == familyId;
  };

  /// Returns a single relationship request by id within `familyId`, or `null`
  /// when absent or when the request belongs to another family.
  public func getRelationshipRequestForFamily(
    requests : List.List<Types.RelationshipRequest>,
    familyId : FamilyTypes.FamilyId,
    id : Nat,
  ) : ?Types.RelationshipRequest {
    requests.find(func r = r.id == id and relationshipRequestBelongsToFamily(r, familyId));
  };

  /// Lists the confirmed relationships of `familyId` that the frontend merges
  /// into the shared family graph. Relationships from other families are never
  /// included.
  public func listConfirmedRelationshipsForFamily(
    confirmed : List.List<Types.Relationship>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Relationship] {
    confirmed.toArray().filter(func r = relationshipBelongsToFamily(r, familyId));
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getRelationshipRequestForFamily`.
  public func getRelationshipRequest(
    requests : List.List<Types.RelationshipRequest>,
    id : Nat,
  ) : ?Types.RelationshipRequest {
    getRelationshipRequestForFamily(requests, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listConfirmedRelationshipsForFamily`.
  public func listConfirmedRelationships(
    confirmed : List.List<Types.Relationship>,
  ) : [Types.Relationship] {
    listConfirmedRelationshipsForFamily(confirmed, FamilyTypes.DEFAULT_FAMILY_ID);
  };
};

import List "mo:core/List";
import Types "../types/relationships";
import FamilyTypes "../types/family";
import RelationshipsLib "../lib/relationships";

/// Tenancy 1C-A family-scoped relationship reads. Every read takes the
/// requested `familyId` and returns only records belonging to it. The legacy
/// single-family endpoints are retained only as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  requests : List.List<Types.RelationshipRequest>,
  confirmed : List.List<Types.Relationship>,
) {
  /// Returns a single relationship request by id within `familyId`, or `null`
  /// when absent or when the request belongs to another family.
  public query func getRelationshipRequestForFamily(familyId : FamilyTypes.FamilyId, id : Nat) : async ?Types.RelationshipRequest {
    RelationshipsLib.getRelationshipRequestForFamily(requests, familyId, id);
  };

  /// Lists the confirmed relationships of `familyId` for the frontend to merge
  /// into the shared family graph. Relationships from other families are never
  /// included.
  public query func listConfirmedRelationshipsForFamily(familyId : FamilyTypes.FamilyId) : async [Types.Relationship] {
    RelationshipsLib.listConfirmedRelationshipsForFamily(confirmed, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getRelationshipRequestForFamily`.
  public query func getRelationshipRequest(id : Nat) : async ?Types.RelationshipRequest {
    RelationshipsLib.getRelationshipRequestForFamily(requests, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listConfirmedRelationshipsForFamily`.
  public query func listConfirmedRelationships() : async [Types.Relationship] {
    RelationshipsLib.listConfirmedRelationshipsForFamily(confirmed, FamilyTypes.DEFAULT_FAMILY_ID);
  };
};

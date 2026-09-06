import List "mo:core/List";
import Types "../types/relationships";
import RelationshipsLib "../lib/relationships";

mixin (
  requests : List.List<Types.RelationshipRequest>,
  confirmed : List.List<Types.Relationship>,
) {
  /// Returns a single relationship request by id.
  public query func getRelationshipRequest(id : Nat) : async ?Types.RelationshipRequest {
    RelationshipsLib.getRelationshipRequest(requests, id);
  };

  /// Lists all confirmed relationships for the frontend to merge into the
  /// shared family graph.
  public query func listConfirmedRelationships() : async [Types.Relationship] {
    RelationshipsLib.listConfirmedRelationships(confirmed);
  };
};

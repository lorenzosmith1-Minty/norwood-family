import List "mo:core/List";
import Types "../types/relationships";

module {
  /// Returns a single relationship request by id, or `null` when absent.
  public func getRelationshipRequest(
    requests : List.List<Types.RelationshipRequest>,
    id : Nat,
  ) : ?Types.RelationshipRequest {
    requests.find(func r = r.id == id);
  };

  /// Lists all confirmed relationships that the frontend merges into the shared
  /// family graph.
  public func listConfirmedRelationships(
    confirmed : List.List<Types.Relationship>,
  ) : [Types.Relationship] {
    confirmed.toArray();
  };
};

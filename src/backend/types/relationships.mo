import Ownership "ownership";

module {
  /// Re-exported from the canonical ownership types so there is exactly ONE
  /// definition of each shared relationship type.
  public type PersonId = Ownership.PersonId;
  public type RelationshipType = Ownership.RelationshipType;
  public type RelationshipStatus = Ownership.RelationshipStatus;
  public type RelationshipRequestStatus = Ownership.RelationshipRequestStatus;
  public type RelationshipRequest = Ownership.RelationshipRequest;
  public type Relationship = Ownership.Relationship;
};

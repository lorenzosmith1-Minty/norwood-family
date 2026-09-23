import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-B2-B3: family-scope Relationship Proposals.
  //
  // Adds a `familyId` field to every `RelationshipProposal`. Every pre-existing
  // proposal migrates to familyId = "norwood", matching the default family that
  // owns all pre-tenancy data. Existing ids, person references, relationship
  // types, source links, statuses, submitters, and timestamps are preserved
  // as-is. No other stable collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type ReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
    #NeedsResearch;
  };

  type OldRelationshipProposal = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : Text;
    sourceId : Nat;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type NewRelationshipProposal = {
    familyId : FamilyId;
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : Text;
    sourceId : Nat;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    relationshipProposals : List.List<OldRelationshipProposal>;
  };

  type NewActor = {
    relationshipProposals : List.List<NewRelationshipProposal>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let relationshipProposals = List.empty<NewRelationshipProposal>();
    for (p in old.relationshipProposals.toArray().values()) {
      relationshipProposals.add({
        familyId = defaultFamilyId;
        id = p.id;
        fromPersonId = p.fromPersonId;
        toPersonId = p.toPersonId;
        relationshipType = p.relationshipType;
        sourceId = p.sourceId;
        status = p.status;
        submittedBy = p.submittedBy;
        submittedAt = p.submittedAt;
        reviewedBy = p.reviewedBy;
        reviewedAt = p.reviewedAt;
      });
    };
    { relationshipProposals };
  };
};

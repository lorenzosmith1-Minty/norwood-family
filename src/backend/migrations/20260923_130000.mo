import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-B2-B2: family-scope New Person Candidates.
  //
  // Adds a `familyId` field to every `NewPersonCandidate`. Every pre-existing
  // candidate migrates to familyId = "norwood", matching the default family that
  // owns all pre-tenancy data. Existing ids, names, details, source links,
  // statuses, submitters, and timestamps are preserved as-is. No other stable
  // collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type ReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
    #NeedsResearch;
  };

  type OldNewPersonCandidate = {
    id : Nat;
    name : Text;
    details : Text;
    sourceId : Nat;
    status : ReviewStatus;
    submittedBy : Principal;
    submittedAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type NewNewPersonCandidate = {
    familyId : FamilyId;
    id : Nat;
    name : Text;
    details : Text;
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
    newPersonCandidates : List.List<OldNewPersonCandidate>;
  };

  type NewActor = {
    newPersonCandidates : List.List<NewNewPersonCandidate>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let newPersonCandidates = List.empty<NewNewPersonCandidate>();
    for (c in old.newPersonCandidates.toArray().values()) {
      newPersonCandidates.add({
        familyId = defaultFamilyId;
        id = c.id;
        name = c.name;
        details = c.details;
        sourceId = c.sourceId;
        status = c.status;
        submittedBy = c.submittedBy;
        submittedAt = c.submittedAt;
        reviewedBy = c.reviewedBy;
        reviewedAt = c.reviewedAt;
      });
    };
    { newPersonCandidates };
  };
};

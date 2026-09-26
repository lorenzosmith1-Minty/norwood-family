import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-D4-A: family-scope Family Mysteries and Mystery Contributions.
  //
  // Adds a `familyId` field to every `Mystery` and every `MysteryContribution`.
  // Every pre-existing record migrates to familyId = "norwood", matching the
  // default family that owns all pre-tenancy data. Existing ids, titles,
  // descriptions, related-member references, branch, known facts, possibilities,
  // source/archive references, status, contributor, timestamps, resolution, and
  // contribution review fields are preserved as-is. No reset, no reseed, and no
  // duplicate entries: each list is rebuilt exactly once from the old list, so a
  // repeated upgrade is idempotent. No other stable collection changes shape —
  // stories carry through unchanged.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldMystery = {
    id : Nat;
    title : Text;
    description : Text;
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    knownFacts : [Text];
    possibilities : [Text];
    relatedSourceIds : [Nat];
    relatedArchiveItemIds : [Nat];
    status : { #Open; #Researching; #PartiallyResolved; #Resolved };
    contributor : Principal;
    createdAt : Int;
    updatedAt : Int;
    resolution : ?{
      summary : Text;
      supportingEvidence : [Text];
      resolvedAt : Int;
      resolvedBy : Principal;
    };
  };

  type NewMystery = {
    familyId : FamilyId;
    id : Nat;
    title : Text;
    description : Text;
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    knownFacts : [Text];
    possibilities : [Text];
    relatedSourceIds : [Nat];
    relatedArchiveItemIds : [Nat];
    status : { #Open; #Researching; #PartiallyResolved; #Resolved };
    contributor : Principal;
    createdAt : Int;
    updatedAt : Int;
    resolution : ?{
      summary : Text;
      supportingEvidence : [Text];
      resolvedAt : Int;
      resolvedBy : Principal;
    };
  };

  type OldMysteryContribution = {
    id : Nat;
    mysteryId : Nat;
    contributionType : { #Note; #Memory; #Lead; #Source };
    text : Text;
    contributor : Principal;
    status : { #Pending; #Approved; #Rejected };
    createdAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  type NewMysteryContribution = {
    familyId : FamilyId;
    id : Nat;
    mysteryId : Nat;
    contributionType : { #Note; #Memory; #Lead; #Source };
    text : Text;
    contributor : Principal;
    status : { #Pending; #Approved; #Rejected };
    createdAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  // Subset form: only the collections whose element type changed are listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    mysteries : List.List<OldMystery>;
    mysteryContributions : List.List<OldMysteryContribution>;
  };

  type NewActor = {
    mysteries : List.List<NewMystery>;
    mysteryContributions : List.List<NewMysteryContribution>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let mysteries = List.empty<NewMystery>();
    for (m in old.mysteries.toArray().values()) {
      mysteries.add({
        familyId = defaultFamilyId;
        id = m.id;
        title = m.title;
        description = m.description;
        relatedMemberIds = m.relatedMemberIds;
        relatedBranchId = m.relatedBranchId;
        knownFacts = m.knownFacts;
        possibilities = m.possibilities;
        relatedSourceIds = m.relatedSourceIds;
        relatedArchiveItemIds = m.relatedArchiveItemIds;
        status = m.status;
        contributor = m.contributor;
        createdAt = m.createdAt;
        updatedAt = m.updatedAt;
        resolution = m.resolution;
      });
    };

    let mysteryContributions = List.empty<NewMysteryContribution>();
    for (c in old.mysteryContributions.toArray().values()) {
      mysteryContributions.add({
        familyId = defaultFamilyId;
        id = c.id;
        mysteryId = c.mysteryId;
        contributionType = c.contributionType;
        text = c.text;
        contributor = c.contributor;
        status = c.status;
        createdAt = c.createdAt;
        reviewedBy = c.reviewedBy;
        reviewedAt = c.reviewedAt;
      });
    };

    { mysteries; mysteryContributions };
  };
};

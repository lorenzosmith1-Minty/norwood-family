import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1B: family-scope successor designations.
  //
  // Adds a `familyId` field to every `SuccessorDesignation`. Every pre-existing
  // designation migrates to familyId = "norwood", matching the default family
  // that owns all pre-tenancy data. Existing personId, priority, assignedBy,
  // assignedAt, and status are preserved as-is. No reset, no reseed, and no
  // duplicate entries: the list is rebuilt exactly once from the old list, so a
  // repeated upgrade is idempotent. No other stable collection changes shape —
  // every other collection carries through unchanged.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldSuccessorDesignation = {
    personId : Text;
    priority : Nat;
    assignedBy : Principal;
    assignedAt : Int;
    status : {
      #Designated;
      #Activated;
      #Removed;
    };
  };

  type NewSuccessorDesignation = {
    familyId : FamilyId;
    personId : Text;
    priority : Nat;
    assignedBy : Principal;
    assignedAt : Int;
    status : {
      #Designated;
      #Activated;
      #Removed;
    };
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    successors : List.List<OldSuccessorDesignation>;
  };

  type NewActor = {
    successors : List.List<NewSuccessorDesignation>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let successors = List.empty<NewSuccessorDesignation>();
    for (s in old.successors.toArray().values()) {
      successors.add({
        familyId = defaultFamilyId;
        personId = s.personId;
        priority = s.priority;
        assignedBy = s.assignedBy;
        assignedAt = s.assignedAt;
        status = s.status;
      });
    };

    { successors };
  };
};

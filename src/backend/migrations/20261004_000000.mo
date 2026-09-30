import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1B-2: founding-Steward decision state.
  //
  // Introduces the family-scoped onboarding progress map, the persisted
  // nomination list, and the nomination-id counter. These track onboarding
  // PROGRESS ONLY; `StewardRecord` remains the single source of Steward
  // authority.
  //
  // Also adds the `founding : Bool` role-context flag to every `StewardRecord`.
  // It marks a record created by the founding-Steward onboarding flow; it never
  // changes authority. Every pre-existing record migrates to `founding = false`,
  // preserving familyId, stewardAccountId, roleStatus, successorPriority,
  // assignedBy, and assignedAt exactly as-is. The list is rebuilt exactly once
  // from the old list, so a repeated upgrade is idempotent.
  //
  // The new collections start empty. This migration is a no-op for existing
  // data: the default Norwood family is never initialized into the onboarding
  // state, and its existing StewardRecords, memberships, profiles, and claims
  // are not read, reseeded, migrated, reset, or renamed. Every pre-existing
  // stable collection carries through unchanged.
  // ---------------------------------------------------------------------------

  // Subset form: only the new stable fields and the changed `stewards` element
  // type are declared; every other pre-existing stable collection carries
  // through unchanged.
  type OldActor = {
    stewards : List.List<OldStewardRecord>;
  };

  type FoundingStewardState = {
    #Undecided;
    #FounderAccepted;
    #NominationPending;
    #Transferred;
  };

  type FoundingStewardNominationStatus = {
    #Pending;
    #Accepted;
    #Declined;
    #Cancelled;
  };

  type FoundingStewardNomination = {
    id : Nat;
    familyId : Text;
    founderAccountId : Principal;
    nomineePersonId : Text;
    nomineeAccountId : ?Principal;
    nomineeEmail : ?Text;
    status : FoundingStewardNominationStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  type OldStewardRecord = {
    familyId : Text;
    stewardAccountId : Principal;
    roleStatus : {
      #Active;
      #Removed;
    };
    successorPriority : ?Nat;
    assignedBy : Principal;
    assignedAt : Int;
  };

  type NewStewardRecord = {
    familyId : Text;
    stewardAccountId : Principal;
    roleStatus : {
      #Active;
      #Removed;
    };
    successorPriority : ?Nat;
    assignedBy : Principal;
    assignedAt : Int;
    founding : Bool;
  };

  type NewActor = {
    foundingStewardStates : Map.Map<Text, FoundingStewardState>;
    foundingStewardNominations : List.List<FoundingStewardNomination>;
    foundingStewardState : { var nextNominationId : Nat };
    stewards : List.List<NewStewardRecord>;
  };

  public func migration(old : OldActor) : NewActor {
    let stewards = List.empty<NewStewardRecord>();
    for (s in old.stewards.toArray().values()) {
      stewards.add({
        familyId = s.familyId;
        stewardAccountId = s.stewardAccountId;
        roleStatus = s.roleStatus;
        successorPriority = s.successorPriority;
        assignedBy = s.assignedBy;
        assignedAt = s.assignedAt;
        founding = false;
      });
    };

    {
      foundingStewardStates = Map.empty();
      foundingStewardNominations = List.empty();
      foundingStewardState = { var nextNominationId = 0 };
      stewards;
    };
  };
};

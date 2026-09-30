import Map "mo:core/Map";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1B-1: create-family transaction foundation.
  //
  // Introduces the `familyCreationIdempotency` stable map, which records the
  // family id created for a given (caller, client-supplied idempotency key)
  // pair. It is the retry/double-submit guard for `createFamilyWithFounder`:
  // a repeated request carrying the same key returns the records created by the
  // first attempt instead of creating a duplicate family.
  //
  // The map starts empty. This migration is a no-op for existing data: the
  // default Norwood family, its memberships, profiles, claims, and stewards are
  // not read, reseeded, migrated, reset, or renamed. Every pre-existing stable
  // collection carries through unchanged.
  // ---------------------------------------------------------------------------

  // Subset form: only the new stable fields are declared; every other
  // pre-existing stable collection carries through unchanged.
  type OldActor = {};

  type NewActor = {
    familyCreationIdempotency : Map.Map<Text, Text>;
    familyCreationState : { var nextFamilyNonce : Nat };
  };

  public func migration(_old : OldActor) : NewActor {
    {
      familyCreationIdempotency = Map.empty();
      familyCreationState = { var nextFamilyNonce = 0 };
    };
  };
};

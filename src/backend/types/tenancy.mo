import FamilyTypes "family";

/// Tenancy 1C-A family-scope types.
///
/// Re-exports the Tenancy 1A family model so profile / claim / relationship
/// code has a single family-scope vocabulary. `FamilyPersonKey` is the
/// family-qualified storage key form for person-keyed collections; a bare
/// `personId` is never assumed globally unique.
module {
  /// Identifier of a family in the multi-family tenancy model.
  public type FamilyId = FamilyTypes.FamilyId;

  /// The family-qualified storage key for a person: `familyId + "::" +
  /// personId`. Two families may safely hold the same `personId` text.
  public type FamilyPersonKey = Text;

  /// Builds the family-qualified storage key for a person id. Re-exports the
  /// canonical Tenancy 1A helper so there is exactly one key format.
  public func familyPersonKey(familyId : FamilyId, personId : Text) : FamilyPersonKey {
    FamilyTypes.familyPersonKey(familyId, personId);
  };
};

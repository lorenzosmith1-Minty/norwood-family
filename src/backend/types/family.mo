import Principal "mo:core/Principal";

module {
  /// Identifier of a family in the multi-family tenancy model. The single
  /// existing Norwood family uses the id `"norwood"`.
  public type FamilyId = Text;

  /// Lifecycle of a family. Archived families are retained but are not part of
  /// normal family browsing.
  public type FamilyStatus = {
    #active;
    #archived;
  };

  /// A family record. `createdBy` is the account that created the family;
  /// `createdAt` is the creation time in nanoseconds.
  public type Family = {
    id : FamilyId;
    displayName : Text;
    createdAt : Int;
    createdBy : Principal;
    status : FamilyStatus;
  };

  /// The id of the single default family that owns all pre-tenancy data.
  public let DEFAULT_FAMILY_ID : FamilyId = "norwood";

  /// The display name of the single default family.
  public let DEFAULT_FAMILY_DISPLAY_NAME : Text = "Norwood";

  /// Builds the family-qualified storage key for a person id:
  /// `familyId + "::" + personId`. This is the migration-safe key form for
  /// family-scoped person storage; Tenancy 1B/1C will adopt it for the
  /// person-keyed collections that are still keyed by bare `personId`.
  public func familyPersonKey(familyId : FamilyId, personId : Text) : Text {
    familyId # "::" # personId;
  };
};

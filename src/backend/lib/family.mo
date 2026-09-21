import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Types "../types/family";

module {
  /// Returns the family with the given id, or `null` when it is not tracked.
  /// This is a read-only lookup — it never creates a family.
  public func getFamily(
    families : Map.Map<Types.FamilyId, Types.Family>,
    familyId : Types.FamilyId,
  ) : ?Types.Family {
    families.get(familyId);
  };

  /// Ensures the single default family exists, creating it only when missing.
  /// Repeated calls are idempotent: an existing default family is never
  /// overwritten, duplicated, or reset. Returns `true` when the family was
  /// created by this call.
  public func ensureDefaultFamily(
    families : Map.Map<Types.FamilyId, Types.Family>,
    createdBy : Principal.Principal,
  ) : Bool {
    switch (families.get(Types.DEFAULT_FAMILY_ID)) {
      case (?_) { false };
      case null {
        families.add(Types.DEFAULT_FAMILY_ID, {
          id = Types.DEFAULT_FAMILY_ID;
          displayName = Types.DEFAULT_FAMILY_DISPLAY_NAME;
          createdAt = Time.now();
          createdBy;
          status = #active;
        });
        true;
      };
    };
  };

  /// Flattens every family into OQL-exposable rows.
  public func familyRows(
    families : Map.Map<Types.FamilyId, Types.Family>,
  ) : [Types.Family] {
    let rows = List.empty<Types.Family>();
    for ((_, family) in families.entries()) {
      rows.add(family);
    };
    rows.toArray();
  };
};

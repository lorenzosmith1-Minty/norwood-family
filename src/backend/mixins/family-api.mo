import Map "mo:core/Map";
import Types "../types/family";
import FamilyLib "../lib/family";

mixin (families : Map.Map<Types.FamilyId, Types.Family>) {
  /// Returns the family with the given id, or `null` when it is not tracked.
  /// Read-only: this never creates a family.
  public query func getFamily(familyId : Types.FamilyId) : async ?Types.Family {
    FamilyLib.getFamily(families, familyId);
  };
};

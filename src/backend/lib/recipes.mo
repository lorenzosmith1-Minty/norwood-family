import Iter "mo:core/Iter";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Types "../types/recipes";

module {
  /// Adds a newly submitted recipe in pending state. The caller is recorded as
  /// the contributor. Returns the stored recipe.
  public func submit(items : List.List<Types.Recipe>, recipe : Types.Recipe) : Types.Recipe {
    items.add(recipe);
    recipe;
  };

  /// Lists all recipes currently in pending state (steward only).
  public func listPending(items : List.List<Types.Recipe>) : [Types.Recipe] {
    items.toArray().filter(func r = r.status == #Pending);
  };

  /// Whether a recipe is visible to the given caller. Public and family-only
  /// recipes are visible to any signed-in family member; private recipes are
  /// visible only to their contributor or a Family Steward.
  func isVisible(recipe : Types.Recipe, caller : Principal, isAdmin : Bool) : Bool {
    switch (recipe.privacyLevel) {
      case (#Private) { isAdmin or recipe.contributorAccountId == caller };
      case (_) { true };
    };
  };

  /// Lists all recipes in approved state visible to the given caller. Private
  /// recipes are only visible to their contributor or a Family Steward.
  public func listApproved(
    items : List.List<Types.Recipe>,
    caller : Principal,
    isAdmin : Bool,
  ) : [Types.Recipe] {
    items.toArray().filter(
      func r = r.status == #Approved and isVisible(r, caller, isAdmin)
    );
  };

  /// Approves a pending recipe, moving it to approved state. Returns the updated
  /// recipe, or `null` when the recipe does not exist or is not pending.
  public func approve(items : List.List<Types.Recipe>, id : Types.RecipeId) : ?Types.Recipe {
    switch (items.find(func r = r.recipeId == id and r.status == #Pending)) {
      case (?r) {
        let updated : Types.Recipe = { r with status = #Approved; updatedAt = Time.now() };
        let snapshot = items.toArray();
        items.clear();
        for (recipe in snapshot.values()) {
          if (recipe.recipeId == id) { items.add(updated) } else { items.add(recipe) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Rejects a pending recipe, moving it to rejected state. Returns the updated
  /// recipe, or `null` when the recipe does not exist or is not pending.
  public func reject(items : List.List<Types.Recipe>, id : Types.RecipeId) : ?Types.Recipe {
    switch (items.find(func r = r.recipeId == id and r.status == #Pending)) {
      case (?r) {
        let updated : Types.Recipe = { r with status = #Rejected; updatedAt = Time.now() };
        let snapshot = items.toArray();
        items.clear();
        for (recipe in snapshot.values()) {
          if (recipe.recipeId == id) { items.add(updated) } else { items.add(recipe) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Returns a single recipe by id, or `null` when it does not exist.
  public func get(items : List.List<Types.Recipe>, id : Types.RecipeId) : ?Types.Recipe {
    items.find(func r = r.recipeId == id);
  };

  /// Returns a single recipe by id when it is visible to the given caller, or
  /// `null` when it does not exist or is not visible. Private recipes are only
  /// visible to their contributor or a Family Steward; non-approved recipes are
  /// only visible to a Family Steward.
  public func getVisible(
    items : List.List<Types.Recipe>,
    id : Types.RecipeId,
    caller : Principal,
    isAdmin : Bool,
  ) : ?Types.Recipe {
    switch (items.find(func r = r.recipeId == id)) {
      case (?r) {
        if (isVisible(r, caller, isAdmin) and (isAdmin or r.status == #Approved)) {
          ?r;
        } else {
          null;
        };
      };
      case null { null };
    };
  };

  /// Lists recipes linked to a person, whether as the originating member or a
  /// related member. Returns only approved recipes visible to the given caller;
  /// private recipes are only visible to their contributor or a Family Steward.
  public func listForPerson(
    items : List.List<Types.Recipe>,
    personId : Text,
    caller : Principal,
    isAdmin : Bool,
  ) : [Types.Recipe] {
    items.toArray().filter(
      func r = r.status == #Approved
        and (r.originatingPersonId == personId or r.relatedPersonIds.contains(personId))
        and isVisible(r, caller, isAdmin)
    );
  };

  /// Adds a canonical recipe directly (steward only), already approved. Returns
  /// the stored recipe.
  public func addCanonical(items : List.List<Types.Recipe>, recipe : Types.Recipe) : Types.Recipe {
    items.add(recipe);
    recipe;
  };

  /// Flattens all recipes into OQL-exposable rows. Enumerated variants render as
  /// their tag text; optional fields render as empty text when absent; array
  /// fields render as counts (OQL has no array value type).
  public func recipeRows(items : List.List<Types.Recipe>) : Iter.Iter<Types.RecipeRow> {
    let rows = List.empty<Types.RecipeRow>();
    for (recipe in items.toArray().values()) {
      rows.add({
        recipeId = recipe.recipeId;
        title = recipe.title;
        shortDescription = recipe.shortDescription;
        originatingPersonId = recipe.originatingPersonId;
        relatedPersonCount = recipe.relatedPersonIds.size();
        contributorAccountId = recipe.contributorAccountId.toText();
        era = recipe.era ?? "";
        year = recipe.year;
        location = recipe.location ?? "";
        familyBranch = recipe.familyBranch ?? "";
        ingredientCount = recipe.ingredients.size();
        tagCount = recipe.tags.size();
        privacyLevel = switch (recipe.privacyLevel) {
          case (#Public) "Public";
          case (#FamilyOnly) "FamilyOnly";
          case (#Private) "Private";
        };
        evidenceStatus = switch (recipe.evidenceStatus) {
          case (#Documented) "Documented";
          case (#FamilyHistory) "FamilyHistory";
          case (#PersonalMemory) "PersonalMemory";
          case (#Unresolved) "Unresolved";
        };
        linkedMediaCount = recipe.linkedMediaIds.size();
        status = switch (recipe.status) {
          case (#Pending) "Pending";
          case (#Approved) "Approved";
          case (#Rejected) "Rejected";
          case (#Archived) "Archived";
        };
        createdAt = recipe.createdAt;
        updatedAt = recipe.updatedAt;
      });
    };
    rows.values();
  };
};

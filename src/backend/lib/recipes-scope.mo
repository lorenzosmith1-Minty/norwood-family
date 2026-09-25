import Iter "mo:core/Iter";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Types "../types/recipes";
import FamilyTypes "../types/family";

/// Tenancy 1C-D1 canonical family-scoped Family Recipes domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `Recipe` whose `familyId` equals it. A `recipeId` alone is never a tenant
/// boundary: a lookup that finds a recipe belonging to another family behaves
/// exactly like a lookup that found nothing. The API mixin owns authorization
/// and state wiring; this module is pure over the injected collections.
module {
  /// Whether a recipe belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped recipe read and action funnels through.
  public func belongsToFamily(recipe : Types.Recipe, familyId : FamilyTypes.FamilyId) : Bool {
    recipe.familyId == familyId;
  };

  /// Lists every recipe in `familyId`, newest first. Only recipes whose
  /// `familyId` equals `familyId` are considered, so Family A recipes never
  /// appear in a Family B call.
  public func listRecipesForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Recipe] {
    recipes.toArray()
      .filter(func r = belongsToFamily(r, familyId))
      .sort(func(a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Lists every recipe in `familyId` currently in pending state (Steward only).
  /// Only recipes whose `familyId` equals `familyId` are considered.
  public func listPendingForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Recipe] {
    recipes.toArray().filter(func r = belongsToFamily(r, familyId) and r.status == #Pending);
  };

  /// Lists every approved recipe in `familyId` visible to the given caller.
  /// Private recipes are only visible to their contributor or a Family Steward.
  /// Only recipes whose `familyId` equals `familyId` are considered.
  public func listApprovedForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : [Types.Recipe] {
    recipes.toArray().filter(func r =
      belongsToFamily(r, familyId) and r.status == #Approved and isVisible(r, caller, isAdmin, isApprovedFamilyMember)
    );
  };

  /// Returns the recipe with `recipeId` when it belongs to `familyId`, or `null`
  /// otherwise. A recipe that exists under another family is never returned, so
  /// a `recipeId` alone cannot cross the family boundary.
  public func getForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
  ) : ?Types.Recipe {
    recipes.find(func r = r.recipeId == recipeId and belongsToFamily(r, familyId));
  };

  /// Returns the recipe with `recipeId` when it belongs to `familyId` and is
  /// visible to the given caller, or `null` otherwise. Private recipes are only
  /// visible to their contributor or a Family Steward; non-approved recipes are
  /// only visible to a Family Steward. A recipe that exists under another family
  /// is never returned.
  public func getVisibleForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : ?Types.Recipe {
    switch (recipes.find(func r = r.recipeId == recipeId and belongsToFamily(r, familyId))) {
      case null { null };
      case (?recipe) {
        if (recipe.status != #Approved and not isAdmin) {
          return null;
        };
        if (not isVisible(recipe, caller, isAdmin, isApprovedFamilyMember)) {
          return null;
        };
        ?recipe;
      };
    };
  };

  /// Lists approved recipes in `familyId` linked to a person, whether as the
  /// originating member or a related member. Returns only approved recipes
  /// visible to the given caller. Only recipes whose `familyId` equals
  /// `familyId` are considered.
  public func listForPersonForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    personId : Text,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : [Types.Recipe] {
    recipes.toArray().filter(func r =
      belongsToFamily(r, familyId) and
      r.status == #Approved and
      (r.originatingPersonId == personId or r.relatedPersonIds.any(func id = id == personId)) and
      isVisible(r, caller, isAdmin, isApprovedFamilyMember)
    );
  };

  /// Appends a newly submitted recipe. The recipe's `familyId` is set by the
  /// caller; this module never rewrites it.
  public func submitForFamily(
    recipes : List.List<Types.Recipe>,
    recipe : Types.Recipe,
  ) : Types.Recipe {
    recipes.add(recipe);
    recipe;
  };

  /// Appends a canonical recipe directly (Steward only), already approved. The
  /// recipe's `familyId` is set by the caller; this module never rewrites it.
  public func addCanonicalForFamily(
    recipes : List.List<Types.Recipe>,
    recipe : Types.Recipe,
  ) : Types.Recipe {
    recipes.add(recipe);
    recipe;
  };

  /// Approves the pending recipe with `recipeId` in `familyId`, moving it to
  /// approved state. Returns the updated recipe, or `null` when no pending
  /// recipe with that id belongs to `familyId`. A recipe in another family is
  /// never touched.
  public func approveForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
  ) : ?Types.Recipe {
    transitionStatusForFamily(recipes, familyId, recipeId, #Approved);
  };

  /// Rejects the pending recipe with `recipeId` in `familyId`, moving it to
  /// rejected state. Returns the updated recipe, or `null` when no pending
  /// recipe with that id belongs to `familyId`. A recipe in another family is
  /// never touched.
  public func rejectForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
  ) : ?Types.Recipe {
    transitionStatusForFamily(recipes, familyId, recipeId, #Rejected);
  };

  /// Flattens every recipe into OQL-exposable rows, including the tenant
  /// boundary `familyId`. Enumerated variants render as their tag text; optional
  /// fields render as empty text when absent; array fields render as counts.
  public func recipeRows(recipes : List.List<Types.Recipe>) : Iter.Iter<Types.RecipeRow> {
    recipes.toArray().map(
      func r : Types.RecipeRow = {
        familyId = r.familyId;
        recipeId = r.recipeId;
        title = r.title;
        shortDescription = r.shortDescription;
        originatingPersonId = r.originatingPersonId;
        relatedPersonCount = r.relatedPersonIds.size();
        contributorAccountId = r.contributorAccountId.toText();
        era = r.era ?? "";
        year = r.year;
        location = r.location ?? "";
        familyBranch = r.familyBranch ?? "";
        ingredientCount = r.ingredients.size();
        tagCount = r.tags.size();
        privacyLevel = switch (r.privacyLevel) {
          case (#Public) "Public";
          case (#FamilyOnly) "FamilyOnly";
          case (#Private) "Private";
        };
        evidenceStatus = switch (r.evidenceStatus) {
          case (#Documented) "Documented";
          case (#FamilyHistory) "FamilyHistory";
          case (#PersonalMemory) "PersonalMemory";
          case (#Unresolved) "Unresolved";
        };
        linkedMediaCount = r.linkedMediaIds.size();
        status = switch (r.status) {
          case (#Pending) "Pending";
          case (#Approved) "Approved";
          case (#Rejected) "Rejected";
          case (#Archived) "Archived";
        };
        createdAt = r.createdAt;
        updatedAt = r.updatedAt;
      }
    ).values();
  };

  // --- helpers ---

  /// Whether an approved recipe is visible to the given caller. Public recipes
  /// are visible to everyone; FamilyOnly recipes require approved family
  /// membership or admin; Private recipes are visible only to their contributor
  /// or an admin. Preserves the pre-tenancy recipe privacy semantics.
  func isVisible(recipe : Types.Recipe, caller : Principal, isAdmin : Bool, isApprovedFamilyMember : Bool) : Bool {
    switch (recipe.privacyLevel) {
      case (#Public) true;
      case (#FamilyOnly) isAdmin or isApprovedFamilyMember;
      case (#Private) isAdmin or recipe.contributorAccountId == caller;
    };
  };

  /// Transitions the pending recipe with `recipeId` in `familyId` to `status`,
  /// preserving every other field and list order. Returns the updated recipe, or
  /// `null` when no pending recipe with that id belongs to `familyId`.
  func transitionStatusForFamily(
    recipes : List.List<Types.Recipe>,
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
    status : Types.RecipeStatus,
  ) : ?Types.Recipe {
    switch (recipes.find(func r = r.recipeId == recipeId and belongsToFamily(r, familyId) and r.status == #Pending)) {
      case null { null };
      case (?recipe) {
        // Restore the pre-tenancy approve/reject behavior: the transition
        // advances `updatedAt` alongside `status`.
        let updated : Types.Recipe = { recipe with status; updatedAt = Time.now() };
        let snapshot = recipes.toArray();
        recipes.clear();
        for (r in snapshot.values()) {
          if (r.recipeId == recipeId and belongsToFamily(r, familyId)) {
            recipes.add(updated);
          } else {
            recipes.add(r);
          };
        };
        ?updated;
      };
    };
  };
};

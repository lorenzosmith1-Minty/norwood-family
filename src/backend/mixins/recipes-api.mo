import AccessControl "mo:caffeineai-authorization/access-control";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/recipes";
import OwnershipTypes "../types/ownership";
import RecipesLib "../lib/recipes";

mixin (
  accessControlState : AccessControl.AccessControlState,
  recipes : List.List<Types.Recipe>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
) {
  /// Computes the next recipe id: one greater than the largest existing id, or
  /// `0` when there are no recipes.
  func nextRecipeId() : Types.RecipeId {
    var maxId = 0;
    for (recipe in recipes.toArray().values()) {
      if (recipe.recipeId >= maxId) { maxId := recipe.recipeId + 1 };
    };
    maxId;
  };

  /// Submits a new recipe. Requires sign-in; the signed-in caller is recorded as
  /// the contributor. The recipe is stored in pending state and waits for a
  /// Family Steward to approve it before becoming visible in Family Recipes.
  public shared ({ caller }) func submitRecipe(
    title : Text,
    shortDescription : Text,
    originatingPersonId : Text,
    relatedPersonIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    familyBranch : ?Text,
    ingredients : [Text],
    instructions : Text,
    familyStory : ?Text,
    tags : [Text],
    privacyLevel : Types.PrivacyLevel,
    evidenceStatus : Types.EvidenceStatus,
    linkedMediaIds : [Nat],
  ) : async Types.Recipe {
    if (caller.isAnonymous()) {
      Runtime.trap("Sign-in required to submit a recipe");
    };
    if (profiles.get(originatingPersonId) == null) {
      Runtime.trap("Originating family member not found");
    };
    let recipe : Types.Recipe = {
      recipeId = nextRecipeId();
      title;
      shortDescription;
      originatingPersonId;
      relatedPersonIds;
      contributorAccountId = caller;
      era;
      year;
      location;
      familyBranch;
      ingredients;
      instructions;
      familyStory;
      tags;
      privacyLevel;
      evidenceStatus;
      linkedMediaIds;
      status = #Pending;
      createdAt = Time.now();
      updatedAt = Time.now();
      ocrText = null;
      transcript = null;
      extractedIngredients = null;
      aiDerivedText = null;
    };
    RecipesLib.submit(recipes, recipe);
  };

  /// Lists all recipes in pending state (steward only).
  public query ({ caller }) func listPendingRecipes() : async [Types.Recipe] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list pending recipes");
    };
    RecipesLib.listPending(recipes);
  };

  /// Approves a pending recipe (steward only). Returns the updated recipe, or
  /// `null` when the recipe does not exist or is not pending.
  public shared ({ caller }) func approveRecipe(id : Types.RecipeId) : async ?Types.Recipe {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve recipes");
    };
    RecipesLib.approve(recipes, id);
  };

  /// Rejects a pending recipe (steward only). Returns the updated recipe, or
  /// `null` when the recipe does not exist or is not pending.
  public shared ({ caller }) func rejectRecipe(id : Types.RecipeId) : async ?Types.Recipe {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject recipes");
    };
    RecipesLib.reject(recipes, id);
  };

  /// Lists all approved recipes visible to the caller. Private recipes are only
  /// visible to their contributor or a Family Steward.
  public query ({ caller }) func listApprovedRecipes() : async [Types.Recipe] {
    RecipesLib.listApproved(recipes, caller, AccessControl.isAdmin(accessControlState, caller));
  };

  /// Returns a single recipe by id, or `null` when it does not exist or is not
  /// visible to the caller. Private recipes are only visible to their
  /// contributor or a Family Steward; non-approved recipes are only visible to
  /// a Family Steward.
  public query ({ caller }) func getRecipe(id : Types.RecipeId) : async ?Types.Recipe {
    RecipesLib.getVisible(recipes, id, caller, AccessControl.isAdmin(accessControlState, caller));
  };

  /// Lists recipes linked to a person, whether as the originating member or a
  /// related member. Returns only approved recipes visible to the caller;
  /// private recipes are only visible to their contributor or a Family Steward.
  public query ({ caller }) func listRecipesForPerson(personId : Text) : async [Types.Recipe] {
    RecipesLib.listForPerson(recipes, personId, caller, AccessControl.isAdmin(accessControlState, caller));
  };

  /// Publishes a canonical recipe directly (steward only), already approved.
  /// This is the steward-only add flow; it does not create a second Recipe on
  /// approval.
  public shared ({ caller }) func publishRecipe(
    title : Text,
    shortDescription : Text,
    originatingPersonId : Text,
    relatedPersonIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    familyBranch : ?Text,
    ingredients : [Text],
    instructions : Text,
    familyStory : ?Text,
    tags : [Text],
    privacyLevel : Types.PrivacyLevel,
    evidenceStatus : Types.EvidenceStatus,
    linkedMediaIds : [Nat],
  ) : async Types.Recipe {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can publish recipes");
    };
    if (profiles.get(originatingPersonId) == null) {
      Runtime.trap("Originating family member not found");
    };
    let recipe : Types.Recipe = {
      recipeId = nextRecipeId();
      title;
      shortDescription;
      originatingPersonId;
      relatedPersonIds;
      contributorAccountId = caller;
      era;
      year;
      location;
      familyBranch;
      ingredients;
      instructions;
      familyStory;
      tags;
      privacyLevel;
      evidenceStatus;
      linkedMediaIds;
      status = #Approved;
      createdAt = Time.now();
      updatedAt = Time.now();
      ocrText = null;
      transcript = null;
      extractedIngredients = null;
      aiDerivedText = null;
    };
    RecipesLib.addCanonical(recipes, recipe);
  };
};

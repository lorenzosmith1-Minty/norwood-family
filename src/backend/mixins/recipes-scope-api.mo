import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/recipes";
import ArchiveTypes "../types/archive";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import RecipesScopeLib "../lib/recipes-scope";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import TenancyLib "../lib/tenancy";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-D1 canonical family-scoped Family Recipes public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Reads
/// gate on `FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily`;
/// Steward review (pending list, approve, reject, publish) gates on
/// `requireActiveStewardForFamily`. Every returned or mutated recipe must carry
/// `familyId == familyId`, and every related person and linked media id must
/// belong to the same family, so a `recipeId` alone never crosses a family
/// boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  recipes : List.List<Types.Recipe>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
) {
  // ---------------------------------------------------------------------------
  // Canonical family-scoped endpoints.
  // ---------------------------------------------------------------------------

  /// Lists every recipe in `familyId`, newest first. Approved members of
  /// `familyId` only. A recipe whose `familyId` differs is never returned, so
  /// Family A recipes never appear in a Family B call.
  public query ({ caller }) func listRecipesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Recipe] {
    requireRecipeMemberForFamily(caller, familyId);
    RecipesScopeLib.listRecipesForFamily(recipes, familyId);
  };

  /// Lists every recipe in `familyId` currently in pending state. Active Steward
  /// of `familyId` only. A recipe whose `familyId` differs is never returned.
  public query ({ caller }) func listPendingRecipesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Recipe] {
    requireRecipeStewardForFamily(caller, familyId);
    RecipesScopeLib.listPendingForFamily(recipes, familyId);
  };

  /// Lists every approved recipe in `familyId` visible to the caller. Approved
  /// members of `familyId` only. Private recipes are only visible to their
  /// contributor or a Family Steward. A recipe whose `familyId` differs is never
  /// returned.
  public query ({ caller }) func listApprovedRecipesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Recipe] {
    requireRecipeMemberForFamily(caller, familyId);
    RecipesScopeLib.listApprovedForFamily(recipes, familyId, caller, isRecipeSteward(caller, familyId), true);
  };

  /// Returns a single recipe by id when it belongs to `familyId` and is visible
  /// to the caller. Approved members of `familyId` only. A recipe that exists
  /// under another family is never returned, so a `recipeId` alone cannot cross
  /// the family boundary.
  public query ({ caller }) func getRecipeForFamily(
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
  ) : async ?Types.Recipe {
    requireRecipeMemberForFamily(caller, familyId);
    RecipesScopeLib.getVisibleForFamily(recipes, familyId, recipeId, caller, isRecipeSteward(caller, familyId), true);
  };

  /// Lists approved recipes in `familyId` linked to a person, whether as the
  /// originating member or a related member. Approved members of `familyId`
  /// only. A recipe whose `familyId` differs is never returned.
  public query ({ caller }) func listRecipesForPersonForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
  ) : async [Types.Recipe] {
    requireRecipeMemberForFamily(caller, familyId);
    RecipesScopeLib.listForPersonForFamily(recipes, familyId, personId, caller, isRecipeSteward(caller, familyId), true);
  };

  /// Submits a new recipe into `familyId`. Approved members or Stewards of
  /// `familyId` only. The new recipe's `familyId` is the requested `familyId`;
  /// the originating person and every related person must belong to `familyId`,
  /// and every linked Archive media id must belong to `familyId`. The recipe is
  /// stored in pending state and waits for a Steward of `familyId` to approve
  /// it.
  public shared ({ caller }) func submitRecipeForFamily(
    familyId : FamilyTypes.FamilyId,
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
    submitRecipeForFamilyInternal(familyId, title, shortDescription, originatingPersonId, relatedPersonIds, era, year, location, familyBranch, ingredients, instructions, familyStory, tags, privacyLevel, evidenceStatus, linkedMediaIds, caller);
  };

  /// Publishes a canonical recipe directly into `familyId` (Steward only),
  /// already approved. Active Steward of `familyId` only. The new recipe's
  /// `familyId` is the requested `familyId`; the originating person and every
  /// related person must belong to `familyId`, and every linked Archive media id
  /// must belong to `familyId`.
  public shared ({ caller }) func publishRecipeForFamily(
    familyId : FamilyTypes.FamilyId,
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
    publishRecipeForFamilyInternal(familyId, title, shortDescription, originatingPersonId, relatedPersonIds, era, year, location, familyBranch, ingredients, instructions, familyStory, tags, privacyLevel, evidenceStatus, linkedMediaIds, caller);
  };

  /// Approves a pending recipe in `familyId`. Active Steward of `familyId` only;
  /// a Steward of another family cannot approve the recipe. Returns the updated
  /// recipe, or `null` when no pending recipe with that id belongs to
  /// `familyId`. A recipe in another family is never touched.
  public shared ({ caller }) func approveRecipeForFamily(
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
  ) : async ?Types.Recipe {
    approveRecipeForFamilyInternal(familyId, recipeId, caller);
  };

  /// Rejects a pending recipe in `familyId`. Active Steward of `familyId` only;
  /// a Steward of another family cannot reject the recipe. Returns the updated
  /// recipe, or `null` when no pending recipe with that id belongs to
  /// `familyId`. A recipe in another family is never touched.
  public shared ({ caller }) func rejectRecipeForFamily(
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
  ) : async ?Types.Recipe {
    rejectRecipeForFamilyInternal(familyId, recipeId, caller);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `submitRecipeForFamily`.
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
    submitRecipeForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, shortDescription, originatingPersonId, relatedPersonIds, era, year, location, familyBranch, ingredients, instructions, familyStory, tags, privacyLevel, evidenceStatus, linkedMediaIds, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listPendingRecipesForFamily`.
  public query ({ caller }) func listPendingRecipes() : async [Types.Recipe] {
    requireRecipeStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    RecipesScopeLib.listPendingForFamily(recipes, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveRecipeForFamily`.
  public shared ({ caller }) func approveRecipe(recipeId : Types.RecipeId) : async ?Types.Recipe {
    approveRecipeForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, recipeId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectRecipeForFamily`.
  public shared ({ caller }) func rejectRecipe(recipeId : Types.RecipeId) : async ?Types.Recipe {
    rejectRecipeForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, recipeId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listApprovedRecipesForFamily`.
  public query ({ caller }) func listApprovedRecipes() : async [Types.Recipe] {
    requireRecipeMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    RecipesScopeLib.listApprovedForFamily(recipes, FamilyTypes.DEFAULT_FAMILY_ID, caller, isRecipeSteward(caller, FamilyTypes.DEFAULT_FAMILY_ID), true);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getRecipeForFamily`.
  public query ({ caller }) func getRecipe(recipeId : Types.RecipeId) : async ?Types.Recipe {
    requireRecipeMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    RecipesScopeLib.getVisibleForFamily(recipes, FamilyTypes.DEFAULT_FAMILY_ID, recipeId, caller, isRecipeSteward(caller, FamilyTypes.DEFAULT_FAMILY_ID), true);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listRecipesForPersonForFamily`.
  public query ({ caller }) func listRecipesForPerson(personId : Text) : async [Types.Recipe] {
    requireRecipeMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    RecipesScopeLib.listForPersonForFamily(recipes, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller, isRecipeSteward(caller, FamilyTypes.DEFAULT_FAMILY_ID), true);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `publishRecipeForFamily`.
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
    publishRecipeForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, shortDescription, originatingPersonId, relatedPersonIds, era, year, location, familyBranch, ingredients, instructions, familyStory, tags, privacyLevel, evidenceStatus, linkedMediaIds, caller);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Traps unless the caller is a signed-in approved member or Steward of
  /// `familyId`, using the canonical family-scoped membership helper.
  func requireRecipeMemberForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the canonical family-scoped Steward helper. A Steward of one family can
  /// never review another family's recipes.
  func requireRecipeStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Whether the caller is an active Steward of `familyId`. Used to widen recipe
  /// visibility for Stewards (pending/private recipes) without trapping.
  func isRecipeSteward(caller : Principal, familyId : FamilyTypes.FamilyId) : Bool {
    FamilyAuthorizationLib.isStewardForFamily(stewards, caller, familyId);
  };

  /// Traps unless every linked media id resolves to an Archive item in
  /// `familyId`. A media id from another family is never attached. Named
  /// `requireRecipeLinkedMediaInFamily` so it does not collide with the Board
  /// mixin's same-purpose helper when both mixins are included in `main.mo`.
  func requireRecipeLinkedMediaInFamily(mediaIds : [Nat], familyId : FamilyTypes.FamilyId) {
    for (mediaId in mediaIds.values()) {
      if (archiveItems.find(func it = it.id == mediaId and ArchiveLib.belongsToFamily(it, familyId)) == null) {
        Runtime.trap("Unauthorized: Linked media must belong to the same family");
      };
    };
  };

  /// Computes the next recipe id: one greater than the largest existing id, or
  /// `0` when there are no recipes.
  func nextRecipeId() : Types.RecipeId {
    var maxId = 0;
    for (recipe in recipes.toArray().values()) {
      if (recipe.recipeId >= maxId) { maxId := recipe.recipeId + 1 };
    };
    maxId;
  };

  /// Internal implementation of `submitRecipeForFamily` that takes the caller
  /// explicitly, so the membership gate always evaluates the real caller rather
  /// than the canister principal a shared-to-shared call would otherwise
  /// present. Validates the submission, enforces the family boundary on the
  /// originating person, every related person, and every linked media id, and
  /// stores the recipe in pending state.
  func submitRecipeForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
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
    caller : Principal,
  ) : Types.Recipe {
    requireRecipeMemberForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanShortDescription = InputValidation.requireText("shortDescription", shortDescription, InputValidation.MAX_SHORT_DESCRIPTION_CHARS);
    let cleanOriginating = InputValidation.requireText("originatingPersonId", originatingPersonId, InputValidation.MAX_LOCATION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedPersonIds);
    let cleanEra = InputValidation.requireOptionalText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanLocation = InputValidation.requireOptionalText("location", location, InputValidation.MAX_LOCATION_CHARS);
    let cleanFamilyBranch = InputValidation.requireOptionalText("familyBranch", familyBranch, InputValidation.MAX_LOCATION_CHARS);
    let cleanInstructions = InputValidation.requireText("instructions", instructions, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanFamilyStory = InputValidation.requireOptionalText("familyStory", familyStory, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanTags = InputValidation.requireTags(tags);
    InputValidation.requireArraySize("linkedMediaIds", linkedMediaIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    // The originating person must exist in the requested family. This restores
    // the pre-tenancy existence guard explicitly: `isPersonInFamily` accepts any
    // well-formed person id for the default Norwood family, so without this
    // check a Norwood caller could submit a recipe whose originating person does
    // not exist, where the pre-tenancy endpoint trapped.
    if (TenancyLib.getProfileForFamily(profiles, familyId, cleanOriginating) == null) {
      Runtime.trap("Originating family member not found");
    };
    // The originating person and every related person must belong to the
    // requested family: Family A may never reference Family B people.
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, [cleanOriginating].concat(cleanRelated), familyId);
    // Every linked media id must resolve to an Archive item in the same family.
    requireRecipeLinkedMediaInFamily(linkedMediaIds, familyId);
    let recipe : Types.Recipe = {
      familyId;
      recipeId = nextRecipeId();
      title = cleanTitle;
      shortDescription = cleanShortDescription;
      originatingPersonId = cleanOriginating;
      relatedPersonIds = cleanRelated;
      contributorAccountId = caller;
      era = cleanEra;
      year;
      location = cleanLocation;
      familyBranch = cleanFamilyBranch;
      ingredients;
      instructions = cleanInstructions;
      familyStory = cleanFamilyStory;
      tags = cleanTags;
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
    ignore (RecipesScopeLib.submitForFamily(recipes, recipe));
    recipe;
  };

  /// Internal implementation of `publishRecipeForFamily` that takes the caller
  /// explicitly, so the Steward gate always evaluates the real caller. Stores an
  /// already-approved canonical recipe in `familyId`.
  func publishRecipeForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
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
    caller : Principal,
  ) : Types.Recipe {
    requireRecipeStewardForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanShortDescription = InputValidation.requireText("shortDescription", shortDescription, InputValidation.MAX_SHORT_DESCRIPTION_CHARS);
    let cleanOriginating = InputValidation.requireText("originatingPersonId", originatingPersonId, InputValidation.MAX_LOCATION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedPersonIds);
    let cleanEra = InputValidation.requireOptionalText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanLocation = InputValidation.requireOptionalText("location", location, InputValidation.MAX_LOCATION_CHARS);
    let cleanFamilyBranch = InputValidation.requireOptionalText("familyBranch", familyBranch, InputValidation.MAX_LOCATION_CHARS);
    let cleanInstructions = InputValidation.requireText("instructions", instructions, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanFamilyStory = InputValidation.requireOptionalText("familyStory", familyStory, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanTags = InputValidation.requireTags(tags);
    InputValidation.requireArraySize("linkedMediaIds", linkedMediaIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    // The originating person must exist in the requested family. This restores
    // the pre-tenancy existence guard explicitly: `isPersonInFamily` accepts any
    // well-formed person id for the default Norwood family, so without this
    // check a Norwood caller could publish a recipe whose originating person
    // does not exist, where the pre-tenancy endpoint trapped.
    if (TenancyLib.getProfileForFamily(profiles, familyId, cleanOriginating) == null) {
      Runtime.trap("Originating family member not found");
    };
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, [cleanOriginating].concat(cleanRelated), familyId);
    requireRecipeLinkedMediaInFamily(linkedMediaIds, familyId);
    let recipe : Types.Recipe = {
      familyId;
      recipeId = nextRecipeId();
      title = cleanTitle;
      shortDescription = cleanShortDescription;
      originatingPersonId = cleanOriginating;
      relatedPersonIds = cleanRelated;
      contributorAccountId = caller;
      era = cleanEra;
      year;
      location = cleanLocation;
      familyBranch = cleanFamilyBranch;
      ingredients;
      instructions = cleanInstructions;
      familyStory = cleanFamilyStory;
      tags = cleanTags;
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
    ignore (RecipesScopeLib.addCanonicalForFamily(recipes, recipe));
    recipe;
  };

  /// Internal implementation of `approveRecipeForFamily` that takes the caller
  /// explicitly, so the Steward gate always evaluates the real caller. Returns
  /// the updated recipe, or `null` when no pending recipe with that id belongs
  /// to `familyId`.
  func approveRecipeForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
    caller : Principal,
  ) : ?Types.Recipe {
    requireRecipeStewardForFamily(caller, familyId);
    RecipesScopeLib.approveForFamily(recipes, familyId, recipeId);
  };

  /// Internal implementation of `rejectRecipeForFamily` that takes the caller
  /// explicitly, so the Steward gate always evaluates the real caller. Returns
  /// the updated recipe, or `null` when no pending recipe with that id belongs
  /// to `familyId`.
  func rejectRecipeForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    recipeId : Types.RecipeId,
    caller : Principal,
  ) : ?Types.Recipe {
    requireRecipeStewardForFamily(caller, familyId);
    RecipesScopeLib.rejectForFamily(recipes, familyId, recipeId);
  };
};

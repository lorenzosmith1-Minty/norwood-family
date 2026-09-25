import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-D1: family-scope Family Recipes.
  //
  // Adds a `familyId` field to every `Recipe`. Every pre-existing recipe
  // migrates to familyId = "norwood", matching the default family that owns all
  // pre-tenancy data. Existing recipe ids, content, media links, status,
  // privacy, evidence, timestamps, and reserved future-ready fields are
  // preserved as-is. No reset, no reseed, and no duplicate entries: the list is
  // rebuilt exactly once from the old list, so a repeated upgrade is idempotent.
  // No other stable collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldRecipe = {
    recipeId : Nat;
    title : Text;
    shortDescription : Text;
    originatingPersonId : Text;
    relatedPersonIds : [Text];
    contributorAccountId : Principal;
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    familyBranch : ?Text;
    ingredients : [Text];
    instructions : Text;
    familyStory : ?Text;
    tags : [Text];
    privacyLevel : { #Public; #FamilyOnly; #Private };
    evidenceStatus : { #Documented; #FamilyHistory; #PersonalMemory; #Unresolved };
    linkedMediaIds : [Nat];
    status : { #Pending; #Approved; #Rejected; #Archived };
    createdAt : Int;
    updatedAt : Int;
    ocrText : ?Text;
    transcript : ?Text;
    extractedIngredients : ?[Text];
    aiDerivedText : ?Text;
  };

  type NewRecipe = {
    familyId : FamilyId;
    recipeId : Nat;
    title : Text;
    shortDescription : Text;
    originatingPersonId : Text;
    relatedPersonIds : [Text];
    contributorAccountId : Principal;
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    familyBranch : ?Text;
    ingredients : [Text];
    instructions : Text;
    familyStory : ?Text;
    tags : [Text];
    privacyLevel : { #Public; #FamilyOnly; #Private };
    evidenceStatus : { #Documented; #FamilyHistory; #PersonalMemory; #Unresolved };
    linkedMediaIds : [Nat];
    status : { #Pending; #Approved; #Rejected; #Archived };
    createdAt : Int;
    updatedAt : Int;
    ocrText : ?Text;
    transcript : ?Text;
    extractedIngredients : ?[Text];
    aiDerivedText : ?Text;
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    recipes : List.List<OldRecipe>;
  };

  type NewActor = {
    recipes : List.List<NewRecipe>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let recipes = List.empty<NewRecipe>();
    for (r in old.recipes.toArray().values()) {
      recipes.add({
        familyId = defaultFamilyId;
        recipeId = r.recipeId;
        title = r.title;
        shortDescription = r.shortDescription;
        originatingPersonId = r.originatingPersonId;
        relatedPersonIds = r.relatedPersonIds;
        contributorAccountId = r.contributorAccountId;
        era = r.era;
        year = r.year;
        location = r.location;
        familyBranch = r.familyBranch;
        ingredients = r.ingredients;
        instructions = r.instructions;
        familyStory = r.familyStory;
        tags = r.tags;
        privacyLevel = r.privacyLevel;
        evidenceStatus = r.evidenceStatus;
        linkedMediaIds = r.linkedMediaIds;
        status = r.status;
        createdAt = r.createdAt;
        updatedAt = r.updatedAt;
        ocrText = r.ocrText;
        transcript = r.transcript;
        extractedIngredients = r.extractedIngredients;
        aiDerivedText = r.aiDerivedText;
      });
    };

    { recipes };
  };
};

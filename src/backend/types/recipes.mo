import Principal "mo:core/Principal";
import ArchiveTypes "../types/archive";
import FamilyHistoryTypes "../types/family-history";

module {
  /// Identifier of a single family recipe.
  public type RecipeId = Nat;

  /// Lifecycle of a contributed recipe: it is submitted pending, then a Family
  /// Steward either approves it (making it visible in Family Recipes) or rejects
  /// it. Archived recipes are hidden from active views but retained.
  public type RecipeStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Archived;
  };

  /// Reused from the archive domain: who may view the recipe.
  public type PrivacyLevel = ArchiveTypes.PrivacyLevel;

  /// Reused from the family-history domain: how well the recipe is backed by
  /// evidence.
  public type EvidenceStatus = FamilyHistoryTypes.EvidenceStatus;

  /// A single family recipe. The recipe references canonical Person records by
  /// `personId` only (no Person data duplicated here) and canonical
  /// Archive/media records by id only (no media files duplicated here). One
  /// uploaded media file remains one canonical archive record even when linked
  /// to multiple recipes or profiles.
  ///
  /// Original source material (the recipe text, story, and linked media) is kept
  /// separate from the reserved future-ready AI-derived fields, so derived text
  /// never overwrites the original.
  public type Recipe = {
    recipeId : RecipeId;
    title : Text;
    shortDescription : Text;
    /// The single primary originating family member, linked to a canonical
    /// Person record by `personId`.
    originatingPersonId : Text;
    /// Related family members, each linked to a canonical Person record.
    relatedPersonIds : [Text];
    /// The signed-in account that contributed the recipe.
    contributorAccountId : Principal;
    /// Approximate era as free text (e.g. "early 1900s"), plus an optional year.
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    familyBranch : ?Text;
    ingredients : [Text];
    instructions : Text;
    familyStory : ?Text;
    tags : [Text];
    privacyLevel : PrivacyLevel;
    evidenceStatus : EvidenceStatus;
    /// References to canonical Archive/media records. No media is duplicated.
    linkedMediaIds : [Nat];
    status : RecipeStatus;
    createdAt : Int;
    updatedAt : Int;
    /// Reserved future-ready fields. Not populated by any logic yet. Kept
    /// separate from the original source material above.
    ocrText : ?Text;
    transcript : ?Text;
    extractedIngredients : ?[Text];
    aiDerivedText : ?Text;
  };

  /// Flattened, OQL-exposable view of a recipe. Enumerated variants render as
  /// their tag text; optional fields render as empty text when absent; array
  /// fields render as counts (OQL has no array value type).
  public type RecipeRow = {
    recipeId : RecipeId;
    title : Text;
    shortDescription : Text;
    originatingPersonId : Text;
    relatedPersonCount : Nat;
    contributorAccountId : Text;
    era : Text;
    year : ?Nat;
    location : Text;
    familyBranch : Text;
    ingredientCount : Nat;
    tagCount : Nat;
    privacyLevel : Text;
    evidenceStatus : Text;
    linkedMediaCount : Nat;
    status : Text;
    createdAt : Int;
    updatedAt : Int;
  };
};

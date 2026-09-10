import {
  ArchiveItemType,
  EvidenceStatus,
  PrivacyLevel,
  RecipeStatus,
} from "@/backend";
import type {
  ArchiveItem as BackendArchiveItem,
  Recipe as BackendRecipe,
} from "@/backend";

/**
 * Shared Family Recipes types mirroring the generated backend.d.ts contract,
 * plus friendly human labels and badge classes for recipe status, privacy
 * level, and evidence status, and a helper to resolve a recipe's primary image
 * from its linked media. Page tasks import these rather than reaching into the
 * generated bindings directly.
 */
export type Recipe = BackendRecipe;
export type RecipeId = bigint;

export { RecipeStatus, PrivacyLevel, EvidenceStatus };

/** Friendly labels for recipe lifecycle status. */
export const RECIPE_STATUS_LABELS: Record<RecipeStatus, string> = {
  [RecipeStatus.Pending]: "Pending",
  [RecipeStatus.Approved]: "Approved",
  [RecipeStatus.Rejected]: "Rejected",
  [RecipeStatus.Archived]: "Archived",
};

/** Status pill modifier class (from index.css) for each recipe status. */
export const RECIPE_STATUS_PILL: Record<RecipeStatus, string> = {
  [RecipeStatus.Pending]: "status-pending",
  [RecipeStatus.Approved]: "status-approved",
  [RecipeStatus.Rejected]: "status-rejected",
  [RecipeStatus.Archived]: "status-rejected",
};

/** Friendly labels for recipe privacy levels. */
export const RECIPE_PRIVACY_LABELS: Record<PrivacyLevel, string> = {
  [PrivacyLevel.Public]: "Public",
  [PrivacyLevel.FamilyOnly]: "Family Only",
  [PrivacyLevel.Private]: "Private",
};

/** Friendly labels for recipe evidence / source status. */
export const RECIPE_EVIDENCE_LABELS: Record<EvidenceStatus, string> = {
  [EvidenceStatus.Documented]: "Documented",
  [EvidenceStatus.FamilyHistory]: "Family History",
  [EvidenceStatus.PersonalMemory]: "Personal Memory",
  [EvidenceStatus.Unresolved]: "Unresolved",
};

/**
 * Badge modifier class (from index.css) for each evidence status. Documented
 * is a solid green confirmed fact; Family History / Personal Memory /
 * Unresolved use a dashed edge so a theory or memory can never be mistaken
 * for documented fact.
 */
export const RECIPE_EVIDENCE_BADGE: Record<EvidenceStatus, string> = {
  [EvidenceStatus.Documented]: "evidence-documented",
  [EvidenceStatus.FamilyHistory]: "evidence-history",
  [EvidenceStatus.PersonalMemory]: "evidence-memory",
  [EvidenceStatus.Unresolved]: "evidence-unresolved",
};

/**
 * Extracts a numeric year from a recipe: prefers the structured `year` field,
 * otherwise parses the first four-digit year found in the free-text `era`
 * string. Returns null when no year can be determined.
 */
export function getRecipeYear(recipe: Recipe): number | null {
  if (recipe.year !== undefined && recipe.year !== null) {
    return Number(recipe.year);
  }
  if (!recipe.era) return null;
  const match = recipe.era.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Resolves a recipe's primary image from its linked media. Walks the recipe's
 * linkedMediaIds in order and returns the direct URL of the first linked
 * archive item that is a photo (an image). Returns null when no linked media
 * is an image. The caller supplies the resolved archive items (e.g. from
 * useApprovedArchiveItems) so the recipe never stores a browser-only URL.
 */
export function getRecipePrimaryImage(
  recipe: Recipe,
  media: BackendArchiveItem[],
): string | null {
  for (const id of recipe.linkedMediaIds) {
    const item = media.find((m) => m.id === id);
    if (item && item.itemType === ArchiveItemType.Photo) {
      return item.blob.getDirectURL();
    }
  }
  return null;
}

import {
  ArrowLeft,
  CalendarDays,
  ChefHat,
  FileText,
  MapPin,
  Tag,
  User,
  Users,
} from "lucide-react";
import { PersonLink } from "../components/PersonLink";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import { useRecipe } from "../hooks/useRecipes";
import type { ArchiveItem } from "../types/archive";
import { ArchiveItemType } from "../types/archive";
import {
  RECIPE_EVIDENCE_BADGE,
  RECIPE_EVIDENCE_LABELS,
  RECIPE_PRIVACY_LABELS,
  RECIPE_STATUS_LABELS,
  RECIPE_STATUS_PILL,
  getRecipePrimaryImage,
  getRecipeYear,
} from "../types/recipes";

interface RecipeDetailPageProps {
  /** The recipe id to display. */
  recipeId: bigint;
  /** Navigates back to the Family Recipes browsing view. */
  onBack: () => void;
  /** Opens a person's profile (e.g. the originating family member). */
  onOpenProfile: (personId: string) => void;
  /** Navigates back to the Family Recipes browsing view (alias for onBack). */
  onOpenRecipes?: () => void;
}

/** Shortens a contributor principal to a readable, copy-safe label. */
function formatContributor(contributor: { toText(): string }): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/**
 * True when a linked archive item is handwritten recipe source material — a
 * scanned recipe card (Document) or a photo of a recipe card (Photo). These
 * are the original family sources and are labeled as such.
 */
function isHandwrittenSource(item: ArchiveItem): boolean {
  return (
    item.itemType === ArchiveItemType.Document ||
    item.itemType === ArchiveItemType.Photo
  );
}

/**
 * Family Recipes detail view. This is the single canonical detail view for a
 * recipe — every recipe card and profile link routes here. It shows the title,
 * originating family member and related people (with profile links), the
 * description, ingredients, instructions, family story, the linked media
 * gallery (with handwritten recipe cards labeled as original family source
 * material), the contributor, era/year, location, branch, tags, evidence
 * badge, and privacy level.
 */
export function RecipeDetailPage({
  recipeId,
  onBack,
  onOpenProfile,
  onOpenRecipes,
}: RecipeDetailPageProps) {
  const { data: recipe } = useRecipe(recipeId);
  const { data: media = [] } = useApprovedArchiveItems();

  const back = onOpenRecipes ?? onBack;

  if (!recipe) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <button
          type="button"
          data-ocid="recipe_detail.back_button"
          onClick={back}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Recipes
        </button>
        <div
          data-ocid="recipe_detail.empty_state"
          className="recipe-empty-state"
        >
          <div className="recipe-empty-mark">
            <ChefHat className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="recipe-empty-title">Recipe not found</h1>
          <p className="recipe-empty-hint">
            This family recipe is no longer available.
          </p>
        </div>
      </div>
    );
  }

  const linkedMedia = recipe.linkedMediaIds
    .map((id) => media.find((m) => m.id === id))
    .filter((item): item is ArchiveItem => Boolean(item));
  const primaryImage = getRecipePrimaryImage(recipe, media);
  const year = getRecipeYear(recipe);
  const statusPill = RECIPE_STATUS_PILL[recipe.status];
  const evidenceBadge = RECIPE_EVIDENCE_BADGE[recipe.evidenceStatus];
  const hasSourceMaterial = linkedMedia.some(isHandwrittenSource);
  const ingredientItems = recipe.ingredients.map((text, index) => ({
    id: `ingredient-${index}`,
    text,
  }));

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <button
        type="button"
        data-ocid="recipe_detail.back_button"
        onClick={back}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Recipes
      </button>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span
            data-ocid="recipe_detail.evidence_badge"
            className={`evidence-badge ${evidenceBadge}`}
          >
            {RECIPE_EVIDENCE_LABELS[recipe.evidenceStatus]}
          </span>
          <span className={`status-pill ${statusPill}`}>
            {RECIPE_STATUS_LABELS[recipe.status]}
          </span>
          <span className="text-xs font-medium text-muted-foreground">
            {RECIPE_PRIVACY_LABELS[recipe.privacyLevel]}
          </span>
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold text-foreground">
          {recipe.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <User className="h-4 w-4" aria-hidden="true" />
            From{" "}
            <PersonLink
              personId={recipe.originatingPersonId}
              onOpenProfile={onOpenProfile}
            />
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {year !== null ? String(year) : "Year unknown"}
          </span>
          {recipe.location ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4" aria-hidden="true" />
              {recipe.location}
            </span>
          ) : null}
          {recipe.familyBranch ? (
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-4 w-4" aria-hidden="true" />
              {recipe.familyBranch}
            </span>
          ) : null}
        </p>
      </header>

      <div className="recipe-detail">
        {/* Left column: hero image + the recipe itself */}
        <div className="min-w-0">
          <div data-ocid="recipe_detail.hero" className="recipe-detail-hero">
            {primaryImage ? (
              <img
                src={primaryImage}
                alt={`${recipe.title} — a family recipe`}
              />
            ) : (
              <div className="recipe-detail-hero-frame">
                <ChefHat className="h-10 w-10" aria-hidden="true" />
              </div>
            )}
          </div>

          {recipe.shortDescription ? (
            <section className="recipe-detail-section mt-6">
              <h2 className="recipe-detail-section-title">About this recipe</h2>
              <p className="recipe-detail-text whitespace-pre-line">
                {recipe.shortDescription}
              </p>
            </section>
          ) : null}

          {recipe.ingredients.length > 0 ? (
            <section className="recipe-section mt-6">
              <div className="recipe-section-head">
                <h2 className="recipe-section-title">Ingredients</h2>
              </div>
              <ul className="recipe-section-list">
                {ingredientItems.map((ingredient) => (
                  <li key={ingredient.id} className="flex items-start gap-2">
                    <span
                      className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-muted"
                      aria-hidden="true"
                    />
                    <span>{ingredient.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {recipe.instructions ? (
            <section className="recipe-section mt-6">
              <div className="recipe-section-head">
                <h2 className="recipe-section-title">Instructions</h2>
              </div>
              <p className="recipe-section-body whitespace-pre-line">
                {recipe.instructions}
              </p>
            </section>
          ) : null}

          {recipe.familyStory ? (
            <section className="recipe-section mt-6">
              <div className="recipe-section-head">
                <h2 className="recipe-section-title">Family story</h2>
              </div>
              <p className="recipe-section-body whitespace-pre-line">
                {recipe.familyStory}
              </p>
            </section>
          ) : null}
        </div>

        {/* Right column: people, media, and details */}
        <div className="flex min-w-0 flex-col gap-6">
          <section className="recipe-detail-section">
            <h2 className="recipe-detail-section-title">
              Originating family member
            </h2>
            <PersonLink
              personId={recipe.originatingPersonId}
              onOpenProfile={onOpenProfile}
            />
          </section>

          {recipe.relatedPersonIds.length > 0 ? (
            <section className="recipe-detail-section">
              <h2 className="recipe-detail-section-title">
                Related family members
              </h2>
              <div className="flex flex-wrap gap-2">
                {recipe.relatedPersonIds.map((personId) => (
                  <PersonLink
                    key={personId}
                    personId={personId}
                    onOpenProfile={onOpenProfile}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {linkedMedia.length > 0 ? (
            <section className="recipe-detail-section">
              <h2 className="recipe-detail-section-title">Recipe media</h2>
              {hasSourceMaterial ? (
                <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
                  Handwritten recipe cards are preserved as original family
                  source material.
                </p>
              ) : null}
              <div className="recipe-gallery">
                {linkedMedia.map((item) => {
                  const isSource = isHandwrittenSource(item);
                  const url = item.blob.getDirectURL();
                  return (
                    <figure
                      key={item.id.toString()}
                      data-ocid={`recipe_detail.media.${item.id.toString()}`}
                      className="recipe-gallery-item"
                    >
                      {item.itemType === ArchiveItemType.Photo ||
                      item.itemType === ArchiveItemType.Document ? (
                        <img
                          src={url}
                          alt={item.title}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="recipe-gallery-item-icon">
                          <FileText className="h-6 w-6" aria-hidden="true" />
                        </div>
                      )}
                      {isSource ? (
                        <figcaption className="source-material absolute bottom-2 left-2">
                          Original family source
                        </figcaption>
                      ) : null}
                    </figure>
                  );
                })}
              </div>
            </section>
          ) : null}

          <section className="recipe-detail-section">
            <h2 className="recipe-detail-section-title">Details</h2>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Contributor</span>
              <span className="meta-value">
                {formatContributor(recipe.contributorAccountId)}
              </span>
            </div>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Era</span>
              <span className="meta-value">
                {recipe.era || (year !== null ? String(year) : "Unknown")}
              </span>
            </div>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Year</span>
              <span className="meta-value">
                {year !== null ? String(year) : "Unknown"}
              </span>
            </div>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Location</span>
              <span className="meta-value">{recipe.location || "Unknown"}</span>
            </div>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Branch</span>
              <span className="meta-value">
                {recipe.familyBranch || "Unknown"}
              </span>
            </div>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Privacy</span>
              <span className="meta-value">
                {RECIPE_PRIVACY_LABELS[recipe.privacyLevel]}
              </span>
            </div>
            <div className="recipe-detail-meta-row">
              <span className="meta-label">Evidence</span>
              <span className="meta-value">
                {RECIPE_EVIDENCE_LABELS[recipe.evidenceStatus]}
              </span>
            </div>
          </section>

          {recipe.tags.length > 0 ? (
            <section className="recipe-detail-section">
              <h2 className="recipe-detail-section-title">Tags</h2>
              <div className="flex flex-wrap gap-2">
                {recipe.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

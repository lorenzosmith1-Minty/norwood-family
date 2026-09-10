import { BookOpen, ChefHat, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { useApprovedRecipes } from "../hooks/useRecipes";
import { ARCHIVE_ERAS } from "../types/archive";
import type { ArchiveItem } from "../types/archive";
import { getRecipePrimaryImage, getRecipeYear } from "../types/recipes";
import type { Recipe } from "../types/recipes";
import { profiles } from "./PersonProfilePage";

interface RecipesPageProps {
  onBack: () => void;
  /** Opens a recipe's detail view. */
  onOpenRecipe: (id: bigint) => void;
  /** Opens the add-recipe flow. */
  onAddRecipe: () => void;
}

interface Filters {
  /** "all" or an originating family member profile id. */
  origin: string;
  /** "all" or a related family member profile id. */
  related: string;
  /** "all" or an ARCHIVE_ERAS value. */
  era: string;
  /** "all" or a family branch value. */
  branch: string;
  /** "all" or a tag value. */
  tag: string;
}

const DEFAULT_FILTERS: Filters = {
  origin: "all",
  related: "all",
  era: "all",
  branch: "all",
  tag: "all",
};

/** Reads filter selections from the page URL query string. */
function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  return {
    origin: params.get("origin") ?? "all",
    related: params.get("related") ?? "all",
    era: params.get("era") ?? "all",
    branch: params.get("branch") ?? "all",
    tag: params.get("tag") ?? "all",
  };
}

/**
 * Resolves the canonical display name for a recipe's originating family
 * member. Uses the backend Person Profile record (preferredName-first) so the
 * card always shows the family-facing name, never an internal id or slug.
 */
function RecipeOrigin({ personId }: { personId: string }) {
  const fallback = profiles[personId]?.name ?? "";
  const canonical = useCanonicalPerson(personId, fallback);
  const name = canonical.displayName || fallback;
  if (!name) return null;
  return <span className="recipe-card-origin">{name}</span>;
}

interface RecipeCardProps {
  recipe: Recipe;
  media: ArchiveItem[];
  /** One-based position in the list, used for deterministic test markers. */
  position: number;
  onOpen: () => void;
}

/**
 * A single recipe card in the browsing grid: a warm-paper plate with a primary
 * image stage (or a keepsake icon), the dish title, the originating family
 * member, the era/year when available, and a short description.
 */
function RecipeCard({ recipe, media, position, onOpen }: RecipeCardProps) {
  const primaryImage = getRecipePrimaryImage(recipe, media);
  const year = getRecipeYear(recipe);
  const eraLabel = recipe.era || (year !== null ? String(year) : null);

  return (
    <button
      type="button"
      data-ocid={`recipes.card.${position}`}
      onClick={onOpen}
      className="recipe-card group"
    >
      <div className="recipe-card-thumb">
        {primaryImage ? (
          <img src={primaryImage} alt={recipe.title} loading="lazy" />
        ) : (
          <div className="recipe-card-thumb-icon">
            <ChefHat
              className="h-10 w-10"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
        )}
      </div>

      <div className="recipe-card-body">
        <h3 className="recipe-card-title line-clamp-2">{recipe.title}</h3>
        <div className="recipe-card-meta">
          <RecipeOrigin personId={recipe.originatingPersonId} />
          {eraLabel ? (
            <span className="recipe-card-era">{eraLabel}</span>
          ) : null}
        </div>
        {recipe.shortDescription ? (
          <p className="recipe-card-desc line-clamp-2">
            {recipe.shortDescription}
          </p>
        ) : null}
      </div>
    </button>
  );
}

/**
 * Dedicated Family Recipes browsing page: lists all approved family recipes
 * with filters for originating member, related member, era/year, branch, and
 * tag. Reaches the keepsake recipe-box feel of the Norwood archival style.
 */
export function RecipesPage({
  onBack,
  onOpenRecipe,
  onAddRecipe,
}: RecipesPageProps) {
  const { data: recipes = [], isLoading } = useApprovedRecipes();
  const { data: media = [] } = useApprovedArchiveItems();
  const [filters, setFilters] = useState<Filters>(readFilters);

  // Persist filter selections in the URL so they survive refresh and can be
  // shared. Back navigation to this view re-reads them from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    for (const key of Object.keys(filters) as (keyof Filters)[]) {
      if (filters[key] !== "all") params.set(key, filters[key]);
      else params.delete(key);
    }
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters]);

  // Unique branch and tag options derived from the approved recipes.
  const branchOptions = useMemo(() => {
    const values = new Set<string>();
    for (const recipe of recipes) {
      if (recipe.familyBranch) values.add(recipe.familyBranch);
    }
    return Array.from(values).sort();
  }, [recipes]);

  const tagOptions = useMemo(() => {
    const values = new Set<string>();
    for (const recipe of recipes) {
      for (const tag of recipe.tags) values.add(tag);
    }
    return Array.from(values).sort();
  }, [recipes]);

  // Newest first, then apply the active filters.
  const filtered = useMemo(() => {
    const sorted = [...recipes].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted
      .filter(
        (recipe) =>
          filters.origin === "all" ||
          recipe.originatingPersonId === filters.origin,
      )
      .filter(
        (recipe) =>
          filters.related === "all" ||
          recipe.relatedPersonIds.includes(filters.related),
      )
      .filter((recipe) => {
        if (filters.era === "all") return true;
        const era = ARCHIVE_ERAS.find((e) => e.value === filters.era);
        if (!era) return true;
        const year = getRecipeYear(recipe);
        if (year === null) return false;
        if (era.min !== null && year < era.min) return false;
        if (era.max !== null && year > era.max) return false;
        return true;
      })
      .filter(
        (recipe) =>
          filters.branch === "all" || recipe.familyBranch === filters.branch,
      )
      .filter(
        (recipe) => filters.tag === "all" || recipe.tags.includes(filters.tag),
      );
  }, [recipes, filters]);

  const hasActiveFilters =
    filters.origin !== "all" ||
    filters.related !== "all" ||
    filters.era !== "all" ||
    filters.branch !== "all" ||
    filters.tag !== "all";

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const memberOptions = Object.values(profiles).map((profile) => ({
    id: profile.id,
    name: profile.name,
  }));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <button
        type="button"
        data-ocid="recipes.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span aria-hidden="true">←</span> Back to Home
      </button>

      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <BookOpen
              className="h-3.5 w-3.5"
              style={{ color: "oklch(var(--recipe-accent))" }}
              aria-hidden="true"
            />
            Family Recipes
          </div>
          <h1 className="font-display text-3xl font-semibold text-foreground">
            Family Recipes
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            The dishes, handwritten notes, and kitchen stories your family
            passes down.
          </p>
        </div>

        <button
          type="button"
          data-ocid="recipes.add_button"
          onClick={onAddRecipe}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{
            color: "oklch(var(--recipe-accent-foreground))",
            backgroundColor: "oklch(var(--recipe-accent))",
          }}
        >
          <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Add Recipe
        </button>
      </header>

      {/* Filter bar: All Recipes tab + member / era / branch / tag dropdowns */}
      <div className="flex flex-col gap-4">
        <div role="tablist" aria-label="Filter recipes" className="filter-bar">
          <button
            type="button"
            role="tab"
            aria-selected={!hasActiveFilters}
            data-ocid="recipes.filter.all"
            onClick={resetFilters}
            className={`filter-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
              !hasActiveFilters ? "filter-tab-active-recipe" : ""
            }`}
          >
            All Recipes
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Originating family member</span>
            <select
              data-ocid="recipes.filter.origin"
              value={filters.origin}
              onChange={(event) =>
                setFilters((f) => ({ ...f, origin: event.target.value }))
              }
              className="filter-select"
            >
              <option value="all">All originating members</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Related family member</span>
            <select
              data-ocid="recipes.filter.related"
              value={filters.related}
              onChange={(event) =>
                setFilters((f) => ({ ...f, related: event.target.value }))
              }
              className="filter-select"
            >
              <option value="all">All related members</option>
              {memberOptions.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Era</span>
            <select
              data-ocid="recipes.filter.era"
              value={filters.era}
              onChange={(event) =>
                setFilters((f) => ({ ...f, era: event.target.value }))
              }
              className="filter-select"
            >
              {ARCHIVE_ERAS.map((era) => (
                <option key={era.value} value={era.value}>
                  {era.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Family branch</span>
            <select
              data-ocid="recipes.filter.branch"
              value={filters.branch}
              onChange={(event) =>
                setFilters((f) => ({ ...f, branch: event.target.value }))
              }
              className="filter-select"
            >
              <option value="all">All branches</option>
              {branchOptions.map((branch) => (
                <option key={branch} value={branch}>
                  {branch}
                </option>
              ))}
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="sr-only">Tag</span>
            <select
              data-ocid="recipes.filter.tag"
              value={filters.tag}
              onChange={(event) =>
                setFilters((f) => ({ ...f, tag: event.target.value }))
              }
              className="filter-select"
            >
              <option value="all">All tags</option>
              {tagOptions.map((tag) => (
                <option key={tag} value={tag}>
                  {tag}
                </option>
              ))}
            </select>
          </label>

          {hasActiveFilters ? (
            <button
              type="button"
              data-ocid="recipes.filter.clear"
              onClick={resetFilters}
              className="filter-clear"
            >
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div
            data-ocid="recipes.loading_state"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading recipes"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-xl border border-border/60 bg-card"
              >
                <div className="aspect-[4/3] w-full bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div data-ocid="recipes.empty_state" className="recipe-empty-state">
            <div className="recipe-empty-mark">
              <ChefHat
                className="h-7 w-7"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </div>
            <h2 className="recipe-empty-title">
              {hasActiveFilters
                ? "No recipes match these filters"
                : "No family recipes yet"}
            </h2>
            <p className="recipe-empty-hint">
              {hasActiveFilters
                ? "Try adjusting or clearing the filters to see more of the family recipes."
                : "Preserve the dishes, handwritten notes, and kitchen stories your family passes down."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                data-ocid="recipes.filter.clear_button"
                onClick={resetFilters}
                className="recipe-empty-action"
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                data-ocid="recipes.empty_add_button"
                onClick={onAddRecipe}
                className="recipe-empty-action"
              >
                Add a Recipe
              </button>
            )}
          </div>
        ) : (
          <ul
            data-ocid="recipes.list"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
          >
            {filtered.map((recipe, index) => (
              <li key={recipe.recipeId.toString()}>
                <RecipeCard
                  recipe={recipe}
                  media={media}
                  position={index + 1}
                  onOpen={() => onOpenRecipe(recipe.recipeId)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

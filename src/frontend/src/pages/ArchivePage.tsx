import {
  Archive,
  Clapperboard,
  Inbox,
  Mic,
  Plus,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ArchiveCard } from "../components/ArchiveCard";
import { ArchiveFilterBar } from "../components/ArchiveFilterBar";
import {
  useApprovedArchiveItems,
  useSearchArchiveItems,
} from "../hooks/useArchiveStorage";
import type { ArchiveItemType } from "../types/archive";
import { ARCHIVE_ERAS, getArchiveItemYear } from "../types/archive";

interface ArchivePageProps {
  onBack: () => void;
  onOpenArchiveItem: (id: bigint) => void;
  /** Navigates to the dedicated Family Videos & Oral History page. */
  onOpenVideos: () => void;
  /** Navigates to the dedicated Family Recipes page. */
  onOpenRecipes: () => void;
  /** Navigates to the Add to Archive contribution view. */
  onAddToArchive: () => void;
}

interface Filters {
  type: ArchiveItemType | "all";
  member: string;
  era: string;
  query: string;
  tags: string[];
}

const DEFAULT_FILTERS: Filters = {
  type: "all",
  member: "all",
  era: "all",
  query: "",
  tags: [],
};

/** Reads filter selections from the page URL query string. */
function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") as ArchiveItemType | null;
  const member = params.get("member");
  const era = params.get("era");
  const query = params.get("query");
  const tagsParam = params.get("tags");
  return {
    type: type ?? "all",
    member: member ?? "all",
    era: era ?? "all",
    query: query ?? "",
    tags: tagsParam ? tagsParam.split(",").filter(Boolean) : [],
  };
}

/**
 * Family Archive browsing screen: lists all approved archive items newest
 * first, with a title search box, tag filter chips, and type / family-member /
 * era filters that persist in the URL. Title + tag filtering runs through the
 * backend search hook; the category / member / era filters are applied on top
 * so the existing year-range era behavior is preserved.
 */
export function ArchivePage({
  onBack,
  onOpenArchiveItem,
  onOpenVideos,
  onOpenRecipes,
  onAddToArchive,
}: ArchivePageProps) {
  const [filters, setFilters] = useState<Filters>(readFilters);
  // The full approved set, used to derive the stable list of available tag
  // filter chips regardless of the currently active filters.
  const { data: allItems = [], isLoading: allLoading } =
    useApprovedArchiveItems();
  // Title + tag search via the backend. Category / member / era are applied
  // client-side on the results so the existing era year-range behavior holds.
  const { data: searchResults = [], isLoading: searchLoading } =
    useSearchArchiveItems({
      query: filters.query || null,
      tags: filters.tags,
      itemType: null,
      relatedMemberId: null,
      era: null,
    });
  const isLoading = allLoading || searchLoading;

  // Persist filter selections in the URL so they survive refresh and can be
  // shared. Back navigation to this view re-reads them from the URL.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (filters.type !== "all") params.set("type", filters.type);
    else params.delete("type");
    if (filters.member !== "all") params.set("member", filters.member);
    else params.delete("member");
    if (filters.era !== "all") params.set("era", filters.era);
    else params.delete("era");
    if (filters.query) params.set("query", filters.query);
    else params.delete("query");
    if (filters.tags.length > 0) params.set("tags", filters.tags.join(","));
    else params.delete("tags");
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters]);

  // Every tag present across the approved archive, sorted, for the filter
  // chips. Derived from the full set so chips stay visible while filtering.
  const availableTags = useMemo(() => {
    const set = new Set<string>();
    for (const item of allItems) {
      for (const tag of item.tags) set.add(tag);
    }
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [allItems]);

  // Newest first, then apply the category / member / era filters on top of the
  // backend title + tag search results.
  const filtered = useMemo(() => {
    const sorted = [...searchResults].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted
      .filter(
        (item) => filters.type === "all" || item.itemType === filters.type,
      )
      .filter(
        (item) =>
          filters.member === "all" ||
          item.relatedMemberIds.includes(filters.member),
      )
      .filter((item) => {
        if (filters.era === "all") return true;
        const era = ARCHIVE_ERAS.find((e) => e.value === filters.era);
        if (!era) return true;
        const year = getArchiveItemYear(item);
        if (year === null) return false;
        if (era.min !== null && year < era.min) return false;
        if (era.max !== null && year > era.max) return false;
        return true;
      });
  }, [searchResults, filters]);

  const hasActiveFilters =
    filters.type !== "all" ||
    filters.member !== "all" ||
    filters.era !== "all" ||
    filters.query !== "" ||
    filters.tags.length > 0;

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

  const toggleTag = (tag: string) =>
    setFilters((f) => ({
      ...f,
      tags: f.tags.includes(tag)
        ? f.tags.filter((t) => t !== tag)
        : [...f.tags, tag],
    }));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <button
        type="button"
        data-ocid="archive.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span aria-hidden="true">←</span> Back to Home
      </button>

      <header className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <Archive
            className="h-3.5 w-3.5 text-accent-foreground"
            aria-hidden="true"
          />
          Family Archive
        </div>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-semibold text-foreground">
              Our Family Archive
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Approved photos, documents, stories, and more — preserved as they
              were contributed.
            </p>
          </div>
          <button
            type="button"
            data-ocid="archive.add_button"
            onClick={onAddToArchive}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
          >
            <Plus className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Add to Archive
          </button>
        </div>
      </header>

      {/* Prominent entry point to the dedicated Family Videos & Oral History
          library. Family Archive remains the primary navigation parent for
          preserved media; this card is the category entry into the moving
          memories and spoken stories. */}
      <button
        type="button"
        data-ocid="archive.videos_entry_button"
        onClick={onOpenVideos}
        className="group mb-6 flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "oklch(var(--oral-history) / 0.14)",
            color: "oklch(var(--oral-history))",
          }}
          aria-hidden="true"
        >
          <Clapperboard className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold text-foreground">
            Family Videos &amp; Oral History
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Mic className="h-3.5 w-3.5" aria-hidden="true" />
              Home videos and spoken stories
            </span>
          </span>
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: "oklch(var(--oral-history))",
            color: "oklch(var(--oral-history-foreground))",
          }}
        >
          Browse
          <span aria-hidden="true">→</span>
        </span>
      </button>

      {/* Prominent entry point to the dedicated Family Recipes library. Family
          Archive remains the canonical media repository — handwritten recipe
          images, photos, and documents stay archived here and are never
          duplicated. This card is the category entry into the preserved
          family recipes. */}
      <button
        type="button"
        data-ocid="archive.recipes_entry_button"
        onClick={onOpenRecipes}
        className="group mb-6 flex w-full items-center gap-4 rounded-2xl border border-border bg-card p-5 text-left shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
      >
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: "oklch(var(--recipe-accent) / 0.14)",
            color: "oklch(var(--recipe-accent))",
          }}
          aria-hidden="true"
        >
          <UtensilsCrossed className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-semibold text-foreground">
            Family Recipes
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <UtensilsCrossed className="h-3.5 w-3.5" aria-hidden="true" />
              Handed-down dishes and family favorites
            </span>
          </span>
        </span>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-semibold"
          style={{
            backgroundColor: "oklch(var(--recipe-accent))",
            color: "oklch(var(--recipe-accent-foreground))",
          }}
        >
          Browse
          <span aria-hidden="true">→</span>
        </span>
      </button>

      <ArchiveFilterBar
        typeFilter={filters.type}
        memberFilter={filters.member}
        eraFilter={filters.era}
        query={filters.query}
        tags={filters.tags}
        availableTags={availableTags}
        onTypeChange={(type) => setFilters((f) => ({ ...f, type }))}
        onMemberChange={(member) => setFilters((f) => ({ ...f, member }))}
        onEraChange={(era) => setFilters((f) => ({ ...f, era }))}
        onQueryChange={(query) => setFilters((f) => ({ ...f, query }))}
        onTagToggle={toggleTag}
      />

      <div className="mt-6">
        {isLoading ? (
          <div
            data-ocid="archive.loading_state"
            className="archive-grid"
            aria-label="Loading archive items"
          >
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="animate-pulse overflow-hidden rounded-xl border border-border/60 bg-card"
              >
                <div className="aspect-[4/3] w-full bg-muted" />
                <div className="space-y-2 p-4">
                  <div className="h-4 w-1/3 rounded bg-muted" />
                  <div className="h-5 w-2/3 rounded bg-muted" />
                  <div className="h-4 w-1/2 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div data-ocid="archive.empty_state" className="archive-empty">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
              <Inbox
                className="h-7 w-7 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </div>
            <h2 className="archive-empty-title">
              {hasActiveFilters
                ? "No items match these filters"
                : "The archive is empty"}
            </h2>
            <p className="archive-empty-hint">
              {hasActiveFilters
                ? "Try adjusting or clearing the filters to see more of the family archive."
                : "Approved contributions will appear here once they are added."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                data-ocid="archive.reset_filters_button"
                onClick={resetFilters}
                className="archive-empty-reset"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <ul data-ocid="archive.list" className="archive-grid">
            {filtered.map((item, index) => (
              <li key={item.id.toString()}>
                <ArchiveCard
                  item={item}
                  index={index}
                  onOpen={() => onOpenArchiveItem(item.id)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

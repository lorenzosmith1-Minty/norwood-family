import {
  Archive,
  Clapperboard,
  Inbox,
  Mic,
  UtensilsCrossed,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ArchiveCard } from "../components/ArchiveCard";
import { ArchiveFilterBar } from "../components/ArchiveFilterBar";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import type { ArchiveItemType } from "../types/archive";
import { ARCHIVE_ERAS, getArchiveItemYear } from "../types/archive";

interface ArchivePageProps {
  onBack: () => void;
  onOpenArchiveItem: (id: bigint) => void;
  /** Navigates to the dedicated Family Videos & Oral History page. */
  onOpenVideos: () => void;
  /** Navigates to the dedicated Family Recipes page. */
  onOpenRecipes: () => void;
}

interface Filters {
  type: ArchiveItemType | "all";
  member: string;
  era: string;
}

const DEFAULT_FILTERS: Filters = { type: "all", member: "all", era: "all" };

/** Reads filter selections from the page URL query string. */
function readFilters(): Filters {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type") as ArchiveItemType | null;
  const member = params.get("member");
  const era = params.get("era");
  return {
    type: type ?? "all",
    member: member ?? "all",
    era: era ?? "all",
  };
}

/**
 * Family Archive browsing screen: lists all approved archive items newest
 * first, with type / family-member / era filters that persist in the URL.
 */
export function ArchivePage({
  onBack,
  onOpenArchiveItem,
  onOpenVideos,
  onOpenRecipes,
}: ArchivePageProps) {
  const { data: items = [], isLoading } = useApprovedArchiveItems();
  const [filters, setFilters] = useState<Filters>(readFilters);

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
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [filters]);

  // Newest first, then apply the active filters.
  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
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
  }, [items, filters]);

  const hasActiveFilters =
    filters.type !== "all" || filters.member !== "all" || filters.era !== "all";

  const resetFilters = () => setFilters(DEFAULT_FILTERS);

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
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Our Family Archive
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Approved photos, documents, stories, and more — preserved as they were
          contributed.
        </p>
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
        onTypeChange={(type) => setFilters((f) => ({ ...f, type }))}
        onMemberChange={(member) => setFilters((f) => ({ ...f, member }))}
        onEraChange={(era) => setFilters((f) => ({ ...f, era }))}
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

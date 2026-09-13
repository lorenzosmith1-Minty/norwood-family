import { PostType } from "@/backend";
import { ChevronDown, Search, X } from "lucide-react";
import { useState } from "react";
import type { PostTag } from "../types/board";

/** A board filter option: "all" or a specific post type. */
export type BoardFilter = PostType | "all";

interface BoardFilterBarProps {
  /** The currently active post-type filter. */
  active: BoardFilter;
  /** Called when the user selects a post-type filter. */
  onChange: (filter: BoardFilter) => void;
  /** Every existing tag across the board, for the tag filter dropdown. */
  tags: PostTag[];
  /** The currently active tag filter, or null when none is active. */
  activeTag: PostTag | null;
  /** Called when the user selects or clears a tag filter. */
  onTagChange: (tag: PostTag | null) => void;
}

/** The board filter pills shown above the post list. */
const BOARD_FILTERS: { value: BoardFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: PostType.Announcement, label: "Announcements" },
  { value: PostType.FamilyQuestion, label: "Questions" },
  { value: PostType.ResearchHistory, label: "Research / History" },
  { value: PostType.Recipe, label: "Recipes" },
  { value: PostType.ReunionEvent, label: "Events" },
  { value: PostType.Memorial, label: "Memorials" },
];

/**
 * The Family Message Board filter bar. Reuses the shared .filter-tab language
 * with the board-aware active state (.filter-tab-active-board) so the active
 * pill is tinted with the sepia board accent, matching the Archive / Media /
 * Recipe filter bars. A tag filter dropdown lists every existing tag with a
 * free-text search field on top; selecting a tag filters the board by it.
 */
export function BoardFilterBar({
  active,
  onChange,
  tags,
  activeTag,
  onTagChange,
}: BoardFilterBarProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLowerCase();
  const filteredTags = tags.filter((tag) => tag.includes(normalizedQuery));

  // Keep the active tag selectable even when the free-text search narrows the
  // option list, so the native <select> never holds a value with no matching
  // <option>.
  const options =
    activeTag && !filteredTags.includes(activeTag)
      ? [activeTag, ...filteredTags]
      : filteredTags;

  const handleTagSelect = (value: string) => {
    onTagChange(value === "" ? null : value);
    setQuery("");
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="tablist"
        aria-label="Filter board posts"
        className="filter-bar"
      >
        {BOARD_FILTERS.map((filter) => {
          const isActive = active === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-ocid={`board.filter.${filter.value}`}
              onClick={() => onChange(filter.value)}
              className={`filter-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                isActive ? "filter-tab-active-board" : ""
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <div className="search-input w-44">
        <Search
          className="search-icon h-4 w-4"
          strokeWidth={2}
          aria-hidden="true"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search tags…"
          aria-label="Search tags"
          data-ocid="board.tag_search"
        />
      </div>

      <div className="relative">
        <select
          data-ocid="board.tag_filter"
          aria-label="Filter by tag"
          value={activeTag ?? ""}
          onChange={(e) => handleTagSelect(e.target.value)}
          className={`filter-select appearance-none pr-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
            activeTag ? "filter-tab-active-board" : ""
          }`}
        >
          <option value="">All tags</option>
          {options.map((tag) => (
            <option key={tag} value={tag}>
              {tag}
            </option>
          ))}
        </select>
        <ChevronDown
          className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>

      {activeTag ? (
        <button
          type="button"
          data-ocid="board.tag_clear"
          onClick={() => onTagChange(null)}
          className="filter-clear focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2} aria-hidden="true" />
          Clear tag
        </button>
      ) : null}
    </div>
  );
}

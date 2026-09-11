import { PostType } from "@/backend";

/** A board filter option: "all" or a specific post type. */
export type BoardFilter = PostType | "all";

interface BoardFilterBarProps {
  /** The currently active filter. */
  active: BoardFilter;
  /** Called when the user selects a filter. */
  onChange: (filter: BoardFilter) => void;
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
 * The Family Message Board filter pill row. Reuses the shared .filter-tab
 * language with the board-aware active state (.filter-tab-active-board) so the
 * active pill is tinted with the sepia board accent, matching the Archive /
 * Media / Recipe filter bars.
 */
export function BoardFilterBar({ active, onChange }: BoardFilterBarProps) {
  return (
    <div role="tablist" aria-label="Filter board posts" className="filter-bar">
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
  );
}

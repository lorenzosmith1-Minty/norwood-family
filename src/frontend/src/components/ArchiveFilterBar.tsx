import { Search, Users } from "lucide-react";
import { profiles } from "../pages/PersonProfilePage";
import type { ArchiveItemType } from "../types/archive";
import { ARCHIVE_ERAS, ARCHIVE_TYPE_FILTERS } from "../types/archive";

interface ArchiveFilterBarProps {
  typeFilter: ArchiveItemType | "all";
  /** "all" or a family member profile id. */
  memberFilter: string;
  /** "all" or an ARCHIVE_ERAS value. */
  eraFilter: string;
  /** Current title search text. */
  query: string;
  /** Currently active tag filters. */
  tags: string[];
  /** Every tag present across the approved archive, for the filter chips. */
  availableTags: string[];
  onTypeChange: (value: ArchiveItemType | "all") => void;
  onMemberChange: (value: string) => void;
  onEraChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onTagToggle: (tag: string) => void;
}

/**
 * Filter controls for the archive browsing screen: a title search box, tag
 * filter chips, type filter tabs, a family member dropdown, and an era/date
 * range dropdown. Controlled by the browsing page, which owns the filter state
 * and persists it to the URL.
 */
export function ArchiveFilterBar({
  typeFilter,
  memberFilter,
  eraFilter,
  query,
  tags,
  availableTags,
  onTypeChange,
  onMemberChange,
  onEraChange,
  onQueryChange,
  onTagToggle,
}: ArchiveFilterBarProps) {
  const memberOptions = Object.values(profiles).map((profile) => ({
    id: profile.id,
    name: profile.name,
  }));

  return (
    <div className="flex flex-col gap-4">
      {/* Title search box */}
      <div className="search-input" data-ocid="archive.search">
        <Search
          className="search-icon h-4 w-4 shrink-0"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <input
          type="search"
          data-ocid="archive.search_input"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search by title…"
          aria-label="Search archive by title"
        />
      </div>

      {/* Tag filter chips */}
      {availableTags.length > 0 ? (
        <fieldset className="flex flex-wrap items-center gap-2 border-0 p-0">
          <legend className="sr-only">Filter by tag</legend>
          {availableTags.map((tag, index) => {
            const active = tags.includes(tag);
            return (
              <label
                key={tag}
                className={`tag-filter focus-within:outline-none focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background ${
                  active ? "tag-filter-active" : ""
                }`}
              >
                <input
                  type="checkbox"
                  className="sr-only"
                  data-ocid={`archive.filter.tag.${index + 1}`}
                  checked={active}
                  onChange={() => onTagToggle(tag)}
                />
                {tag}
              </label>
            );
          })}
        </fieldset>
      ) : null}

      {/* Type filter tabs */}
      <div role="tablist" aria-label="Filter by type" className="filter-bar">
        {ARCHIVE_TYPE_FILTERS.map((filter, index) => {
          const active = typeFilter === filter.value;
          return (
            <button
              key={filter.value}
              type="button"
              role="tab"
              aria-selected={active}
              data-ocid={`archive.filter.type.${index + 1}`}
              onClick={() => onTypeChange(filter.value)}
              className={`filter-tab focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                active ? "filter-tab-active" : ""
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      {/* Family member + era dropdowns */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users
            className="h-4 w-4 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span className="sr-only">Family member</span>
          <select
            data-ocid="archive.filter.member"
            value={memberFilter}
            onChange={(event) => onMemberChange(event.target.value)}
            className="filter-select"
          >
            <option value="all">All family members</option>
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
            data-ocid="archive.filter.era"
            value={eraFilter}
            onChange={(event) => onEraChange(event.target.value)}
            className="filter-select"
          >
            {ARCHIVE_ERAS.map((era) => (
              <option key={era.value} value={era.value}>
                {era.label}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

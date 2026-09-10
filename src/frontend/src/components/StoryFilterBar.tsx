import type { Story } from "@/types/family-history";
import { EVIDENCE_STATUS_LABELS, EvidenceStatus } from "@/types/family-history";
import { X } from "lucide-react";
import { profiles } from "../pages/PersonProfilePage";

/**
 * Client-side filter state for the Family Stories browse view. Each dimension
 * is optional; an empty object means "All Stories".
 */
export interface StoryFilter {
  person?: string;
  branch?: string;
  era?: string;
  evidence?: EvidenceStatus;
}

/**
 * Branch membership derived from the documented family graph (the Heritage
 * Branch anchors). A story belongs to a branch when any of its related members
 * is a member of that branch. This is a client-side derivation only — stories
 * do not carry a branch field on the backend.
 */
export const BRANCH_MEMBERS: Record<string, string[]> = {
  "Clayton Branch": [
    "clayton",
    "hudson",
    "erma",
    "elbert",
    "wellman",
    "wetherby",
    "clayton-son-died",
    "columbus",
    "thomas-clayton",
    "alton",
    "robert-davis",
    "ardeanus",
    "willie-b",
    "james",
    "freddie",
    "zelia-mae",
    "lula-mae",
  ],
  "Smith Branch": [
    "lorenzoSmithSr",
    "versieSmithJr",
    "herbertSmith",
    "alonzoSmith",
    "sherriSmith",
    "beatriceSmith",
    "edSmith",
  ],
  "Adams Line": [
    "harvey-adams-sr",
    "mary-louise-sims",
    "mary-jane-johnson",
    "gertrude-adams-hill",
    "john-adams",
    "louis-adams-sr",
    "albert-adams",
    "charles-adams",
    "homer-adams",
    "versie-adams-sr",
    "judge-granberry-adams",
    "fannie-adams",
  ],
};

/** True when a story matches the active filter (used by the browse view). */
export function matchesStoryFilter(story: Story, filter: StoryFilter): boolean {
  if (filter.person && !story.relatedMemberIds.includes(filter.person)) {
    return false;
  }
  if (
    filter.branch &&
    !BRANCH_MEMBERS[filter.branch]?.some((member) =>
      story.relatedMemberIds.includes(member),
    )
  ) {
    return false;
  }
  if (filter.era && story.era !== filter.era) {
    return false;
  }
  if (filter.evidence && story.evidenceStatus !== filter.evidence) {
    return false;
  }
  return true;
}

interface StoryFilterBarProps {
  stories: Story[];
  filter: StoryFilter;
  onChange: (filter: StoryFilter) => void;
}

/** Resolves a person id to its family-facing display name for the selects. */
function personLabel(personId: string): string {
  return profiles[personId]?.name ?? personId;
}

/**
 * Filter controls for the Family Stories browse view: All Stories plus
 * Person, Branch, Era, and Evidence status. Filtering is client-side over the
 * approved stories list.
 */
export function StoryFilterBar({
  stories,
  filter,
  onChange,
}: StoryFilterBarProps) {
  const people = Array.from(
    new Set(stories.flatMap((story) => story.relatedMemberIds)),
  );
  const eras = Array.from(
    new Set(
      stories
        .map((story) => story.era)
        .filter((era): era is string => Boolean(era)),
    ),
  );
  const branches = Object.keys(BRANCH_MEMBERS);
  const hasFilter = Boolean(
    filter.person || filter.branch || filter.era || filter.evidence,
  );

  const clear = () => onChange({});

  return (
    <div data-ocid="stories.filter_bar" className="filter-bar">
      <button
        type="button"
        data-ocid="stories.filter.all"
        onClick={clear}
        className={`filter-tab ${!hasFilter ? "filter-tab-active" : ""}`}
      >
        All Stories
      </button>

      <select
        data-ocid="stories.filter.person"
        aria-label="Filter by person"
        value={filter.person ?? ""}
        onChange={(event) =>
          onChange({ ...filter, person: event.target.value || undefined })
        }
        className="filter-select"
      >
        <option value="">All people</option>
        {people.map((personId) => (
          <option key={personId} value={personId}>
            {personLabel(personId)}
          </option>
        ))}
      </select>

      <select
        data-ocid="stories.filter.branch"
        aria-label="Filter by branch"
        value={filter.branch ?? ""}
        onChange={(event) =>
          onChange({ ...filter, branch: event.target.value || undefined })
        }
        className="filter-select"
      >
        <option value="">All branches</option>
        {branches.map((branch) => (
          <option key={branch} value={branch}>
            {branch}
          </option>
        ))}
      </select>

      <select
        data-ocid="stories.filter.era"
        aria-label="Filter by era"
        value={filter.era ?? ""}
        onChange={(event) =>
          onChange({ ...filter, era: event.target.value || undefined })
        }
        className="filter-select"
      >
        <option value="">All eras</option>
        {eras.map((era) => (
          <option key={era} value={era}>
            {era}
          </option>
        ))}
      </select>

      <select
        data-ocid="stories.filter.evidence"
        aria-label="Filter by evidence status"
        value={filter.evidence ?? ""}
        onChange={(event) =>
          onChange({
            ...filter,
            evidence: (event.target.value || undefined) as
              | EvidenceStatus
              | undefined,
          })
        }
        className="filter-select"
      >
        <option value="">All evidence</option>
        {Object.values(EvidenceStatus).map((status) => (
          <option key={status} value={status}>
            {EVIDENCE_STATUS_LABELS[status]}
          </option>
        ))}
      </select>

      {hasFilter && (
        <button
          type="button"
          data-ocid="stories.filter.clear"
          onClick={clear}
          className="filter-clear"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      )}
    </div>
  );
}

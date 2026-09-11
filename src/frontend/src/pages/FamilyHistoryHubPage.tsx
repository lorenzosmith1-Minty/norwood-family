import { ArrowRight, Clock3, LibraryBig, Search } from "lucide-react";

interface FamilyHistoryHubPageProps {
  onBack: () => void;
  onOpenStories: () => void;
  onOpenMysteries: () => void;
  onOpenTimeline: () => void;
}

/**
 * Family History hub: groups the family's storytelling and research features —
 * Family Stories, Family Mysteries, and Travel Through Time — behind large
 * option cards that mirror the Home navigation cards. Each option reuses its
 * existing page; this hub only routes to it.
 */
export function FamilyHistoryHubPage({
  onBack,
  onOpenStories,
  onOpenMysteries,
  onOpenTimeline,
}: FamilyHistoryHubPageProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8">
      <header className="hub-header mb-8">
        <button
          type="button"
          data-ocid="family_history_hub.back_button"
          onClick={onBack}
          aria-label="Back to Home"
          className="hub-back"
        >
          <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="hub-title">Family History</h1>
          <p className="hub-subtitle">
            The stories, mysteries, and milestones that make up the Norwood
            family story.
          </p>
        </div>
      </header>

      <div data-ocid="family_history_hub.grid" className="hub-grid">
        <button
          type="button"
          data-ocid="family_history_hub.stories_option"
          onClick={onOpenStories}
          className="hub-option hub-accent-history"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <LibraryBig
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Family Stories</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            The moments and memories that shaped our family.
          </span>
        </button>

        <button
          type="button"
          data-ocid="family_history_hub.mysteries_option"
          onClick={onOpenMysteries}
          className="hub-option hub-accent-history"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Search
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Family Mysteries</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            The questions we are still working to answer.
          </span>
        </button>

        <button
          type="button"
          data-ocid="family_history_hub.timeline_option"
          onClick={onOpenTimeline}
          className="hub-option hub-accent-history"
        >
          <span className="hub-option-head">
            <span className="hub-option-icon">
              <Clock3
                className="h-5 w-5"
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </span>
            <span className="hub-option-title">Travel Through Time</span>
            <span className="hub-option-arrow" aria-hidden="true">
              →
            </span>
          </span>
          <span className="hub-option-desc">
            Our family's journey across the years.
          </span>
        </button>
      </div>
    </div>
  );
}

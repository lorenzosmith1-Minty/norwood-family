import { Clock3 } from "lucide-react";
import { DomainEmptyState } from "../components/DomainEmptyState";
import { EraSection } from "../components/EraSection";
import { TimelineEventCard } from "../components/TimelineEventCard";
import { useTimelineEvents } from "../hooks/useFamilyHistory";
import type { TimelineEvent } from "../types/family-history";

interface TimelinePageProps {
  /** Navigates back to the home screen. */
  onBack: () => void;
  /** Opens a person's profile (used for Person link targets). */
  onOpenProfile?: (id: string) => void;
  /** Opens a story (used for Story link targets). */
  onOpenStory?: (id: bigint) => void;
  /** Opens an archive item (used for ArchiveItem link targets). */
  onOpenArchiveItem?: (id: bigint) => void;
  /** Opens a mystery (used for Mystery link targets). */
  onOpenMystery?: (id: bigint) => void;
}

interface EraRange {
  key: string;
  label: string;
  years: string;
  min: number | null;
  max: number | null;
}

/**
 * Chronological era buckets. Only eras that actually contain events are
 * rendered — empty eras are never fabricated. Events without a year fall into
 * the trailing "Undated" bucket so no stored data is dropped.
 */
const ERA_RANGES: EraRange[] = [
  {
    key: "1800s",
    label: "The 1800s",
    years: "1800–1899",
    min: 1800,
    max: 1899,
  },
  {
    key: "early-1900s",
    label: "Early 1900s",
    years: "1900–1929",
    min: 1900,
    max: 1929,
  },
  {
    key: "mid-century",
    label: "Mid-Century",
    years: "1930–1959",
    min: 1930,
    max: 1959,
  },
  {
    key: "late-1900s",
    label: "Late 1900s",
    years: "1960–1989",
    min: 1960,
    max: 1989,
  },
  {
    key: "modern",
    label: "Modern Era",
    years: "1990–Present",
    min: 1990,
    max: null,
  },
  {
    key: "undated",
    label: "Undated",
    years: "Dates unknown",
    min: null,
    max: null,
  },
];

function eventYear(event: TimelineEvent): number | null {
  return event.year == null ? null : Number(event.year);
}

function eraForEvent(event: TimelineEvent): EraRange {
  const year = eventYear(event);
  if (year == null) return ERA_RANGES[ERA_RANGES.length - 1];
  return (
    ERA_RANGES.find(
      (era) =>
        era.min != null &&
        year >= era.min &&
        (era.max == null || year <= era.max),
    ) ?? ERA_RANGES[ERA_RANGES.length - 1]
  );
}

function groupByEra(events: TimelineEvent[]): {
  era: EraRange;
  events: TimelineEvent[];
}[] {
  const groups = new Map<string, TimelineEvent[]>();
  for (const event of events) {
    const era = eraForEvent(event);
    const list = groups.get(era.key) ?? [];
    list.push(event);
    groups.set(era.key, list);
  }
  return ERA_RANGES.filter((era) => groups.has(era.key)).map((era) => ({
    era,
    events: (groups.get(era.key) ?? []).sort((a, b) => {
      const ay = eventYear(a) ?? Number.MAX_SAFE_INTEGER;
      const by = eventYear(b) ?? Number.MAX_SAFE_INTEGER;
      return ay - by;
    }),
  }));
}

function TimelineLoadingState() {
  return (
    <div data-ocid="timeline.loading_state" className="flex flex-col gap-4">
      {Array.from({ length: 3 }, (_, i) => `era-skeleton-${i}`).map((id) => (
        <div key={id} className="era-section">
          <div className="flex items-center gap-2.5">
            <div className="h-2.5 w-2.5 animate-pulse rounded-full bg-muted" />
            <div className="h-5 w-40 animate-pulse rounded-full bg-muted" />
          </div>
          <div className="timeline-rail">
            {Array.from({ length: 2 }, (_, j) => `item-skeleton-${j}`).map(
              (itemId) => (
                <div key={itemId} className="timeline-item">
                  <div className="h-3 w-24 animate-pulse rounded-full bg-muted" />
                  <div className="h-5 w-3/4 animate-pulse rounded-full bg-muted" />
                  <div className="h-4 w-full animate-pulse rounded-full bg-muted" />
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Travel Through Time: a chronological era/timeline browsing view (not a
 * family tree) built only from existing Timeline entries, Stories, Archive
 * items, and family-profile dates. Eras are generated dynamically from the
 * available data — empty eras are never fabricated.
 */
export function TimelinePage({
  onBack,
  onOpenProfile,
  onOpenStory,
  onOpenArchiveItem,
  onOpenMystery,
}: TimelinePageProps) {
  const {
    data: events = [],
    isLoading,
    isError,
    refetch,
  } = useTimelineEvents();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            Travel Through Time
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Our family's journey across the years.
          </p>
        </div>
        <button
          type="button"
          data-ocid="timeline.back_button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Back
        </button>
      </div>

      {isLoading ? (
        <TimelineLoadingState />
      ) : isError ? (
        <div
          data-ocid="timeline.error_state"
          className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border/70 px-6 py-16 text-center"
        >
          <p className="text-sm text-muted-foreground">
            We couldn't load the family timeline right now.
          </p>
          <button
            type="button"
            data-ocid="timeline.retry_button"
            onClick={() => void refetch()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Try again
          </button>
        </div>
      ) : events.length === 0 ? (
        <DomainEmptyState
          icon={Clock3}
          title="Your timeline is just beginning"
          hint="As family dates, stories, and records are added, your timeline will grow."
        />
      ) : (
        <div className="flex flex-col gap-5">
          {groupByEra(events).map(({ era, events: eraEvents }) => (
            <EraSection key={era.key} title={era.label} years={era.years}>
              {eraEvents.map((event) => (
                <TimelineEventCard
                  key={event.id}
                  event={event}
                  onOpenProfile={onOpenProfile}
                  onOpenStory={onOpenStory}
                  onOpenArchiveItem={onOpenArchiveItem}
                  onOpenMystery={onOpenMystery}
                />
              ))}
            </EraSection>
          ))}
        </div>
      )}
    </div>
  );
}

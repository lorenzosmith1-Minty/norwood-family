import type { ReactNode } from "react";
import type { TimelineEvent } from "../types/family-history";
import {
  TIMELINE_EVENT_TYPE_LABELS,
  getTimelineLinkId,
  getTimelineLinkKind,
} from "../types/family-history";
import { EvidenceBadge } from "./EvidenceBadge";
import { PersonLink } from "./PersonLink";

interface TimelineEventCardProps {
  /** The timeline event to render. */
  event: TimelineEvent;
  /** Opens a person's profile (used for Person link targets). */
  onOpenProfile?: (id: string) => void;
  /** Opens a story (used for Story link targets). */
  onOpenStory?: (id: bigint) => void;
  /** Opens an archive item (used for ArchiveItem link targets). */
  onOpenArchiveItem?: (id: bigint) => void;
  /** Opens a mystery (used for Mystery link targets). */
  onOpenMystery?: (id: bigint) => void;
}

/**
 * A single timeline event card in the Travel Through Time view. Shows the
 * event type label, title, description, year/date, and an evidence badge.
 * The card links back to its source content (Person Profile via PersonLink,
 * Story, Archive Item, or Mystery) based on the event's link target.
 */
export function TimelineEventCard({
  event,
  onOpenProfile,
  onOpenStory,
  onOpenArchiveItem,
  onOpenMystery,
}: TimelineEventCardProps) {
  const kind = getTimelineLinkKind(event.linkTarget);
  const id = getTimelineLinkId(event.linkTarget);
  const year = event.year == null ? null : Number(event.year);

  let link: ReactNode = null;
  if (kind === "Person" && typeof id === "string" && onOpenProfile) {
    link = <PersonLink personId={id} onOpenProfile={onOpenProfile} />;
  } else if (kind === "Story" && typeof id === "bigint" && onOpenStory) {
    link = (
      <button
        type="button"
        data-ocid="timeline.story_link"
        className="timeline-link"
        onClick={() => onOpenStory(id)}
      >
        View Story
      </button>
    );
  } else if (
    kind === "ArchiveItem" &&
    typeof id === "bigint" &&
    onOpenArchiveItem
  ) {
    link = (
      <button
        type="button"
        data-ocid="timeline.archive_link"
        className="timeline-link"
        onClick={() => onOpenArchiveItem(id)}
      >
        View Record
      </button>
    );
  } else if (kind === "Mystery" && typeof id === "bigint" && onOpenMystery) {
    link = (
      <button
        type="button"
        data-ocid="timeline.mystery_link"
        className="timeline-link"
        onClick={() => onOpenMystery(id)}
      >
        View Mystery
      </button>
    );
  }

  return (
    <article data-ocid="timeline_item" className="timeline-item">
      <div className="flex items-center justify-between gap-2">
        <span className="timeline-item-date">
          {year == null ? "Date unknown" : year}
        </span>
        <EvidenceBadge status={event.evidenceStatus} />
      </div>
      <h3 className="timeline-item-title">{event.title}</h3>
      <p className="timeline-item-detail">{event.description}</p>
      <div className="timeline-item-links">
        <span className="timeline-link">
          {TIMELINE_EVENT_TYPE_LABELS[event.eventType]}
        </span>
        {link}
      </div>
    </article>
  );
}

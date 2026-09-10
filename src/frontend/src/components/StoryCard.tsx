import type { Story } from "@/types/family-history";
import { EvidenceBadge } from "./EvidenceBadge";
import { PersonLink } from "./PersonLink";

interface StoryCardProps {
  story: Story;
  /** Opens the full story detail view. */
  onOpen: (id: bigint) => void;
  /** Navigates to a person's profile. When omitted, names render as plain chips. */
  onOpenProfile?: (id: string) => void;
}

/**
 * A story card in the Family Stories browse view: title, short preview,
 * related people (as PersonLink chips), era/date when available, and an
 * evidence badge. Uses the story-card utility classes from index.css. The
 * title is the click target that opens the detail view; person chips are
 * separate buttons so no interactive element is nested inside another.
 */
export function StoryCard({ story, onOpen, onOpenProfile }: StoryCardProps) {
  const eraLabel =
    story.era ?? (story.year !== undefined ? String(story.year) : null);

  return (
    <article data-ocid={`stories.card.${story.id}`} className="story-card">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          data-ocid={`stories.card.open.${story.id}`}
          onClick={() => onOpen(story.id)}
          className="story-card-title text-left hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {story.title}
        </button>
        <EvidenceBadge status={story.evidenceStatus} />
      </div>

      <p className="story-card-preview line-clamp-3">{story.storyText}</p>

      {story.relatedMemberIds.length > 0 && (
        <div className="story-card-meta">
          {story.relatedMemberIds.map((personId) =>
            onOpenProfile ? (
              <PersonLink
                key={personId}
                personId={personId}
                onOpenProfile={onOpenProfile}
              />
            ) : (
              <span key={personId} className="member-chip">
                {personId}
              </span>
            ),
          )}
        </div>
      )}

      {eraLabel && <span className="story-card-era">{eraLabel}</span>}
    </article>
  );
}

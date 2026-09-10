import type { Story } from "@/types/family-history";
import { ArrowLeft, Pencil } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { useNavbarIdentity } from "../hooks/useNavbarIdentity";
import { EvidenceBadge } from "./EvidenceBadge";
import { PersonLink } from "./PersonLink";

/** Converts a Motoko nanosecond timestamp to a short human date. */
function formatDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Shortens a contributor principal to a readable, copy-safe label. */
function formatContributor(contributor: Story["contributor"]): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

interface StoryDetailProps {
  story: Story;
  onBack: () => void;
  /** Navigates to a person's profile. When omitted, names render as plain chips. */
  onOpenProfile?: (id: string) => void;
  /** True when the caller is a Family Steward (shows edit controls). */
  isSteward: boolean;
  /** Opens the edit form for a canonical story (steward-only). */
  onEdit: (story: Story) => void;
}

/**
 * Full story detail view showing every story field: title, full text, related
 * family members (as PersonLink to their profiles), approximate date/era,
 * location, contributor (display name, never a raw account id), evidence
 * status badge, related Archive items, and created/updated dates. Stewards see
 * edit controls that are hidden from non-stewards.
 */
export function StoryDetail({
  story,
  onBack,
  onOpenProfile,
  isSteward,
  onEdit,
}: StoryDetailProps) {
  const { accountId } = useAuth();
  const { displayName } = useNavbarIdentity();
  const contributorText =
    accountId && story.contributor.toText() === accountId
      ? displayName || "You"
      : formatContributor(story.contributor);
  const eraLabel =
    story.era ?? (story.year !== undefined ? String(story.year) : null);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between gap-3">
        <button
          type="button"
          data-ocid="stories.detail.back_button"
          onClick={onBack}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to Stories
        </button>
        {isSteward && (
          <button
            type="button"
            data-ocid="stories.detail.edit_button"
            onClick={() => onEdit(story)}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            Edit Story
          </button>
        )}
      </div>

      <div className="story-detail">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {story.title}
          </h1>
          <EvidenceBadge status={story.evidenceStatus} />
        </div>

        <div className="story-evidence-legend">
          <span className="story-evidence-legend-label">Evidence</span>
          <EvidenceBadge status={story.evidenceStatus} />
          <span className="text-xs text-muted-foreground">
            {story.evidenceStatus === "Documented"
              ? "Supported by records."
              : "Family history or memory — not documented fact."}
          </span>
        </div>

        <p className="story-detail-body">{story.storyText}</p>

        <div className="rounded-xl border border-border/60 bg-card p-5">
          <div className="archive-detail-meta-row">
            <span className="meta-label">Related family members</span>
            <div className="flex flex-wrap justify-end gap-1.5">
              {story.relatedMemberIds.length > 0 ? (
                story.relatedMemberIds.map((personId) =>
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
                )
              ) : (
                <span className="meta-value text-muted-foreground">None</span>
              )}
            </div>
          </div>

          {eraLabel && (
            <div className="archive-detail-meta-row">
              <span className="meta-label">Era / date</span>
              <span className="meta-value">{eraLabel}</span>
            </div>
          )}

          {story.location && (
            <div className="archive-detail-meta-row">
              <span className="meta-label">Location</span>
              <span className="meta-value">{story.location}</span>
            </div>
          )}

          <div className="archive-detail-meta-row">
            <span className="meta-label">Contributor</span>
            <span className="meta-value">{contributorText}</span>
          </div>

          {story.relatedArchiveItemIds.length > 0 && (
            <div className="archive-detail-meta-row">
              <span className="meta-label">Related Archive items</span>
              <span className="meta-value">
                {story.relatedArchiveItemIds.length} item
                {story.relatedArchiveItemIds.length === 1 ? "" : "s"}
              </span>
            </div>
          )}

          <div className="archive-detail-meta-row">
            <span className="meta-label">Added</span>
            <span className="meta-value">{formatDate(story.createdAt)}</span>
          </div>

          <div className="archive-detail-meta-row">
            <span className="meta-label">Updated</span>
            <span className="meta-value">{formatDate(story.updatedAt)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

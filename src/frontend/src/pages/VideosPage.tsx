import {
  AudioLines,
  Clapperboard,
  Film,
  Mic,
  Play,
  Plus,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useApprovedMediaItems } from "../hooks/useArchiveStorage";
import type { ArchiveItem, MediaKind } from "../types/archive";
import { MEDIA_KIND_FILTERS, getMediaKind } from "../types/archive";
import { profiles } from "./PersonProfilePage";

interface VideosPageProps {
  /** Navigates back to the Family Archive (the primary navigation parent). */
  onBack: () => void;
  /** Opens a media item's detail view. */
  onOpenMediaItem: (id: bigint) => void;
  /** Navigates to the add-media flow. */
  onAddMedia: () => void;
}

/** Extracts initials from a person's name for the avatar chip. */
function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

/** Resolves a related member's display name from the static profile record. */
function memberName(id: string): string {
  return profiles[id]?.name ?? id;
}

/** The category badge label + modifier class for a media item. */
function categoryFor(item: ArchiveItem): {
  label: string;
  badgeClass: string;
} {
  const kind = getMediaKind(item);
  if (kind === "audio-only-oral-history") {
    return { label: "Audio", badgeClass: "badge-audio" };
  }
  if (kind === "oral-history-video") {
    return { label: "Oral History", badgeClass: "badge-oral-history" };
  }
  return { label: "Video", badgeClass: "badge-video" };
}

/** The era / year label shown on a media card. */
function eraLabel(item: ArchiveItem): string {
  if (item.era) return item.era;
  if (item.year !== undefined) return item.year.toString();
  return "Undated";
}

interface MediaCardProps {
  item: ArchiveItem;
  position: number;
  featured?: boolean;
  onOpen: () => void;
}

/**
 * A single media card in the Family Videos & Oral History library: a dark
 * media stage with a play overlay, a category badge, the serif title, the
 * primary speaker (for oral history) or contributor, and the era.
 */
function MediaCard({ item, position, featured, onOpen }: MediaCardProps) {
  const kind = getMediaKind(item);
  const category = categoryFor(item);
  const isAudio = kind === "audio-only-oral-history";
  const speaker = item.primarySpeaker;
  const relatedMembers = item.relatedMemberIds
    .slice(0, featured ? 3 : 2)
    .map(memberName);

  return (
    <button
      type="button"
      data-ocid={`videos.card.${position}`}
      onClick={onOpen}
      className="archive-card group text-left"
    >
      {/* Media stage: dark backdrop with a play overlay */}
      <div
        className={`relative w-full overflow-hidden ${
          featured ? "aspect-video" : "aspect-[4/3]"
        }`}
        style={{
          backgroundColor: "oklch(var(--media-stage))",
          color: "oklch(var(--media-stage-muted))",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          {isAudio ? (
            <AudioLines
              className={featured ? "h-16 w-16" : "h-10 w-10"}
              strokeWidth={1.25}
              aria-hidden="true"
            />
          ) : (
            <Film
              className={featured ? "h-16 w-16" : "h-10 w-10"}
              strokeWidth={1.25}
              aria-hidden="true"
            />
          )}
        </div>
        {/* Play overlay */}
        <div
          className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{
            backgroundColor: "oklch(var(--media-overlay))",
            opacity: 0.9,
          }}
        >
          <span
            className="flex items-center justify-center rounded-full"
            style={{
              backgroundColor: "oklch(var(--oral-history-foreground) / 0.9)",
              color: "oklch(var(--oral-history))",
              boxShadow: "0 0 0 2px oklch(var(--oral-history) / 0.5)",
              width: featured ? "4rem" : "3rem",
              height: featured ? "4rem" : "3rem",
            }}
          >
            <Play
              className={featured ? "h-6 w-6" : "h-5 w-5"}
              fill="currentColor"
              aria-hidden="true"
            />
          </span>
        </div>
        {/* Category badge */}
        <span
          className={`archive-type-badge absolute left-3 top-3 ${category.badgeClass}`}
          data-ocid={`videos.card.${position}.category_badge`}
        >
          {category.label}
        </span>
      </div>

      <div className="archive-card-body">
        <h3
          className={`archive-card-title line-clamp-2 ${
            featured ? "text-xl" : ""
          }`}
        >
          {item.title}
        </h3>

        {/* Speaker (oral history) or contributor */}
        <div className="archive-card-meta">
          {speaker ? (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-bold"
                style={{
                  backgroundColor: "oklch(var(--speaker-accent))",
                  color: "oklch(var(--speaker-accent-foreground))",
                }}
                aria-hidden="true"
              >
                {getInitials(speaker.name)}
              </span>
              <span className="contributor">{speaker.name}</span>
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5">
              <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="contributor">Family video</span>
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span>{eraLabel(item)}</span>
        </div>

        {/* Related family members */}
        {relatedMembers.length > 0 ? (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {relatedMembers.map((name) => (
              <span key={name} className="member-chip">
                <span className="member-avatar" aria-hidden="true">
                  {getInitials(name)}
                </span>
                {name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

/**
 * Family Videos & Oral History: a dedicated library of the family's moving
 * memories and spoken stories. Lists approved media (uploaded video,
 * oral-history video, and audio-only oral history) with media-kind and speaker
 * filters, a featured card, and a responsive grid. Reached from the Family
 * Archive — never a permanent top-level navbar pill.
 */
export function VideosPage({
  onBack,
  onAddMedia,
  onOpenMediaItem,
}: VideosPageProps) {
  const { data: items = [], isLoading } = useApprovedMediaItems();
  const [kindFilter, setKindFilter] = useState<MediaKind | "all">("all");
  const [speakerOnly, setSpeakerOnly] = useState(false);

  // Newest first, then apply the media-kind and speaker filters.
  const filtered = useMemo(() => {
    const sorted = [...items].sort((a, b) =>
      a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
    );
    return sorted
      .filter(
        (item) => kindFilter === "all" || getMediaKind(item) === kindFilter,
      )
      .filter((item) => !speakerOnly || Boolean(item.primarySpeaker));
  }, [items, kindFilter, speakerOnly]);

  const hasActiveFilters = kindFilter !== "all" || speakerOnly;
  const resetFilters = () => {
    setKindFilter("all");
    setSpeakerOnly(false);
  };

  const featured = filtered[0];
  const rest = filtered.slice(1);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      {/* Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          data-ocid="videos.back_button"
          onClick={onBack}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">←</span> Back to Archive
        </button>
        <button
          type="button"
          data-ocid="videos.add_button"
          onClick={onAddMedia}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-primary-foreground transition-shadow hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ backgroundColor: "oklch(var(--primary))" }}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Video
        </button>
      </div>

      <header className="mb-6">
        <div
          className="mb-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em]"
          style={{
            backgroundColor: "oklch(var(--oral-history) / 0.14)",
            color: "oklch(var(--oral-history))",
          }}
        >
          <Clapperboard className="h-3.5 w-3.5" aria-hidden="true" />
          Family Archive
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Family Videos &amp; Oral History
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Preserve the family&apos;s moving memories — home videos and the
          spoken stories of the people who lived them.
        </p>
      </header>

      {/* Filter chip bar */}
      <fieldset className="filter-bar">
        <legend className="sr-only">Filter media</legend>
        {MEDIA_KIND_FILTERS.map((filter) => (
          <button
            key={filter.value}
            type="button"
            data-ocid={`videos.filter.${filter.value}`}
            aria-pressed={kindFilter === filter.value}
            onClick={() => setKindFilter(filter.value)}
            className={`filter-tab ${
              kindFilter === filter.value ? "filter-tab-active" : ""
            }`}
          >
            {filter.label}
          </button>
        ))}
        <button
          type="button"
          data-ocid="videos.filter.speaker"
          aria-pressed={speakerOnly}
          onClick={() => setSpeakerOnly((v) => !v)}
          className={`filter-tab ${speakerOnly ? "filter-tab-active" : ""}`}
        >
          <Mic className="h-3.5 w-3.5" aria-hidden="true" />
          Speaker
        </button>
      </fieldset>

      <div className="mt-6">
        {isLoading ? (
          <div
            data-ocid="videos.loading_state"
            className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
            aria-label="Loading media"
          >
            {Array.from({ length: 6 }, (_, i) => `skeleton-${i}`).map((id) => (
              <div
                key={id}
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
          <div data-ocid="videos.empty_state" className="archive-empty">
            <div
              className="flex h-14 w-14 items-center justify-center rounded-full"
              style={{
                backgroundColor: "oklch(var(--oral-history) / 0.14)",
                color: "oklch(var(--oral-history))",
                boxShadow: "0 0 0 2px oklch(var(--oral-history) / 0.4)",
              }}
            >
              {hasActiveFilters ? (
                <Mic className="h-6 w-6" aria-hidden="true" />
              ) : (
                <Clapperboard className="h-6 w-6" aria-hidden="true" />
              )}
            </div>
            <h2 className="archive-empty-title">
              {hasActiveFilters
                ? "No media match these filters"
                : "No videos or oral histories yet"}
            </h2>
            <p className="archive-empty-hint">
              {hasActiveFilters
                ? "Try adjusting or clearing the filters to see more of the family's media."
                : "Add a home video or record a family member's story to begin preserving the family's moving memories."}
            </p>
            {hasActiveFilters ? (
              <button
                type="button"
                data-ocid="videos.reset_filters_button"
                onClick={resetFilters}
                className="archive-empty-reset"
              >
                Clear filters
              </button>
            ) : (
              <button
                type="button"
                data-ocid="videos.empty_add_button"
                onClick={onAddMedia}
                className="archive-empty-reset"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Add Video
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {/* Featured card */}
            {featured ? (
              <section aria-label="Featured media">
                <MediaCard
                  item={featured}
                  position={1}
                  featured
                  onOpen={() => onOpenMediaItem(featured.id)}
                />
              </section>
            ) : null}

            {/* Remaining grid */}
            {rest.length > 0 ? (
              <ul
                data-ocid="videos.list"
                className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3"
              >
                {rest.map((item, index) => (
                  <li key={item.id.toString()}>
                    <MediaCard
                      item={item}
                      position={index + 2}
                      onOpen={() => onOpenMediaItem(item.id)}
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

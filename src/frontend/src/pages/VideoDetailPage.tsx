import {
  ArrowLeft,
  CalendarDays,
  Clapperboard,
  Mic,
  ShieldCheck,
} from "lucide-react";
import { useApprovedMediaItems } from "../hooks/useArchiveStorage";
import type { ArchiveItem } from "../types/archive";
import {
  ARCHIVE_ITEM_CLASSIFICATION_LABELS,
  ARCHIVE_ITEM_STATUS_LABELS,
  ARCHIVE_ITEM_STATUS_PILL,
  ArchiveItemClassification,
  MEDIA_KIND_LABELS,
  PRIVACY_LEVEL_LABELS,
  getArchiveItemYear,
  getMediaKind,
} from "../types/archive";
import { profiles } from "./PersonProfilePage";

interface VideoDetailPageProps {
  /** The media item id to display. */
  itemId: bigint;
  /** Navigates back to the Family Videos & Oral History page. */
  onBack: () => void;
  /** Opens a person's profile (e.g. the primary speaker). */
  onOpenProfile: (personId: string) => void;
}

/** Renders the embedded player for the item's media kind. */
function MediaPlayer({ item }: { item: ArchiveItem }) {
  const kind = getMediaKind(item);
  const url = item.blob.getDirectURL();

  if (kind === "audio-only-oral-history") {
    return (
      <div className="media-player-frame">
        <div className="frame-mark">
          <Mic className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="frame-title">Audio-only Oral History</p>
        <audio controls src={url} className="w-full max-w-md">
          <track kind="captions" />
          Your browser does not support the audio tag.
        </audio>
      </div>
    );
  }

  return (
    <video controls src={url} className="w-full">
      <track kind="captions" />
      Your browser does not support the video tag.
    </video>
  );
}

/**
 * Family Videos & Oral History media detail view. This is the single canonical
 * detail view for every media item — every profile link and card routes here,
 * so there are no per-profile duplicates. It embeds the player (video for video
 * kinds, audio for audio-only oral history) and shows the title, description,
 * speaker (for Oral History items), related family members, era/year, and
 * privacy/approval status.
 */
export function VideoDetailPage({
  itemId,
  onBack,
  onOpenProfile,
}: VideoDetailPageProps) {
  const { data: items = [] } = useApprovedMediaItems();
  const item = items.find((i) => i.id === itemId);

  if (!item) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <button
          type="button"
          data-ocid="video_detail.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Videos
        </button>
        <div data-ocid="video_detail.empty_state" className="media-empty">
          <div className="media-empty-mark">
            <Clapperboard className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="media-empty-title">Media not found</h1>
          <p className="media-empty-hint">
            This video or oral history is no longer available.
          </p>
        </div>
      </div>
    );
  }

  const kind = getMediaKind(item);
  const isOralHistory =
    item.classification === ArchiveItemClassification.OralHistory;
  const speaker = item.primarySpeaker;
  const speakerProfile = speaker?.personId
    ? profiles[speaker.personId]
    : undefined;
  const relatedMembers = item.relatedMemberIds
    .map((id) => profiles[id])
    .filter((profile) => Boolean(profile));
  const year = getArchiveItemYear(item);
  const statusPill = ARCHIVE_ITEM_STATUS_PILL[item.status];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <button
        type="button"
        data-ocid="video_detail.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Videos
      </button>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          {isOralHistory ? (
            <span className="oral-history-badge">
              {ARCHIVE_ITEM_CLASSIFICATION_LABELS[item.classification]}
            </span>
          ) : (
            <span className="archive-type-badge badge-video">
              {MEDIA_KIND_LABELS[kind ?? "uploaded-video"]}
            </span>
          )}
          <span className={`status-pill ${statusPill}`}>
            {ARCHIVE_ITEM_STATUS_LABELS[item.status]}
          </span>
          {item.era ? (
            <span className="text-xs font-medium text-muted-foreground">
              {item.era}
            </span>
          ) : null}
        </div>
        <h1 className="mt-3 font-display text-3xl font-semibold text-foreground">
          {item.title}
        </h1>
        <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {year !== null ? String(year) : "Year unknown"}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            {PRIVACY_LEVEL_LABELS[item.privacyLevel]}
          </span>
        </p>
      </header>

      <div className="media-detail">
        {/* Left column: the embedded player */}
        <div className="min-w-0">
          <div data-ocid="video_detail.player" className="media-player">
            <MediaPlayer item={item} />
          </div>

          {item.description ? (
            <section className="archive-detail-section mt-6">
              <h2 className="archive-detail-section-title">Description</h2>
              <p className="archive-detail-description whitespace-pre-line">
                {item.description}
              </p>
            </section>
          ) : null}
        </div>

        {/* Right column: speaker, related members, metadata */}
        <div className="flex min-w-0 flex-col gap-6">
          {isOralHistory && speaker ? (
            <section className="archive-detail-section">
              <h2 className="archive-detail-section-title">Speaker</h2>
              {speakerProfile ? (
                <button
                  type="button"
                  data-ocid={`video_detail.speaker.${speakerProfile.id}`}
                  onClick={() => onOpenProfile(speakerProfile.id)}
                  className="speaker-card w-full text-left transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <span className="speaker-card-portrait" aria-hidden="true">
                    {speakerProfile.name.charAt(0)}
                  </span>
                  <span className="speaker-card-body">
                    <span className="speaker-card-name">
                      {speakerProfile.name}
                    </span>
                    <span className="speaker-card-role">
                      {speakerProfile.role}
                    </span>
                  </span>
                </button>
              ) : (
                <div className="speaker-card">
                  <span className="speaker-card-portrait" aria-hidden="true">
                    {speaker.name.charAt(0)}
                  </span>
                  <span className="speaker-card-body">
                    <span className="speaker-card-name">{speaker.name}</span>
                    <span className="speaker-card-role">Primary speaker</span>
                  </span>
                </div>
              )}
            </section>
          ) : null}

          {relatedMembers.length > 0 ? (
            <section className="archive-detail-section">
              <h2 className="archive-detail-section-title">
                Related family members
              </h2>
              <div className="flex flex-wrap gap-2">
                {relatedMembers.map((profile) => (
                  <button
                    key={profile.id}
                    type="button"
                    data-ocid={`video_detail.member.${profile.id}`}
                    onClick={() => onOpenProfile(profile.id)}
                    className="member-chip transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  >
                    <span className="member-avatar" aria-hidden="true">
                      {profile.name.charAt(0)}
                    </span>
                    {profile.name}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <section className="archive-detail-section">
            <h2 className="archive-detail-section-title">Details</h2>
            <div className="archive-detail-meta-row">
              <span className="meta-label">Type</span>
              <span className="meta-value">
                {MEDIA_KIND_LABELS[kind ?? "uploaded-video"]}
              </span>
            </div>
            {isOralHistory && speaker ? (
              <div className="archive-detail-meta-row">
                <span className="meta-label">Speaker</span>
                <span className="meta-value">{speaker.name}</span>
              </div>
            ) : null}
            <div className="archive-detail-meta-row">
              <span className="meta-label">Era</span>
              <span className="meta-value">
                {item.era || (year !== null ? String(year) : "Unknown")}
              </span>
            </div>
            <div className="archive-detail-meta-row">
              <span className="meta-label">Privacy</span>
              <span className="meta-value">
                {PRIVACY_LEVEL_LABELS[item.privacyLevel]}
              </span>
            </div>
            <div className="archive-detail-meta-row">
              <span className="meta-label">Status</span>
              <span className="meta-value">
                {ARCHIVE_ITEM_STATUS_LABELS[item.status]}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

import {
  ArrowLeft,
  AudioLines,
  CalendarDays,
  ExternalLink,
  FileText,
  Image,
  Landmark,
  type LucideIcon,
  NotebookPen,
  ScrollText,
  Tag,
  User,
  Video,
} from "lucide-react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import type { ArchiveItem } from "../types/archive";
import {
  ARCHIVE_ITEM_TYPE_BADGE,
  ARCHIVE_ITEM_TYPE_LABELS,
  ArchiveItemType,
  SOURCE_STATUS_LABELS,
  SourceStatus,
} from "../types/archive";
import { profiles } from "./PersonProfilePage";

const TYPE_ICONS: Record<ArchiveItemType, LucideIcon> = {
  [ArchiveItemType.Photo]: Image,
  [ArchiveItemType.Document]: FileText,
  [ArchiveItemType.Audio]: AudioLines,
  [ArchiveItemType.Video]: Video,
  [ArchiveItemType.WrittenStoryNote]: NotebookPen,
  [ArchiveItemType.Research]: ScrollText,
  [ArchiveItemType.WorkBusiness]: Landmark,
  [ArchiveItemType.Other]: FileText,
};

/** Source-status modifier class (from index.css) for each evidence status. */
const SOURCE_STATUS_CLASS: Record<SourceStatus, string> = {
  [SourceStatus.Original]: "source-primary",
  [SourceStatus.Copy]: "source-copy",
  [SourceStatus.Transcribed]: "source-inferred",
  [SourceStatus.Unverified]: "source-unverified",
};

/** Text-based item types whose original content is the description itself. */
const TEXT_TYPES: ArchiveItemType[] = [
  ArchiveItemType.WrittenStoryNote,
  ArchiveItemType.Research,
  ArchiveItemType.WorkBusiness,
  ArchiveItemType.Other,
];

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
function formatContributor(contributor: ArchiveItem["contributor"]): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

interface ArchiveDetailPageProps {
  itemId: bigint;
  onBack: () => void;
  onOpenProfile: (id: string) => void;
}

/**
 * Archive detail page: shows the full record for one approved item in a
 * two-column layout and preserves access to the original uploaded artifact,
 * which is always displayed as-is and never altered or replaced.
 */
export function ArchiveDetailPage({
  itemId,
  onBack,
  onOpenProfile,
}: ArchiveDetailPageProps) {
  const { data: items = [] } = useApprovedArchiveItems();
  const item = items.find((i) => i.id === itemId);

  if (!item) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <button
          type="button"
          data-ocid="archive_detail.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Archive
        </button>
        <div data-ocid="archive_detail.empty_state" className="archive-empty">
          <h1 className="archive-empty-title">Item not found</h1>
          <p className="archive-empty-hint">
            This archive item is no longer available.
          </p>
        </div>
      </div>
    );
  }

  const typeBadge = ARCHIVE_ITEM_TYPE_BADGE[item.itemType];
  const Icon = TYPE_ICONS[item.itemType];
  const relatedMembers = item.relatedMemberIds
    .map((id) => profiles[id])
    .filter((profile) => Boolean(profile));
  const isTextType = TEXT_TYPES.includes(item.itemType);
  const artifactUrl = item.blob.getDirectURL();
  const filename = item.blob.filename;

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <button
        type="button"
        data-ocid="archive_detail.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to Archive
      </button>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`archive-type-badge ${typeBadge}`}>
            {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
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
            <User className="h-4 w-4" aria-hidden="true" />
            Contributed by {formatContributor(item.contributor)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            {formatDate(item.createdAt)}
          </span>
        </p>
      </header>

      <div className="archive-detail">
        {/* Left column: the original artifact, displayed as-is */}
        <div className="min-w-0">
          <div data-ocid="archive_detail.artifact" className="artifact-viewer">
            {item.itemType === ArchiveItemType.Photo ? (
              <img
                src={artifactUrl}
                alt={item.title}
                className="max-h-[32rem] w-full object-contain"
              />
            ) : item.itemType === ArchiveItemType.Video ? (
              <video
                controls
                src={artifactUrl}
                className="max-h-[32rem] w-full"
              >
                <track kind="captions" />
                Your browser does not support the video tag.
              </video>
            ) : item.itemType === ArchiveItemType.Audio ? (
              <div className="artifact-viewer-frame flex-col gap-3 p-6">
                <AudioLines
                  className="h-12 w-12 text-muted-foreground"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <p className="font-display text-lg font-semibold text-foreground">
                  {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
                </p>
                <audio controls src={artifactUrl} className="w-full max-w-md">
                  <track kind="captions" />
                  Your browser does not support the audio tag.
                </audio>
              </div>
            ) : isTextType ? (
              <div className="artifact-viewer-frame flex-col gap-3 p-6">
                <Icon
                  className="h-12 w-12 text-muted-foreground"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <p className="font-display text-lg font-semibold text-foreground">
                  {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
                </p>
                <p className="max-w-md text-sm text-muted-foreground">
                  The original written content is preserved below, exactly as it
                  was contributed.
                </p>
              </div>
            ) : (
              /* Document view: icon + filename + open-original link */
              <div className="artifact-viewer-frame flex-col gap-3 p-6">
                <Icon
                  className="h-12 w-12 text-muted-foreground"
                  strokeWidth={1.25}
                  aria-hidden="true"
                />
                <p className="font-display text-lg font-semibold text-foreground">
                  {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
                </p>
                {filename ? (
                  <p className="max-w-md truncate text-sm text-muted-foreground">
                    {filename}
                  </p>
                ) : null}
                <a
                  href={artifactUrl}
                  target="_blank"
                  rel="noreferrer"
                  data-ocid="archive_detail.open_original"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  Open original
                </a>
              </div>
            )}
          </div>

          {/* Text-based types: the original content is the description */}
          {isTextType && item.description ? (
            <section className="archive-detail-section mt-6">
              <h2 className="archive-detail-section-title">Original content</h2>
              <p className="archive-detail-description whitespace-pre-line">
                {item.description}
              </p>
            </section>
          ) : null}
        </div>

        {/* Right column: metadata, tags, source, related members */}
        <div className="flex min-w-0 flex-col gap-6">
          {item.description && !isTextType ? (
            <section className="archive-detail-section">
              <h2 className="archive-detail-section-title">Description</h2>
              <p className="archive-detail-description whitespace-pre-line">
                {item.description}
              </p>
            </section>
          ) : null}

          {item.tags.length > 0 ? (
            <section className="archive-detail-section">
              <h2 className="archive-detail-section-title">Tags</h2>
              <div className="flex flex-wrap gap-1.5">
                {item.tags.map((tag) => (
                  <span key={tag} className="tag-chip">
                    <Tag className="h-3 w-3" aria-hidden="true" />
                    {tag}
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          <section className="archive-detail-section">
            <h2 className="archive-detail-section-title">
              Source &amp; evidence
            </h2>
            <span
              className={`source-status ${SOURCE_STATUS_CLASS[item.sourceStatus]}`}
            >
              {SOURCE_STATUS_LABELS[item.sourceStatus]}
            </span>
          </section>

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
                    data-ocid={`archive_detail.member.${profile.id}`}
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
        </div>
      </div>
    </div>
  );
}

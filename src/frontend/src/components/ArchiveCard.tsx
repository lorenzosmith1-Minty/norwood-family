import {
  AudioLines,
  FileText,
  Image,
  Landmark,
  type LucideIcon,
  NotebookPen,
  ScrollText,
  Video,
} from "lucide-react";
import { profiles } from "../pages/PersonProfilePage";
import type { ArchiveItem } from "../types/archive";
import {
  ARCHIVE_ITEM_TYPE_BADGE,
  ARCHIVE_ITEM_TYPE_LABELS,
  ArchiveItemType,
} from "../types/archive";

/** Type-appropriate icon shown in the card thumbnail for non-photo items. */
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

/** Shortens a contributor principal to a readable, copy-safe label. */
function formatContributor(contributor: ArchiveItem["contributor"]): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/** Extracts initials from a family member's name for the avatar chip. */
function getInitials(name: string): string {
  const parts = name
    .split(/\s+/)
    .filter((part) => part.length > 0 && /[A-Za-z]/.test(part.charAt(0)));
  const first = parts[0]?.charAt(0) ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : "";
  return (first + last).toUpperCase();
}

interface ArchiveCardProps {
  item: ArchiveItem;
  /** Zero-based position in the list, used for deterministic test markers. */
  index: number;
  /** Opens the archive detail page for this item. */
  onOpen: () => void;
}

/**
 * A single archive item card in the browsing grid: a photo thumbnail (via the
 * original artifact's direct URL) or a type-appropriate icon, a type badge,
 * date/era, contributor, and related family member chips.
 */
export function ArchiveCard({ item, index, onOpen }: ArchiveCardProps) {
  const position = index + 1;
  const typeBadge = ARCHIVE_ITEM_TYPE_BADGE[item.itemType];
  const Icon = TYPE_ICONS[item.itemType];
  const relatedMembers = item.relatedMemberIds
    .map((id) => profiles[id])
    .filter((profile) => Boolean(profile));
  const dateLabel =
    item.era || (item.year !== undefined ? item.year.toString() : null);

  return (
    <button
      type="button"
      data-ocid={`archive.card.${position}`}
      onClick={onOpen}
      className="archive-card group"
    >
      {/* Thumbnail: photo preview for photos, type icon otherwise */}
      <div className="archive-card-thumb">
        {item.itemType === ArchiveItemType.Photo ? (
          <img src={item.blob.getDirectURL()} alt={item.title} loading="lazy" />
        ) : (
          <div className="archive-card-icon">
            <Icon className="h-10 w-10" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
      </div>

      <div className="archive-card-body">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={`archive-type-badge ${typeBadge}`}
            data-ocid={`archive.card.${position}.type_badge`}
          >
            {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
          </span>
          {dateLabel ? (
            <span className="text-xs font-medium text-muted-foreground">
              {dateLabel}
            </span>
          ) : null}
        </div>

        <h3 className="archive-card-title line-clamp-2">{item.title}</h3>

        <p className="archive-card-meta">
          <span className="contributor">
            {formatContributor(item.contributor)}
          </span>
          <span aria-hidden="true">·</span>
          <span>contributed</span>
        </p>

        {relatedMembers.length > 0 ? (
          <div className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
            {relatedMembers.map((profile) => (
              <span key={profile.id} className="member-chip">
                <span className="member-avatar" aria-hidden="true">
                  {getInitials(profile.name)}
                </span>
                {profile.name}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </button>
  );
}

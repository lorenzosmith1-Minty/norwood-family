import {
  ArchiveItemStatus,
  ArchiveItemType,
  PrivacyLevel,
  SourceStatus,
} from "@/backend";
import type { ArchiveItem as BackendArchiveItem } from "@/backend";

/**
 * Shared archive types mirroring the generated backend.d.ts contract, plus
 * friendly human labels and badge classes for the eight item types, source
 * statuses, privacy levels, and item statuses. Page tasks import these rather
 * than reaching into the generated bindings directly.
 */
export type ArchiveItem = BackendArchiveItem;
export { ArchiveItemType, ArchiveItemStatus, SourceStatus, PrivacyLevel };

/** Friendly labels for the eight archive item types. */
export const ARCHIVE_ITEM_TYPE_LABELS: Record<ArchiveItemType, string> = {
  [ArchiveItemType.Photo]: "Photo",
  [ArchiveItemType.Document]: "Document",
  [ArchiveItemType.Audio]: "Audio",
  [ArchiveItemType.Video]: "Video",
  [ArchiveItemType.WrittenStoryNote]: "Written Story or Note",
  [ArchiveItemType.Research]: "Research",
  [ArchiveItemType.WorkBusiness]: "Work or Business Material",
  [ArchiveItemType.Other]: "Other",
};

/**
 * Badge modifier class (from index.css) for each item type, used to tint the
 * archive-type-badge dot on the on-palette color per type.
 */
export const ARCHIVE_ITEM_TYPE_BADGE: Record<ArchiveItemType, string> = {
  [ArchiveItemType.Photo]: "badge-photo",
  [ArchiveItemType.Document]: "badge-document",
  [ArchiveItemType.Audio]: "badge-audio",
  [ArchiveItemType.Video]: "badge-video",
  [ArchiveItemType.WrittenStoryNote]: "badge-story",
  [ArchiveItemType.Research]: "badge-research",
  [ArchiveItemType.WorkBusiness]: "badge-work",
  [ArchiveItemType.Other]: "badge-other",
};

/** Friendly labels for source / evidence status. */
export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  [SourceStatus.Original]: "Original",
  [SourceStatus.Copy]: "Copy",
  [SourceStatus.Transcribed]: "Transcribed",
  [SourceStatus.Unverified]: "Unverified",
};

/** Friendly labels for privacy levels. */
export const PRIVACY_LEVEL_LABELS: Record<PrivacyLevel, string> = {
  [PrivacyLevel.Public]: "Public",
  [PrivacyLevel.FamilyOnly]: "Family Only",
  [PrivacyLevel.Private]: "Private",
};

/** Friendly labels for archive item status. */
export const ARCHIVE_ITEM_STATUS_LABELS: Record<ArchiveItemStatus, string> = {
  [ArchiveItemStatus.Pending]: "Pending",
  [ArchiveItemStatus.Approved]: "Approved",
  [ArchiveItemStatus.Rejected]: "Rejected",
};

/** Status pill modifier class (from index.css) for each item status. */
export const ARCHIVE_ITEM_STATUS_PILL: Record<ArchiveItemStatus, string> = {
  [ArchiveItemStatus.Pending]: "status-pending",
  [ArchiveItemStatus.Approved]: "status-approved",
  [ArchiveItemStatus.Rejected]: "status-rejected",
};

/** A single type-filter tab option for the archive browsing screen. */
export interface ArchiveTypeFilter {
  value: ArchiveItemType | "all";
  label: string;
}

/**
 * Type filter tabs for the archive browsing screen: "All" plus the eight item
 * types. The browsing page renders these as tabs and filters items by value.
 */
export const ARCHIVE_TYPE_FILTERS: ArchiveTypeFilter[] = [
  { value: "all", label: "All" },
  { value: ArchiveItemType.Photo, label: "Photos" },
  { value: ArchiveItemType.Document, label: "Documents" },
  { value: ArchiveItemType.Audio, label: "Audio" },
  { value: ArchiveItemType.Video, label: "Video" },
  { value: ArchiveItemType.WrittenStoryNote, label: "Stories/Notes" },
  { value: ArchiveItemType.Research, label: "Research" },
  { value: ArchiveItemType.WorkBusiness, label: "Work/Business" },
  { value: ArchiveItemType.Other, label: "Other" },
];

/** A single era/date-range filter option for the archive browsing screen. */
export interface EraOption {
  value: string;
  label: string;
  min: number | null;
  max: number | null;
}

/**
 * Era buckets used to filter the archive by date range. Items are classified
 * by their numeric year (see getArchiveItemYear); items with no year fall into
 * the "unknown" bucket and are excluded when a specific era is selected.
 */
export const ARCHIVE_ERAS: EraOption[] = [
  { value: "all", label: "All eras", min: null, max: null },
  { value: "pre-1900", label: "Before 1900", min: null, max: 1899 },
  { value: "1900s", label: "1900–1949", min: 1900, max: 1949 },
  { value: "1950s", label: "1950–1999", min: 1950, max: 1999 },
  { value: "2000s", label: "2000–present", min: 2000, max: null },
];

/**
 * Extracts a numeric year from an archive item: prefers the structured `year`
 * field, otherwise parses the first four-digit year found in the free-text
 * `era` string. Returns null when no year can be determined.
 */
export function getArchiveItemYear(item: ArchiveItem): number | null {
  if (item.year !== undefined && item.year !== null) {
    return Number(item.year);
  }
  const match = item.era.match(/\b(1[89]\d{2}|20\d{2})\b/);
  return match ? Number(match[1]) : null;
}

/**
 * Classifies an item into one of the ARCHIVE_ERAS buckets by its year, or
 * "unknown" when no year is available.
 */
export function getArchiveItemEra(item: ArchiveItem): string {
  const year = getArchiveItemYear(item);
  if (year === null) return "unknown";
  if (year < 1900) return "pre-1900";
  if (year < 1950) return "1900s";
  if (year < 2000) return "1950s";
  return "2000s";
}

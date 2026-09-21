import type { ExternalBlob } from "@caffeineai/object-storage";
import {
  ArrowLeft,
  AudioLines,
  CalendarDays,
  Download,
  Eye,
  FileText,
  Image,
  Landmark,
  type LucideIcon,
  NotebookPen,
  ScrollText,
  Tag,
  User,
  Video,
  X,
} from "lucide-react";
import { useState } from "react";
import { PdfPreview } from "../components/archive/PdfPreview";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import type { ArchiveItem } from "../types/archive";
import {
  ARCHIVE_ITEM_TYPE_BADGE,
  ARCHIVE_ITEM_TYPE_LABELS,
  ArchiveItemType,
  PRIVACY_LEVEL_BADGE,
  PRIVACY_LEVEL_LABELS,
  SOURCE_STATUS_LABELS,
  SourceStatus,
  getArchiveItemFilename,
  getArchiveItemMimeType,
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

/**
 * True when the document is a PDF. The persisted MIME type is authoritative:
 * when one is available it decides the classification outright, so a non-PDF
 * MIME type (e.g. text/html) is never routed to the PDF renderer merely
 * because the filename ends in ".pdf". The filename extension is consulted
 * only when no MIME type is available at all.
 */
function isPdfDocument(item: ArchiveItem): boolean {
  const mime = getArchiveItemMimeType(item);
  if (mime) return mime === "application/pdf";
  const name = getArchiveItemFilename(item)?.toLowerCase() ?? "";
  return name.endsWith(".pdf");
}

/**
 * Raster image MIME types that are safe to render inline as an <img>. SVG is
 * deliberately excluded: it is a scriptable document type that can execute
 * embedded scripts and same-origin requests when loaded as a top-level
 * document, so it is download-only.
 */
const SAFE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/bmp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "image/avif",
  "image/tiff",
]);

/** Raster image filename extensions, used only when the MIME type is absent. */
const SAFE_IMAGE_EXTENSIONS = /\.(jpe?g|png|gif|webp|bmp|ico|avif|tiff?)$/;

/**
 * True when the document is a raster image that can be rendered inline as an
 * <img>. Judged from the persisted MIME type (falling back to the ExternalBlob
 * metadata), and only when no MIME type is available at all from the filename
 * extension. SVG, HTML, XML, and every other scriptable or unknown type are
 * excluded and remain download-only.
 */
function isRasterImageDocument(item: ArchiveItem): boolean {
  const mime = getArchiveItemMimeType(item);
  if (mime) return SAFE_IMAGE_MIME_TYPES.has(mime);
  const name = getArchiveItemFilename(item)?.toLowerCase() ?? "";
  return SAFE_IMAGE_EXTENSIONS.test(name);
}

/**
 * True when a document can be rendered in-app: PDFs (rasterized by PDF.js into
 * canvases) and raster images (as an <img>). HTML, SVG, XML, and any other
 * scriptable or unknown MIME type are never previewed inline and offer
 * Download Original only.
 */
function isPreviewableDocument(item: ArchiveItem): boolean {
  return isPdfDocument(item) || isRasterImageDocument(item);
}

/**
 * Office document MIME types (Word, Excel) and CSV. These are accepted and
 * stored, but are deliberately never rendered inline: no iframe, no HTML
 * interpretation, no in-app renderer. They show a document card with the
 * filename and a Download Original action only.
 */
const OFFICE_DOCUMENT_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

/** Office/CSV filename extensions, used only when the MIME type is absent. */
const OFFICE_DOCUMENT_EXTENSIONS = /\.(docx?|xlsx?|csv)$/;

/**
 * True when the document is a Word, Excel, or CSV file. Judged from the
 * persisted MIME type, falling back to the filename extension only when no MIME
 * type is available at all. These documents are download-only.
 */
function isOfficeDocument(item: ArchiveItem): boolean {
  const mime = getArchiveItemMimeType(item);
  if (mime) return OFFICE_DOCUMENT_MIME_TYPES.has(mime);
  const name = getArchiveItemFilename(item)?.toLowerCase() ?? "";
  return OFFICE_DOCUMENT_EXTENSIONS.test(name);
}

/**
 * Downloads the original uploaded file with its original filename via the
 * object-storage gateway. The download reads a copy of the bytes and never
 * alters the stored original.
 */
async function downloadOriginal(
  blob: ExternalBlob,
  filename: string | undefined,
): Promise<void> {
  const bytes = await blob.getBytes();
  const url = URL.createObjectURL(new Blob([bytes]));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename || "document";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
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
  // Whether the in-app document preview stage is open. Only meaningful for
  // browser-supported documents (PDFs and images); unsupported formats never
  // show a preview.
  const [previewOpen, setPreviewOpen] = useState(false);

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
  const filename = getArchiveItemFilename(item);

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
          <span
            className={`privacy-badge ${PRIVACY_LEVEL_BADGE[item.privacyLevel]}`}
            data-ocid="archive_detail.privacy_badge"
          >
            {PRIVACY_LEVEL_LABELS[item.privacyLevel]}
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
            ) : isOfficeDocument(item) ? (
              /* Office document card (Word, Excel, CSV): filename plus Download
                 Original only. These formats are never rendered inline in an
                 iframe and never interpreted as HTML. */
              <div
                data-ocid="archive_detail.document_card"
                className="artifact-viewer-frame flex-col gap-3 p-6"
              >
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
                <p className="max-w-md text-sm text-muted-foreground">
                  This document is stored exactly as it was contributed.
                  Download the original to open it in your own application.
                </p>
                <button
                  type="button"
                  data-ocid="archive_detail.download_button"
                  onClick={() => void downloadOriginal(item.blob, filename)}
                  className="preview-download"
                >
                  <Download className="h-4 w-4" aria-hidden="true" />
                  Download Original
                </button>
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
                <div className="flex flex-wrap items-center justify-center gap-2">
                  {isPreviewableDocument(item) ? (
                    <button
                      type="button"
                      data-ocid="archive_detail.preview_button"
                      onClick={() => setPreviewOpen(true)}
                      className="preview-action"
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" />
                      Preview
                    </button>
                  ) : null}
                  <button
                    type="button"
                    data-ocid="archive_detail.download_button"
                    onClick={() => void downloadOriginal(item.blob, filename)}
                    className="preview-download"
                  >
                    <Download className="h-4 w-4" aria-hidden="true" />
                    Download Original
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* In-app preview stage for browser-supported documents (PDFs and
              images). Renders a copy of the original via the gateway URL and
              never alters the stored file. */}
          {previewOpen && isPreviewableDocument(item) ? (
            <div
              data-ocid="archive_detail.preview_stage"
              className="preview-stage mt-6"
            >
              <div className="preview-stage-head">
                <div className="min-w-0">
                  <p className="preview-stage-title">
                    {filename || item.title}
                  </p>
                  <p className="preview-stage-meta">Preview</p>
                </div>
                <button
                  type="button"
                  data-ocid="archive_detail.preview_close"
                  onClick={() => setPreviewOpen(false)}
                  aria-label="Close preview"
                  className="preview-stage-close"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="preview-stage-body">
                {isPdfDocument(item) ? (
                  /* PDFs are rasterized in-app by PDF.js: no embedded script
                     runs, no document HTML is injected, and no navigation or
                     form submission is possible. */
                  <PdfPreview
                    blob={item.blob}
                    filename={filename}
                    title={item.title}
                  />
                ) : (
                  <img src={artifactUrl} alt={item.title} />
                )}
              </div>
            </div>
          ) : null}

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

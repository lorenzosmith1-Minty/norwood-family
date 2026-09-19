/**
 * Shared frontend file-validation utility for every upload surface.
 *
 * This module is the single source of truth for the frontend pre-read checks
 * that run BEFORE any `file.arrayBuffer()` call: it inspects only `File.size`
 * and `File.type`, never the bytes. It mirrors the backend
 * `lib/input-validation.mo` contract (byte ceilings, MIME allowlists, forbidden
 * types, filename sanitization) so the two layers agree, while the backend
 * remains the authoritative second line of defence.
 *
 * Framework-agnostic plain TypeScript — no React, no DOM-only APIs beyond the
 * standard `File` shape — so it is unit-testable in isolation.
 */

/** The upload surface a file is being submitted to. Mirrors the backend `UploadSurface`. */
export type UploadSurface =
  | "profileImage"
  | "recipeImage"
  | "archiveImage"
  | "archiveDocument"
  | "archiveAudio"
  | "archiveVideo"
  | "boardAttachment";

/** A content category a surface accepts, used by the consistency helpers. */
export type MediaCategory = "image" | "document" | "audio" | "video";

// --- Byte-size ceilings (bytes) ---

/** Profile / gallery image ceiling: 10 MB. */
export const MAX_PROFILE_IMAGE_BYTES = 10 * 1024 * 1024;
/** Recipe image ceiling: 10 MB. */
export const MAX_RECIPE_IMAGE_BYTES = 10 * 1024 * 1024;
/** Archive image ceiling: 15 MB. */
export const MAX_ARCHIVE_IMAGE_BYTES = 15 * 1024 * 1024;
/** Archive PDF / document ceiling: 20 MB. */
export const MAX_ARCHIVE_DOCUMENT_BYTES = 20 * 1024 * 1024;
/** Archive audio ceiling: 40 MB. */
export const MAX_ARCHIVE_AUDIO_BYTES = 40 * 1024 * 1024;
/** Archive video ceiling: 75 MB. */
export const MAX_ARCHIVE_VIDEO_BYTES = 75 * 1024 * 1024;
/** Message Board attachment ceiling: 20 MB per attachment. */
export const MAX_BOARD_ATTACHMENT_BYTES = 20 * 1024 * 1024;

/** Filename ceiling: 120 characters. Mirrors the backend `MAX_FILENAME_CHARS`. */
export const MAX_FILENAME_CHARS = 120;

/** Per-surface byte ceilings, keyed by surface. */
export const SURFACE_MAX_BYTES: Record<UploadSurface, number> = {
  profileImage: MAX_PROFILE_IMAGE_BYTES,
  recipeImage: MAX_RECIPE_IMAGE_BYTES,
  archiveImage: MAX_ARCHIVE_IMAGE_BYTES,
  archiveDocument: MAX_ARCHIVE_DOCUMENT_BYTES,
  archiveAudio: MAX_ARCHIVE_AUDIO_BYTES,
  archiveVideo: MAX_ARCHIVE_VIDEO_BYTES,
  boardAttachment: MAX_BOARD_ATTACHMENT_BYTES,
};

/** Human-readable surface labels used in error messages. */
export const SURFACE_LABELS: Record<UploadSurface, string> = {
  profileImage: "profile image",
  recipeImage: "recipe image",
  archiveImage: "archive image",
  archiveDocument: "archive document",
  archiveAudio: "archive audio",
  archiveVideo: "archive video",
  boardAttachment: "board attachment",
};

// --- MIME allowlists ---

/** Image MIME types accepted anywhere an image is allowed. */
export const IMAGE_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

/** Document MIME types accepted for archive documents and board attachments. */
export const DOCUMENT_MIME_TYPES = ["application/pdf", "text/plain"] as const;

/** Audio MIME types accepted for archive audio. */
export const AUDIO_MIME_TYPES = [
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
] as const;

/** Video MIME types accepted for archive video and board attachments. */
export const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "video/quicktime",
] as const;

/**
 * MIME types that are never accepted on any surface: executable, script,
 * archive, and scriptable-document formats. SVG (`image/svg+xml`) can carry
 * script and is therefore never permitted.
 */
export const FORBIDDEN_MIME_TYPES = [
  "text/html",
  "application/javascript",
  "text/javascript",
  "application/x-sh",
  "application/x-msdownload",
  "application/x-executable",
  "application/zip",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
  "image/svg+xml",
] as const;

/** The MIME types allowed for a given upload surface. */
export const SURFACE_ALLOWED_MIME_TYPES: Record<
  UploadSurface,
  readonly string[]
> = {
  profileImage: IMAGE_MIME_TYPES,
  recipeImage: IMAGE_MIME_TYPES,
  archiveImage: IMAGE_MIME_TYPES,
  archiveDocument: DOCUMENT_MIME_TYPES,
  archiveAudio: AUDIO_MIME_TYPES,
  archiveVideo: VIDEO_MIME_TYPES,
  boardAttachment: [
    ...IMAGE_MIME_TYPES,
    ...VIDEO_MIME_TYPES,
    ...DOCUMENT_MIME_TYPES,
  ],
};

/** The content categories a surface accepts, used by the consistency helpers. */
export const SURFACE_CATEGORIES: Record<
  UploadSurface,
  readonly MediaCategory[]
> = {
  profileImage: ["image"],
  recipeImage: ["image"],
  archiveImage: ["image"],
  archiveDocument: ["document"],
  archiveAudio: ["audio"],
  archiveVideo: ["video"],
  boardAttachment: ["image", "video", "document"],
};

// --- MIME helpers ---

/** Normalizes a MIME type: trims surrounding whitespace and lower-cases it. */
export function normalizeMimeType(mimeType: string): string {
  return mimeType.trim().toLowerCase();
}

/** Whether the MIME type is explicitly forbidden on every surface. */
export function isForbiddenMimeType(mimeType: string): boolean {
  const normalized = normalizeMimeType(mimeType);
  return FORBIDDEN_MIME_TYPES.some((forbidden) => forbidden === normalized);
}

/** The MIME types allowed for a surface. */
export function allowedMimeTypes(surface: UploadSurface): readonly string[] {
  return SURFACE_ALLOWED_MIME_TYPES[surface];
}

/** The byte ceiling for a surface. */
export function maxBytesForSurface(surface: UploadSurface): number {
  return SURFACE_MAX_BYTES[surface];
}

/** The human-readable label for a surface. */
export function surfaceLabel(surface: UploadSurface): string {
  return SURFACE_LABELS[surface];
}

/**
 * Whether the MIME type is on the allowlist for the surface. A forbidden type
 * is never allowed, even if it somehow appears on an allowlist.
 */
export function isMimeTypeAllowed(
  surface: UploadSurface,
  mimeType: string,
): boolean {
  if (isForbiddenMimeType(mimeType)) return false;
  const normalized = normalizeMimeType(mimeType);
  return allowedMimeTypes(surface).some((allowed) => allowed === normalized);
}

/** Formats a byte count as a compact human-readable size (e.g. "10 MB"). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// --- Validation result ---

/** The outcome of validating a file against a surface. */
export interface FileValidationResult {
  /** True when the file passes every check for the surface. */
  valid: boolean;
  /** A clear, human-readable rejection message, or null when valid. */
  error: string | null;
}

const OK: FileValidationResult = { valid: true, error: null };

/**
 * Validates a `File` against a named surface using only its `size` and `type`
 * metadata — safe to call before any `file.arrayBuffer()` read. Checks, in
 * order: forbidden type, allowlisted type, non-empty, and the surface ceiling.
 * Returns a clear, human-readable error message when rejected.
 */
export function validateFile(
  file: File,
  surface: UploadSurface,
): FileValidationResult {
  const label = surfaceLabel(surface);
  const mimeType = normalizeMimeType(file.type);

  if (isForbiddenMimeType(mimeType)) {
    return {
      valid: false,
      error: `This file type (${mimeType || "unknown"}) is not permitted. Choose a supported ${label} format.`,
    };
  }

  if (!isMimeTypeAllowed(surface, mimeType)) {
    return {
      valid: false,
      error: `Unsupported file type${mimeType ? ` "${mimeType}"` : ""} for ${label}. Allowed: ${allowedMimeTypes(surface).join(", ")}.`,
    };
  }

  if (file.size === 0) {
    return { valid: false, error: `The ${label} file is empty.` };
  }

  const maxBytes = maxBytesForSurface(surface);
  if (file.size > maxBytes) {
    return {
      valid: false,
      error: `The ${label} must be at most ${formatBytes(maxBytes)} (this file is ${formatBytes(file.size)}).`,
    };
  }

  return OK;
}

/** Convenience predicate for call sites that only need a boolean. */
export function isFileValid(file: File, surface: UploadSurface): boolean {
  return validateFile(file, surface).valid;
}

// --- Feature / content-type consistency helpers ---

/** True when the file's MIME type is an allowed image type. */
export function isImageFile(file: File): boolean {
  return isMimeTypeAllowed("archiveImage", file.type);
}

/** True when the file's MIME type is an allowed video type. */
export function isVideoFile(file: File): boolean {
  return isMimeTypeAllowed("archiveVideo", file.type);
}

/** True when the file's MIME type is an allowed audio type. */
export function isAudioFile(file: File): boolean {
  return isMimeTypeAllowed("archiveAudio", file.type);
}

/** True when the file's MIME type is an allowed document type. */
export function isDocumentFile(file: File): boolean {
  return isMimeTypeAllowed("archiveDocument", file.type);
}

/**
 * Validates a profile photo: images only, 10 MB ceiling.
 */
export function validateProfilePhoto(file: File): FileValidationResult {
  return validateFile(file, "profileImage");
}

/**
 * Validates recipe media: images only, 10 MB ceiling.
 */
export function validateRecipeMedia(file: File): FileValidationResult {
  return validateFile(file, "recipeImage");
}

/**
 * Validates a video contribution: video only, 75 MB ceiling.
 */
export function validateVideoContribution(file: File): FileValidationResult {
  return validateFile(file, "archiveVideo");
}

/**
 * Validates an audio-only oral-history contribution: audio only, 40 MB ceiling.
 */
export function validateAudioContribution(file: File): FileValidationResult {
  return validateFile(file, "archiveAudio");
}

/**
 * Validates a media contribution against the surface implied by its media kind:
 * the video kinds accept video only, while the audio-only oral history accepts
 * audio only. Mirrors the backend `archiveSurfaceFor` mapping so the frontend
 * pre-read gate agrees with the authoritative backend check.
 */
export function validateMediaContribution(
  file: File,
  kind: "uploaded-video" | "oral-history-video" | "audio-only-oral-history",
): FileValidationResult {
  return kind === "audio-only-oral-history"
    ? validateAudioContribution(file)
    : validateVideoContribution(file);
}

/**
 * Validates a board attachment: image, video, PDF, or plain text only, 20 MB
 * ceiling per attachment.
 */
export function validateBoardAttachment(file: File): FileValidationResult {
  return validateFile(file, "boardAttachment");
}

/**
 * Maps an archive item type to the upload surface that governs its media, or
 * null when the item type carries no uploaded file (written story/note, other).
 * Research and work/business material are limited to the types supported by the
 * selected archive item type.
 */
export function surfaceForArchiveItemType(
  itemType: string,
): UploadSurface | null {
  switch (itemType) {
    case "Photo":
      return "archiveImage";
    case "Document":
      return "archiveDocument";
    case "Audio":
      return "archiveAudio";
    case "Video":
      return "archiveVideo";
    default:
      return null;
  }
}

/**
 * Maps a research source type to the upload surface that governs its media.
 * Every research source upload is created through the backend
 * `createSourceWithUpload` path, which validates the bytes against
 * `#ArchiveDocument` (PDF or plain text), so the document surface is the
 * correct gate for every source type — including the ones whose label mentions
 * an image. Returns null only when no source type has been selected yet.
 */
export function surfaceForSourceType(sourceType: string): UploadSurface | null {
  return sourceType === "" ? null : "archiveDocument";
}

/**
 * Validates a research source file against the surface implied by its selected
 * source type. Returns a rejection when no source type is selected yet.
 */
export function validateSourceFile(
  file: File,
  sourceType: string,
): FileValidationResult {
  const surface = surfaceForSourceType(sourceType);
  if (surface === null) {
    return {
      valid: false,
      error: "Choose a source type before uploading a file.",
    };
  }
  return validateFile(file, surface);
}

/**
 * Validates an archive contribution against the surface implied by its selected
 * item type. Returns a rejection when the item type carries no file, or when the
 * file does not match the type's supported media.
 */
export function validateArchiveFile(
  file: File,
  itemType: string,
): FileValidationResult {
  const surface = surfaceForArchiveItemType(itemType);
  if (surface === null) {
    return {
      valid: false,
      error: "The selected archive item type does not accept an uploaded file.",
    };
  }
  return validateFile(file, surface);
}

// --- Filename sanitization ---

/** Whether a character is a path separator (`/` or `\`). */
function isPathSeparator(ch: string): boolean {
  return ch === "/" || ch === "\\";
}

/** Whether a character is an ASCII control character (code point < 0x20) or DEL (0x7F). */
function isControlChar(ch: string): boolean {
  const code = ch.codePointAt(0) ?? 0;
  return code < 0x20 || code === 0x7f;
}

/**
 * Returns the trailing extension (including the dot) when the filename has a
 * short, safe one, or null otherwise. A safe extension is 1–10 characters after
 * the final dot and contains only alphanumeric characters.
 */
function safeExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot + 1 >= filename.length) return null;
  const ext = filename.slice(dot);
  if (ext.length - 1 > 10) return null;
  return /^\.[A-Za-z0-9]+$/.test(ext) ? ext : null;
}

/**
 * Caps a filename at `MAX_FILENAME_CHARS`, preserving a trailing safe extension
 * when one is present so the stored name still communicates its format.
 */
function capFilenamePreservingExtension(filename: string): string {
  const ext = safeExtension(filename);
  if (ext === null) {
    return filename.slice(0, MAX_FILENAME_CHARS);
  }
  if (ext.length >= MAX_FILENAME_CHARS) {
    return ext;
  }
  const stem = filename.slice(0, MAX_FILENAME_CHARS - ext.length);
  return stem + ext;
}

/**
 * Sanitizes a filename to mirror the backend rules: removes path separators and
 * control characters, collapses whitespace runs to a single space, trims, caps
 * at 120 characters while preserving a safe extension, and rejects an empty
 * result. Returns the sanitized name, or null when nothing usable remains.
 */
export function sanitizeFilename(filename: string): string | null {
  let cleaned = "";
  let lastWasSpace = false;
  for (const ch of filename) {
    if (isPathSeparator(ch) || isControlChar(ch)) {
      continue;
    }
    if (/\s/.test(ch)) {
      if (!lastWasSpace) {
        cleaned += " ";
        lastWasSpace = true;
      }
      continue;
    }
    cleaned += ch;
    lastWasSpace = false;
  }

  const trimmed = cleaned.trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length <= MAX_FILENAME_CHARS) return trimmed;

  const capped = capFilenamePreservingExtension(trimmed);
  return capped.length === 0 ? null : capped;
}

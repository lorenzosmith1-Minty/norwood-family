import { type ExportEnvelope, ExportMediaAvailability } from "@/backend";
import {
  BUNDLE_TOO_LARGE_MESSAGE,
  MAX_BUNDLE_ASSET_COUNT,
  MAX_BUNDLE_SINGLE_FILE_BYTES,
  MAX_BUNDLE_TOTAL_BYTES,
  MAX_BUNDLE_ZIP_BYTES,
} from "@/lib/archiveBundleLimits";
import { serializeExportEnvelope } from "@/lib/exportDownload";
import { zipSync } from "fflate";

/**
 * Phase 5D — Family Archive bundle engine (pure, testable helpers).
 *
 * This module turns an authorized Phase 5A FamilyArchive envelope plus the
 * Phase 5C export-bound media retrieval flow into a single portable ZIP. It is
 * deliberately framework-free so the bundle logic can be unit-tested without a
 * React tree or a live canister.
 *
 * Privacy and integrity rules enforced here:
 *   - The export envelope is used UNCHANGED. `norwood-export.json` is produced
 *     by `serializeExportEnvelope`, so it is byte-identical to the existing
 *     JSON-only download. The frontend never rebuilds or reinterprets the
 *     export schema; the media manifest is parsed READ-ONLY to drive retrieval.
 *   - Media is retrieved ONLY through the Phase 5C export-instance + media-N
 *     flow. No raw storage id, archive id, profile-photo id, or reconstructed
 *     current-family ordering is ever used.
 *   - ZIP paths are portable and sanitized: no principals, internal ids, raw
 *     storage ids, unsafe characters, `../` traversal, or absolute paths.
 *   - Unavailable media never fails the bundle and is never substituted; the
 *     JSON manifest inside the ZIP remains the source of truth.
 *   - Generation is bounded in-memory and ephemeral: nothing is written to
 *     localStorage/sessionStorage, uploaded, or persisted server-side.
 */

// ---------------------------------------------------------------------------
// Manifest parsing (read-only)
// ---------------------------------------------------------------------------

/**
 * A single media manifest entry as serialized inside the envelope's
 * `payloadJson`. This mirrors the backend's `ExportMediaRef` JSON projection
 * exactly; it is parsed read-only and never re-serialized.
 */
export interface ArchiveMediaManifestEntry {
  /** The export-local `media-N` token used for retrieval. */
  mediaRef: string;
  /** `ProfilePhoto` or `ArchiveItem`. */
  mediaKind: string;
  /** Neutral availability: `Available` or `Unavailable`. */
  availability: string;
  /** The asset's size in bytes when already known. */
  byteSize: number | null;
  /** A safe, human-facing filename when the backend supplied one. */
  filename: string | null;
  /** A human-facing title, used as a filename fallback. */
  title: string;
}

/** The Phase 5C resource summary parsed from the payload. */
export interface ArchiveMediaManifestSummary {
  assetCount: number;
  knownTotalBytes: number;
  unavailableCount: number;
}

/** The read-only view of the payload the bundle engine needs. */
export interface ArchiveMediaManifest {
  entries: ArchiveMediaManifestEntry[];
  summary: ArchiveMediaManifestSummary;
}

/** The raw JSON shape of a manifest entry, before normalization. */
interface RawManifestEntry {
  ref?: { portableId?: unknown };
  mediaKind?: unknown;
  availability?: unknown;
  byteSize?: unknown;
  filename?: unknown;
  title?: unknown;
}

/** The raw JSON shape of the payload, before normalization. */
interface RawPayload {
  mediaManifest?: unknown;
  mediaManifestSummary?: unknown;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Parses the media manifest out of an envelope's `payloadJson` READ-ONLY.
 *
 * The payload is the backend's serialized export schema; this function only
 * reads the `mediaManifest` and `mediaManifestSummary` fields it needs to drive
 * retrieval and preflight. It never mutates, rebuilds, or re-serializes the
 * payload. A malformed or absent manifest yields an empty manifest rather than
 * throwing, so a bundle can still be produced from the JSON envelope alone.
 */
export function parseMediaManifest(
  envelope: ExportEnvelope,
): ArchiveMediaManifest {
  let payload: RawPayload;
  try {
    payload = JSON.parse(envelope.payloadJson) as RawPayload;
  } catch {
    return {
      entries: [],
      summary: { assetCount: 0, knownTotalBytes: 0, unavailableCount: 0 },
    };
  }

  const rawEntries = Array.isArray(payload.mediaManifest)
    ? (payload.mediaManifest as RawManifestEntry[])
    : [];
  const entries: ArchiveMediaManifestEntry[] = [];
  for (const raw of rawEntries) {
    const mediaRef = asString(raw.ref?.portableId);
    if (!mediaRef) continue;
    entries.push({
      mediaRef,
      mediaKind: asString(raw.mediaKind) ?? "ArchiveItem",
      availability: asString(raw.availability) ?? "Unavailable",
      byteSize: asNumber(raw.byteSize),
      filename: asString(raw.filename),
      title: asString(raw.title) ?? "",
    });
  }

  const rawSummary = (payload.mediaManifestSummary ?? {}) as Record<
    string,
    unknown
  >;
  const summary: ArchiveMediaManifestSummary = {
    assetCount: asNumber(rawSummary.assetCount) ?? entries.length,
    knownTotalBytes: asNumber(rawSummary.knownTotalBytes) ?? 0,
    unavailableCount: asNumber(rawSummary.unavailableCount) ?? 0,
  };

  return { entries, summary };
}

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

/** The neutral decision returned by the bundle preflight. */
export type BundlePreflightDecision =
  | { kind: "proceed" }
  | { kind: "too-large"; message: string };

/**
 * Decides whether a bundle can be generated from the Phase 5C resource summary
 * and the per-file sizes when known.
 *
 * This runs BEFORE any media retrieval. It rejects when the asset count, the
 * aggregate known byte size, or any single known file size exceeds the
 * configured conservative limits, so no bytes are fetched for a bundle that
 * will not be produced. The returned message is neutral and never exposes
 * internal ids or backend detail.
 */
export function preflightBundle(
  summary: ArchiveMediaManifestSummary,
  entries: ArchiveMediaManifestEntry[],
): BundlePreflightDecision {
  const tooLarge = (): BundlePreflightDecision => ({
    kind: "too-large",
    message: BUNDLE_TOO_LARGE_MESSAGE,
  });

  if (summary.assetCount > MAX_BUNDLE_ASSET_COUNT) return tooLarge();
  if (summary.knownTotalBytes > MAX_BUNDLE_TOTAL_BYTES) return tooLarge();

  for (const entry of entries) {
    if (
      entry.byteSize !== null &&
      entry.byteSize > MAX_BUNDLE_SINGLE_FILE_BYTES
    ) {
      return tooLarge();
    }
  }

  return { kind: "proceed" };
}

// ---------------------------------------------------------------------------
// Portable path sanitization
// ---------------------------------------------------------------------------

/** The directory every bundled media entry lives under. */
export const MEDIA_DIRECTORY = "media";

/** The filename of the unchanged export envelope inside the ZIP. */
export const EXPORT_JSON_FILENAME = "norwood-export.json";

/** The filename of the optional non-sensitive README inside the ZIP. */
export const README_FILENAME = "README.txt";

/**
 * Sanitizes a candidate filename into a portable, safe basename.
 *
 * It strips any directory components (including Windows separators), removes
 * `../` traversal and absolute-path markers, drops unsafe path characters, and
 * collapses whitespace. It never emits a principal, internal id, or raw storage
 * id — the caller only ever passes a manifest filename/title. Returns `null`
 * when nothing safe remains, so the caller can fall back to a generated name.
 */
export function sanitizeMediaFilename(candidate: string | null): string | null {
  if (!candidate) return null;
  // Normalize separators, then take only the final path component so no
  // directory component (and therefore no traversal) can survive.
  const normalized = candidate.replace(/\\/gu, "/");
  const segments = normalized.split("/");
  const basename = segments[segments.length - 1] ?? "";
  // Drop control characters (code points below 0x20 and DEL) and characters
  // unsafe across filesystems, then collapse dot-dot sequences defensively.
  const withoutControl = Array.from(basename)
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
  const cleaned = withoutControl
    .replace(/[<>:"|?*]/gu, "")
    .replace(/\.\./gu, "")
    .replace(/\s+/gu, " ")
    .trim()
    // A leading dot would create a hidden file; strip it.
    .replace(/^\.+/u, "");
  if (cleaned === "" || cleaned === "." || cleaned === "..") return null;
  return cleaned;
}

/**
 * Builds a deterministic, safe fallback filename for a media entry when the
 * manifest supplied no usable filename. The name is derived only from the
 * export-local `media-N` token and the media kind — never from a principal,
 * internal id, or raw storage id.
 */
export function fallbackMediaFilename(
  entry: ArchiveMediaManifestEntry,
): string {
  const token = sanitizeMediaFilename(entry.mediaRef) ?? "media";
  const extension = entry.mediaKind === "ProfilePhoto" ? "jpg" : "bin";
  return `${token}.${extension}`;
}

/**
 * Resolves the safe basename for a media entry: the sanitized manifest
 * filename when one exists, otherwise a deterministic generated fallback.
 */
export function resolveMediaBasename(entry: ArchiveMediaManifestEntry): string {
  return sanitizeMediaFilename(entry.filename) ?? fallbackMediaFilename(entry);
}

// ---------------------------------------------------------------------------
// Deterministic collision resolution
// ---------------------------------------------------------------------------

/**
 * Resolves duplicate basenames deterministically so no media item overwrites
 * another: `photo.jpg`, `photo-2.jpg`, `photo-3.jpg`, … The result is stable
 * for the same input order, so the same manifest always produces the same
 * paths.
 *
 * Uniqueness is tracked on the EMITTED name, not the original basename. A
 * generated `-N` suffix can itself collide with a later original basename
 * (for example `['photo.jpg', 'photo.jpg', 'photo-2.jpg']`), so every emitted
 * name is reserved as it is produced and a candidate is advanced until it is
 * unused. This guarantees every returned basename is distinct, so no media
 * item can overwrite another at a shared ZIP path.
 */
export function resolveUniqueBasenames(basenames: string[]): string[] {
  const used = new Set<string>();
  return basenames.map((basename) => {
    if (!used.has(basename)) {
      used.add(basename);
      return basename;
    }
    const dot = basename.lastIndexOf(".");
    const hasExtension = dot > 0;
    const stem = hasExtension ? basename.slice(0, dot) : basename;
    const extension = hasExtension ? basename.slice(dot) : "";
    let suffix = 2;
    let candidate = `${stem}-${suffix}${extension}`;
    while (used.has(candidate)) {
      suffix += 1;
      candidate = `${stem}-${suffix}${extension}`;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * Assigns a unique, portable ZIP path under `media/` to every manifest entry,
 * in manifest order. The returned map is keyed by `media-N` token.
 */
export function assignMediaPaths(
  entries: ArchiveMediaManifestEntry[],
): Map<string, string> {
  const basenames = resolveUniqueBasenames(
    entries.map((entry) => resolveMediaBasename(entry)),
  );
  const paths = new Map<string, string>();
  entries.forEach((entry, index) => {
    paths.set(entry.mediaRef, `${MEDIA_DIRECTORY}/${basenames[index]}`);
  });
  return paths;
}

// ---------------------------------------------------------------------------
// README
// ---------------------------------------------------------------------------

/**
 * Builds the optional top-level README. It carries ONLY non-sensitive info:
 * the app name, the generation date, the schema version, and a note that media
 * files correspond to the manifest. It never includes private family content.
 */
export function buildReadme(
  envelope: ExportEnvelope,
  now: Date = new Date(),
): string {
  const date = now.toISOString().slice(0, 10);
  const schemaVersion = String(envelope.metadata.schemaVersion);
  return [
    "Norwood family archive export",
    `Generated: ${date}`,
    `Schema version: ${schemaVersion}`,
    "",
    "This bundle contains norwood-export.json (the portable family archive",
    "export) and a media/ directory. Each media file corresponds to an entry",
    "in the export's media manifest, which is the source of truth for the",
    "archive contents and availability.",
    "",
  ].join("\n");
}

// ---------------------------------------------------------------------------
// ZIP assembly
// ---------------------------------------------------------------------------

/** A retrieved media item ready to be written into the ZIP. */
export interface BundleMediaItem {
  /** The export-local `media-N` token. */
  mediaRef: string;
  /** The portable ZIP path under `media/`. */
  path: string;
  /** The retrieved bytes. */
  bytes: Uint8Array;
}

/** The inputs to {@link assembleArchiveZip}. */
export interface AssembleArchiveZipInput {
  envelope: ExportEnvelope;
  media: BundleMediaItem[];
  /** Whether to include the optional non-sensitive README. */
  includeReadme?: boolean;
  /** The generation date used in the README. */
  now?: Date;
}

/**
 * Thrown by {@link assembleArchiveZip} when the produced ZIP exceeds
 * `MAX_BUNDLE_ZIP_BYTES`. It is a distinct type so the caller can present the
 * neutral "too large for one bundle" outcome rather than a generic failure.
 * No partial ZIP is ever returned when this is thrown.
 */
export class BundleTooLargeError extends Error {
  constructor() {
    super(BUNDLE_TOO_LARGE_MESSAGE);
    this.name = "BundleTooLargeError";
  }
}

/**
 * Assembles the ZIP bundle as a `Uint8Array`.
 *
 * The archive contains `norwood-export.json` (the envelope serialized
 * UNCHANGED via `serializeExportEnvelope`, byte-identical to the JSON-only
 * download), every retrieved media item under `media/`, and an optional
 * non-sensitive `README.txt`. Generation is bounded in-memory: the caller has
 * already passed the preflight and the final size is checked against
 * `MAX_BUNDLE_ZIP_BYTES` before the ZIP is returned.
 */
export function assembleArchiveZip(input: AssembleArchiveZipInput): Uint8Array {
  const files: Record<string, Uint8Array> = {};
  const encoder = new TextEncoder();

  files[EXPORT_JSON_FILENAME] = encoder.encode(
    serializeExportEnvelope(input.envelope),
  );
  if (input.includeReadme) {
    files[README_FILENAME] = encoder.encode(
      buildReadme(input.envelope, input.now),
    );
  }
  for (const item of input.media) {
    // A shared path would silently overwrite an earlier media item in the ZIP
    // (the object key would be reused). Paths are assigned uniquely upstream,
    // but guard here so a media item can never be lost without a signal.
    if (Object.prototype.hasOwnProperty.call(files, item.path)) {
      throw new Error(`Duplicate bundle path: ${item.path}`);
    }
    files[item.path] = item.bytes;
  }

  const zipped = zipSync(files, { level: 6 });
  if (zipped.byteLength > MAX_BUNDLE_ZIP_BYTES) {
    throw new BundleTooLargeError();
  }
  return zipped;
}

/**
 * Builds the download filename for the bundle:
 * `norwood-family-archive-YYYY-MM-DD.zip`. It carries only the app name, the
 * scope, and the date — no private names, account IDs, principals, or internal
 * ids.
 */
export function buildBundleFilename(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `norwood-family-archive-${year}-${month}-${day}.zip`;
}

// ---------------------------------------------------------------------------
// Retrieval orchestration
// ---------------------------------------------------------------------------

/** The result of retrieving one media item. */
export type MediaRetrievalOutcome =
  | { kind: "retrieved"; bytes: Uint8Array }
  | { kind: "skipped" };

/**
 * The structured outcome of a whole bundle media-retrieval pass.
 *
 * It distinguishes the three cases the caller must treat differently:
 *   - `success`: retrieval completed. `items` holds the retrieved media and
 *     `skipped` counts the assets that were skipped because the specific asset
 *     was unavailable (`MediaUnavailable` / `MediaNotFound`) or already marked
 *     unavailable in the manifest. The JSON manifest inside the ZIP remains the
 *     source of truth for availability, and no substitute asset is ever used.
 *   - `denied`: the export instance itself is not valid for use (an
 *     authorization or export-instance rejection). Retrieval stopped
 *     immediately; no partial bundle may be produced.
 *   - `failed`: a fatal retrieval failure (a thrown transport error or an
 *     unrecognized error tag). Retrieval stopped immediately; no partial bundle
 *     may be produced.
 */
export type BundleRetrievalOutcome =
  | { kind: "success"; items: BundleMediaItem[]; skipped: number }
  | { kind: "denied" }
  | { kind: "failed" };

/** The minimal actor surface the orchestrator needs. */
export interface MediaRetrievalActor {
  retrieveFamilyArchiveMedia(
    exportInstanceRef: string,
    mediaRef: string,
  ): Promise<
    | { __kind__: "ok"; ok: { bytes: Uint8Array } }
    | { __kind__: "err"; err: string }
  >;
}

/** The inputs to {@link retrieveBundleMedia}. */
export interface RetrieveBundleMediaInput {
  actor: MediaRetrievalActor;
  exportInstanceRef: string;
  entries: ArchiveMediaManifestEntry[];
  paths: Map<string, string>;
  /** Called before each retrieval with the 1-based index and total count. */
  onProgress?: (current: number, total: number) => void;
}

/**
 * Retrieves every available media item through the Phase 5C export-instance +
 * media-N flow, in manifest order, and returns a structured outcome.
 *
 * Each item is fetched with `retrieveFamilyArchiveMedia(exportInstanceRef,
 * mediaRef)` — never by raw storage id, archive id, or profile-photo id, and
 * never against a rebuilt current-family manifest.
 *
 * Per-item classification:
 *   - `MediaUnavailable` / `MediaNotFound` mean only that specific asset is
 *     unavailable. That item is SKIPPED and retrieval continues: the bundle is
 *     never failed as a whole, no substitute asset is used, and the condition
 *     is not silently dropped from the portable data because the JSON manifest
 *     inside the ZIP already records availability.
 *   - Every other error tag — `NotSignedIn`, `NotSteward`, `FamilyNotFound`,
 *     `ExportInstanceNotFound`, `ExportInstanceExpired`, and any unrecognized
 *     tag — means the export instance itself is not valid for use. Retrieval
 *     STOPS immediately and the denied/failed outcome is returned so the caller
 *     never assembles a partial ZIP.
 *   - A thrown transport error is a fatal retrieval failure: retrieval STOPS
 *     immediately rather than silently skipping the item.
 *
 * The classification reuses {@link mapBundleError} so the per-item path and the
 * top-level export path stay consistent.
 */
export async function retrieveBundleMedia(
  input: RetrieveBundleMediaInput,
): Promise<BundleRetrievalOutcome> {
  const { actor, exportInstanceRef, entries, paths, onProgress } = input;
  const items: BundleMediaItem[] = [];
  let skipped = 0;
  const total = entries.length;

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    onProgress?.(index + 1, total);
    // Skip entries the manifest already marks Unavailable: no backend call is
    // made for a known-unavailable asset. The JSON manifest inside the ZIP
    // remains the source of truth for availability, and no substitute asset is
    // ever used.
    if (!isAvailable(entry)) {
      skipped += 1;
      continue;
    }
    const path = paths.get(entry.mediaRef);
    if (!path) {
      skipped += 1;
      continue;
    }
    let result: Awaited<
      ReturnType<MediaRetrievalActor["retrieveFamilyArchiveMedia"]>
    >;
    try {
      result = await actor.retrieveFamilyArchiveMedia(
        exportInstanceRef,
        entry.mediaRef,
      );
    } catch {
      // A thrown transport error is fatal: stop retrieval immediately rather
      // than silently skipping the item and producing a partial bundle.
      return { kind: "failed" };
    }
    if (result.__kind__ === "ok") {
      items.push({ mediaRef: entry.mediaRef, path, bytes: result.ok.bytes });
      continue;
    }
    // Classify the error tag. Only the two asset-specific tags are skippable;
    // every authorization/export-instance rejection (and any unrecognized tag)
    // stops retrieval immediately.
    if (result.err === "MediaUnavailable" || result.err === "MediaNotFound") {
      skipped += 1;
      continue;
    }
    // Reuse the shared classification so the per-item path and the top-level
    // export path stay consistent. Only `denied` and `failed` are reachable
    // here; the other BundleOutcome variants are not retrieval outcomes.
    const mapped = mapBundleError(result.err);
    return mapped.kind === "denied" ? { kind: "denied" } : { kind: "failed" };
  }

  return { kind: "success", items, skipped };
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

/** The neutral, user-facing outcome of a bundle generation attempt. */
export type BundleOutcome =
  | { kind: "downloaded"; filename: string }
  | { kind: "too-large"; message: string }
  | { kind: "denied" }
  | { kind: "failed" };

/**
 * Maps a Phase 5C media-retrieval error tag to a neutral outcome.
 *
 * Authorization rejections (`NotSignedIn`, `NotSteward`, `FamilyNotFound`,
 * `ExportInstanceNotFound`, `ExportInstanceExpired`) become `denied`; every
 * other failure becomes `failed`. The tag itself is never surfaced, so no
 * backend implementation detail leaks through the UI.
 */
export function mapBundleError(error: string): BundleOutcome {
  switch (error) {
    case "NotSignedIn":
    case "NotSteward":
    case "FamilyNotFound":
    case "ExportInstanceNotFound":
    case "ExportInstanceExpired":
      return { kind: "denied" };
    default:
      return { kind: "failed" };
  }
}

/** True when a manifest entry is marked available for retrieval. */
export function isAvailable(entry: ArchiveMediaManifestEntry): boolean {
  return entry.availability === ExportMediaAvailability.Available;
}

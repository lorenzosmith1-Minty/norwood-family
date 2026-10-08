/**
 * Phase 5D — Family Archive bundle limits.
 *
 * This is the SINGLE, clearly named configuration location for every limit
 * that governs client-side ZIP bundle generation. Keeping them in one module
 * means the preflight, the retrieval orchestrator, and the ZIP assembler all
 * agree on the same conservative ceilings, and a future change is a one-line
 * edit here rather than a hunt through the bundle engine.
 *
 * Rationale for the values:
 *   - Bundle generation is bounded in-memory: the whole archive (JSON envelope
 *     plus every retrieved media byte) is assembled in the browser tab before
 *     the download is triggered. A tab that allocates hundreds of megabytes of
 *     media at once can be killed by the browser, so the ceilings are chosen to
 *     stay comfortably inside a typical mobile/desktop tab budget.
 *   - The Phase 5C resource summary already reports `assetCount` and
 *     `knownTotalBytes`, so the preflight can reject an oversized archive
 *     BEFORE any media is retrieved — no bytes are fetched for a bundle that
 *     will not be produced.
 *   - These are temporary, conservative limits. They are intentionally lower
 *     than the theoretical maximum so the feature is safe by default; a later
 *     phase can raise them once streaming ZIP generation is proven.
 */

/** Maximum number of media assets allowed in a single bundle. */
export const MAX_BUNDLE_ASSET_COUNT = 500;

/**
 * Maximum aggregate known byte size of all media in a single bundle (256 MiB).
 * This is the primary preflight gate: it is compared against the Phase 5C
 * `knownTotalBytes` before any retrieval begins.
 */
export const MAX_BUNDLE_TOTAL_BYTES = 256 * 1024 * 1024;

/**
 * Maximum size of any single media file (64 MiB). A single oversized asset is
 * rejected by the preflight even when the aggregate total is under the cap,
 * because one huge blob can still exhaust the tab during assembly.
 */
export const MAX_BUNDLE_SINGLE_FILE_BYTES = 64 * 1024 * 1024;

/**
 * Maximum total size of the produced ZIP (288 MiB). This is the aggregate cap
 * plus headroom for the JSON envelope, the optional README, and ZIP framing
 * overhead. It is a final safety net checked after retrieval, before the ZIP
 * is assembled.
 */
export const MAX_BUNDLE_ZIP_BYTES = 288 * 1024 * 1024;

/**
 * The neutral, user-facing message shown when an archive exceeds the supported
 * bundle limits. It never exposes internal ids, sizes, or backend detail.
 */
export const BUNDLE_TOO_LARGE_MESSAGE =
  "This archive is too large for one bundle. The JSON-only download is still available.";

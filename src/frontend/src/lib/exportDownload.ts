import { type ExportEnvelope, type ExportError, ExportScope } from "@/backend";

/**
 * Phase 5B export-download helpers.
 *
 * These are pure, framework-free utilities shared by the export hook. They
 * turn an authorized Phase 5A export envelope into an ephemeral client-side
 * JSON download and map backend error tags to neutral, user-facing outcomes.
 *
 * Privacy and integrity rules enforced here:
 *   - The versioned export envelope is used UNCHANGED. The payload is the
 *     backend's `payloadJson` verbatim; the frontend never mutates, rebuilds,
 *     or re-serializes the export schema.
 *   - The download is ephemeral: the file is built in browser memory, the
 *     user download is triggered, and the temporary object URL is released.
 *     Nothing is written to localStorage/sessionStorage, uploaded to a
 *     third-party, or persisted server-side.
 *   - Filenames carry only the app name, the scope, and the date. No private
 *     names, account IDs, principals, or internal IDs ever appear in a name.
 */

/** The neutral, user-facing outcome of an export request. */
export type ExportDownloadOutcome =
  | { kind: "downloaded"; filename: string }
  | { kind: "denied" }
  | { kind: "failed" };

/**
 * Builds the download filename for an export scope.
 *
 * `norwood-my-data-YYYY-MM-DD.json` for a MyData export and
 * `norwood-family-archive-YYYY-MM-DD.json` for a FamilyArchive export. The
 * date is the local calendar date at download time; the name contains no
 * private names, account IDs, principals, or internal IDs.
 */
export function buildExportFilename(
  scope: ExportScope,
  now: Date = new Date(),
): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const date = `${year}-${month}-${day}`;
  const stem =
    scope === ExportScope.FamilyArchive
      ? "norwood-family-archive"
      : "norwood-my-data";
  return `${stem}-${date}.json`;
}

/**
 * Serializes an export envelope to human-readable, UTF-8 JSON.
 *
 * The envelope is used unchanged: `metadata` is emitted as-is and
 * `payloadJson` is embedded as the already-serialized payload string, so the
 * frontend never re-parses or rebuilds the export schema. The result is valid
 * JSON with two-space indentation for readability.
 */
export function serializeExportEnvelope(envelope: ExportEnvelope): string {
  return JSON.stringify(
    {
      metadata: envelope.metadata,
      payloadJson: envelope.payloadJson,
    },
    (_key, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value,
    2,
  );
}

/**
 * Triggers an ephemeral client-side download of the given text as a UTF-8 JSON
 * file, then releases the temporary object URL.
 *
 * This reuses the existing archive-download pattern (Blob +
 * URL.createObjectURL + anchor.download + append/click/remove +
 * URL.revokeObjectURL). The blob lives only in browser memory for the duration
 * of the click; nothing is persisted and no public URL is created.
 */
export function downloadJsonFile(contents: string, filename: string): void {
  const blob = new Blob([contents], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Maps a backend export error tag to a neutral outcome.
 *
 * Authorization rejections (`NotAuthorized`, `NotSteward`, `NotSignedIn`,
 * `FamilyNotFound`, `UnsupportedScope`) become `denied`; every other failure
 * becomes `failed`. The tag itself is never surfaced to the user, so no
 * backend implementation detail or private reason leaks through the UI.
 */
export function mapExportError(error: ExportError): ExportDownloadOutcome {
  switch (error) {
    case "NotAuthorized":
    case "NotSteward":
    case "NotSignedIn":
    case "FamilyNotFound":
    case "UnsupportedScope":
      return { kind: "denied" };
    default:
      return { kind: "failed" };
  }
}

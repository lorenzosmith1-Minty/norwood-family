import { createActor } from "@/backend";
import { useActiveFamilyId } from "@/context/FamilyContext";
import {
  type ArchiveMediaManifest,
  type BundleMediaItem,
  type BundleOutcome,
  BundleTooLargeError,
  assembleArchiveZip,
  assignMediaPaths,
  buildBundleFilename,
  mapBundleError,
  parseMediaManifest,
  preflightBundle,
  retrieveBundleMedia,
} from "@/lib/archiveBundle";
import { mapExportError } from "@/lib/exportDownload";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";

/**
 * Phase 5D — Family Archive bundle download hook.
 *
 * Orchestrates the client-side ZIP bundle flow for the active family:
 *
 *   1. `exportFamilyArchive(familyId)` obtains the versioned envelope and the
 *      opaque export-instance reference (unwrapped via `'envelope' in result.ok`).
 *   2. The Phase 5C resource summary is parsed READ-ONLY from the envelope's
 *      `payloadJson` and run through the preflight BEFORE any media retrieval.
 *      An oversized archive returns a neutral "too large" state and generates
 *      nothing.
 *   3. Every media item is retrieved through the Phase 5C export-instance +
 *      media-N flow, in manifest order, reporting progress as it goes.
 *   4. The ZIP is assembled in memory and downloaded ephemerally.
 *
 * It follows the existing backend-call pattern (`useActor(createActor)` +
 * `useMutation`) and reads the active family from the centralized
 * FamilyContext — the family id is never hardcoded.
 *
 * Privacy: the export contents are never displayed on screen. The download is
 * ephemeral — Blob + URL.createObjectURL + anchor click + URL.revokeObjectURL —
 * and nothing is written to localStorage/sessionStorage, uploaded anywhere, or
 * persisted server-side. Retained media bytes are released after the download.
 */

/** The user-facing phase of a bundle generation request. */
export type ArchiveBundlePhase =
  | "idle"
  | "preparing"
  | "retrieving"
  | "creating"
  | "ready"
  | "too-large"
  | "denied"
  | "failed";

/** The page-facing state, derived from the phase. */
export type ArchiveBundleState =
  | "idle"
  | "working"
  | "ready"
  | "too-large"
  | "error";

/** The state returned by {@link useArchiveBundleDownload}. */
export interface ArchiveBundleDownloadState {
  /** The current phase, driving the visible status copy. */
  phase: ArchiveBundlePhase;
  /** The page-facing state, derived from `phase`. */
  state: ArchiveBundleState;
  /** True while generation is in flight; used to prevent repeated clicks. */
  isGenerating: boolean;
  /** The neutral status copy for the current phase, or `null` when idle. */
  statusCopy: string | null;
  /** The neutral failure message, or `null` when there is no failure. */
  error: string | null;
  /** The filename of the most recent successful download, if any. */
  filename: string | null;
  /** Starts bundle generation for the active family. */
  start: () => void;
  /** Clears the terminal state so the user can start a fresh bundle. */
  reset: () => void;
}

/** The neutral failure message shown when a bundle does not complete. */
const BUNDLE_FAILED_MESSAGE = "Archive could not be created.";

/** Maps the internal phase to the page-facing state. */
function toBundleState(phase: ArchiveBundlePhase): ArchiveBundleState {
  switch (phase) {
    case "preparing":
    case "retrieving":
    case "creating":
      return "working";
    case "ready":
      return "ready";
    case "too-large":
      return "too-large";
    case "denied":
    case "failed":
      return "error";
    default:
      return "idle";
  }
}

/**
 * Triggers an ephemeral client-side download of the given ZIP bytes, then
 * releases the temporary object URL. The blob lives only in browser memory for
 * the duration of the click; nothing is persisted and no public URL is created.
 */
function downloadZipFile(bytes: Uint8Array, filename: string): void {
  // Copy into a fresh ArrayBuffer-backed view so the Blob part is a plain
  // ArrayBufferView, independent of the source buffer's backing store.
  const part = new Uint8Array(bytes.byteLength);
  part.set(bytes);
  const blob = new Blob([part], { type: "application/zip" });
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
 * Requests an authorized FamilyArchive export for the active family and
 * downloads it as an ephemeral ZIP bundle.
 *
 * The mutation resolves to a neutral {@link BundleOutcome}; the download itself
 * is triggered inside the mutation so a rejection, an oversized archive, or a
 * failure never produces a file. `isGenerating` is true only while the request
 * is in flight, so the caller can disable its controls and prevent overlapping
 * generations.
 */
export function useArchiveBundleDownload(): ArchiveBundleDownloadState {
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const [phase, setPhase] = useState<ArchiveBundlePhase>("idle");
  const [filename, setFilename] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const mutation = useMutation({
    mutationFn: async (): Promise<BundleOutcome> => {
      if (!actor) throw new Error("Backend is not ready");

      // 1. Obtain the envelope + export-instance reference.
      const result = await actor.exportFamilyArchive(familyId);
      if (result.__kind__ === "err") {
        return mapExportError(result.err);
      }
      const { envelope, exportInstanceRef } = result.ok;

      // 2. Parse the manifest READ-ONLY and preflight before any retrieval.
      const manifest: ArchiveMediaManifest = parseMediaManifest(envelope);
      const decision = preflightBundle(manifest.summary, manifest.entries);
      if (decision.kind === "too-large") {
        return { kind: "too-large", message: decision.message };
      }

      // 3. Retrieve media through the export-instance + media-N flow. The
      //    structured outcome distinguishes a completed pass from an
      //    authorization/export-instance rejection or a fatal retrieval
      //    failure; the latter two stop before any ZIP is assembled.
      const paths = assignMediaPaths(manifest.entries);
      setPhase("retrieving");
      const retrieval = await retrieveBundleMedia({
        actor,
        exportInstanceRef,
        entries: manifest.entries,
        paths,
        onProgress: (current, total) => setProgress({ current, total }),
      });
      if (retrieval.kind !== "success") {
        // No partial ZIP is assembled and no download is triggered. The
        // backend error tag is never surfaced — only the neutral state.
        return retrieval.kind === "denied"
          ? { kind: "denied" }
          : { kind: "failed" };
      }
      const media: BundleMediaItem[] = retrieval.items;

      // 4. Assemble and download the ZIP.
      setPhase("creating");
      let bytes: Uint8Array;
      try {
        bytes = assembleArchiveZip({
          envelope,
          media,
          includeReadme: true,
        });
      } catch (error) {
        // The final ZIP-size safety net is a neutral "too large" outcome, not a
        // generic failure. No partial ZIP is produced in either case.
        if (error instanceof BundleTooLargeError) {
          return { kind: "too-large", message: error.message };
        }
        throw error;
      }
      const name = buildBundleFilename();
      downloadZipFile(bytes, name);
      return { kind: "downloaded", filename: name };
    },
    onMutate: () => {
      // A new request clears any previous terminal state and any stale
      // filename, so a failed retry never leaves a downloadable object behind.
      setPhase("preparing");
      setFilename(null);
      setProgress(null);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "downloaded") {
        setFilename(outcome.filename);
        setPhase("ready");
        return;
      }
      if (outcome.kind === "too-large") {
        setPhase("too-large");
        return;
      }
      setPhase(outcome.kind === "denied" ? "denied" : "failed");
    },
    onError: () => {
      setPhase("failed");
    },
  });

  const start = useCallback(() => {
    mutation.mutate();
  }, [mutation]);

  const reset = useCallback(() => {
    setPhase("idle");
    setFilename(null);
    setProgress(null);
  }, []);

  const statusCopy =
    phase === "preparing"
      ? "Preparing archive…"
      : phase === "retrieving"
        ? `Retrieving media ${progress?.current ?? 0} of ${progress?.total ?? 0}`
        : phase === "creating"
          ? "Creating archive…"
          : phase === "ready"
            ? "Download started"
            : phase === "too-large"
              ? "This archive is too large for one bundle."
              : phase === "denied" || phase === "failed"
                ? BUNDLE_FAILED_MESSAGE
                : null;

  return {
    phase,
    state: toBundleState(phase),
    isGenerating: mutation.isPending,
    statusCopy,
    error:
      phase === "denied" || phase === "failed" ? BUNDLE_FAILED_MESSAGE : null,
    filename,
    start,
    reset,
  };
}

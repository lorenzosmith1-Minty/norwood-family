import { ExportScope, createActor } from "@/backend";
import { useActiveFamilyId } from "@/context/FamilyContext";
import {
  type ExportDownloadOutcome,
  buildExportFilename,
  downloadJsonFile,
  mapExportError,
  serializeExportEnvelope,
} from "@/lib/exportDownload";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation } from "@tanstack/react-query";
import { useCallback, useState } from "react";

/**
 * Phase 5B shared export-download hook.
 *
 * Requests an authorized Phase 5A export (MyData or FamilyArchive) for the
 * active family and turns the returned versioned envelope into an ephemeral
 * client-side JSON download. It follows the existing backend-call pattern
 * (`useActor(createActor)` + `useMutation`) used by useRecovery and
 * useStewardAuthority, and reads the active family from the centralized
 * FamilyContext — the family id is never hardcoded.
 *
 * The backend is the authorization boundary: `exportMyData` /
 * `exportFamilyArchive` decide whether the caller may export. This hook only
 * shapes the result for the UI and never widens access. On a rejection no
 * download is created and a neutral permission message is shown; on a
 * generation failure no partial or stale downloadable object is left behind
 * and the user can retry.
 *
 * The full exported JSON is never displayed in the application — it is only
 * written to the ephemeral download blob.
 */

/** The user-facing phase of an export request. */
export type ExportPhase = "idle" | "preparing" | "ready" | "denied" | "failed";

/**
 * The page-facing state of an export request. `error` is the neutral failure
 * message shown when the request did not produce a download; it is `null` in
 * every other phase.
 */
export type ExportState = "idle" | "preparing" | "ready" | "error";

/** The state returned by {@link useExportDownload}. */
export interface ExportDownloadState {
  /** The current phase, driving the visible status copy. */
  phase: ExportPhase;
  /** The page-facing state, derived from `phase`. */
  state: ExportState;
  /** True while a request is in flight; used to prevent repeated clicks. */
  isPreparing: boolean;
  /** The neutral failure message, or `null` when there is no failure. */
  error: string | null;
  /** The filename of the most recent successful download, if any. */
  filename: string | null;
  /** Requests an export for the given scope. */
  start: (scope: ExportScope) => void;
  /** Requests the caller's own MyData export. */
  downloadMyData: () => void;
  /** Clears the terminal state so the user can start a fresh export. */
  reset: () => void;
}

/** The neutral failure message shown when an export does not complete. */
const EXPORT_FAILED_MESSAGE = "Export failed — try again.";

/** Maps the internal phase to the page-facing state. */
function toExportState(phase: ExportPhase): ExportState {
  switch (phase) {
    case "preparing":
      return "preparing";
    case "ready":
      return "ready";
    case "denied":
    case "failed":
      return "error";
    default:
      return "idle";
  }
}

/**
 * Requests an authorized export for the active family and downloads it as an
 * ephemeral JSON file.
 *
 * The mutation resolves to a neutral {@link ExportDownloadOutcome}; the
 * download itself is triggered inside the mutation so a rejection or failure
 * never produces a file. `isPreparing` is true only while the request is in
 * flight, so the caller can disable its controls and prevent repeated clicks.
 */
export function useExportDownload(): ExportDownloadState {
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const [phase, setPhase] = useState<ExportPhase>("idle");
  const [filename, setFilename] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (scope: ExportScope): Promise<ExportDownloadOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      const result =
        scope === ExportScope.FamilyArchive
          ? await actor.exportFamilyArchive(familyId)
          : await actor.exportMyData(familyId);
      if (result.__kind__ === "err") {
        return mapExportError(result.err);
      }
      // The family-archive scope now returns an ExportFamilyArchiveResult that
      // wraps the versioned envelope alongside an opaque export-instance
      // reference; the MyData scope still returns the envelope directly. Unwrap
      // the envelope so the download shape is unchanged. Nothing is persisted
      // and no partial object is left behind.
      const envelope = "envelope" in result.ok ? result.ok.envelope : result.ok;
      const name = buildExportFilename(scope);
      downloadJsonFile(serializeExportEnvelope(envelope), name);
      return { kind: "downloaded", filename: name };
    },
    onMutate: () => {
      // A new request clears any previous terminal state and any stale
      // filename, so a failed retry never leaves a downloadable object behind.
      setPhase("preparing");
      setFilename(null);
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "downloaded") {
        setFilename(outcome.filename);
        setPhase("ready");
        return;
      }
      setPhase(outcome.kind === "denied" ? "denied" : "failed");
    },
    onError: () => {
      setPhase("failed");
    },
  });

  const start = useCallback(
    (scope: ExportScope) => {
      mutation.mutate(scope);
    },
    [mutation],
  );

  const downloadMyData = useCallback(() => {
    mutation.mutate(ExportScope.MyData);
  }, [mutation]);

  const reset = useCallback(() => {
    setPhase("idle");
    setFilename(null);
  }, []);

  return {
    phase,
    state: toExportState(phase),
    isPreparing: mutation.isPending,
    error:
      phase === "denied" || phase === "failed" ? EXPORT_FAILED_MESSAGE : null,
    filename,
    start,
    downloadMyData,
    reset,
  };
}

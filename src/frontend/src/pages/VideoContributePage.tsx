import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  ArrowLeft,
  AudioLines,
  BookOpen,
  Check,
  Circle,
  Clapperboard,
  FileText,
  Loader2,
  type LucideIcon,
  Mic,
  Square,
  Upload,
  Video,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSubmitArchiveItem } from "../hooks/useArchiveStorage";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import {
  ArchiveItemClassification,
  ArchiveItemType,
  MEDIA_KIND_LABELS,
  type MediaKind,
  PRIVACY_LEVEL_LABELS,
  PrivacyLevel,
  SOURCE_STATUS_LABELS,
  SourceStatus,
} from "../types/archive";
import { profiles } from "./PersonProfilePage";

interface VideoContributePageProps {
  /** Navigates back to the Family Videos & Oral History page. */
  onBack: () => void;
  /** Preselect a media kind, skipping the kind chooser. */
  initialKind?: MediaKind;
  /** Person ids to preselect as related family members. */
  initialRelatedMemberIds?: string[];
  /** Person id to preselect as the primary speaker (oral history). */
  initialSpeakerId?: string | null;
}

/** Per-kind icon and helper copy for the three media choices. */
const KIND_META: Record<MediaKind, { icon: LucideIcon; description: string }> =
  {
    "uploaded-video": {
      icon: Video,
      description: "Share a video of a family moment.",
    },
    "oral-history-video": {
      icon: Clapperboard,
      description: "Record a family member telling their story on video.",
    },
    "audio-only-oral-history": {
      icon: Mic,
      description: "Preserve a voice and memory as an audio-only recording.",
    },
  };

const KIND_ORDER: MediaKind[] = [
  "uploaded-video",
  "oral-history-video",
  "audio-only-oral-history",
];

/** Maps a media kind to the archive item type + classification it submits as. */
function kindToItemType(kind: MediaKind): ArchiveItemType {
  return kind === "audio-only-oral-history"
    ? ArchiveItemType.Audio
    : ArchiveItemType.Video;
}

/** True when a media kind is classified as oral history (requires a speaker). */
function isOralHistoryKind(kind: MediaKind): boolean {
  return kind === "oral-history-video" || kind === "audio-only-oral-history";
}

/** Parses an optional year string into a bigint, or null when empty/invalid. */
function parseYear(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

/**
 * In-browser recording for oral-history kinds. Uses the MediaRecorder API with
 * the device camera + microphone (video oral history) or microphone only
 * (audio oral history). When MediaRecorder or getUserMedia is unavailable on
 * the device, renders nothing so the page falls back to the standard file
 * upload — never a broken control.
 */
function RecordingCapture({
  kind,
  onRecorded,
}: {
  kind: MediaKind;
  onRecorded: (blob: Blob) => void;
}) {
  const isVideo = kind === "oral-history-video";
  const [supported, setSupported] = useState<boolean | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    setSupported(
      typeof MediaRecorder !== "undefined" &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
  }, []);

  // Stop any active stream and timer when the component unmounts.
  useEffect(() => {
    return () => {
      for (const track of streamRef.current?.getTracks() ?? []) {
        track.stop();
      }
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        isVideo ? { video: true, audio: true } : { audio: true },
      );
      streamRef.current = stream;
      if (videoRef.current && isVideo) {
        videoRef.current.srcObject = stream;
      }
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const fullBlob = new Blob(chunksRef.current, {
          type: isVideo ? "video/webm" : "audio/webm",
        });
        for (const track of streamRef.current?.getTracks() ?? []) {
          track.stop();
        }
        streamRef.current = null;
        if (timerRef.current !== null) window.clearInterval(timerRef.current);
        setIsRecording(false);
        onRecorded(fullBlob);
      };
      recorder.start();
      setIsRecording(true);
      setSeconds(0);
      timerRef.current = window.setInterval(
        () => setSeconds((current) => current + 1),
        1000,
      );
    } catch {
      setError("Unable to access your camera or microphone.");
    }
  };

  const stop = () => {
    mediaRecorderRef.current?.stop();
  };

  if (supported === null) return null;
  if (!supported) return null;

  const formatTime = (total: number) => {
    const minutes = Math.floor(total / 60);
    const secs = total % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="rounded-2xl border border-border bg-card p-4 shadow-subtle"
      data-ocid="video_contribute.form.recording_panel"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {isVideo ? (
            <Video
              className="h-4 w-4 text-accent-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          ) : (
            <Mic
              className="h-4 w-4 text-accent-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          )}
          <span className="text-sm font-semibold text-foreground">
            {isVideo
              ? "Record with camera & microphone"
              : "Record with microphone"}
          </span>
        </div>
        {isRecording ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <span
              className="h-2 w-2 animate-pulse rounded-full bg-destructive"
              aria-hidden="true"
            />
            REC {formatTime(seconds)}
          </span>
        ) : null}
      </div>

      {isVideo && isRecording ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="mt-3 aspect-video w-full rounded-lg bg-black object-cover"
        />
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {isRecording ? (
          <button
            type="button"
            data-ocid="video_contribute.form.stop_recording_button"
            onClick={stop}
            className="inline-flex items-center gap-2 rounded-full bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground transition-colors hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Square
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden="true"
            />
            Stop recording
          </button>
        ) : (
          <button
            type="button"
            data-ocid="video_contribute.form.start_recording_button"
            onClick={() => void start()}
            className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Circle
              className="h-4 w-4"
              fill="currentColor"
              aria-hidden="true"
            />
            Start recording
          </button>
        )}
        <span className="text-xs text-muted-foreground">
          {isRecording
            ? "Recording in progress — press stop when finished."
            : "Or upload a file below."}
        </span>
      </div>

      {error ? (
        <p
          data-ocid="video_contribute.form.recording_error"
          className="mt-3 rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Renders a selection chip for a person who is part of the current selection
 * but has no entry in the static `profiles` record — e.g. a backend-resolved /
 * graph-only profile such as Waxx Minty (lorenzoSmithJr). The display name is
 * resolved from the backend via useCanonicalPerson so the preselected person's
 * chip renders with a visible selected checkmark and can be re-selected as
 * speaker. While the name is still resolving it falls back to the person id so
 * the chip always renders.
 */
function ResolvedProfileChip({
  personId,
  selected,
  onToggle,
  kind,
}: {
  personId: string;
  selected: boolean;
  onToggle: () => void;
  kind: "speaker" | "member";
}) {
  const { displayName } = useCanonicalPerson(personId, personId);
  return (
    <button
      type="button"
      data-ocid={`video_contribute.form.${kind}.${personId}`}
      onClick={onToggle}
      aria-pressed={selected}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        selected
          ? "border-accent bg-accent text-accent-foreground"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {selected ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : null}
      {displayName}
    </button>
  );
}

export function VideoContributePage({
  onBack,
  initialKind,
  initialRelatedMemberIds,
  initialSpeakerId,
}: VideoContributePageProps) {
  const { isAuthenticated, login, isInitializing, isLoggingIn } =
    useInternetIdentity();
  const submit = useSubmitArchiveItem();

  const [selectedKind, setSelectedKind] = useState<MediaKind | null>(
    initialKind ?? null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [era, setEra] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");
  const [relatedMemberIds, setRelatedMemberIds] = useState<string[]>(
    initialRelatedMemberIds ?? [],
  );
  const [relatedBranch, setRelatedBranch] = useState("");
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>(
    SourceStatus.Unverified,
  );
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(
    PrivacyLevel.FamilyOnly,
  );
  // Single primary speaker, required for oral-history kinds. Stored as the
  // canonical person id; resolved to a name + personId at submit time.
  const [speakerId, setSpeakerId] = useState<string | null>(
    initialSpeakerId ?? null,
  );

  // Backend-resolved / graph-only people (e.g. Waxx Minty) have no static
  // profile chip. Track them so their chips render persistently in the
  // speaker list and stay selectable even after being deselected.
  const knownResolvedPeople = useMemo(() => {
    const initial = new Set<string>();
    if (initialSpeakerId && !profiles[initialSpeakerId]) {
      initial.add(initialSpeakerId);
    }
    for (const id of initialRelatedMemberIds ?? []) {
      if (!profiles[id]) initial.add(id);
    }
    return [...initial];
  }, [initialSpeakerId, initialRelatedMemberIds]);

  // Resolve the primary speaker's display name from the backend so a
  // backend-resolved / graph-only speaker (e.g. Waxx Minty) saves a correct
  // name rather than an empty string. Falls back to the static profile name.
  const speakerCanonical = useCanonicalPerson(
    speakerId ?? undefined,
    speakerId ? (profiles[speakerId]?.name ?? "") : "",
  );

  // File upload state
  const [fileBytes, setFileBytes] = useState<Uint8Array<ArrayBuffer> | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOralHistory =
    selectedKind !== null && isOralHistoryKind(selectedKind);

  const handleFile = async (file: File) => {
    if (!file) return;
    setFileBytes(new Uint8Array(await file.arrayBuffer()));
    setFileName(file.name);
    setFileMime(file.type);
    setProgress(null);
  };
  // Converts a completed in-browser recording into the same file state used by
  // the standard upload path, so the recorded media submits through the
  // canonical Archive item architecture.
  const handleRecorded = async (blob: Blob) => {
    setFileBytes(new Uint8Array(await blob.arrayBuffer()));
    setFileName(
      selectedKind === "audio-only-oral-history"
        ? "audio-recording.webm"
        : "video-recording.webm",
    );
    setFileMime(blob.type);
    setProgress(null);
  };
  const toggleMember = (id: string) => {
    setRelatedMemberIds((current) =>
      current.includes(id)
        ? current.filter((memberId) => memberId !== id)
        : [...current, id],
    );
  };

  const resetForm = () => {
    setSelectedKind(null);
    setTitle("");
    setDescription("");
    setEra("");
    setYear("");
    setTags("");
    setRelatedMemberIds([]);
    setRelatedBranch("");
    setSourceStatus(SourceStatus.Unverified);
    setPrivacyLevel(PrivacyLevel.FamilyOnly);
    setSpeakerId(null);
    setFileBytes(null);
    setFileName("");
    setFileMime("");
    setProgress(null);
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedKind) return;
    setError(null);

    if (!fileBytes) {
      setError("Please choose a file to upload before submitting.");
      return;
    }

    // Oral-history kinds require a single primary speaker.
    if (isOralHistory && !speakerId) {
      setError("Please choose who is speaking before submitting.");
      return;
    }

    const blob = ExternalBlob.fromBytes(
      fileBytes,
      fileMime,
      fileName,
    ).withUploadProgress(setProgress);

    submit.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        itemType: kindToItemType(selectedKind),
        blob,
        era: era.trim(),
        year: parseYear(year),
        tags: tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        relatedMemberIds,
        relatedBranchId: relatedBranch.trim() || null,
        sourceStatus,
        privacyLevel,
        classification: isOralHistory
          ? ArchiveItemClassification.OralHistory
          : ArchiveItemClassification.Standard,
        primarySpeaker: isOralHistory
          ? {
              name: speakerCanonical.displayName,
              personId: speakerId ?? undefined,
            }
          : null,
      },
      {
        onSuccess: () => setSubmitted(true),
        onError: () =>
          setError("Something went wrong while submitting. Please try again."),
      },
    );
  };

  // ---- Confirmation screen ----
  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-elevated"
          data-ocid="video_contribute.submit.success_state"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
            <Check
              className="h-7 w-7 text-success"
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Media submitted
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Thank you for adding to the Norwood family history. Your{" "}
            {MEDIA_KIND_LABELS[selectedKind!].toLowerCase()} is now awaiting
            admin approval and will appear in Family Videos &amp; Oral History
            once it is reviewed.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              data-ocid="video_contribute.submit.add_another_button"
              onClick={() => {
                resetForm();
                setSubmitted(false);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Add another media item
            </button>
            <button
              type="button"
              data-ocid="video_contribute.submit.back_videos_button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to Videos
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ---- Sign-in gate ----
  if (!isAuthenticated) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <button
            type="button"
            data-ocid="video_contribute.signin.back_button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Videos
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-elevated"
          data-ocid="video_contribute.signin.prompt"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
            <BookOpen
              className="h-7 w-7 text-accent-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Sign in to add media
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Contributions are recorded with your name so the family knows who
            shared each piece. Sign in to begin adding videos and oral histories
            to the Norwood family archive.
          </p>
          <button
            type="button"
            data-ocid="video_contribute.signin.primary_button"
            onClick={() => login()}
            disabled={isInitializing || isLoggingIn}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            {isLoggingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {isLoggingIn ? "Signing in…" : "Sign in"}
          </button>
        </motion.div>
      </div>
    );
  }

  // ---- Step 1: media-kind chooser ----
  if (selectedKind === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <button
            type="button"
            data-ocid="video_contribute.kind.back_button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Videos
          </button>
        </motion.div>

        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
            <AudioLines
              className="h-4 w-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Family Videos &amp; Oral History
          </span>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            What would you like to add?
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Choose the kind of media you'd like to preserve for the Norwood
            family.
          </p>
        </motion.header>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {KIND_ORDER.map((kind, index) => {
            const meta = KIND_META[kind];
            const Icon = meta.icon;
            const oral = isOralHistoryKind(kind);
            return (
              <motion.button
                key={kind}
                type="button"
                data-ocid={`video_contribute.kind.card.${index + 1}`}
                onClick={() => setSelectedKind(kind)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.05 + index * 0.04,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span
                  className="flex h-11 w-11 items-center justify-center rounded-xl"
                  style={
                    oral
                      ? {
                          backgroundColor: "oklch(var(--oral-history) / 0.14)",
                          color: "oklch(var(--oral-history))",
                        }
                      : undefined
                  }
                >
                  <Icon
                    className="h-5 w-5 text-accent-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <span className="flex flex-col items-start gap-1.5">
                  <span
                    className={`archive-type-badge ${
                      oral ? "badge-oral-history" : "badge-video"
                    }`}
                  >
                    {MEDIA_KIND_LABELS[kind]}
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    {meta.description}
                  </span>
                </span>
              </motion.button>
            );
          })}
        </div>
      </div>
    );
  }

  // ---- Step 2: media form ----
  const meta = KIND_META[selectedKind];
  const KindIcon = meta.icon;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          data-ocid="video_contribute.form.back_button"
          onClick={() => setSelectedKind(null)}
          className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Choose a different kind
        </button>
      </motion.div>

      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <span
          className={`archive-type-badge ${
            isOralHistory ? "badge-oral-history" : "badge-video"
          }`}
        >
          {MEDIA_KIND_LABELS[selectedKind]}
        </span>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Add {MEDIA_KIND_LABELS[selectedKind].toLowerCase()}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <KindIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          {meta.description}
        </p>
      </motion.header>

      <motion.form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* In-browser recording for oral-history kinds (falls back to upload) */}
        {isOralHistory ? (
          <RecordingCapture
            kind={selectedKind}
            onRecorded={(blob) => void handleRecorded(blob)}
          />
        ) : null}

        {/* File upload */}
        <div>
          <label className="field-label" htmlFor="video-file">
            Upload file
          </label>
          <input
            ref={fileInputRef}
            id="video-file"
            type="file"
            className="sr-only"
            data-ocid="video_contribute.form.file_input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />
          {fileName ? (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-subtle"
              data-ocid="video_contribute.form.file_selected"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                  <FileText
                    className="h-4 w-4 text-accent-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {fileName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fileMime || "File"} · ready to submit
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-ocid="video_contribute.form.change_file_button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-ocid="video_contribute.form.dropzone"
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDragover(true);
              }}
              onDragLeave={() => setDragover(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragover(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void handleFile(file);
              }}
              className={`dropzone focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                dragover ? "dragover" : ""
              }`}
            >
              <Upload
                className="h-6 w-6 text-muted-foreground"
                strokeWidth={1.5}
                aria-hidden="true"
              />
              <span className="dropzone-title">Choose a file to upload</span>
              <span className="dropzone-hint">
                Drag and drop, or tap to browse. The original file is preserved
                as-is.
              </span>
            </button>
          )}

          {progress !== null && (
            <div
              className="upload-progress"
              data-ocid="video_contribute.form.upload_progress"
            >
              <div className="upload-progress-label">
                <span>Uploading…</span>
                <span className="upload-percent">{progress}%</span>
              </div>
              <div
                className="progress-track"
                role="progressbar"
                tabIndex={0}
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div
                  className="progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Title */}
        <div>
          <label className="field-label" htmlFor="video-title">
            Title
          </label>
          <input
            id="video-title"
            data-ocid="video_contribute.form.title_input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give this media a short title"
            className="form-input"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="field-label" htmlFor="video-description">
            Description
          </label>
          <textarea
            id="video-description"
            data-ocid="video_contribute.form.description_textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tell us what this is and why it matters to the family"
            className="form-textarea"
          />
        </div>

        {/* Speaker — required for oral history, hidden otherwise */}
        {isOralHistory ? (
          <div>
            <span className="field-label">Who is speaking?</span>
            <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
              Choose the single primary speaker for this oral history. Select a
              family member from the tree when they exist.
            </p>
            <div className="flex flex-wrap gap-2">
              {Object.values(profiles).map((profile) => {
                const selected = speakerId === profile.id;
                return (
                  <button
                    key={profile.id}
                    type="button"
                    data-ocid={`video_contribute.form.speaker.${profile.id}`}
                    onClick={() => setSpeakerId(selected ? null : profile.id)}
                    aria-pressed={selected}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {selected ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : null}
                    {profile.name}
                  </button>
                );
              })}
              {/* Backend-resolved / graph-only speakers (e.g. Waxx Minty) have
                  no static profile chip. Render one persistently so they stay
                  selectable even after the speaker is changed to a static
                  profile. */}
              {knownResolvedPeople.map((id) => (
                <ResolvedProfileChip
                  key={id}
                  personId={id}
                  selected={speakerId === id}
                  onToggle={() => setSpeakerId(speakerId === id ? null : id)}
                  kind="speaker"
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Date / era + optional year */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="video-era">
              Date or approximate era
            </label>
            <input
              id="video-era"
              data-ocid="video_contribute.form.era_input"
              type="text"
              value={era}
              onChange={(event) => setEra(event.target.value)}
              placeholder="e.g. circa 1920s, or a specific date"
              className="form-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="video-year">
              Year (optional)
            </label>
            <input
              id="video-year"
              data-ocid="video_contribute.form.year_input"
              type="text"
              inputMode="numeric"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="e.g. 1924"
              className="form-input"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="field-label" htmlFor="video-tags">
            Tags
          </label>
          <input
            id="video-tags"
            data-ocid="video_contribute.form.tags_input"
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Separate tags with commas, e.g. wedding, Mississippi, 1920s"
            className="form-input"
          />
        </div>

        {/* Related family members */}
        <div>
          <span className="field-label">Related family members</span>
          <div className="flex flex-wrap gap-2">
            {Object.values(profiles).map((profile) => {
              const selected = relatedMemberIds.includes(profile.id);
              return (
                <button
                  key={profile.id}
                  type="button"
                  data-ocid={`video_contribute.form.member.${profile.id}`}
                  onClick={() => toggleMember(profile.id)}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                    selected
                      ? "border-accent bg-accent text-accent-foreground"
                      : "border-border bg-card text-foreground hover:bg-muted"
                  }`}
                >
                  {selected ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {profile.name}
                </button>
              );
            })}
            {/* Backend-resolved / graph-only members (e.g. Waxx Minty) have no
                static profile chip, so render one per selected id so the
                preselected person shows a visible selected checkmark and can be
                toggled off. */}
            {relatedMemberIds
              .filter((id) => !profiles[id])
              .map((id) => (
                <ResolvedProfileChip
                  key={id}
                  personId={id}
                  selected
                  onToggle={() => toggleMember(id)}
                  kind="member"
                />
              ))}
          </div>
        </div>

        {/* Related branch */}
        <div>
          <label className="field-label" htmlFor="video-branch">
            Related branch (optional)
          </label>
          <input
            id="video-branch"
            data-ocid="video_contribute.form.branch_input"
            type="text"
            value={relatedBranch}
            onChange={(event) => setRelatedBranch(event.target.value)}
            placeholder="e.g. the Clayton Norwood branch"
            className="form-input"
          />
        </div>

        {/* Source status + privacy */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="video-source">
              Source / evidence status
            </label>
            <select
              id="video-source"
              data-ocid="video_contribute.form.source_select"
              value={sourceStatus}
              onChange={(event) =>
                setSourceStatus(event.target.value as SourceStatus)
              }
              className="form-select"
            >
              {Object.values(SourceStatus).map((status) => (
                <option key={status} value={status}>
                  {SOURCE_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="field-label" htmlFor="video-privacy">
              Privacy level
            </label>
            <select
              id="video-privacy"
              data-ocid="video_contribute.form.privacy_select"
              value={privacyLevel}
              onChange={(event) =>
                setPrivacyLevel(event.target.value as PrivacyLevel)
              }
              className="form-select"
            >
              {Object.values(PrivacyLevel).map((level) => (
                <option key={level} value={level}>
                  {PRIVACY_LEVEL_LABELS[level]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <p
            data-ocid="video_contribute.form.error_state"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your media will be reviewed by an admin before it appears in Family
            Videos &amp; Oral History.
          </p>
          <button
            type="submit"
            data-ocid="video_contribute.form.submit_button"
            disabled={submit.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            {submit.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {submit.isPending ? "Submitting…" : "Submit for approval"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

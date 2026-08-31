import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  ArrowLeft,
  AudioLines,
  BookOpen,
  Briefcase,
  Camera,
  Check,
  FileText,
  Loader2,
  type LucideIcon,
  MoreHorizontal,
  NotebookPen,
  Search,
  Upload,
  Video,
} from "lucide-react";
import { motion } from "motion/react";
import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useSubmitArchiveItem } from "../hooks/useArchiveStorage";
import {
  ARCHIVE_ITEM_TYPE_BADGE,
  ARCHIVE_ITEM_TYPE_LABELS,
  ArchiveItemType,
  PRIVACY_LEVEL_LABELS,
  PrivacyLevel,
  SOURCE_STATUS_LABELS,
  SourceStatus,
} from "../types/archive";
import { profiles } from "./PersonProfilePage";

interface ArchiveContributionPageProps {
  onBack: () => void;
}

/** Per-type icon and helper copy for the eight contribution choices. */
const TYPE_META: Record<
  ArchiveItemType,
  { icon: LucideIcon; description: string }
> = {
  [ArchiveItemType.Photo]: {
    icon: Camera,
    description: "Share a photograph of a family member or place.",
  },
  [ArchiveItemType.Document]: {
    icon: FileText,
    description: "Upload a letter, record, or other document.",
  },
  [ArchiveItemType.Audio]: {
    icon: AudioLines,
    description: "Add a recording of a voice or memory.",
  },
  [ArchiveItemType.Video]: {
    icon: Video,
    description: "Share a video of a family moment.",
  },
  [ArchiveItemType.WrittenStoryNote]: {
    icon: NotebookPen,
    description: "Write a story or note to preserve.",
  },
  [ArchiveItemType.Research]: {
    icon: Search,
    description: "Contribute research findings or evidence.",
  },
  [ArchiveItemType.WorkBusiness]: {
    icon: Briefcase,
    description: "Add work or business material.",
  },
  [ArchiveItemType.Other]: {
    icon: MoreHorizontal,
    description: "Something else worth preserving.",
  },
};

/** Types that upload an original file; the written story/note is text instead. */
const FILE_TYPES: ArchiveItemType[] = [
  ArchiveItemType.Photo,
  ArchiveItemType.Document,
  ArchiveItemType.Audio,
  ArchiveItemType.Video,
  ArchiveItemType.Research,
  ArchiveItemType.WorkBusiness,
  ArchiveItemType.Other,
];

const TYPE_ORDER: ArchiveItemType[] = [
  ArchiveItemType.Photo,
  ArchiveItemType.Document,
  ArchiveItemType.Audio,
  ArchiveItemType.Video,
  ArchiveItemType.WrittenStoryNote,
  ArchiveItemType.Research,
  ArchiveItemType.WorkBusiness,
  ArchiveItemType.Other,
];

/** Parses an optional year string into a bigint, or null when empty/invalid. */
function parseYear(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

export function ArchiveContributionPage({
  onBack,
}: ArchiveContributionPageProps) {
  const { isAuthenticated, login, isInitializing, isLoggingIn } =
    useInternetIdentity();
  const submit = useSubmitArchiveItem();

  const [selectedType, setSelectedType] = useState<ArchiveItemType | null>(
    null,
  );
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [era, setEra] = useState("");
  const [year, setYear] = useState("");
  const [tags, setTags] = useState("");
  const [relatedMemberIds, setRelatedMemberIds] = useState<string[]>([]);
  const [relatedBranch, setRelatedBranch] = useState("");
  const [sourceStatus, setSourceStatus] = useState<SourceStatus>(
    SourceStatus.Unverified,
  );
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(
    PrivacyLevel.FamilyOnly,
  );

  // File upload state (file-based types only)
  const [fileBytes, setFileBytes] = useState<Uint8Array<ArrayBuffer> | null>(
    null,
  );
  const [fileName, setFileName] = useState("");
  const [fileMime, setFileMime] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [dragover, setDragover] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Written story/note text
  const [storyText, setStoryText] = useState("");

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isFileType = selectedType !== null && FILE_TYPES.includes(selectedType);

  const handleFile = async (file: File) => {
    if (!file) return;
    setFileBytes(new Uint8Array(await file.arrayBuffer()));
    setFileName(file.name);
    setFileMime(file.type);
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
    setSelectedType(null);
    setTitle("");
    setDescription("");
    setEra("");
    setYear("");
    setTags("");
    setRelatedMemberIds([]);
    setRelatedBranch("");
    setSourceStatus(SourceStatus.Unverified);
    setPrivacyLevel(PrivacyLevel.FamilyOnly);
    setFileBytes(null);
    setFileName("");
    setFileMime("");
    setProgress(null);
    setStoryText("");
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedType) return;
    setError(null);

    let blob: ExternalBlob;
    if (selectedType === ArchiveItemType.WrittenStoryNote) {
      const text = storyText.trim();
      if (!text) {
        setError("Please write your story or note before submitting.");
        return;
      }
      blob = ExternalBlob.fromBytes(
        new TextEncoder().encode(text),
        "text/plain",
        "story.txt",
      );
    } else {
      if (!fileBytes) {
        setError("Please choose a file to upload before submitting.");
        return;
      }
      blob = ExternalBlob.fromBytes(
        fileBytes,
        fileMime,
        fileName,
      ).withUploadProgress(setProgress);
    }

    submit.mutate(
      {
        title: title.trim(),
        description: description.trim(),
        itemType: selectedType,
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
          data-ocid="archive.submit.success_state"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
            <Check
              className="h-7 w-7 text-success"
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Contribution submitted
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Thank you for adding to the Norwood family history. Your{" "}
            {ARCHIVE_ITEM_TYPE_LABELS[selectedType!].toLowerCase()} is now
            awaiting admin approval and will appear in the archive once it is
            reviewed.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              data-ocid="archive.submit.add_another_button"
              onClick={() => {
                resetForm();
                setSubmitted(false);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Add another contribution
            </button>
            <button
              type="button"
              data-ocid="archive.submit.back_home_button"
              onClick={onBack}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to Home
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
            data-ocid="archive.signin.back_button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Home
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-elevated"
          data-ocid="archive.signin.prompt"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
            <BookOpen
              className="h-7 w-7 text-accent-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Sign in to add to our history
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Contributions are recorded with your name so the family knows who
            shared each piece. Sign in to begin adding photos, documents,
            stories, and more to the Norwood family archive.
          </p>
          <button
            type="button"
            data-ocid="archive.signin.primary_button"
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

  // ---- Step 1: type chooser ----
  if (selectedType === null) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <button
            type="button"
            data-ocid="archive.type.back_button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Home
          </button>
        </motion.div>

        <motion.header
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
        >
          <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
            <BookOpen
              className="h-4 w-4"
              strokeWidth={1.75}
              aria-hidden="true"
            />
            Add to Our History
          </span>
          <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
            What would you like to share?
          </h1>
          <p className="mt-2 text-base leading-relaxed text-muted-foreground">
            Choose the kind of contribution you'd like to add to the Norwood
            family archive.
          </p>
        </motion.header>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {TYPE_ORDER.map((type, index) => {
            const meta = TYPE_META[type];
            const Icon = meta.icon;
            return (
              <motion.button
                key={type}
                type="button"
                data-ocid={`archive.type.card.${index + 1}`}
                onClick={() => setSelectedType(type)}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.5,
                  delay: 0.05 + index * 0.04,
                  ease: [0.4, 0, 0.2, 1],
                }}
                className="group flex flex-col items-start gap-3 rounded-2xl border border-border bg-card p-5 text-left shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-secondary">
                  <Icon
                    className="h-5 w-5 text-accent-foreground"
                    strokeWidth={1.75}
                    aria-hidden="true"
                  />
                </span>
                <span className="flex flex-col items-start gap-1.5">
                  <span
                    className={`archive-type-badge ${ARCHIVE_ITEM_TYPE_BADGE[type]}`}
                  >
                    {ARCHIVE_ITEM_TYPE_LABELS[type]}
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

  // ---- Step 2: contribution form ----
  const meta = TYPE_META[selectedType];
  const TypeIcon = meta.icon;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          data-ocid="archive.form.back_button"
          onClick={() => setSelectedType(null)}
          className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Choose a different type
        </button>
      </motion.div>

      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <span
          className={`archive-type-badge ${ARCHIVE_ITEM_TYPE_BADGE[selectedType]}`}
        >
          {ARCHIVE_ITEM_TYPE_LABELS[selectedType]}
        </span>
        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Add {ARCHIVE_ITEM_TYPE_LABELS[selectedType].toLowerCase()}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
          <TypeIcon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
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
        {/* File upload for file-based types */}
        {isFileType ? (
          <div>
            <label className="field-label" htmlFor="archive-file">
              Upload file
            </label>
            <input
              ref={fileInputRef}
              id="archive-file"
              type="file"
              className="sr-only"
              data-ocid="archive.form.file_input"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleFile(file);
                event.target.value = "";
              }}
            />
            {fileName ? (
              <div
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-subtle"
                data-ocid="archive.form.file_selected"
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
                  data-ocid="archive.form.change_file_button"
                  onClick={() => fileInputRef.current?.click()}
                  className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                >
                  Change
                </button>
              </div>
            ) : (
              <button
                type="button"
                data-ocid="archive.form.dropzone"
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
                  Drag and drop, or tap to browse. The original file is
                  preserved as-is.
                </span>
              </button>
            )}

            {progress !== null && (
              <div
                className="upload-progress"
                data-ocid="archive.form.upload_progress"
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
        ) : (
          <div>
            <label className="field-label" htmlFor="archive-story">
              Your story or note
            </label>
            <textarea
              id="archive-story"
              data-ocid="archive.form.story_textarea"
              value={storyText}
              onChange={(event) => setStoryText(event.target.value)}
              placeholder="Write the story or note you'd like to preserve for the family…"
              className="form-textarea"
            />
          </div>
        )}

        {/* Title */}
        <div>
          <label className="field-label" htmlFor="archive-title">
            Title
          </label>
          <input
            id="archive-title"
            data-ocid="archive.form.title_input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Give this contribution a short title"
            className="form-input"
            required
          />
        </div>

        {/* Description */}
        <div>
          <label className="field-label" htmlFor="archive-description">
            Description
          </label>
          <textarea
            id="archive-description"
            data-ocid="archive.form.description_textarea"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Tell us what this is and why it matters to the family"
            className="form-textarea"
          />
        </div>

        {/* Date / era + optional year */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="archive-era">
              Date or approximate era
            </label>
            <input
              id="archive-era"
              data-ocid="archive.form.era_input"
              type="text"
              value={era}
              onChange={(event) => setEra(event.target.value)}
              placeholder="e.g. circa 1920s, or a specific date"
              className="form-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="archive-year">
              Year (optional)
            </label>
            <input
              id="archive-year"
              data-ocid="archive.form.year_input"
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
          <label className="field-label" htmlFor="archive-tags">
            Tags
          </label>
          <input
            id="archive-tags"
            data-ocid="archive.form.tags_input"
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
                  data-ocid={`archive.form.member.${profile.id}`}
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
          </div>
        </div>

        {/* Related branch */}
        <div>
          <label className="field-label" htmlFor="archive-branch">
            Related branch (optional)
          </label>
          <input
            id="archive-branch"
            data-ocid="archive.form.branch_input"
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
            <label className="field-label" htmlFor="archive-source">
              Source / evidence status
            </label>
            <select
              id="archive-source"
              data-ocid="archive.form.source_select"
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
            <label className="field-label" htmlFor="archive-privacy">
              Privacy level
            </label>
            <select
              id="archive-privacy"
              data-ocid="archive.form.privacy_select"
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
            data-ocid="archive.form.error_state"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your contribution will be reviewed by an admin before it appears in
            the archive.
          </p>
          <button
            type="submit"
            data-ocid="archive.form.submit_button"
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

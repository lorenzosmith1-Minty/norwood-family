import { useInternetIdentity } from "@caffeineai/core-infrastructure";
import { ExternalBlob } from "@caffeineai/object-storage";
import {
  ArrowLeft,
  BookOpen,
  Check,
  FileText,
  Image,
  Loader2,
  Upload,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  useApprovedArchiveItems,
  useSubmitArchiveItem,
} from "../hooks/useArchiveStorage";
import { useCanonicalPerson } from "../hooks/useCanonicalPerson";
import { useSubmitRecipe } from "../hooks/useRecipes";
import {
  ArchiveItemClassification,
  ArchiveItemType,
  PRIVACY_LEVEL_LABELS,
  PrivacyLevel,
  SOURCE_STATUS_LABELS,
  SourceStatus,
} from "../types/archive";
import { EvidenceStatus, RECIPE_EVIDENCE_LABELS } from "../types/recipes";
import { profiles } from "./PersonProfilePage";

interface RecipeContributePageProps {
  /** Navigates back to the Family Recipes page (or the originating profile). */
  onBack: () => void;
  /** Navigates to the Family Recipes browsing view. */
  onOpenRecipes: () => void;
  /**
   * Optional preselection carried in when launched from a Person Profile. The
   * profile person is preselected as the originating member or a related
   * member depending on `role`, visibly shown, and changeable before submit.
   */
  preselect?: { personId: string; role: "originating" | "related" };
}

/** Parses an optional year string into a bigint, or null when empty/invalid. */
function parseYear(value: string): bigint | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{1,4}$/.test(trimmed)) return null;
  return BigInt(trimmed);
}

/**
 * Renders a selection chip for a person who is part of the current selection
 * but has no entry in the static `profiles` record — e.g. a backend-resolved /
 * graph-only profile. The display name is resolved from the backend via
 * useCanonicalPerson so the preselected person's chip renders with a visible
 * selected checkmark and can be re-selected. While the name is still resolving
 * it falls back to the person id so the chip always renders.
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
  kind: "originating" | "member";
}) {
  const { displayName } = useCanonicalPerson(personId, personId);
  return (
    <button
      type="button"
      data-ocid={`recipe.form.${kind}.${personId}`}
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

export function RecipeContributePage({
  onBack,
  onOpenRecipes,
  preselect,
}: RecipeContributePageProps) {
  const { isAuthenticated, login, isInitializing, isLoggingIn } =
    useInternetIdentity();
  const submitRecipe = useSubmitRecipe();
  const submitMedia = useSubmitArchiveItem();
  const { data: approvedMedia = [] } = useApprovedArchiveItems();

  // ---- Text fields ----
  const [title, setTitle] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [instructions, setInstructions] = useState("");
  const [familyStory, setFamilyStory] = useState("");
  const [era, setEra] = useState("");
  const [year, setYear] = useState("");
  const [location, setLocation] = useState("");
  const [familyBranch, setFamilyBranch] = useState("");
  const [tags, setTags] = useState("");

  // ---- Person selection (Norwood checkmark pattern) ----
  // Single originating member; multi-select related members.
  const [originatingId, setOriginatingId] = useState<string | null>(
    preselect?.role === "originating" ? preselect.personId : null,
  );
  const [relatedMemberIds, setRelatedMemberIds] = useState<string[]>(
    preselect?.role === "related" ? [preselect.personId] : [],
  );

  // ---- Privacy + evidence ----
  const [privacyLevel, setPrivacyLevel] = useState<PrivacyLevel>(
    PrivacyLevel.FamilyOnly,
  );
  const [evidenceStatus, setEvidenceStatus] = useState<EvidenceStatus>(
    EvidenceStatus.PersonalMemory,
  );

  // ---- Media: attach existing (link) + upload new (one canonical record) ----
  const [attachedMediaIds, setAttachedMediaIds] = useState<bigint[]>([]);
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

  // Backend-resolved / graph-only people (e.g. Waxx Minty) have no static
  // profile chip. Track them so their chips render persistently in the member
  // lists and stay selectable even after being deselected.
  const knownResolvedPeople = useMemo(() => {
    const initial = new Set<string>();
    if (preselect?.personId && !profiles[preselect.personId]) {
      initial.add(preselect.personId);
    }
    for (const id of relatedMemberIds) {
      if (!profiles[id]) initial.add(id);
    }
    return [...initial];
  }, [preselect?.personId, relatedMemberIds]);

  // Resolve the originating member's canonical display name from the backend
  // so a backend-resolved / graph-only origin (e.g. Waxx Minty) shows a real
  // name rather than an internal id or slug.
  const originatingCanonical = useCanonicalPerson(
    originatingId ?? undefined,
    originatingId ? (profiles[originatingId]?.name ?? "") : "",
  );

  const handleFile = async (file: File) => {
    if (!file) return;
    setFileBytes(new Uint8Array(await file.arrayBuffer()));
    setFileName(file.name);
    setFileMime(file.type);
    setProgress(null);
  };

  const toggleOriginating = (id: string) => {
    setOriginatingId((current) => (current === id ? null : id));
  };
  const toggleMember = (id: string) => {
    setRelatedMemberIds((current) =>
      current.includes(id)
        ? current.filter((memberId) => memberId !== id)
        : [...current, id],
    );
  };
  const toggleAttachedMedia = (id: bigint) => {
    setAttachedMediaIds((current) =>
      current.includes(id)
        ? current.filter((mediaId) => mediaId !== id)
        : [...current, id],
    );
  };

  const resetForm = () => {
    setTitle("");
    setShortDescription("");
    setIngredients("");
    setInstructions("");
    setFamilyStory("");
    setEra("");
    setYear("");
    setLocation("");
    setFamilyBranch("");
    setTags("");
    setOriginatingId(null);
    setRelatedMemberIds([]);
    setPrivacyLevel(PrivacyLevel.FamilyOnly);
    setEvidenceStatus(EvidenceStatus.PersonalMemory);
    setAttachedMediaIds([]);
    setFileBytes(null);
    setFileName("");
    setFileMime("");
    setProgress(null);
    setError(null);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Please give the recipe a title before submitting.");
      return;
    }
    if (!originatingId) {
      setError("Please choose whose recipe this is before submitting.");
      return;
    }

    const linkedMediaIds = [...attachedMediaIds];

    // Upload new media first (if any): creates ONE canonical archive/media
    // record via useSubmitArchiveItem, then links its id to the recipe. The
    // same record can be linked to other recipes/profiles without duplication.
    const finishSubmit = () => {
      submitRecipe.mutate(
        {
          title: title.trim(),
          shortDescription: shortDescription.trim(),
          originatingPersonId: originatingId!,
          relatedPersonIds: relatedMemberIds,
          era: era.trim() || null,
          year: parseYear(year),
          location: location.trim() || null,
          familyBranch: familyBranch.trim() || null,
          ingredients: ingredients
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          instructions: instructions.trim(),
          familyStory: familyStory.trim() || null,
          tags: tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          privacyLevel,
          evidenceStatus,
          linkedMediaIds,
        },
        {
          onSuccess: () => setSubmitted(true),
          onError: () =>
            setError(
              "Something went wrong while submitting. Please try again.",
            ),
        },
      );
    };

    if (fileBytes) {
      const blob = ExternalBlob.fromBytes(
        fileBytes,
        fileMime,
        fileName,
      ).withUploadProgress(setProgress);
      submitMedia.mutate(
        {
          title: fileName,
          description: `Recipe media for "${title.trim()}"`,
          itemType: ArchiveItemType.Photo,
          blob,
          era: era.trim(),
          year: parseYear(year),
          tags: [],
          relatedMemberIds: [originatingId, ...relatedMemberIds],
          relatedBranchId: familyBranch.trim() || null,
          sourceStatus: SourceStatus.Original,
          privacyLevel,
          classification: ArchiveItemClassification.Standard,
          primarySpeaker: null,
        },
        {
          onSuccess: (created) => {
            linkedMediaIds.push(created.id);
            finishSubmit();
          },
          onError: () =>
            setError(
              "Something went wrong uploading your media. Please try again.",
            ),
        },
      );
      return;
    }

    finishSubmit();
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
          data-ocid="recipe.submit.success_state"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-success/15">
            <Check
              className="h-7 w-7 text-success"
              strokeWidth={2}
              aria-hidden="true"
            />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Recipe submitted for review
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Thank you for preserving this family recipe. It is now{" "}
            <span className="font-semibold text-foreground">Pending</span> and
            awaiting Family Steward approval. Once approved it will appear in
            Family Recipes.
          </p>
          <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
            <button
              type="button"
              data-ocid="recipe.submit.add_another_button"
              onClick={() => {
                resetForm();
                setSubmitted(false);
              }}
              className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Add another recipe
            </button>
            <button
              type="button"
              data-ocid="recipe.submit.back_recipes_button"
              onClick={onOpenRecipes}
              className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-background px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              Back to Family Recipes
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
            data-ocid="recipe.signin.back_button"
            onClick={onBack}
            className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
            Back to Family Recipes
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
          className="rounded-3xl border border-border bg-card px-6 py-10 text-center shadow-elevated"
          data-ocid="recipe.signin.prompt"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-accent/15">
            <BookOpen
              className="h-7 w-7 text-accent-foreground"
              strokeWidth={1.75}
              aria-hidden="true"
            />
          </span>
          <h1 className="mt-4 font-display text-2xl font-semibold text-foreground sm:text-3xl">
            Sign in to add a recipe
          </h1>
          <p className="mx-auto mt-3 max-w-md text-base leading-relaxed text-muted-foreground">
            Family recipes are recorded with your name so the family knows who
            shared each dish. Sign in to begin preserving a recipe for the
            Norwood family.
          </p>
          <button
            type="button"
            data-ocid="recipe.signin.primary_button"
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

  // ---- Recipe form ----
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col px-6 py-8 sm:py-12">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <button
          type="button"
          data-ocid="recipe.form.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-2 self-start rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          Back to Family Recipes
        </button>
      </motion.div>

      <motion.header
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
      >
        <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-accent-foreground/70">
          <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          Family Recipes
        </span>
        <h1 className="mt-2 font-display text-3xl font-semibold leading-tight text-foreground sm:text-4xl">
          Add a family recipe
        </h1>
        <p className="mt-2 text-base leading-relaxed text-muted-foreground">
          Preserve a dish the way it was passed down — who made it, how it was
          made, and the memory behind it.
        </p>
      </motion.header>

      <motion.form
        onSubmit={handleSubmit}
        className="mt-6 flex flex-col gap-5"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.05, ease: [0.4, 0, 0.2, 1] }}
      >
        {/* Title */}
        <div>
          <label className="field-label" htmlFor="recipe-title">
            Recipe title
          </label>
          <input
            id="recipe-title"
            data-ocid="recipe.form.title_input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="e.g. Grandma Julia's Sweet Potato Pie"
            className="form-input"
            required
          />
        </div>

        {/* Short description */}
        <div>
          <label className="field-label" htmlFor="recipe-description">
            Short description
          </label>
          <textarea
            id="recipe-description"
            data-ocid="recipe.form.description_textarea"
            value={shortDescription}
            onChange={(event) => setShortDescription(event.target.value)}
            placeholder="A sentence or two about this dish and why it matters to the family"
            className="form-textarea"
          />
        </div>

        {/* Whose recipe is this? — single-select originating member */}
        <div>
          <span className="field-label">Whose recipe is this?</span>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Choose the single family member this recipe belongs to.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.values(profiles).map((profile) => {
              const selected = originatingId === profile.id;
              return (
                <button
                  key={profile.id}
                  type="button"
                  data-ocid={`recipe.form.originating.${profile.id}`}
                  onClick={() => toggleOriginating(profile.id)}
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
            {knownResolvedPeople.map((id) => (
              <ResolvedProfileChip
                key={id}
                personId={id}
                selected={originatingId === id}
                onToggle={() => toggleOriginating(id)}
                kind="originating"
              />
            ))}
          </div>
          {originatingId ? (
            <p
              className="mt-2 text-xs font-medium text-accent-foreground"
              data-ocid="recipe.form.originating_selected"
            >
              This recipe is from {originatingCanonical.displayName}.
            </p>
          ) : null}
        </div>

        {/* Related family members — multi-select */}
        <div>
          <span className="field-label">Related family members</span>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Select other family members connected to this recipe.
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.values(profiles).map((profile) => {
              const selected = relatedMemberIds.includes(profile.id);
              return (
                <button
                  key={profile.id}
                  type="button"
                  data-ocid={`recipe.form.member.${profile.id}`}
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

        {/* Ingredients */}
        <div>
          <label className="field-label" htmlFor="recipe-ingredients">
            Ingredients
          </label>
          <textarea
            id="recipe-ingredients"
            data-ocid="recipe.form.ingredients_textarea"
            value={ingredients}
            onChange={(event) => setIngredients(event.target.value)}
            placeholder={
              "One ingredient per line, e.g.\n3 cups flour\n1 tsp cinnamon"
            }
            className="form-textarea"
          />
        </div>

        {/* Instructions */}
        <div>
          <label className="field-label" htmlFor="recipe-instructions">
            Instructions
          </label>
          <textarea
            id="recipe-instructions"
            data-ocid="recipe.form.instructions_textarea"
            value={instructions}
            onChange={(event) => setInstructions(event.target.value)}
            placeholder="Write the steps the way they were handed down…"
            className="form-textarea"
          />
        </div>

        {/* Family story / memory */}
        <div>
          <label className="field-label" htmlFor="recipe-story">
            Family story / memory
          </label>
          <textarea
            id="recipe-story"
            data-ocid="recipe.form.story_textarea"
            value={familyStory}
            onChange={(event) => setFamilyStory(event.target.value)}
            placeholder="The memory behind this dish — who made it, when, and why it matters"
            className="form-textarea"
          />
        </div>

        {/* Era + year */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="recipe-era">
              Era / year
            </label>
            <input
              id="recipe-era"
              data-ocid="recipe.form.era_input"
              type="text"
              value={era}
              onChange={(event) => setEra(event.target.value)}
              placeholder="e.g. circa 1940s"
              className="form-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="recipe-year">
              Year (optional)
            </label>
            <input
              id="recipe-year"
              data-ocid="recipe.form.year_input"
              type="text"
              inputMode="numeric"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="e.g. 1942"
              className="form-input"
            />
          </div>
        </div>

        {/* Location + family branch */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="recipe-location">
              Location
            </label>
            <input
              id="recipe-location"
              data-ocid="recipe.form.location_input"
              type="text"
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              placeholder="e.g. Clayton, Mississippi"
              className="form-input"
            />
          </div>
          <div>
            <label className="field-label" htmlFor="recipe-branch">
              Family branch
            </label>
            <input
              id="recipe-branch"
              data-ocid="recipe.form.branch_input"
              type="text"
              value={familyBranch}
              onChange={(event) => setFamilyBranch(event.target.value)}
              placeholder="e.g. the Clayton Norwood branch"
              className="form-input"
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="field-label" htmlFor="recipe-tags">
            Tags
          </label>
          <input
            id="recipe-tags"
            data-ocid="recipe.form.tags_input"
            type="text"
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            placeholder="Separate tags with commas, e.g. dessert, holiday, Mississippi"
            className="form-input"
          />
        </div>

        {/* Privacy + evidence */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <label className="field-label" htmlFor="recipe-privacy">
              Privacy level
            </label>
            <select
              id="recipe-privacy"
              data-ocid="recipe.form.privacy_select"
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
          <div>
            <label className="field-label" htmlFor="recipe-evidence">
              Evidence / source status
            </label>
            <select
              id="recipe-evidence"
              data-ocid="recipe.form.evidence_select"
              value={evidenceStatus}
              onChange={(event) =>
                setEvidenceStatus(event.target.value as EvidenceStatus)
              }
              className="form-select"
            >
              {Object.values(EvidenceStatus).map((status) => (
                <option key={status} value={status}>
                  {RECIPE_EVIDENCE_LABELS[status]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Attach existing media */}
        <div>
          <span className="field-label">Attach existing media</span>
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            Link photos already in the family archive. Existing media is linked,
            never duplicated.
          </p>
          {approvedMedia.length === 0 ? (
            <p
              className="rounded-xl border border-dashed border-border/70 bg-card/50 px-4 py-3 text-sm text-muted-foreground"
              data-ocid="recipe.form.media_empty"
            >
              No approved media in the archive yet. You can upload new media
              below.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {approvedMedia.map((item) => {
                const selected = attachedMediaIds.includes(item.id);
                return (
                  <button
                    key={item.id.toString()}
                    type="button"
                    data-ocid={`recipe.form.media.${item.id.toString()}`}
                    onClick={() => toggleAttachedMedia(item.id)}
                    aria-pressed={selected}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                      selected
                        ? "border-accent bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground hover:bg-muted"
                    }`}
                  >
                    {selected ? (
                      <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    ) : (
                      <Image
                        className="h-3.5 w-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                    {item.title}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Upload new media */}
        <div>
          <label className="field-label" htmlFor="recipe-file">
            Upload new media
          </label>
          <input
            ref={fileInputRef}
            id="recipe-file"
            type="file"
            className="sr-only"
            data-ocid="recipe.form.file_input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />
          {fileName ? (
            <div
              className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-subtle"
              data-ocid="recipe.form.file_selected"
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
                    {fileMime || "File"} · saved as one archive record
                  </p>
                </div>
              </div>
              <button
                type="button"
                data-ocid="recipe.form.change_file_button"
                onClick={() => fileInputRef.current?.click()}
                className="shrink-0 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-ocid="recipe.form.dropzone"
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
              <span className="dropzone-title">Choose a photo to upload</span>
              <span className="dropzone-hint">
                Drag and drop, or tap to browse. The photo is preserved as one
                archive record.
              </span>
            </button>
          )}

          {progress !== null && (
            <div
              className="upload-progress"
              data-ocid="recipe.form.upload_progress"
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

        {error && (
          <p
            data-ocid="recipe.form.error_state"
            className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm font-medium text-destructive"
          >
            {error}
          </p>
        )}

        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs leading-relaxed text-muted-foreground">
            Your recipe will be reviewed by a Family Steward before it appears
            in Family Recipes.
          </p>
          <button
            type="submit"
            data-ocid="recipe.form.submit_button"
            disabled={submitRecipe.isPending || submitMedia.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-primary px-6 py-2.5 text-sm font-semibold text-primary-foreground shadow-subtle transition-all duration-300 hover:-translate-y-0.5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
          >
            {submitRecipe.isPending || submitMedia.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : null}
            {submitRecipe.isPending || submitMedia.isPending
              ? "Submitting…"
              : "Submit for approval"}
          </button>
        </div>
      </motion.form>
    </div>
  );
}

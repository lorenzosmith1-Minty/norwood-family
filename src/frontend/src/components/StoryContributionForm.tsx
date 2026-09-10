import type { Story } from "@/types/family-history";
import { EVIDENCE_STATUS_LABELS, EvidenceStatus } from "@/types/family-history";
import { Check, CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { useApprovedArchiveItems } from "../hooks/useArchiveStorage";
import {
  type SubmitStoryInput,
  useAddCanonicalStory,
  useSubmitStory,
  useUpdateCanonicalStory,
} from "../hooks/useFamilyHistory";
import { profiles } from "../pages/PersonProfilePage";

interface StoryContributionFormProps {
  /** Closes the form without submitting. */
  onClose: () => void;
  /** True when the caller is a Family Steward (adds/edits canonical stories). */
  isSteward: boolean;
  /** When set, the form edits this canonical story (steward-only). */
  initialStory?: Story;
}

/**
 * Form for proposing a new family story. Signed-in family members submit a
 * story that enters pending review and becomes visible only after a Family
 * Steward approves. Stewards can instead add canonical stories directly, or
 * edit an existing canonical story. Story contribution never overwrites a
 * person's profile story text automatically.
 */
export function StoryContributionForm({
  onClose,
  isSteward,
  initialStory,
}: StoryContributionFormProps) {
  const { data: archiveItems = [] } = useApprovedArchiveItems();
  const submitStory = useSubmitStory();
  const addCanonicalStory = useAddCanonicalStory();
  const updateCanonicalStory = useUpdateCanonicalStory();

  const [title, setTitle] = useState(initialStory?.title ?? "");
  const [storyText, setStoryText] = useState(initialStory?.storyText ?? "");
  const [relatedMemberIds, setRelatedMemberIds] = useState<string[]>(
    initialStory?.relatedMemberIds ?? [],
  );
  const [era, setEra] = useState(initialStory?.era ?? "");
  const [year, setYear] = useState(
    initialStory?.year !== undefined ? String(initialStory.year) : "",
  );
  const [location, setLocation] = useState(initialStory?.location ?? "");
  const [evidenceStatus, setEvidenceStatus] = useState<EvidenceStatus>(
    initialStory?.evidenceStatus ?? EvidenceStatus.FamilyHistory,
  );
  const [relatedArchiveItemIds, setRelatedArchiveItemIds] = useState<bigint[]>(
    initialStory?.relatedArchiveItemIds ?? [],
  );
  const [submitted, setSubmitted] = useState(false);

  const isEditing = Boolean(initialStory);

  const toggleMember = (personId: string) => {
    setRelatedMemberIds((current) =>
      current.includes(personId)
        ? current.filter((id) => id !== personId)
        : [...current, personId],
    );
  };

  const toggleArchiveItem = (itemId: bigint) => {
    setRelatedArchiveItemIds((current) =>
      current.includes(itemId)
        ? current.filter((id) => id !== itemId)
        : [...current, itemId],
    );
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const input: SubmitStoryInput = {
      title: title.trim(),
      storyText: storyText.trim(),
      relatedMemberIds,
      era: era.trim() || null,
      year: year.trim() === "" ? null : BigInt(year.trim()),
      location: location.trim() || null,
      evidenceStatus,
      relatedArchiveItemIds,
    };
    if (isEditing && initialStory) {
      updateCanonicalStory.mutate({ ...input, id: initialStory.id });
    } else if (isSteward) {
      addCanonicalStory.mutate(input);
    } else {
      submitStory.mutate(input);
    }
    setSubmitted(true);
  };

  const isPending =
    submitStory.isPending ||
    addCanonicalStory.isPending ||
    updateCanonicalStory.isPending;
  const hasError =
    submitStory.isError ||
    addCanonicalStory.isError ||
    updateCanonicalStory.isError;

  if (submitted && !hasError) {
    return (
      <div data-ocid="stories.form.success_state" className="domain-empty">
        <span className="domain-empty-mark" aria-hidden="true">
          <CheckCircle2 className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <h2 className="domain-empty-title">
          {isEditing
            ? "Story updated"
            : isSteward
              ? "Story added"
              : "Story submitted"}
        </h2>
        <p className="domain-empty-hint">
          {isEditing
            ? "The canonical story has been updated and is now visible."
            : isSteward
              ? "The canonical story is now visible to the family."
              : "Your story has been submitted and is pending steward review. It will appear here once a Family Steward approves it."}
        </p>
        <button
          type="button"
          data-ocid="stories.form.close_button"
          onClick={onClose}
          className="archive-empty-reset"
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold tracking-tight text-foreground">
            {isEditing
              ? "Edit Story"
              : isSteward
                ? "Add a Story"
                : "Propose a Story"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {isSteward
              ? "Add a canonical story that is visible to the family immediately."
              : "Your story enters pending review and appears once a Family Steward approves it."}
          </p>
        </div>
        <button
          type="button"
          data-ocid="stories.form.cancel_button"
          onClick={onClose}
          aria-label="Close form"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label htmlFor="story-title" className="field-label">
            Title
          </label>
          <input
            id="story-title"
            data-ocid="stories.form.title_input"
            type="text"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            required
            placeholder="A short, memorable title"
            className="form-input"
          />
        </div>

        <div>
          <label htmlFor="story-text" className="field-label">
            Story
          </label>
          <textarea
            id="story-text"
            data-ocid="stories.form.textarea"
            value={storyText}
            onChange={(event) => setStoryText(event.target.value)}
            required
            placeholder="Share the moment, memory, or account…"
            className="form-textarea"
          />
        </div>

        <div>
          <span className="field-label">Related family members</span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(profiles).map(([personId, profile]) => {
              const checked = relatedMemberIds.includes(personId);
              return (
                <button
                  key={personId}
                  type="button"
                  data-ocid={`stories.form.member.${personId}`}
                  onClick={() => toggleMember(personId)}
                  aria-pressed={checked}
                  className={`member-chip transition-colors ${
                    checked
                      ? "border-accent bg-accent text-accent-foreground"
                      : "hover:border-accent/50 hover:bg-muted"
                  }`}
                >
                  {checked ? (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  ) : null}
                  {profile.name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="story-era" className="field-label">
              Era
            </label>
            <input
              id="story-era"
              data-ocid="stories.form.era_input"
              type="text"
              value={era}
              onChange={(event) => setEra(event.target.value)}
              placeholder="e.g. Reconstruction era"
              className="form-input"
            />
          </div>
          <div>
            <label htmlFor="story-year" className="field-label">
              Year (approx.)
            </label>
            <input
              id="story-year"
              data-ocid="stories.form.year_input"
              type="number"
              value={year}
              onChange={(event) => setYear(event.target.value)}
              placeholder="e.g. 1885"
              className="form-input"
            />
          </div>
        </div>

        <div>
          <label htmlFor="story-location" className="field-label">
            Location
          </label>
          <input
            id="story-location"
            data-ocid="stories.form.location_input"
            type="text"
            value={location}
            onChange={(event) => setLocation(event.target.value)}
            placeholder="Where did this take place?"
            className="form-input"
          />
        </div>

        <div>
          <label htmlFor="story-evidence" className="field-label">
            Evidence status
          </label>
          <select
            id="story-evidence"
            data-ocid="stories.form.evidence_select"
            value={evidenceStatus}
            onChange={(event) =>
              setEvidenceStatus(event.target.value as EvidenceStatus)
            }
            className="form-select"
          >
            {Object.values(EvidenceStatus).map((status) => (
              <option key={status} value={status}>
                {EVIDENCE_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Family History and Personal Memory are never presented as documented
            fact.
          </p>
        </div>

        {archiveItems.length > 0 && (
          <div>
            <span className="field-label">Related Archive items</span>
            <div className="flex flex-wrap gap-2">
              {archiveItems.map((item) => {
                const checked = relatedArchiveItemIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    data-ocid={`stories.form.archive.${item.id}`}
                    onClick={() => toggleArchiveItem(item.id)}
                    aria-pressed={checked}
                    className={`member-chip transition-colors ${
                      checked
                        ? "border-accent bg-accent/10 text-foreground"
                        : "hover:border-accent/50 hover:bg-muted"
                    }`}
                  >
                    {item.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {hasError && (
          <p
            data-ocid="stories.form.error_state"
            className="text-sm font-semibold text-destructive"
          >
            Something went wrong. Please try again.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button
            type="button"
            data-ocid="stories.form.cancel_button"
            onClick={onClose}
            className="inline-flex min-h-[44px] items-center rounded-full border border-border/60 px-4 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Cancel
          </button>
          <button
            type="submit"
            data-ocid="stories.form.submit_button"
            disabled={isPending || !title.trim() || !storyText.trim()}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isPending
              ? "Saving…"
              : isEditing
                ? "Save Changes"
                : isSteward
                  ? "Add Story"
                  : "Submit for Review"}
          </button>
        </div>
      </form>
    </div>
  );
}

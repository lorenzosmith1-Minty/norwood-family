import { MysteryContributionType } from "@/types/family-history";
import { MYSTERY_CONTRIBUTION_TYPE_LABELS } from "@/types/family-history";
import { CheckCircle2, X } from "lucide-react";
import { useState } from "react";
import { useSubmitMysteryContribution } from "../hooks/useFamilyHistory";

interface MysteryContributionFormProps {
  mysteryId: bigint;
  /** Closes the form without submitting. */
  onClose: () => void;
  /** Called after a contribution is submitted (enters pending review). */
  onSubmitted: () => void;
}

const CONTRIBUTION_TYPES = Object.values(MysteryContributionType);

/**
 * Form for a signed-in family member to contribute a note, memory, possible
 * lead, or source/document reference to a mystery. On submit the contribution
 * enters pending steward review before it can alter the canonical mystery
 * record. A confirmation is shown once the contribution is pending.
 */
export function MysteryContributionForm({
  mysteryId,
  onClose,
  onSubmitted,
}: MysteryContributionFormProps) {
  const [contributionType, setContributionType] =
    useState<MysteryContributionType>(MysteryContributionType.Note);
  const [text, setText] = useState("");
  const submit = useSubmitMysteryContribution();

  const handleSubmit = () => {
    const captured = text.trim();
    if (!captured) return;
    setText("");
    submit.mutate(
      { mysteryId, contributionType, text: captured },
      {
        onError: () =>
          setText((current) => (current === "" ? captured : current)),
      },
    );
  };

  if (submit.isSuccess) {
    return (
      <div
        data-ocid="mystery.contribution_success"
        className="flex flex-col items-center gap-3 rounded-xl border border-border/60 bg-card p-6 text-center"
      >
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-success/12 text-success">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </span>
        <h3 className="font-display text-lg font-semibold text-foreground">
          Contribution submitted
        </h3>
        <p className="max-w-sm text-sm text-muted-foreground">
          Thank you. Your contribution is now pending review by a Family Steward
          before it can be added to this mystery.
        </p>
        <button
          type="button"
          data-ocid="mystery.contribution_done_button"
          onClick={onSubmitted}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          style={{ backgroundColor: "oklch(var(--primary))" }}
        >
          Done
        </button>
      </div>
    );
  }

  return (
    <div
      data-ocid="mystery.contribution_form"
      className="flex flex-col gap-4 rounded-xl border border-border/60 bg-card p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-display text-lg font-semibold text-foreground">
            Contribute to this mystery
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Share a note, memory, possible lead, or source reference. It will be
            reviewed by a Family Steward before it is added.
          </p>
        </div>
        <button
          type="button"
          data-ocid="mystery.contribution_close_button"
          onClick={onClose}
          aria-label="Close contribution form"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contribution-type" className="field-label">
          Type
        </label>
        <select
          id="contribution-type"
          data-ocid="mystery.contribution_type_select"
          value={contributionType}
          onChange={(e) =>
            setContributionType(e.target.value as MysteryContributionType)
          }
          className="form-select"
        >
          {CONTRIBUTION_TYPES.map((type) => (
            <option key={type} value={type}>
              {MYSTERY_CONTRIBUTION_TYPE_LABELS[type]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="contribution-text" className="field-label">
          Your contribution
        </label>
        <textarea
          id="contribution-text"
          data-ocid="mystery.contribution_text_input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="What do you remember, know, or suspect?…"
          className="form-textarea"
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          data-ocid="mystery.contribution_submit_button"
          onClick={handleSubmit}
          disabled={!text.trim() || submit.isPending}
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          style={{ backgroundColor: "oklch(var(--primary))" }}
        >
          {submit.isPending ? "Submitting…" : "Submit for review"}
        </button>
        <button
          type="button"
          data-ocid="mystery.contribution_cancel_button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-border/60 px-5 py-2.5 text-sm font-semibold text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          Cancel
        </button>
      </div>

      {submit.isError && (
        <p className="text-xs text-destructive">
          Could not submit your contribution. Please try again.
        </p>
      )}
    </div>
  );
}

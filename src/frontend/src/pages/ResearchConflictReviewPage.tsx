import {
  ArrowRight,
  Check,
  GitMerge,
  Scale,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "../components/ui/alert-dialog";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import {
  useGetFinding,
  useGetSource,
  useListConflictReviewItems,
  useResolveConflict,
} from "../hooks/useResearchIntake";
import {
  CONFLICT_ACTION_LABELS,
  EVIDENCE_LABEL_LABELS,
  FINDING_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  SOURCE_TYPE_LABELS,
} from "../types/research-intake";
import { ConflictResolutionAction } from "../types/research-intake";
import type {
  ConflictReviewItem,
  FindingContent,
} from "../types/research-intake";

interface ResearchConflictReviewPageProps {
  onBack: () => void;
}

/** Converts a Motoko nanosecond timestamp to a short human date and time. */
function formatDateTime(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Shortens a principal to a readable, copy-safe label. */
function formatPrincipal(principal: { toText(): string }): string {
  const text = principal.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/** Renders a proposed finding's content as a short human-readable summary. */
function findingContentSummary(content: FindingContent): string {
  switch (content.__kind__) {
    case "PersonFact":
      return `${content.PersonFact.field}: ${content.PersonFact.value}`;
    case "Relationship":
      return `${content.Relationship.fromPersonId} → ${content.Relationship.toPersonId} (${content.Relationship.relationshipType})`;
    case "TimelineEvent":
      return content.TimelineEvent.description || content.TimelineEvent.title;
    case "Story":
      return content.Story.storyText || content.Story.title;
    case "Mystery":
      return content.Mystery.description || content.Mystery.title;
    case "Source":
      return content.Source.description || content.Source.title;
    default:
      return "";
  }
}

/** The four steward resolution actions, in display order. */
const RESOLUTION_ACTIONS: ConflictResolutionAction[] = [
  ConflictResolutionAction.KeepExisting,
  ConflictResolutionAction.ReplaceExisting,
  ConflictResolutionAction.PreserveBoth,
  ConflictResolutionAction.NeedsResearch,
];

/** Short guidance shown under each resolution action in the confirm dialog. */
const ACTION_GUIDANCE: Record<ConflictResolutionAction, string> = {
  [ConflictResolutionAction.KeepExisting]:
    "The canonical value stays unchanged. The proposed research and its provenance are preserved, and the conflict is resolved and recorded in the audit history.",
  [ConflictResolutionAction.ReplaceExisting]:
    "The canonical value is updated once to the proposed value. The old value and its provenance are preserved in the conflict and audit history, and the new source is kept.",
  [ConflictResolutionAction.PreserveBoth]:
    "Both values stay visible as an unresolved conflict marked Conflicting. Neither value is silently chosen.",
  [ConflictResolutionAction.NeedsResearch]:
    "The canonical value stays unchanged and the conflict is retained with a Needs Research status for future investigation.",
};

/**
 * A single conflict review card. A proposed finding contradicts existing
 * canonical family data, so the EXISTING value (canonical, source/provenance,
 * evidence status) and the PROPOSED value (proposed, source, evidence label)
 * sit side by side on a cool cyan plate and the steward picks one of four
 * explicit resolution actions. The linked finding and both sources are resolved
 * from the backend so the decision is made with full provenance.
 */
function ConflictCard({ item }: { item: ConflictReviewItem }) {
  const { data: finding } = useGetFinding(item.findingId);
  const { data: existingSource } = useGetSource(item.existingSourceId ?? 0n);
  const { data: proposedSource } = useGetSource(item.proposedSourceId ?? 0n);
  const resolve = useResolveConflict();
  const [openAction, setOpenAction] = useState<ConflictResolutionAction | null>(
    null,
  );
  const [notes, setNotes] = useState("");

  const isResolved = item.status === "Approved" || item.status === "Rejected";

  const confirmResolve = (action: ConflictResolutionAction) => {
    resolve.mutate(
      { conflictId: item.id, action, notes },
      {
        onSuccess: () => {
          setOpenAction(null);
          setNotes("");
        },
      },
    );
  };

  return (
    <article
      data-ocid={`research_conflict.card.${item.id}`}
      className="research-conflict-card"
    >
      <div className="research-conflict-head">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="research-conflict-title">{item.field}</h3>
          <p className="research-conflict-meta">
            {isResolved
              ? `Resolved · ${REVIEW_STATUS_LABELS[item.status]}`
              : "Awaiting steward decision"}
            {item.resolvedAt ? ` · ${formatDateTime(item.resolvedAt)}` : ""}
            {item.resolvedBy ? ` · by ${formatPrincipal(item.resolvedBy)}` : ""}
          </p>
        </div>
        <span className="research-evidence research-evidence-conflict">
          Conflict
        </span>
      </div>

      <div className="research-conflict-block">
        <span className="research-conflict-label">Disputed value</span>
        <div className="research-conflict-values">
          <div className="research-conflict-value">
            <span className="research-conflict-owner">
              Existing · canonical
            </span>
            <span className="research-conflict-text">
              {item.canonicalValue}
            </span>
            {existingSource ? (
              <span className="research-conflict-provenance">
                {existingSource.title}
              </span>
            ) : (
              <span className="research-conflict-provenance">
                Existing source
              </span>
            )}
          </div>
          <div className="research-conflict-value">
            <span className="research-conflict-owner">Proposed</span>
            <span className="research-conflict-text">{item.proposedValue}</span>
            {proposedSource ? (
              <span className="research-conflict-provenance">
                {proposedSource.title}
              </span>
            ) : (
              <span className="research-conflict-provenance">
                Proposed source
              </span>
            )}
          </div>
        </div>
      </div>

      {finding ? (
        <div className="research-finding-card">
          <div className="research-finding-head">
            <span className="research-finding-title">{finding.title}</span>
            <span className="research-evidence research-evidence-finding">
              {EVIDENCE_LABEL_LABELS[finding.evidenceLabel]}
            </span>
          </div>
          <p className="research-finding-detail">
            {findingContentSummary(finding.content)}
          </p>
          <div className="research-finding-meta">
            <span>
              {FINDING_TYPE_LABELS[finding.findingType]} · submitted{" "}
              {formatDateTime(finding.submittedAt)} by{" "}
              <span className="research-actor">
                {formatPrincipal(finding.submittedBy)}
              </span>
            </span>
          </div>
        </div>
      ) : (
        <div className="research-finding-card">
          <p className="research-finding-detail">Loading linked finding…</p>
        </div>
      )}

      {proposedSource ? (
        <div className="research-source-card">
          <div className="research-source-head">
            <span className="research-source-title">
              {proposedSource.title}
            </span>
            <span className="research-evidence">
              {SOURCE_TYPE_LABELS[proposedSource.sourceType]}
            </span>
          </div>
          <p className="research-source-meta">
            {proposedSource.description || "No description"}
          </p>
        </div>
      ) : (
        <div className="research-source-card">
          <p className="research-source-meta">Loading linked source…</p>
        </div>
      )}

      <div className="research-conflict-actions">
        {isResolved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {REVIEW_STATUS_LABELS[item.status]}
          </span>
        ) : (
          RESOLUTION_ACTIONS.map((action) => (
            <AlertDialog
              key={action}
              open={openAction === action}
              onOpenChange={(open) => {
                setOpenAction(open ? action : null);
                if (!open) setNotes("");
              }}
            >
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  data-ocid={`research_conflict.action_button.${item.id}.${action}`}
                  className="research-resolve"
                >
                  <GitMerge className="h-4 w-4" aria-hidden="true" />
                  {CONFLICT_ACTION_LABELS[action]}
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {CONFLICT_ACTION_LABELS[action]}?
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {ACTION_GUIDANCE[action]} This decision is recorded in the
                    audit history with your identity and timestamp.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <label
                  htmlFor={`conflict-notes-${item.id}-${action}`}
                  className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground"
                >
                  Steward notes (optional)
                </label>
                <textarea
                  id={`conflict-notes-${item.id}-${action}`}
                  data-ocid={`research_conflict.notes_input.${item.id}.${action}`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Why did you choose this resolution?"
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    data-ocid={`research_conflict.confirm_button.${item.id}.${action}`}
                    disabled={resolve.isPending}
                    onClick={(event) => {
                      event.preventDefault();
                      confirmResolve(action);
                    }}
                  >
                    {resolve.isPending
                      ? "Resolving…"
                      : CONFLICT_ACTION_LABELS[action]}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ))
        )}
        {resolve.isError && (
          <p className="text-xs font-medium text-destructive">
            Could not resolve this conflict. Please try again.
          </p>
        )}
      </div>
    </article>
  );
}

/**
 * Conflict Review: the Historical Research Intake surface where a steward
 * decides the outcome when a proposed finding contradicts existing canonical
 * family data. Existing and proposed values are shown side by side with their
 * sources and evidence, and resolving is an explicit, audited action chosen
 * from four options — conflicting data is never overwritten silently.
 */
export function ResearchConflictReviewPage({
  onBack,
}: ResearchConflictReviewPageProps) {
  const { data: isAdmin = false } = useIsAdmin();
  const { data: conflicts = [], isLoading } = useListConflictReviewItems();

  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-8">
        <header className="hub-header mb-8">
          <button
            type="button"
            data-ocid="research_conflict.back_button"
            onClick={onBack}
            aria-label="Back to Research Intake"
            className="hub-back"
          >
            <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
          </button>
          <div className="min-w-0">
            <h1 className="hub-title">Conflict Review</h1>
            <p className="hub-subtitle">
              Resolve findings where sources or proposals disagree.
            </p>
          </div>
        </header>
        <div
          data-ocid="research_conflict.unauthorized_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 px-6 py-16 text-center"
        >
          <ShieldAlert
            className="h-8 w-8 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="font-display text-xl font-semibold text-foreground">
            Steward access only
          </p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Conflict review is reserved for authorized Family Stewards. If you
            believe this is a mistake, contact a current Steward.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8">
      <header className="hub-header mb-8">
        <button
          type="button"
          data-ocid="research_conflict.back_button"
          onClick={onBack}
          aria-label="Back to Research Intake"
          className="hub-back"
        >
          <ArrowRight className="h-5 w-5 rotate-180" aria-hidden="true" />
        </button>
        <div className="min-w-0">
          <h1 className="hub-title">Conflict Review</h1>
          <p className="hub-subtitle">
            Resolve findings where sources or proposals disagree.
          </p>
        </div>
      </header>

      <div className="research-panel">
        <section className="research-section">
          <div className="research-section-head">
            <span className="research-section-title">Conflicting findings</span>
          </div>
          <p className="research-section-hint">
            A proposed finding below contradicts existing canonical family data.
            Nothing is changed automatically — compare the existing and proposed
            values, then choose one of the four resolution actions to record the
            steward's decision.
          </p>
        </section>

        {isLoading ? (
          <div
            data-ocid="research_conflict.loading_state"
            className="flex flex-col gap-4"
          >
            {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
              <div
                key={id}
                className="research-conflict-card"
                aria-hidden="true"
              >
                <div className="h-4 w-40 animate-pulse rounded-full bg-muted" />
                <div className="h-20 w-full animate-pulse rounded-lg bg-muted" />
                <div className="h-16 w-full animate-pulse rounded-lg bg-muted" />
              </div>
            ))}
          </div>
        ) : conflicts.length === 0 ? (
          <div
            data-ocid="research_conflict.empty_state"
            className="research-empty"
          >
            <Scale
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="research-empty-title">No conflicts to review</p>
            <p className="research-empty-hint">
              When a proposed finding contradicts existing canonical family
              data, it will appear here for a steward to resolve.
            </p>
          </div>
        ) : (
          <div
            data-ocid="research_conflict.list"
            className="flex flex-col gap-4"
          >
            {conflicts.map((item) => (
              <ConflictCard key={item.id.toString()} item={item} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

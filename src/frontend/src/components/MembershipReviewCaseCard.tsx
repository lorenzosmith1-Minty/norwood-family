import {
  ConfirmationDecision,
  MembershipConfirmationResolution,
  type MembershipConfirmationReviewHistoryEntry,
  type MembershipConfirmationReviewView,
  MembershipStatus,
  SimpleRelationshipType,
} from "@/backend";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useResolveMembershipConfirmation } from "@/hooks/useMembershipReviews";
import {
  Check,
  ChevronDown,
  Clock,
  HelpCircle,
  Loader2,
  ShieldQuestion,
  X,
} from "lucide-react";
import { useId, useState } from "react";

/**
 * One unresolved membership-confirmation case awaiting Family Steward review.
 *
 * The card renders only family-safe fields from the canonical
 * `MembershipConfirmationReviewView`: the applicant's display name, the simple
 * relationship label, the membership status, and the confirmed / disputed
 * counts. It never renders an account principal, a technical id (membershipId,
 * pendingPersonId, familyId), or sensitive relationship metadata.
 *
 * The case is expandable to inspect a human-readable confirmation history —
 * who confirmed or disputed, the simple relationship, and when.
 *
 * A Steward resolves the case through three actions: Approve Membership and
 * Reject Membership each open a confirmation dialog before submitting, while
 * Needs More Information submits directly. All three call the existing
 * `resolveMembershipConfirmation` backend API for the active family and the
 * case's membership; the backend membership transitions are preserved exactly.
 * While a resolution is submitting the actions are disabled and a calm
 * in-progress state is shown. A case already settled elsewhere settles into a
 * neutral state with no technical detail or private reason exposed.
 *
 * Wording is neutral and family-safe: a dispute is described as a
 * disagreement, never as an accusation.
 */

/** Friendly labels for the four simple relationship types. */
const SIMPLE_RELATIONSHIP_LABELS: Record<SimpleRelationshipType, string> = {
  [SimpleRelationshipType.Parent]: "Parent",
  [SimpleRelationshipType.Child]: "Child",
  [SimpleRelationshipType.Sibling]: "Sibling",
  [SimpleRelationshipType.SpousePartner]: "Spouse or Partner",
};

/** Neutral labels for the membership status of the applicant. */
const MEMBERSHIP_STATUS_LABELS: Record<MembershipStatus, string> = {
  [MembershipStatus.Pending]: "Pending",
  [MembershipStatus.Active]: "Active",
  [MembershipStatus.Suspended]: "Suspended",
  [MembershipStatus.Left]: "Left",
};

/** Neutral labels for a recorded confirmation decision. */
const DECISION_LABELS: Record<ConfirmationDecision, string> = {
  [ConfirmationDecision.Confirmed]: "Confirmed",
  [ConfirmationDecision.Disputed]: "Disputed",
};

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

/** The neutral tone class for a recorded decision. */
function decisionTone(decision: ConfirmationDecision): string {
  return decision === ConfirmationDecision.Confirmed
    ? "confirm-status-success"
    : "confirm-status-review";
}

/** The neutral settled state the card shows after a resolution. */
type CaseResult =
  | { kind: "approved" }
  | { kind: "rejected" }
  | { kind: "needsMoreInformation" }
  | { kind: "alreadySettled" }
  | { kind: "error" };

interface MembershipReviewCaseCardProps {
  /** The unresolved review case, in the active family. */
  review: MembershipConfirmationReviewView;
  /** The 1-based position of this case in the list, for stable test markers. */
  position: number;
}

export function MembershipReviewCaseCard({
  review,
  position,
}: MembershipReviewCaseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState<
    | MembershipConfirmationResolution.Approve
    | MembershipConfirmationResolution.Reject
    | null
  >(null);
  const [result, setResult] = useState<CaseResult | null>(null);
  const historyId = useId();
  const resolve = useResolveMembershipConfirmation();

  const relationshipLabel =
    SIMPLE_RELATIONSHIP_LABELS[review.simpleRelationship] ?? "Family member";
  const statusLabel =
    MEMBERSHIP_STATUS_LABELS[review.membershipStatus] ?? "Pending";
  const confirmedCount = Number(review.confirmedCount);
  const disputedCount = Number(review.disputedCount);
  const history = review.confirmationHistory;

  const isSubmitting = resolve.isPending;

  const submit = (resolution: MembershipConfirmationResolution) => {
    resolve.mutate(
      { membershipId: review.membershipId, resolution },
      {
        onSuccess: (outcome) => {
          switch (outcome.kind) {
            case "resolved":
              setResult(
                resolution === MembershipConfirmationResolution.Approve
                  ? { kind: "approved" }
                  : resolution === MembershipConfirmationResolution.Reject
                    ? { kind: "rejected" }
                    : { kind: "needsMoreInformation" },
              );
              break;
            case "alreadySettled":
              setResult({ kind: "alreadySettled" });
              break;
            case "error":
              setResult({ kind: "error" });
              break;
          }
        },
        onError: () => setResult({ kind: "error" }),
      },
    );
  };

  if (result) {
    return (
      <li
        data-ocid={`membership_reviews.case_item.${position}`}
        className="review-card"
      >
        <div
          data-ocid={`membership_reviews.case_result.${position}`}
          className={`confirm-status-card ${
            result.kind === "error"
              ? "confirm-status-review"
              : "confirm-status-success"
          }`}
        >
          <span className="confirm-status-mark" aria-hidden="true">
            {result.kind === "error" ? (
              <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Check className="h-4 w-4" strokeWidth={1.75} />
            )}
          </span>
          <div className="confirm-status-text">
            <h3 className="confirm-status-title">
              {result.kind === "approved"
                ? "Membership approved"
                : result.kind === "rejected"
                  ? "Membership rejected"
                  : result.kind === "needsMoreInformation"
                    ? "More information requested"
                    : result.kind === "alreadySettled"
                      ? "This case was already settled"
                      : "We couldn't record your decision"}
            </h3>
            <p className="confirm-status-body">
              {result.kind === "approved"
                ? "This member can now join the family."
                : result.kind === "rejected"
                  ? "This connection will not be added to the family."
                  : result.kind === "needsMoreInformation"
                    ? "This case stays open until more information is available."
                    : result.kind === "alreadySettled"
                      ? "Nothing further is needed from you right now."
                      : "Please try again in a moment."}
            </p>
          </div>
        </div>
      </li>
    );
  }

  return (
    <li
      data-ocid={`membership_reviews.case_item.${position}`}
      className="review-card"
      aria-busy={isSubmitting}
    >
      <div className="review-card-head">
        <div className="min-w-0">
          <h3 className="review-card-title">{review.applicantDisplayName}</h3>
          <p className="review-card-meta">
            {relationshipLabel} · Membership {statusLabel}
          </p>
        </div>
        <span
          data-ocid={`membership_reviews.case_state.${position}`}
          className="confirm-status-card confirm-status-review w-auto shrink-0 items-center gap-2 px-3 py-1.5"
        >
          <span className="confirm-status-mark h-6 w-6" aria-hidden="true">
            <ShieldQuestion className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <span className="confirm-status-title text-xs">Needs review</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span
          data-ocid={`membership_reviews.confirmed_count.${position}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-semibold text-foreground"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-[oklch(var(--confirm-accent))]"
            aria-hidden="true"
          />
          {confirmedCount} confirmed
        </span>
        <span
          data-ocid={`membership_reviews.disputed_count.${position}`}
          className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3 py-1 text-xs font-semibold text-foreground"
        >
          <span
            className="h-1.5 w-1.5 rounded-full bg-[oklch(var(--confirm-review))]"
            aria-hidden="true"
          />
          {disputedCount} disputed
        </span>
      </div>

      <div className="review-card-actions">
        <button
          type="button"
          data-ocid={`membership_reviews.approve_button.${position}`}
          onClick={() =>
            setConfirming(MembershipConfirmationResolution.Approve)
          }
          disabled={isSubmitting}
          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          Approve Membership
        </button>
        <button
          type="button"
          data-ocid={`membership_reviews.reject_button.${position}`}
          onClick={() => setConfirming(MembershipConfirmationResolution.Reject)}
          disabled={isSubmitting}
          className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          Reject Membership
        </button>
        <button
          type="button"
          data-ocid={`membership_reviews.needs_info_button.${position}`}
          onClick={() =>
            submit(MembershipConfirmationResolution.NeedsMoreInformation)
          }
          disabled={isSubmitting}
          className="steward-pending-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          <HelpCircle
            className="h-4 w-4"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          Needs More Information
        </button>
      </div>

      {isSubmitting ? (
        <output
          data-ocid={`membership_reviews.submitting_state.${position}`}
          className="confirm-submitting"
        >
          <Loader2
            className="h-4 w-4 animate-spin"
            strokeWidth={2}
            aria-hidden="true"
          />
          Recording your decision…
        </output>
      ) : null}

      <div className="review-card-actions">
        <button
          type="button"
          data-ocid={`membership_reviews.history_toggle.${position}`}
          onClick={() => setExpanded((current) => !current)}
          aria-expanded={expanded}
          aria-controls={historyId}
          className="steward-pending-action"
        >
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
            strokeWidth={2.25}
            aria-hidden="true"
          />
          {expanded ? "Hide confirmation history" : "View confirmation history"}
        </button>
      </div>

      {expanded ? (
        <div
          id={historyId}
          data-ocid={`membership_reviews.history.${position}`}
          className="flex flex-col gap-2"
        >
          {history.length === 0 ? (
            <p className="review-card-meta">
              No confirmations or disputes have been recorded yet.
            </p>
          ) : (
            <ul
              data-ocid={`membership_reviews.history_list.${position}`}
              className="flex flex-col gap-2"
            >
              {history.map((entry, index) => (
                <HistoryRow
                  key={`${entry.confirmerDisplayName}-${entry.decidedAt.toString()}-${index}`}
                  entry={entry}
                  position={position}
                  index={index}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent
          data-ocid={`membership_reviews.confirm_dialog.${position}`}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === MembershipConfirmationResolution.Approve
                ? "Approve this membership?"
                : "Reject this membership?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === MembershipConfirmationResolution.Approve
                ? `${review.applicantDisplayName} will be able to join the family.`
                : `${review.applicantDisplayName} will not be added to the family.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-ocid={`membership_reviews.confirm_cancel_button.${position}`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid={`membership_reviews.confirm_submit_button.${position}`}
              onClick={() => {
                const resolution = confirming;
                setConfirming(null);
                if (resolution) submit(resolution);
              }}
            >
              {confirming === MembershipConfirmationResolution.Approve
                ? "Approve Membership"
                : "Reject Membership"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

interface HistoryRowProps {
  entry: MembershipConfirmationReviewHistoryEntry;
  position: number;
  index: number;
}

function HistoryRow({ entry, position, index }: HistoryRowProps) {
  const relationshipLabel =
    SIMPLE_RELATIONSHIP_LABELS[entry.simpleRelationship] ?? "Family member";
  const decisionLabel = DECISION_LABELS[entry.decision] ?? "Recorded";
  return (
    <li
      data-ocid={`membership_reviews.history_item.${position}.${index + 1}`}
      className={`confirm-status-card ${decisionTone(entry.decision)}`}
    >
      <span className="confirm-status-mark" aria-hidden="true">
        <Clock className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <div className="confirm-status-text">
        <h4 className="confirm-status-title">
          {entry.confirmerDisplayName} · {decisionLabel}
        </h4>
        <p className="confirm-status-body">
          {relationshipLabel} · {formatDateTime(entry.decidedAt)}
        </p>
      </div>
    </li>
  );
}

export { SIMPLE_RELATIONSHIP_LABELS, MEMBERSHIP_STATUS_LABELS };

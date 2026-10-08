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
import {
  Check,
  HelpCircle,
  Inbox,
  KeyRound,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { RecoveryRequest } from "../backend";
import { DomainEmptyState } from "../components/DomainEmptyState";
import { RecoveryHistorySection } from "../components/RecoveryHistorySection";
import { useAuth } from "../hooks/useAuth";
import {
  type RecoveryActionOutcome,
  useApproveRecovery,
  useRecoveryRequestsForSteward,
  useRejectRecovery,
} from "../hooks/useRecovery";
import {
  presentRecoveryStatus,
  useRecoveryPersonName,
} from "../hooks/useRecoveryStatus";
import { useIsSteward } from "../hooks/useStewardAuthority";

interface FamilyStewardRecoveryReviewsPageProps {
  onBack: () => void;
}

/**
 * The Steward outcome recorded for a recovery request on this screen. Kept
 * locally so a resolved request stays visible in place in a read-only state
 * even after the backend's open-request list drops it.
 */
type RecoveryDecision = "approved" | "rejected" | "alreadySettled" | "error";

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

/**
 * The Family Steward recovery-review screen.
 *
 * Lists the ordinary Account Recovery requests awaiting a Steward decision in
 * the active family from the canonical, family-scoped
 * `useRecoveryRequestsForSteward` read (`listRecoveryRequestsForFamily`). The
 * hook already narrows the list to `#AccountRecovery` requests that are still
 * open, so this page never shows the 2-member quorum path or an already-decided
 * request.
 *
 * Each request shows only family-safe context: the person's display name, the
 * plain-language recovery status, and when the request was made. Raw account
 * principals and internal recovery ids are never rendered — the person name is
 * resolved through `useRecoveryPersonName` and the status through
 * `presentRecoveryStatus`, both of which are the single translation points for
 * internal enum names.
 *
 * A Steward resolves a request through exactly two actions: Approve recovery
 * and Reject recovery. Both call the existing Phase 4A backend actions
 * (`approveAccountRecoveryForFamily` / `rejectRecoveryForFamily`) for the active
 * family. The backend remains the security boundary: it derives the Steward
 * identity, refuses self-approval, and enforces replay safety. The frontend
 * hides the controls for the Steward's own request as an additional guard only.
 *
 * After a decision the request stays visible in place in a clear read-only
 * state — approved shows access restored, rejected shows a neutral final state
 * with no family access implied — and the action buttons are removed, so
 * duplicate submission is impossible. A request that changed elsewhere settles
 * into a neutral "already settled" state with no private reason or technical
 * tag exposed.
 *
 * The page self-gates on the canonical Steward authority, mirroring
 * FamilyStewardMembershipReviewsPage, so a direct navigation by a non-Steward
 * renders an unauthorized state rather than the review data.
 */
export function FamilyStewardRecoveryReviewsPage({
  onBack,
}: FamilyStewardRecoveryReviewsPageProps) {
  const { data: isSteward = false, isLoading: stewardLoading } = useIsSteward();
  const {
    data: requests = [],
    isLoading: requestsLoading,
    isError: requestsError,
    refetch: refetchRequests,
  } = useRecoveryRequestsForSteward();

  // Decisions recorded on this screen, keyed by the request's internal id. The
  // id is used only as a local map key and is never rendered. The decided
  // request object is retained alongside the decision so a request the backend
  // drops from its open-request list stays visible in place in a read-only
  // resolved state instead of silently disappearing.
  const [decisions, setDecisions] = useState<
    Map<string, { request: RecoveryRequest; decision: RecoveryDecision }>
  >(() => new Map());

  const handleDecided = useCallback(
    (request: RecoveryRequest, decision: RecoveryDecision) => {
      setDecisions((current) => {
        const next = new Map(current);
        next.set(request.id.toString(), { request, decision });
        return next;
      });
    },
    [],
  );

  // The rendered list: the backend's open requests, plus any request decided on
  // this screen that the backend no longer returns, in a stable order. A
  // decided request the backend still returns keeps its decision; one the
  // backend has dropped is rendered from the retained request object.
  const visibleRequests = useMemo(() => {
    const backendIds = new Set(requests.map((r) => r.id.toString()));
    const decidedOnly = [...decisions.entries()]
      .filter(([id]) => !backendIds.has(id))
      .map(([, entry]) => entry);
    return [
      ...requests.map((request) => ({
        request,
        decision: decisions.get(request.id.toString())?.decision,
      })),
      ...decidedOnly,
    ];
  }, [requests, decisions]);

  const isLoading = stewardLoading || requestsLoading;

  if (!stewardLoading && !isSteward) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <button
          type="button"
          data-ocid="recovery_reviews.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">←</span> Back to Home
        </button>
        <div
          data-ocid="recovery_reviews.unauthorized_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShieldCheck
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h1 className="font-display text-xl font-semibold text-foreground">
            Family Stewards only
          </h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            This review area is reserved for authorized Family Stewards who
            decide requests to restore access to a family profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <button
        type="button"
        data-ocid="recovery_reviews.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span aria-hidden="true">←</span> Back to Home
      </button>

      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <UserCog
            className="h-3.5 w-3.5 text-accent-foreground"
            aria-hidden="true"
          />
          Family Steward
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Recovery Reviews
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Requests from family members who need access to a family profile
          restored. Approve to restore access, or reject to decline the request.
        </p>
      </header>

      {isLoading ? (
        <div
          data-ocid="recovery_reviews.loading_state"
          className="space-y-4"
          aria-label="Loading recovery requests"
        >
          {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
            <div
              key={id}
              className="animate-pulse rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
              <div className="mb-2 h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : requestsError ? (
        <div
          data-ocid="recovery_reviews.error_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShieldAlert
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            We couldn&rsquo;t load the requests
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Something went wrong while loading the recovery requests. Please try
            again.
          </p>
          <button
            type="button"
            data-ocid="recovery_reviews.retry_button"
            onClick={() => void refetchRequests()}
            className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Retry
          </button>
        </div>
      ) : (
        <div data-ocid="recovery_reviews.panel" className="steward-panel">
          <section
            data-ocid="recovery_reviews.section"
            className="steward-section"
          >
            <h2 className="steward-section-title">
              Awaiting your decision ({visibleRequests.length})
            </h2>
            {visibleRequests.length === 0 ? (
              <DomainEmptyState
                icon={Inbox}
                title="Nothing needs a decision"
                hint="Requests to restore access to a family profile will appear here when a family member needs a Steward decision."
              />
            ) : (
              <ul data-ocid="recovery_reviews.list" className="space-y-3">
                {visibleRequests.map(({ request, decision }, index) => (
                  <RecoveryRequestCard
                    key={request.id.toString()}
                    request={request}
                    position={index + 1}
                    decision={decision}
                    onDecided={handleDecided}
                  />
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

interface RecoveryRequestCardProps {
  /** The open recovery request, in the active family. */
  request: RecoveryRequest;
  /** The 1-based position of this request in the list, for stable markers. */
  position: number;
  /** A decision already recorded for this request, if any. */
  decision?: RecoveryDecision;
  /** Called after a decision settles so the page keeps the request visible. */
  onDecided: (request: RecoveryRequest, decision: RecoveryDecision) => void;
}

/**
 * One ordinary Account Recovery request awaiting a Family Steward decision.
 *
 * Renders only family-safe context: the person's display name, the
 * plain-language recovery status, and when the request was made. It never
 * renders an account principal, an internal recovery id, or a raw enum name.
 *
 * The Steward resolves the request through exactly two actions — Approve
 * recovery and Reject recovery — each behind a confirmation dialog. The
 * controls are hidden when the request belongs to the signed-in Steward's own
 * account (self-approval is refused by the backend; this is an additional
 * frontend guard only).
 *
 * After a decision the card renders a read-only resolved state with no action
 * buttons, so duplicate submission is impossible.
 */
function RecoveryRequestCard({
  request,
  position,
  decision,
  onDecided,
}: RecoveryRequestCardProps) {
  const personName = useRecoveryPersonName(request.personId);
  const { accountId } = useAuth();
  const approve = useApproveRecovery();
  const reject = useRejectRecovery();
  const [confirming, setConfirming] = useState<"approve" | "reject" | null>(
    null,
  );

  const status = presentRecoveryStatus(request.status);
  const isSubmitting = approve.isPending || reject.isPending;
  // The Steward's own request: the replacement account is the signed-in
  // account. Approve/Reject are hidden as an additional frontend guard; the
  // backend independently refuses self-approval.
  const isOwnRequest =
    !!accountId && request.replacementAccountId.toString() === accountId;

  const settle = (next: RecoveryDecision) => {
    onDecided(request, next);
  };

  const submit = (action: "approve" | "reject") => {
    const mutation = action === "approve" ? approve : reject;
    mutation.mutate(
      { recoveryId: request.id },
      {
        onSuccess: (outcome: RecoveryActionOutcome) => {
          switch (outcome.kind) {
            case "approved":
              settle("approved");
              break;
            case "rejected":
              settle("rejected");
              break;
            case "alreadySettled":
              settle("alreadySettled");
              break;
            default:
              settle("error");
              break;
          }
        },
        onError: () => settle("error"),
      },
    );
  };

  if (decision) {
    const isError = decision === "error";
    const isRejected = decision === "rejected";
    return (
      <li
        data-ocid={`recovery_reviews.request_item.${position}`}
        className="review-card"
      >
        <div
          data-ocid={`recovery_reviews.request_result.${position}`}
          className={`confirm-status-card ${
            isError
              ? "confirm-status-review"
              : isRejected
                ? "confirm-status-neutral"
                : "confirm-status-success"
          }`}
        >
          <span className="confirm-status-mark" aria-hidden="true">
            {isError ? (
              <HelpCircle className="h-4 w-4" strokeWidth={1.75} />
            ) : isRejected ? (
              <X className="h-4 w-4" strokeWidth={1.75} />
            ) : (
              <Check className="h-4 w-4" strokeWidth={1.75} />
            )}
          </span>
          <div className="confirm-status-text">
            <h3 className="confirm-status-title">
              {decision === "approved"
                ? "Access restored"
                : decision === "rejected"
                  ? "Request not approved"
                  : decision === "alreadySettled"
                    ? "This request was already settled"
                    : "We couldn't record your decision"}
            </h3>
            <p className="confirm-status-body">
              {decision === "approved"
                ? `${personName} can now sign in to this family profile.`
                : decision === "rejected"
                  ? "This request was declined. No family access was granted."
                  : decision === "alreadySettled"
                    ? "Nothing further is needed from you right now."
                    : "Please try again in a moment."}
            </p>
          </div>
        </div>
        <RecoveryHistorySection recoveryId={request.id} />
      </li>
    );
  }

  return (
    <li
      data-ocid={`recovery_reviews.request_item.${position}`}
      className="review-card"
      aria-busy={isSubmitting}
    >
      <div className="review-card-head">
        <div className="min-w-0">
          <h3 className="review-card-title">{personName}</h3>
          <p
            data-ocid={`recovery_reviews.request_status.${position}`}
            className="review-card-meta"
          >
            {status.label}
          </p>
          <p
            data-ocid={`recovery_reviews.request_date.${position}`}
            className="review-card-meta"
          >
            Requested {formatDateTime(request.createdAt)}
          </p>
        </div>
        <span
          data-ocid={`recovery_reviews.request_type.${position}`}
          className="confirm-status-card confirm-status-review w-auto shrink-0 items-center gap-2 px-3 py-1.5"
        >
          <span className="confirm-status-mark h-6 w-6" aria-hidden="true">
            <KeyRound className="h-3.5 w-3.5" strokeWidth={1.75} />
          </span>
          <span className="confirm-status-title text-xs">Account recovery</span>
        </span>
      </div>

      <p className="review-card-meta">{status.description}</p>

      <RecoveryHistorySection recoveryId={request.id} />

      {isOwnRequest ? (
        <p
          data-ocid={`recovery_reviews.own_request_note.${position}`}
          className="review-card-meta"
        >
          This is your own request. Another Steward needs to decide it.
        </p>
      ) : (
        <div className="review-card-actions">
          <button
            type="button"
            data-ocid={`recovery_reviews.approve_button.${position}`}
            onClick={() => setConfirming("approve")}
            disabled={isSubmitting}
            className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            Approve recovery
          </button>
          <button
            type="button"
            data-ocid={`recovery_reviews.reject_button.${position}`}
            onClick={() => setConfirming("reject")}
            disabled={isSubmitting}
            className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            Reject recovery
          </button>
        </div>
      )}

      {isSubmitting ? (
        <output
          data-ocid={`recovery_reviews.submitting_state.${position}`}
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

      <AlertDialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open) setConfirming(null);
        }}
      >
        <AlertDialogContent
          data-ocid={`recovery_reviews.confirm_dialog.${position}`}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirming === "approve"
                ? "Approve this recovery?"
                : "Reject this recovery?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirming === "approve"
                ? `${personName} will be able to sign in to this family profile.`
                : `${personName} will not be granted access to this family profile.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              data-ocid={`recovery_reviews.confirm_cancel_button.${position}`}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              data-ocid={`recovery_reviews.confirm_submit_button.${position}`}
              onClick={() => {
                const action = confirming;
                setConfirming(null);
                if (action) submit(action);
              }}
            >
              {confirming === "approve"
                ? "Approve recovery"
                : "Reject recovery"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}

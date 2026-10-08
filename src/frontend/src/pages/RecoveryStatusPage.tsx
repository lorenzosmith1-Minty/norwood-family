import { type MyRecoveryRequestView, RecoveryStatus } from "@/backend";
import {
  ArrowLeft,
  Clock,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { DomainEmptyState } from "../components/DomainEmptyState";
import { useMyRecoveryRequests } from "../hooks/useRecovery";
import {
  type RecoveryStatusPresentation,
  presentQuorumProgress,
  presentRecoveryStatus,
} from "../hooks/useRecoveryStatus";

/**
 * "My recovery requests" — the replacement account's own tracking view for the
 * Phase 4B self-service recovery flow.
 *
 * Phase 4B-H1: the list comes from the caller-scoped backend read
 * (`listMyRecoveryRequestsForFamily`), which is authoritative. Status therefore
 * survives a page reload, a fresh browser session, signing in again, or another
 * device with the same replacement account — there is no client-side request-id
 * registry.
 *
 * The page lists the caller's own recovery requests in the active family and
 * shows each one in plain family-facing language across every state: waiting
 * for family review, waiting for family confirmations, ready for a Steward
 * decision, access restored, not approved, withdrawn, and expired. Internal
 * enum names are never rendered — the wording comes exclusively from
 * `presentRecoveryStatus` and the page-local `recoveryStage` helper.
 *
 * The candidate is the requester, so this surface is strictly read-only: it
 * never renders Confirm/Dispute verifier controls, and a resolved request
 * (approved, rejected, withdrawn, or expired) renders a closed, read-only state
 * with no actions at all.
 *
 * Privacy: the caller sees only the minimum needed to track their own request —
 * the target's display name, the plain-language status, and the relevant
 * timestamps. No account principal, internal membership id, recovery id, or
 * unrelated private profile detail is ever shown.
 */
export interface RecoveryStatusPageProps {
  /** Returns to the previous view (Home). */
  onBack: () => void;
  /** Opens the recovery request flow to start a new request. */
  onStartRequest: () => void;
}

/** Format a backend nanosecond timestamp as a short, readable date. */
function formatTimestamp(timestamp: bigint): string | null {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** The status-pill class for a presentation tone. */
function toneClass(tone: RecoveryStatusPresentation["tone"]): string {
  switch (tone) {
    case "approved":
      return "status-approved";
    case "rejected":
      return "status-rejected";
    case "pending":
      return "status-pending";
    default:
      return "status-needs";
  }
}

/**
 * A plain-language stage line for an open request, so the candidate can see
 * where their request is in the family review process without any internal
 * enum name or numeric quorum count. Resolved requests return `null` — their
 * state is fully described by the status presentation.
 *
 * The backend's caller-scoped view deliberately carries no quorum counts, so
 * this communicates the phase (collecting family confirmations vs. ready for a
 * Steward decision) rather than a fabricated progress number.
 */
function recoveryStage(status: RecoveryStatus): string | null {
  switch (status) {
    case RecoveryStatus.Pending:
      return "Your request has been sent to your family.";
    case RecoveryStatus.AwaitingVerification:
      return "Family members are confirming your request.";
    case RecoveryStatus.ReadyForApproval:
      return "Enough family members have confirmed. A Steward will make the final decision.";
    default:
      return null;
  }
}

/** True once a request can no longer change (approved, rejected, withdrawn, expired). */
function isResolvedStatus(status: RecoveryStatus): boolean {
  switch (status) {
    case RecoveryStatus.Approved:
    case RecoveryStatus.Rejected:
    case RecoveryStatus.Cancelled:
    case RecoveryStatus.Expired:
      return true;
    default:
      return false;
  }
}

/**
 * One recovery request row. Renders only the target display name, the
 * plain-language status, the review stage for open requests, and the relevant
 * timestamps — never a principal, a recovery id, or a raw enum name.
 *
 * The row is read-only in every state: the candidate tracks their own request
 * and never sees verifier controls. A resolved request additionally shows a
 * closed-state note so it reads as final.
 */
function RecoveryRequestRow({
  request,
  index,
}: {
  request: MyRecoveryRequestView;
  index: number;
}) {
  const presentation = presentRecoveryStatus(request.status);
  const stage = recoveryStage(request.status);
  const resolved = isResolvedStatus(request.status);
  const updated = formatTimestamp(request.updatedAt);
  // Steward Recovery requests carry quorum counts; ordinary Account Recovery
  // leaves them absent, so the progress line only renders when both are present.
  const quorum =
    request.confirmationsReceived !== undefined &&
    request.confirmationsRequired !== undefined
      ? presentQuorumProgress(
          Number(request.confirmationsReceived),
          Number(request.confirmationsRequired),
        )
      : null;
  return (
    <li
      data-ocid={`recovery_status.item.${index}`}
      className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-foreground">
          {request.targetName}
        </h2>
        <span className={`status-pill ${toneClass(presentation.tone)}`}>
          {presentation.label}
        </span>
      </div>
      <p className="text-sm leading-relaxed text-muted-foreground">
        {presentation.description}
      </p>
      {stage ? (
        <p
          data-ocid={`recovery_status.stage.${index}`}
          className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
        >
          <Clock
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{stage}</span>
        </p>
      ) : null}
      {quorum ? (
        <p
          data-ocid={`recovery_status.quorum.${index}`}
          className="flex items-start gap-2 text-sm leading-relaxed text-foreground"
        >
          <Users
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>{quorum}</span>
        </p>
      ) : null}
      {resolved ? (
        <p
          data-ocid={`recovery_status.resolved_note.${index}`}
          className="flex items-start gap-2 text-xs leading-relaxed text-muted-foreground"
        >
          <ShieldCheck
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <span>This request is closed and can no longer be changed.</span>
        </p>
      ) : null}
      {updated ? (
        <p className="text-xs text-muted-foreground">Last updated {updated}</p>
      ) : null}
    </li>
  );
}

export function RecoveryStatusPage({
  onBack,
  onStartRequest,
}: RecoveryStatusPageProps) {
  const {
    data: requests = [],
    isLoading,
    isError,
    refetch,
  } = useMyRecoveryRequests();

  // Newest first, so the most recent request is always at the top.
  const ordered = useMemo(
    () => [...requests].sort((a, b) => Number(b.createdAt - a.createdAt)),
    [requests],
  );

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-10">
      <button
        type="button"
        data-ocid="recovery_status.back_button"
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back
      </button>

      <header className="flex flex-col gap-2">
        <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <KeyRound
            className="h-3.5 w-3.5 text-accent-foreground"
            aria-hidden="true"
          />
          Recovery
        </div>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-foreground">
          My recovery requests
        </h1>
        <p className="max-w-xl text-sm leading-relaxed text-muted-foreground">
          Track the family profiles you’ve asked to recover. A family Steward
          reviews each request before access is restored.
        </p>
      </header>

      {isLoading ? (
        <div
          data-ocid="recovery_status.loading_state"
          className="space-y-4"
          aria-label="Loading your recovery requests"
        >
          {Array.from({ length: 2 }, (_, i) => `skeleton-${i}`).map((id) => (
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
      ) : isError ? (
        <div
          data-ocid="recovery_status.error_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <RefreshCw
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            We couldn’t load your requests
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Something went wrong while loading your recovery requests. Please
            try again.
          </p>
          <button
            type="button"
            data-ocid="recovery_status.retry_button"
            onClick={() => void refetch()}
            className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Retry
          </button>
        </div>
      ) : ordered.length === 0 ? (
        <DomainEmptyState
          icon={Clock}
          title="No recovery requests yet"
          hint="If you can no longer sign in to a family profile you already claimed, you can ask your family to restore your access."
          action={
            <button
              type="button"
              data-ocid="recovery_status.start_request_button"
              onClick={onStartRequest}
              className="this-is-me-action mt-2"
            >
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              Recover my Norwood profile
            </button>
          }
        />
      ) : (
        <ul data-ocid="recovery_status.list" className="flex flex-col gap-4">
          {ordered.map((req, index) => (
            <RecoveryRequestRow
              key={`${req.targetName}-${req.createdAt.toString()}`}
              request={req}
              index={index}
            />
          ))}
        </ul>
      )}

      {!isLoading && !isError && ordered.length > 0 ? (
        <button
          type="button"
          data-ocid="recovery_status.start_request_button"
          onClick={onStartRequest}
          className="inline-flex w-fit min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <KeyRound className="h-4 w-4" aria-hidden="true" />
          Recover another profile
        </button>
      ) : null}
    </div>
  );
}

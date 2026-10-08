import type { RecoveryAuditView } from "@/backend";
import { History, RefreshCw } from "lucide-react";
import { useAuthorizedRecoveryAudit } from "../hooks/useRecovery";
import {
  type RecoveryAuditEntryView,
  toRecoveryAuditEntryView,
} from "../hooks/useRecoveryStatus";

/**
 * The read-only Recovery History section.
 *
 * Phase 4D: renders the authorized recovery audit trail for one request in the
 * active family, read through `useAuthorizedRecoveryAudit`
 * (`listAuthorizedRecoveryAuditForFamily`). The backend is the authorization
 * boundary — it returns entries only to a caller permitted to view the request
 * (an active Steward of the family, the requester, the current owner, or the
 * replacement account) and exposes only family-safe fields.
 *
 * Each entry shows the plain-language action, the actor, the affected people,
 * and the timestamp. The backend now resolves the actor and affected-person
 * display names server-side, so this surface renders the safe projection
 * directly and performs no profile lookups. Internal enum names, account
 * principals, audit ids, recovery ids, family ids, and the raw free-text
 * summary are never rendered. A neutral empty state is shown when there is no
 * history yet, and a neutral error state with a Retry action when the read
 * fails — the error tag itself is never surfaced.
 *
 * The section is strictly read-only: it offers no recovery actions.
 */

/** Converts a Motoko nanosecond timestamp to a short human date and time. */
function formatHistoryTime(timestamp: bigint): string {
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

/** One audit entry row. */
function RecoveryHistoryRow({
  entry,
  index,
}: {
  entry: RecoveryAuditEntryView;
  index: number;
}) {
  const affected =
    entry.affectedNames.length > 0
      ? entry.affectedNames.join(", ")
      : "A family member";
  return (
    <li
      data-ocid={`recovery_history.item.${index}`}
      className="flex flex-col gap-1 rounded-xl border border-border/50 bg-card px-4 py-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">
          {entry.actionLabel}
        </span>
        <span className="text-xs text-muted-foreground">
          {formatHistoryTime(entry.timestamp)}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        By {entry.actorName} · Affecting {affected}
      </p>
    </li>
  );
}

export interface RecoveryHistorySectionProps {
  /**
   * The internal recovery request id whose history is shown. Passed straight to
   * the authorized backend read and never rendered.
   */
  recoveryId: bigint;
}

export function RecoveryHistorySection({
  recoveryId,
}: RecoveryHistorySectionProps) {
  const {
    data: audit = [],
    isLoading,
    isError,
    refetch,
  } = useAuthorizedRecoveryAudit(recoveryId);

  const entries: RecoveryAuditEntryView[] = audit.map(
    (view: RecoveryAuditView) => toRecoveryAuditEntryView(view),
  );

  return (
    <section
      data-ocid="recovery_history.section"
      className="flex flex-col gap-3"
      aria-label="Recovery history"
    >
      <div className="flex items-center gap-2">
        <History
          className="h-4 w-4 text-muted-foreground"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Recovery history
        </h2>
      </div>

      {isLoading ? (
        <div
          data-ocid="recovery_history.loading_state"
          className="space-y-2"
          aria-label="Loading recovery history"
        >
          {Array.from({ length: 2 }, (_, i) => `history-skeleton-${i}`).map(
            (id) => (
              <div
                key={id}
                className="h-16 animate-pulse rounded-xl border border-border/50 bg-card"
              />
            ),
          )}
        </div>
      ) : isError ? (
        <div
          data-ocid="recovery_history.error_state"
          className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-border/70 bg-card/50 px-4 py-5"
        >
          <p className="text-sm text-muted-foreground">
            We couldn&rsquo;t load the recovery history. Please try again.
          </p>
          <button
            type="button"
            data-ocid="recovery_history.retry_button"
            onClick={() => void refetch()}
            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : entries.length === 0 ? (
        <p
          data-ocid="recovery_history.empty_state"
          className="rounded-xl border border-dashed border-border/70 bg-card/50 px-4 py-5 text-sm text-muted-foreground"
        >
          No recovery activity has been recorded yet.
        </p>
      ) : (
        <ul data-ocid="recovery_history.list" className="flex flex-col gap-2">
          {entries.map((entry, index) => (
            <RecoveryHistoryRow
              key={`${entry.actionLabel}-${entry.timestamp.toString()}-${index}`}
              entry={entry}
              index={index}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

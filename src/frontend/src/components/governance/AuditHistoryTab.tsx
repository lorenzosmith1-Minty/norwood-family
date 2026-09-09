import { Inbox, ScrollText } from "lucide-react";
import { useListAuditHistory } from "../../hooks/useGovernance";
import { profiles } from "../../pages/PersonProfilePage";
import { resolveDisplayName } from "../../types/family";
import { AUDIT_ACTION_LABELS } from "../../types/governance";

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

/** Resolves a person's display name from the shared profiles record. */
function personName(personId: string): string {
  return resolveDisplayName(personId, profiles);
}

export function AuditHistoryTab() {
  const { data: entries = [], isLoading } = useListAuditHistory();

  if (isLoading) {
    return (
      <div
        data-ocid="governance.audit.loading_state"
        className="space-y-3"
        aria-label="Loading audit history"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="h-16 animate-pulse rounded-xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div data-ocid="governance.audit.empty_state" className="gov-empty">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h2 className="gov-empty-title">No audit entries yet</h2>
        <p className="gov-empty-hint">
          Steward actions — claims, relationship changes, promotions, archives,
          and merges — are recorded here.
        </p>
      </div>
    );
  }

  return (
    <div data-ocid="governance.audit.panel" className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScrollText className="h-4 w-4" aria-hidden="true" />
        Visible to Family Stewards only.
      </div>
      <ul data-ocid="governance.audit.list" className="audit-list">
        {entries
          .slice()
          .sort((a, b) => Number(b.timestamp - a.timestamp))
          .map((entry, index) => (
            <li
              key={entry.id.toString()}
              data-ocid={`governance.audit.item.${index + 1}`}
              className="audit-entry"
            >
              <div className="audit-entry-body">
                <span className="audit-entry-action">
                  {AUDIT_ACTION_LABELS[entry.actionType] ?? entry.actionType}
                </span>
                <span className="audit-entry-detail">{entry.summary}</span>
                {entry.affectedPersonIds.length > 0 ? (
                  <span className="audit-entry-detail">
                    People: {entry.affectedPersonIds.map(personName).join(", ")}
                  </span>
                ) : null}
                <span className="audit-entry-meta">
                  <span className="audit-actor">
                    {formatPrincipal(entry.actorAccountId)}
                  </span>
                  · {formatDateTime(entry.timestamp)}
                </span>
              </div>
            </li>
          ))}
      </ul>
    </div>
  );
}

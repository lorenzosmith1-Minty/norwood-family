import { Inbox, ScrollText } from "lucide-react";
import { useGetStewardAuditHistory } from "../../hooks/useGovernance";
import { profiles } from "../../pages/PersonProfilePage";
import { resolveDisplayName } from "../../types/family";
import {
  AUDIT_ACTION_LABELS,
  CONFLICT_RESOLUTION_LABELS,
  STEWARD_AUDIT_KIND_LABELS,
  StewardAuditKind,
} from "../../types/governance";
import type { StewardAuditEntry } from "../../types/governance";

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

/** The action label for a merged audit entry, by kind. */
function actionLabel(entry: StewardAuditEntry): string {
  if (entry.kind === StewardAuditKind.ConflictResolution) {
    return (
      CONFLICT_RESOLUTION_LABELS[entry.resolution ?? ""] ??
      entry.actionType ??
      "Conflict resolved"
    );
  }
  return (
    AUDIT_ACTION_LABELS[entry.actionType as keyof typeof AUDIT_ACTION_LABELS] ??
    entry.actionType
  );
}

/** Renders a single merged steward audit entry. */
function AuditEntryRow({
  entry,
  index,
}: {
  entry: StewardAuditEntry;
  index: number;
}) {
  const isConflict = entry.kind === StewardAuditKind.ConflictResolution;
  return (
    <li
      key={entry.id.toString()}
      data-ocid={`governance.audit.item.${index + 1}`}
      className="audit-entry"
    >
      <div className="audit-entry-body">
        <div className="flex flex-wrap items-center gap-2">
          <span className="audit-entry-action">{actionLabel(entry)}</span>
          <span className="status-pill status-needs">
            {STEWARD_AUDIT_KIND_LABELS[entry.kind]}
          </span>
        </div>

        {isConflict ? (
          <div className="flex flex-col gap-1.5">
            {entry.personId ? (
              <span className="audit-entry-detail">
                Person:{" "}
                <span className="font-semibold text-foreground">
                  {personName(entry.personId)}
                </span>
              </span>
            ) : null}
            {entry.field ? (
              <span className="audit-entry-detail">
                Field: <span className="font-medium">{entry.field}</span>
              </span>
            ) : null}
            {entry.existingValue ? (
              <span className="audit-entry-detail">
                Existing:{" "}
                <span className="font-medium">{entry.existingValue}</span>
              </span>
            ) : null}
            {entry.proposedValue ? (
              <span className="audit-entry-detail">
                Proposed:{" "}
                <span className="font-medium">{entry.proposedValue}</span>
              </span>
            ) : null}
            {entry.resolution ? (
              <span className="audit-entry-detail">
                Resolution:{" "}
                <span className="font-medium">
                  {CONFLICT_RESOLUTION_LABELS[entry.resolution] ??
                    entry.resolution}
                </span>
              </span>
            ) : null}
            {entry.stewardNotes ? (
              <span className="audit-entry-detail">
                Steward notes: {entry.stewardNotes}
              </span>
            ) : null}
            {(entry.existingSourceId !== undefined ||
              entry.proposedSourceId !== undefined) && (
              <span className="audit-entry-detail">
                Sources:{" "}
                {entry.existingSourceId !== undefined
                  ? `Existing #${entry.existingSourceId.toString()}`
                  : ""}
                {entry.existingSourceId !== undefined &&
                entry.proposedSourceId !== undefined
                  ? " · "
                  : ""}
                {entry.proposedSourceId !== undefined
                  ? `Proposed #${entry.proposedSourceId.toString()}`
                  : ""}
              </span>
            )}
          </div>
        ) : (
          <>
            <span className="audit-entry-detail">{entry.summary}</span>
            {entry.affectedPersonIds.length > 0 ? (
              <span className="audit-entry-detail">
                People: {entry.affectedPersonIds.map(personName).join(", ")}
              </span>
            ) : null}
          </>
        )}

        <span className="audit-entry-meta">
          <span className="audit-actor">
            {formatPrincipal(entry.actorAccountId)}
          </span>
          · {formatDateTime(entry.timestamp)}
        </span>
      </div>
    </li>
  );
}

export function AuditHistoryTab() {
  const { data: entries = [], isLoading } = useGetStewardAuditHistory();

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
          merges, and conflict resolutions — are recorded here.
        </p>
      </div>
    );
  }

  return (
    <div data-ocid="governance.audit.panel" className="flex flex-col gap-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <ScrollText className="h-4 w-4" aria-hidden="true" />
        Visible to Family Stewards only. Governance actions and conflict
        resolutions are merged chronologically.
      </div>
      <ul data-ocid="governance.audit.list" className="audit-list">
        {entries
          .slice()
          .sort((a, b) => Number(b.timestamp - a.timestamp))
          .map((entry, index) => (
            <AuditEntryRow
              key={entry.id.toString()}
              entry={entry}
              index={index}
            />
          ))}
      </ul>
    </div>
  );
}

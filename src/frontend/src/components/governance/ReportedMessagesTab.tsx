import { Check, Flag, ShieldAlert, X } from "lucide-react";
import {
  useGetReportedMessage,
  useListReports,
  useReviewReport,
} from "../../hooks/useMessaging";
import { profiles } from "../../pages/PersonProfilePage";
import { resolveDisplayName } from "../../types/family";
import type { Report, ReportedMessageView } from "../../types/messaging";
import { REPORT_STATUS_LABELS, ReportStatus } from "../../types/messaging";

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

/** Shortens a principal to a readable, copy-safe label (never a raw id). */
function formatPrincipal(principal: { toText(): string }): string {
  const text = principal.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/** Resolves a person's display name from the shared profiles record. */
function personName(personId: string): string {
  return resolveDisplayName(personId, profiles);
}

/** A small status pill for a report's review state. */
function ReportStatusPill({ status }: { status: ReportStatus }) {
  return (
    <span
      data-ocid="reported_messages.status_pill"
      className="inline-flex shrink-0 items-center rounded-full border border-border/70 bg-muted px-2.5 py-0.5 text-[11px] font-semibold text-muted-foreground"
    >
      {REPORT_STATUS_LABELS[status]}
    </span>
  );
}

export function ReportedMessagesTab() {
  const { data: reports = [], isLoading } = useListReports();
  const reviewReport = useReviewReport();

  if (isLoading) {
    return (
      <div
        data-ocid="reported_messages.loading_state"
        className="space-y-4"
        aria-label="Loading reported messages"
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="animate-pulse rounded-2xl border border-border bg-card p-5"
          >
            <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
            <div className="mb-2 h-5 w-2/3 rounded bg-muted" />
            <div className="h-4 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (reports.length === 0) {
    return (
      <div data-ocid="reported_messages.empty_state" className="gov-empty">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Flag
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h2 className="gov-empty-title">No reported messages</h2>
        <p className="gov-empty-hint">
          When a family member reports a message, it will appear here for your
          review. You only ever see reported message content — never an
          arbitrary conversation.
        </p>
      </div>
    );
  }

  return (
    <div data-ocid="reported_messages.panel" className="flex flex-col gap-4">
      <section data-ocid="reported_messages.section" className="gov-section">
        <div className="gov-section-head">
          <h2 className="gov-section-title">
            Reported Messages ({reports.length})
          </h2>
        </div>
        <ul data-ocid="reported_messages.list" className="space-y-3">
          {reports.map((report, index) => (
            <ReportedMessageCard
              key={report.reportId.toString()}
              report={report}
              index={index}
              reviewing={reviewReport.isPending}
              onReview={(status) =>
                reviewReport.mutate({ reportId: report.reportId, status })
              }
            />
          ))}
        </ul>
      </section>
    </div>
  );
}

interface ReportedMessageCardProps {
  report: Report;
  index: number;
  reviewing: boolean;
  onReview: (status: ReportStatus) => void;
}

function ReportedMessageCard({
  report,
  index,
  reviewing,
  onReview,
}: ReportedMessageCardProps) {
  const position = index + 1;
  const { data: view, isLoading } = useGetReportedMessage(report.reportId);
  const resolved = view ?? null;

  return (
    <li
      data-ocid={`reported_messages.item.${position}`}
      className="review-card"
    >
      <div className="review-card-head">
        <div className="min-w-0">
          <h3 className="review-card-title">
            {resolved
              ? personName(resolved.message.senderPersonId)
              : "Reported message"}
          </h3>
          <p className="review-card-meta">
            Reported by {formatPrincipal(report.reportingAccountId)} ·{" "}
            {formatDateTime(report.createdAt)}
          </p>
        </div>
        <ReportStatusPill status={report.status} />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/40 p-3">
          <ShieldAlert
            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Reason
            </p>
            <p className="mt-0.5 text-sm text-foreground">{report.reason}</p>
          </div>
        </div>

        <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-card p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Reported message
          </p>
          {isLoading ? (
            <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
          ) : resolved ? (
            <p className="whitespace-pre-wrap break-words text-sm text-foreground">
              {resolved.message.body}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Message content is no longer available.
            </p>
          )}
        </div>
      </div>

      {report.status === ReportStatus.Pending && (
        <div className="review-card-actions">
          <button
            type="button"
            data-ocid={`reported_messages.resolve_button.${position}`}
            onClick={() => onReview(ReportStatus.Reviewed)}
            disabled={reviewing}
            className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            {reviewing ? "Reviewing…" : "Resolve"}
          </button>
          <button
            type="button"
            data-ocid={`reported_messages.dismiss_button.${position}`}
            onClick={() => onReview(ReportStatus.Dismissed)}
            disabled={reviewing}
            className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
            {reviewing ? "Reviewing…" : "Dismiss"}
          </button>
        </div>
      )}
    </li>
  );
}

import { Check, Inbox, ShieldCheck, X } from "lucide-react";
import {
  useApproveArchiveItem,
  usePendingArchiveItems,
  useRejectArchiveItem,
} from "../hooks/useArchiveStorage";
import type { ArchiveItem } from "../types/archive";
import {
  ARCHIVE_ITEM_STATUS_LABELS,
  ARCHIVE_ITEM_STATUS_PILL,
  ARCHIVE_ITEM_TYPE_BADGE,
  ARCHIVE_ITEM_TYPE_LABELS,
  PRIVACY_LEVEL_LABELS,
  SOURCE_STATUS_LABELS,
} from "../types/archive";

interface AdminApprovalPageProps {
  onBack: () => void;
}

/** Converts a Motoko nanosecond timestamp to a short human date. */
function formatDate(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Shortens a contributor principal to a readable, copy-safe label. */
function formatContributor(contributor: ArchiveItem["contributor"]): string {
  const text = contributor.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

export function AdminApprovalPage({ onBack }: AdminApprovalPageProps) {
  const { data: items = [], isLoading } = usePendingArchiveItems();
  const approve = useApproveArchiveItem();
  const reject = useRejectArchiveItem();

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <button
        type="button"
        data-ocid="admin_approval.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <span aria-hidden="true">←</span> Back to Home
      </button>

      <header className="mb-8">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ShieldCheck
            className="h-3.5 w-3.5 text-accent-foreground"
            aria-hidden="true"
          />
          Admin Review
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Pending Contributions
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Review each contribution before it joins the family archive. Approve
          to publish it, or reject to keep it out.
        </p>
      </header>

      {isLoading ? (
        <div
          data-ocid="admin_approval.loading_state"
          className="space-y-4"
          aria-label="Loading pending contributions"
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
      ) : items.length === 0 ? (
        <div
          data-ocid="admin_approval.empty_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Inbox
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            Nothing awaiting review
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            New contributions from family members will appear here for your
            approval before they are added to the archive.
          </p>
        </div>
      ) : (
        <ul data-ocid="admin_approval.list" className="space-y-4">
          {items.map((item, index) => (
            <PendingItem
              key={item.id.toString()}
              item={item}
              index={index}
              approving={approve.isPending}
              rejecting={reject.isPending}
              onApprove={() => approve.mutate(item.id)}
              onReject={() => reject.mutate(item.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface PendingItemProps {
  item: ArchiveItem;
  index: number;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function PendingItem({
  item,
  index,
  approving,
  rejecting,
  onApprove,
  onReject,
}: PendingItemProps) {
  const position = index + 1;
  const typeBadge = ARCHIVE_ITEM_TYPE_BADGE[item.itemType];
  const statusPill = ARCHIVE_ITEM_STATUS_PILL[item.status];

  return (
    <li
      data-ocid={`admin_approval.item.${position}`}
      className="rounded-2xl border border-border bg-card p-5 shadow-subtle"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span
          className={`archive-type-badge ${typeBadge}`}
          data-ocid={`admin_approval.type_badge.${position}`}
        >
          {ARCHIVE_ITEM_TYPE_LABELS[item.itemType]}
        </span>
        <span
          className={`status-pill ${statusPill}`}
          data-ocid={`admin_approval.status_pill.${position}`}
        >
          {ARCHIVE_ITEM_STATUS_LABELS[item.status]}
        </span>
      </div>

      <h3 className="font-display text-xl font-semibold text-foreground">
        {item.title}
      </h3>

      {item.description ? (
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {item.description}
        </p>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Contributor
          </dt>
          <dd className="mt-0.5 font-mono text-xs text-foreground">
            {formatContributor(item.contributor)}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Era
          </dt>
          <dd className="mt-0.5 text-foreground">{item.era || "—"}</dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Year
          </dt>
          <dd className="mt-0.5 text-foreground">
            {item.year !== undefined ? item.year.toString() : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Source
          </dt>
          <dd className="mt-0.5 text-foreground">
            {SOURCE_STATUS_LABELS[item.sourceStatus]}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Privacy
          </dt>
          <dd className="mt-0.5 text-foreground">
            {PRIVACY_LEVEL_LABELS[item.privacyLevel]}
          </dd>
        </div>
        <div>
          <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Submitted
          </dt>
          <dd className="mt-0.5 text-foreground">
            {formatDate(item.createdAt)}
          </dd>
        </div>
      </dl>

      {item.tags.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {item.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/60 bg-background px-2.5 py-0.5 text-xs text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {item.relatedMemberIds.length > 0 ? (
        <div className="mt-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Related family members
          </p>
          <p className="mt-1 text-sm text-foreground">
            {item.relatedMemberIds.join(", ")}
          </p>
        </div>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-border/60 pt-4">
        <button
          type="button"
          data-ocid={`admin_approval.approve_button.${position}`}
          onClick={onApprove}
          disabled={approving || rejecting}
          className="approve-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {approving ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          data-ocid={`admin_approval.reject_button.${position}`}
          onClick={onReject}
          disabled={approving || rejecting}
          className="reject-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </li>
  );
}

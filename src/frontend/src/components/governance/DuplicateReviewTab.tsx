import { Check, GitMerge, Inbox, X } from "lucide-react";
import { useState } from "react";
import {
  useListDuplicateCandidates,
  useMergeProfiles,
  useNotDuplicate,
  useResolveMergeConflict,
} from "../../hooks/useGovernance";
import type {
  DuplicateCandidate,
  DuplicatePair,
  MergeConflict,
  MergeResult,
} from "../../types/governance";
import { MERGE_CONFLICT_STATUS_LABELS } from "../../types/governance";

/** Shortens a principal to a readable, copy-safe label. */
function formatPrincipal(principal: { toText(): string }): string {
  const text = principal.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/** Renders a birth–death year range, or a fallback when neither is known. */
function yearsRange(candidate: DuplicateCandidate): string {
  const birth = candidate.birthDate ?? "?";
  const death = candidate.deathDate ?? "?";
  return `${birth} – ${death}`;
}

export function DuplicateReviewTab() {
  const { data: pairs = [], isLoading } = useListDuplicateCandidates();
  const notDuplicate = useNotDuplicate();
  const merge = useMergeProfiles();
  const resolveConflict = useResolveMergeConflict();

  const [mergeResult, setMergeResult] = useState<MergeResult | null>(null);

  const handleMerge = (pair: DuplicatePair, canonicalPersonId: string) => {
    const mergedAwayPersonId =
      canonicalPersonId === pair.candidateA.personId
        ? pair.candidateB.personId
        : pair.candidateA.personId;
    merge.mutate(
      { canonicalPersonId, mergedAwayPersonId },
      {
        onSuccess: (result) => {
          if (result.__kind__ === "ok") setMergeResult(result.ok);
        },
      },
    );
  };

  if (isLoading) {
    return (
      <div
        data-ocid="governance.duplicates.loading_state"
        className="space-y-4"
        aria-label="Loading duplicate candidates"
      >
        {[0, 1].map((i) => (
          <div
            key={i}
            className="h-40 animate-pulse rounded-2xl border border-border bg-card"
          />
        ))}
      </div>
    );
  }

  if (pairs.length === 0 && !mergeResult) {
    return (
      <div data-ocid="governance.duplicates.empty_state" className="gov-empty">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h2 className="gov-empty-title">No duplicate candidates</h2>
        <p className="gov-empty-hint">
          Suspected duplicate profiles will appear here for your review.
        </p>
      </div>
    );
  }

  return (
    <div
      data-ocid="governance.duplicates.panel"
      className="flex flex-col gap-4"
    >
      {mergeResult ? (
        <MergeConflictPanel
          result={mergeResult}
          resolving={resolveConflict.isPending}
          onResolve={(conflictId, canonicalValue) =>
            resolveConflict.mutate({ conflictId, canonicalValue })
          }
          onDismiss={() => setMergeResult(null)}
        />
      ) : null}

      {pairs.map((pair, index) => (
        <DuplicatePairCard
          key={`${pair.candidateA.personId}-${pair.candidateB.personId}`}
          pair={pair}
          index={index}
          merging={merge.isPending}
          dismissing={notDuplicate.isPending}
          onNotDuplicate={() =>
            notDuplicate.mutate({
              personIdA: pair.candidateA.personId,
              personIdB: pair.candidateB.personId,
            })
          }
          onMerge={(canonicalPersonId) => handleMerge(pair, canonicalPersonId)}
        />
      ))}
    </div>
  );
}

interface DuplicatePairCardProps {
  pair: DuplicatePair;
  index: number;
  merging: boolean;
  dismissing: boolean;
  onNotDuplicate: () => void;
  onMerge: (canonicalPersonId: string) => void;
}

function DuplicatePairCard({
  pair,
  index,
  merging,
  dismissing,
  onNotDuplicate,
  onMerge,
}: DuplicatePairCardProps) {
  const position = index + 1;
  const [canonical, setCanonical] = useState<string>(pair.candidateA.personId);
  return (
    <div
      data-ocid={`governance.duplicates.pair.${position}`}
      className="dup-card"
    >
      <div className="dup-compare">
        <CandidateCard candidate={pair.candidateA} />
        <CandidateCard candidate={pair.candidateB} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          Keep as canonical
          <select
            data-ocid={`governance.duplicates.canonical_select.${position}`}
            value={canonical}
            onChange={(e) => setCanonical(e.target.value)}
            className="form-select w-auto"
          >
            <option value={pair.candidateA.personId}>
              {pair.candidateA.name}
            </option>
            <option value={pair.candidateB.personId}>
              {pair.candidateB.name}
            </option>
          </select>
        </label>
      </div>

      <div className="dup-actions">
        <button
          type="button"
          data-ocid={`governance.duplicates.not_duplicate_button.${position}`}
          onClick={onNotDuplicate}
          disabled={dismissing || merging}
          className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {dismissing ? "Dismissing…" : "Not a duplicate"}
        </button>
        <button
          type="button"
          data-ocid={`governance.duplicates.merge_button.${position}`}
          onClick={() => onMerge(canonical)}
          disabled={merging || dismissing}
          className="merge-resolve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <GitMerge className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {merging ? "Merging…" : "Merge profiles"}
        </button>
      </div>
    </div>
  );
}

function CandidateCard({ candidate }: { candidate: DuplicateCandidate }) {
  return (
    <div data-ocid="governance.duplicates.candidate" className="dup-person">
      <div className="dup-person-head">
        <div className="dup-person-portrait" aria-hidden="true">
          {candidate.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0">
          <h3 className="dup-person-name">{candidate.name}</h3>
          <p className="dup-person-years">{yearsRange(candidate)}</p>
        </div>
      </div>
      <div className="dup-person-facts">
        <FactRow label="Claim" value={candidate.claimStatus} />
        <FactRow
          label="Owner"
          value={
            candidate.ownerAccount
              ? formatPrincipal(candidate.ownerAccount)
              : "Unclaimed"
          }
        />
        <FactRow label="Parents" value={listOrNone(candidate.parents)} />
        <FactRow label="Spouses" value={listOrNone(candidate.spouses)} />
        <FactRow label="Children" value={listOrNone(candidate.children)} />
        <FactRow label="Photos" value={candidate.photoCount.toString()} />
        <FactRow label="Timeline" value={candidate.timelineCount.toString()} />
        <FactRow label="Sources" value={candidate.sourceCount.toString()} />
        {candidate.archiveLinks.length > 0 ? (
          <FactRow
            label="Archive"
            value={`${candidate.archiveLinks.length} link(s)`}
          />
        ) : null}
      </div>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </span>
      <span className="text-right font-medium text-foreground">{value}</span>
    </div>
  );
}

function listOrNone(items: string[]): string {
  return items.length > 0 ? items.join(", ") : "—";
}

interface MergeConflictPanelProps {
  result: MergeResult;
  resolving: boolean;
  onResolve: (conflictId: bigint, canonicalValue: string) => void;
  onDismiss: () => void;
}

function MergeConflictPanel({
  result,
  resolving,
  onResolve,
  onDismiss,
}: MergeConflictPanelProps) {
  const pending = result.conflicts.filter((c) => c.status === "Pending");
  return (
    <div
      data-ocid="governance.duplicates.conflict_panel"
      className="merge-item"
    >
      <div className="merge-item-head">
        <div>
          <h3 className="merge-item-title">
            Merge complete — review conflicts
          </h3>
          <p className="merge-item-meta">
            Profiles merged into a canonical record. {pending.length} field
            conflict(s) need your decision.
          </p>
        </div>
        <button
          type="button"
          data-ocid="governance.duplicates.conflict_dismiss_button"
          onClick={onDismiss}
          className="steward-reject"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          Dismiss
        </button>
      </div>
      {pending.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No conflicts to resolve — the merge is complete.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {pending.map((conflict) => (
            <ConflictRow
              key={conflict.id.toString()}
              conflict={conflict}
              resolving={resolving}
              onResolve={onResolve}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ConflictRowProps {
  conflict: MergeConflict;
  resolving: boolean;
  onResolve: (conflictId: bigint, canonicalValue: string) => void;
}

function ConflictRow({ conflict, resolving, onResolve }: ConflictRowProps) {
  return (
    <div
      data-ocid="governance.duplicates.conflict_item"
      className="merge-conflict"
    >
      <span className="merge-field-label">{conflict.field}</span>
      <div className="merge-values">
        <div className="merge-value">
          <span className="merge-value-owner">Canonical</span>
          <span className="merge-value-text">{conflict.canonicalValue}</span>
        </div>
        <div className="merge-value">
          <span className="merge-value-owner">Alternate</span>
          <span className="merge-value-text">{conflict.alternateValue}</span>
        </div>
      </div>
      <div className="merge-actions">
        <button
          type="button"
          data-ocid="governance.duplicates.resolve_canonical_button"
          onClick={() => onResolve(conflict.id, conflict.canonicalValue)}
          disabled={resolving}
          className="merge-resolve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          Keep canonical
        </button>
        <button
          type="button"
          data-ocid="governance.duplicates.resolve_alternate_button"
          onClick={() => onResolve(conflict.id, conflict.alternateValue)}
          disabled={resolving}
          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          Use alternate
        </button>
      </div>
      <span className="text-[11px] font-medium text-muted-foreground">
        {MERGE_CONFLICT_STATUS_LABELS[conflict.status]}
      </span>
    </div>
  );
}

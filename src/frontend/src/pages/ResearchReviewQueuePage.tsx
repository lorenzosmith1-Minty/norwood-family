import {
  ArrowRight,
  Check,
  ClipboardList,
  FileText,
  GitMerge,
  Inbox,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
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
  useApproveFinding,
  useApproveNewPersonCandidate,
  useApproveRelationshipProposal,
  useApproveSource,
  useGetResearchAuditLog,
  useGetReviewQueue,
  useListConflictReviewItems,
  useListFindings,
  useListNewPersonCandidates,
  useListRelationshipProposals,
  useListSources,
  useNeedsResearchFinding,
  useNeedsResearchNewPersonCandidate,
  useNeedsResearchRelationshipProposal,
  useNeedsResearchSource,
  useRejectFinding,
  useRejectNewPersonCandidate,
  useRejectRelationshipProposal,
  useRejectSource,
  useResolveConflict,
} from "../hooks/useResearchIntake";
import { resolveDisplayName } from "../types/family";
import {
  CONFLICT_ACTION_LABELS,
  EVIDENCE_LABEL_LABELS,
  FINDING_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  ReviewStatus,
  SOURCE_TYPE_LABELS,
} from "../types/research-intake";
import { ConflictResolutionAction } from "../types/research-intake";
import type {
  ConflictReviewItem,
  FindingContent,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
  Result_3,
  SourceRecord,
} from "../types/research-intake";
import { profiles } from "./PersonProfilePage";

interface ResearchReviewQueuePageProps {
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

/** Resolves a person's display name from the shared profiles record. */
function personName(personId: string): string {
  return resolveDisplayName(personId, profiles);
}

/** The canonical surface an approved finding is routed to, by finding type. */
function findingRoutingLabel(
  findingType: ProposedFinding["findingType"],
): string {
  switch (findingType) {
    case "PersonFact":
      return "Profile";
    case "Relationship":
      return "Family graph";
    case "TimelineEvent":
      return "Timeline";
    case "Story":
      return "Family Stories";
    case "Mystery":
      return "Family Mysteries";
    case "Source":
      return "Profile Sources / Archive";
    default:
      return "Family archive";
  }
}

/** A short human summary of a proposed finding's content. */
function findingContentSummary(content: FindingContent): string {
  switch (content.__kind__) {
    case "PersonFact":
      return `${content.PersonFact.field}: ${content.PersonFact.value}`;
    case "Relationship":
      return `${personName(content.Relationship.fromPersonId)} → ${personName(
        content.Relationship.toPersonId,
      )} (${content.Relationship.relationshipType})`;
    case "TimelineEvent":
      return content.TimelineEvent.description;
    case "Story":
      return content.Story.storyText;
    case "Mystery":
      return content.Mystery.description;
    case "Source":
      return content.Source.description;
  }
}

/** A compact source chip linking a review item to its provenance source. */
function SourceChip({
  sourceId,
  sources,
}: {
  sourceId: bigint;
  sources: Map<bigint, SourceRecord>;
}) {
  const source = sources.get(sourceId);
  if (!source) {
    return (
      <span className="research-finding-meta">
        Source #{sourceId.toString()}
      </span>
    );
  }
  return (
    <span className="research-finding-meta">
      <span className="research-actor">
        {SOURCE_TYPE_LABELS[source.sourceType]}
      </span>
      <span aria-hidden="true">·</span>
      <span className="truncate">{source.title}</span>
    </span>
  );
}

/** A review-status pill for a research item. */
function ReviewStatusPill({ status }: { status: ReviewStatus }) {
  const tone =
    status === ReviewStatus.Approved
      ? "status-approved"
      : status === ReviewStatus.Rejected
        ? "status-rejected"
        : status === ReviewStatus.NeedsResearch
          ? "status-needs"
          : "status-pending";
  return (
    <span className={`status-pill ${tone}`}>
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}

interface FindingCardProps {
  finding: ProposedFinding;
  index: number;
  sources: Map<bigint, SourceRecord>;
  approving: boolean;
  rejecting: boolean;
  needsResearch: boolean;
  onApprove: () => void;
  onReject: () => void;
  onNeedsResearch: () => void;
}

function FindingCard({
  finding,
  index,
  sources,
  approving,
  rejecting,
  needsResearch,
  onApprove,
  onReject,
  onNeedsResearch,
}: FindingCardProps) {
  const reviewable =
    finding.status === ReviewStatus.Pending ||
    finding.status === ReviewStatus.Conflicting ||
    finding.status === ReviewStatus.NeedsResearch;
  return (
    <li
      data-ocid={`research_queue.finding.${index}`}
      className="research-finding-card"
    >
      <div className="research-finding-head">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="research-finding-title">{finding.title}</span>
          <div className="research-finding-meta">
            <span className="research-evidence research-evidence-finding">
              {EVIDENCE_LABEL_LABELS[finding.evidenceLabel]}
            </span>
            <span className="research-evidence">
              {FINDING_TYPE_LABELS[finding.findingType]}
            </span>
            <ReviewStatusPill status={finding.status} />
          </div>
        </div>
        {reviewable ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-ocid={`research_queue.finding.${index}.approve_button`}
              onClick={onApprove}
              disabled={approving || rejecting || needsResearch}
              className="approve-action"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              data-ocid={`research_queue.finding.${index}.reject_button`}
              onClick={onReject}
              disabled={approving || rejecting || needsResearch}
              className="reject-action"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </button>
            <button
              type="button"
              data-ocid={`research_queue.finding.${index}.needs_research_button`}
              onClick={onNeedsResearch}
              disabled={approving || rejecting || needsResearch}
              className="research-needs-action"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Needs Research
            </button>
          </div>
        ) : finding.status === ReviewStatus.Approved ? (
          <span className="research-finding-meta">
            Routed to{" "}
            <span className="research-actor">
              {findingRoutingLabel(finding.findingType)}
            </span>
          </span>
        ) : null}
      </div>
      <p className="research-finding-detail">
        {findingContentSummary(finding.content)}
      </p>
      <div className="research-finding-meta">
        <SourceChip sourceId={finding.sourceId} sources={sources} />
        <span aria-hidden="true">·</span>
        <span>
          Submitted by{" "}
          <span className="research-actor">
            {formatPrincipal(finding.submittedBy)}
          </span>{" "}
          on {formatDateTime(finding.submittedAt)}
        </span>
      </div>
    </li>
  );
}

interface CandidateCardProps {
  candidate: NewPersonCandidate;
  index: number;
  sources: Map<bigint, SourceRecord>;
  approving: boolean;
  rejecting: boolean;
  needsResearch: boolean;
  onApprove: () => void;
  onReject: () => void;
  onNeedsResearch: () => void;
}

function CandidateCard({
  candidate,
  index,
  sources,
  approving,
  rejecting,
  needsResearch,
  onApprove,
  onReject,
  onNeedsResearch,
}: CandidateCardProps) {
  const reviewable =
    candidate.status === ReviewStatus.Pending ||
    candidate.status === ReviewStatus.NeedsResearch;
  return (
    <li
      data-ocid={`research_queue.candidate.${index}`}
      className="research-match-row"
    >
      <span className="research-match-portrait" aria-hidden="true">
        {candidate.name.charAt(0).toUpperCase()}
      </span>
      <div className="research-match-body">
        <span className="research-match-name">{candidate.name}</span>
        <span className="research-match-meta">{candidate.details}</span>
        <div className="research-finding-meta">
          <span className="research-evidence research-evidence-candidate">
            New person candidate
          </span>
          <ReviewStatusPill status={candidate.status} />
        </div>
      </div>
      <div className="research-match-actions">
        <SourceChip sourceId={candidate.sourceId} sources={sources} />
        <span className="research-match-meta">
          {formatDateTime(candidate.submittedAt)}
        </span>
        {reviewable ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-ocid={`research_queue.candidate.${index}.approve_button`}
              onClick={onApprove}
              disabled={approving || rejecting || needsResearch}
              className="approve-action"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              data-ocid={`research_queue.candidate.${index}.reject_button`}
              onClick={onReject}
              disabled={approving || rejecting || needsResearch}
              className="reject-action"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </button>
            <button
              type="button"
              data-ocid={`research_queue.candidate.${index}.needs_research_button`}
              onClick={onNeedsResearch}
              disabled={approving || rejecting || needsResearch}
              className="research-needs-action"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Needs Research
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

interface RelationshipCardProps {
  proposal: RelationshipProposal;
  index: number;
  sources: Map<bigint, SourceRecord>;
  approving: boolean;
  rejecting: boolean;
  needsResearch: boolean;
  onApprove: () => void;
  onReject: () => void;
  onNeedsResearch: () => void;
}

function RelationshipCard({
  proposal,
  index,
  sources,
  approving,
  rejecting,
  needsResearch,
  onApprove,
  onReject,
  onNeedsResearch,
}: RelationshipCardProps) {
  const reviewable =
    proposal.status === ReviewStatus.Pending ||
    proposal.status === ReviewStatus.NeedsResearch;
  return (
    <li
      data-ocid={`research_queue.relationship.${index}`}
      className="research-match-row"
    >
      <div className="research-match-body">
        <span className="research-match-name">
          {personName(proposal.fromPersonId)} →{" "}
          {personName(proposal.toPersonId)}
        </span>
        <span className="research-match-meta">{proposal.relationshipType}</span>
        <div className="research-finding-meta">
          <span className="research-evidence research-evidence-relationship">
            Relationship proposal
          </span>
          <ReviewStatusPill status={proposal.status} />
        </div>
      </div>
      <div className="research-match-actions">
        <SourceChip sourceId={proposal.sourceId} sources={sources} />
        <span className="research-match-meta">
          {formatDateTime(proposal.submittedAt)}
        </span>
        {reviewable ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-ocid={`research_queue.relationship.${index}.approve_button`}
              onClick={onApprove}
              disabled={approving || rejecting || needsResearch}
              className="approve-action"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              data-ocid={`research_queue.relationship.${index}.reject_button`}
              onClick={onReject}
              disabled={approving || rejecting || needsResearch}
              className="reject-action"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </button>
            <button
              type="button"
              data-ocid={`research_queue.relationship.${index}.needs_research_button`}
              onClick={onNeedsResearch}
              disabled={approving || rejecting || needsResearch}
              className="research-needs-action"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Needs Research
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

interface SourceCardProps {
  source: SourceRecord;
  index: number;
  approving: boolean;
  rejecting: boolean;
  needsResearch: boolean;
  onApprove: () => void;
  onReject: () => void;
  onNeedsResearch: () => void;
}

function SourceCard({
  source,
  index,
  approving,
  rejecting,
  needsResearch,
  onApprove,
  onReject,
  onNeedsResearch,
}: SourceCardProps) {
  const reviewable =
    source.status === ReviewStatus.Pending ||
    source.status === ReviewStatus.NeedsResearch;
  return (
    <li
      data-ocid={`research_queue.source.${index}`}
      className="research-finding-card"
    >
      <div className="research-finding-head">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="research-finding-title">{source.title}</span>
          <div className="research-finding-meta">
            <span className="research-evidence research-evidence-finding">
              {SOURCE_TYPE_LABELS[source.sourceType]}
            </span>
            <ReviewStatusPill status={source.status} />
          </div>
        </div>
        {reviewable ? (
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-ocid={`research_queue.source.${index}.approve_button`}
              onClick={onApprove}
              disabled={approving || rejecting || needsResearch}
              className="approve-action"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              data-ocid={`research_queue.source.${index}.reject_button`}
              onClick={onReject}
              disabled={approving || rejecting || needsResearch}
              className="reject-action"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
            </button>
            <button
              type="button"
              data-ocid={`research_queue.source.${index}.needs_research_button`}
              onClick={onNeedsResearch}
              disabled={approving || rejecting || needsResearch}
              className="research-needs-action"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              Needs Research
            </button>
          </div>
        ) : null}
      </div>
      <p className="research-finding-detail">{source.description}</p>
      <div className="research-finding-meta">
        <span className="research-actor">
          {SOURCE_TYPE_LABELS[source.sourceType]}
        </span>
        <span aria-hidden="true">·</span>
        <span>
          Submitted by{" "}
          <span className="research-actor">
            {formatPrincipal(source.contributor)}
          </span>{" "}
          on {formatDateTime(source.createdAt)}
        </span>
      </div>
    </li>
  );
}

function AuditEntryRow({
  entry,
  index,
}: {
  entry: ResearchAuditEntry;
  index: number;
}) {
  return (
    <li
      data-ocid={`research_queue.audit.${index}`}
      className="research-audit-entry"
    >
      <div className="research-audit-body">
        <span className="research-audit-action">{entry.action}</span>
        <span className="research-audit-detail">{entry.summary}</span>
        <span className="research-audit-meta">
          <span className="research-actor">
            {formatPrincipal(entry.actorId)}
          </span>
          <span aria-hidden="true"> · </span>
          {formatDateTime(entry.timestamp)}
        </span>
      </div>
    </li>
  );
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

/** Maps a backend ResearchError to a clear, user-facing message. */
function researchErrorMessage(error: {
  __kind__: string;
  invalidState?: string;
}): string {
  switch (error.__kind__) {
    case "invalidState":
      return error.invalidState ?? "The conflict is in an invalid state.";
    case "notAuthorized":
      return "You are not authorized to resolve this conflict.";
    case "notFound":
      return "This conflict no longer exists. It may have been resolved already.";
    default:
      return "Could not resolve this conflict.";
  }
}

/**
 * A single conflict review card rendered inside the Review Queue. A proposed
 * finding contradicts existing canonical family data, so the EXISTING value
 * (canonical) and the PROPOSED value sit side by side and the steward picks one
 * of four explicit resolution actions. Items marked Needs Research are shown
 * here too, so they stay visible and actionable in the queue itself.
 */
function ConflictCard({ item }: { item: ConflictReviewItem }) {
  const resolve = useResolveConflict();
  const [openAction, setOpenAction] = useState<ConflictResolutionAction | null>(
    null,
  );
  const [notes, setNotes] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  const isResolved = item.status === "Approved" || item.status === "Rejected";

  const confirmResolve = (action: ConflictResolutionAction) => {
    setResolveError(null);
    resolve.mutate(
      { conflictId: item.id, action, notes },
      {
        onSuccess: (result: Result_3) => {
          if (result.__kind__ === "err") {
            setResolveError(researchErrorMessage(result.err));
            return;
          }
          setOpenAction(null);
          setNotes("");
        },
      },
    );
  };

  return (
    <li
      data-ocid={`research_queue.conflict.${item.id}`}
      className="research-conflict-card"
    >
      <div className="research-conflict-head">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="research-conflict-title">{item.field}</span>
          <div className="research-finding-meta">
            <span className="research-evidence research-evidence-conflict">
              Conflict
            </span>
            <ReviewStatusPill status={item.status} />
          </div>
        </div>
        {isResolved ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-card px-3.5 py-1.5 text-xs font-semibold text-muted-foreground">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            {REVIEW_STATUS_LABELS[item.status]}
          </span>
        ) : null}
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
          </div>
          <div className="research-conflict-value">
            <span className="research-conflict-owner">Proposed</span>
            <span className="research-conflict-text">{item.proposedValue}</span>
          </div>
        </div>
      </div>

      <div className="research-conflict-actions">
        {isResolved ? (
          <span className="research-finding-meta">
            {item.resolvedAt
              ? `Resolved ${formatDateTime(item.resolvedAt)}`
              : "Resolved"}
            {item.resolvedBy ? ` · by ${formatPrincipal(item.resolvedBy)}` : ""}
          </span>
        ) : (
          RESOLUTION_ACTIONS.map((action) => (
            <AlertDialog
              key={action}
              open={openAction === action}
              onOpenChange={(open) => {
                setOpenAction(open ? action : null);
                if (!open) {
                  setNotes("");
                  setResolveError(null);
                }
              }}
            >
              <AlertDialogTrigger asChild>
                <button
                  type="button"
                  data-ocid={`research_queue.conflict.${item.id}.action_button.${action}`}
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
                  data-ocid={`research_queue.conflict.${item.id}.notes_input.${action}`}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  placeholder="Why did you choose this resolution?"
                  className="w-full resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                />
                {resolveError && (
                  <div
                    data-ocid={`research_queue.conflict.${item.id}.dialog_error.${action}`}
                    className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
                  >
                    <ShieldCheck
                      className="mt-0.5 h-4 w-4 shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      {resolveError} The conflict was left unresolved and no
                      canonical data was changed.
                    </span>
                  </div>
                )}
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    data-ocid={`research_queue.conflict.${item.id}.confirm_button.${action}`}
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
        {resolveError && (
          <p
            data-ocid={`research_queue.conflict.${item.id}.resolve_error`}
            className="text-xs font-medium text-destructive"
          >
            {resolveError}
          </p>
        )}
      </div>
    </li>
  );
}

type QueueTab =
  | "sources"
  | "findings"
  | "candidates"
  | "relationships"
  | "conflicts"
  | "audit";

/** A status filter applied to the current entity tab's items. */
type StatusFilter = "All" | ReviewStatus;

export function ResearchReviewQueuePage({
  onBack,
}: ResearchReviewQueuePageProps) {
  const { data: isAdmin = false, isLoading: adminLoading } = useIsAdmin();
  const { data: reviewQueue } = useGetReviewQueue();
  const { data: findings = [], isLoading: findingsLoading } = useListFindings();
  const { data: candidates = [], isLoading: candidatesLoading } =
    useListNewPersonCandidates();
  const { data: proposals = [], isLoading: proposalsLoading } =
    useListRelationshipProposals();
  const { data: audit = [] } = useGetResearchAuditLog();
  const { data: sources = [] } = useListSources();
  const { data: conflicts = [], isLoading: conflictsLoading } =
    useListConflictReviewItems();

  const approveFinding = useApproveFinding();
  const rejectFinding = useRejectFinding();
  const needsResearchFinding = useNeedsResearchFinding();
  const approveSource = useApproveSource();
  const rejectSource = useRejectSource();
  const needsResearchSource = useNeedsResearchSource();
  const approveCandidate = useApproveNewPersonCandidate();
  const rejectCandidate = useRejectNewPersonCandidate();
  const needsResearchCandidate = useNeedsResearchNewPersonCandidate();
  const approveProposal = useApproveRelationshipProposal();
  const rejectProposal = useRejectRelationshipProposal();
  const needsResearchProposal = useNeedsResearchRelationshipProposal();

  const [tab, setTab] = useState<QueueTab>("findings");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("All");

  const sourceById = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );

  /** Applies the active status filter to a list of review items. */
  const byStatus = useCallback(
    <T extends { status: ReviewStatus }>(items: T[]): T[] =>
      statusFilter === "All"
        ? items
        : items.filter((item) => item.status === statusFilter),
    [statusFilter],
  );

  const filteredFindings = useMemo(
    () => byStatus(findings),
    [findings, byStatus],
  );
  const filteredCandidates = useMemo(
    () => byStatus(candidates),
    [candidates, byStatus],
  );
  const filteredProposals = useMemo(
    () => byStatus(proposals),
    [proposals, byStatus],
  );
  const filteredSources = useMemo(() => byStatus(sources), [sources, byStatus]);
  const filteredConflicts = useMemo(
    () => byStatus(conflicts),
    [conflicts, byStatus],
  );

  const pendingCount = reviewQueue ? Number(reviewQueue.pending) : 0;
  const approvedCount = reviewQueue ? Number(reviewQueue.approved) : 0;
  const conflictingCount = reviewQueue ? Number(reviewQueue.conflicting) : 0;
  const needsResearchCount = reviewQueue
    ? Number(reviewQueue.needsResearch)
    : 0;

  const isLoading =
    adminLoading ||
    findingsLoading ||
    candidatesLoading ||
    proposalsLoading ||
    conflictsLoading;

  if (!adminLoading && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <button
          type="button"
          data-ocid="research_queue.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
          Back to Research Intake
        </button>
        <div
          data-ocid="research_queue.unauthorized_state"
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
            The research review queue is reserved for authorized Family Stewards
            who confirm proposed findings and route them into the family
            archive.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { id: QueueTab; label: string; count: number }[] = [
    { id: "sources", label: "Sources", count: sources.length },
    { id: "findings", label: "Findings", count: findings.length },
    { id: "candidates", label: "Candidates", count: candidates.length },
    { id: "relationships", label: "Relationships", count: proposals.length },
    { id: "conflicts", label: "Conflicts", count: conflicts.length },
    { id: "audit", label: "Audit", count: audit.length },
  ];

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <button
        type="button"
        data-ocid="research_queue.back_button"
        onClick={onBack}
        className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <ArrowRight className="h-4 w-4 rotate-180" aria-hidden="true" />
        Back to Research Intake
      </button>

      <header className="mb-6">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-border/60 bg-card px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          <ScrollText
            className="h-3.5 w-3.5 text-muted-foreground"
            aria-hidden="true"
          />
          Research Intake
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground">
          Review Queue
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Proposed findings, new person candidates, and relationship proposals
          await your review. Approving a finding routes it to its canonical
          place in the family archive; every action is recorded with full
          provenance.
        </p>
      </header>

      {/* Badge summary row */}
      <div
        data-ocid="research_queue.badges"
        className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <div className="research-section">
          <span className="research-section-title">Pending</span>
          <span className="research-queue-badge">{pendingCount}</span>
        </div>
        <div className="research-section">
          <span className="research-section-title">Needs Research</span>
          <span className="research-queue-badge">{needsResearchCount}</span>
        </div>
        <div className="research-section">
          <span className="research-section-title">Conflicting</span>
          <span className="research-queue-badge">{conflictingCount}</span>
        </div>
        <div className="research-section">
          <span className="research-section-title">Approved</span>
          <span className="research-queue-badge">{approvedCount}</span>
        </div>
      </div>

      {/* Status filter row */}
      <div
        data-ocid="research_queue.status_filters"
        className="mb-5 flex flex-wrap items-center gap-2"
      >
        <span className="mr-1 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Status
        </span>
        {(
          [
            { id: "All" as StatusFilter, label: "All" },
            { id: ReviewStatus.Pending, label: "Pending" },
            { id: ReviewStatus.NeedsResearch, label: "Needs Research" },
            { id: ReviewStatus.Conflicting, label: "Conflicting" },
            { id: ReviewStatus.Approved, label: "Resolved / Approved" },
          ] as { id: StatusFilter; label: string }[]
        ).map((f) => (
          <button
            key={f.id}
            type="button"
            data-ocid={`research_queue.status_filter.${f.id}`}
            onClick={() => setStatusFilter(f.id)}
            className={`research-tab ${statusFilter === f.id ? "research-tab-active" : ""}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div data-ocid="research_queue.tabs" className="research-tabs mb-5">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            data-ocid={`research_queue.tab.${t.id}`}
            onClick={() => setTab(t.id)}
            className={`research-tab ${tab === t.id ? "research-tab-active" : ""}`}
          >
            {t.label}
            <span className="research-tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {isLoading ? (
        <div
          data-ocid="research_queue.loading_state"
          className="space-y-4"
          aria-label="Loading review queue"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={`skeleton-${i}`}
              className="animate-pulse rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
              <div className="mb-2 h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <div data-ocid="research_queue.panel" className="research-panel">
          {tab === "sources" && (
            <section
              data-ocid="research_queue.sources_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  Sources ({filteredSources.length})
                </span>
              </div>
              {filteredSources.length === 0 ? (
                <div
                  data-ocid="research_queue.sources_empty"
                  className="research-empty"
                >
                  <FileText
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">
                    No sources in this view
                  </p>
                  <p className="research-empty-hint">
                    Sources recorded in Research Intake will appear here for
                    your review, approval, or further research. Adjust the
                    status filter to see other states.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {filteredSources.map((source, index) => (
                    <SourceCard
                      key={source.id.toString()}
                      source={source}
                      index={index}
                      approving={approveSource.isPending}
                      rejecting={rejectSource.isPending}
                      needsResearch={needsResearchSource.isPending}
                      onApprove={() => approveSource.mutate(source.id)}
                      onReject={() => rejectSource.mutate(source.id)}
                      onNeedsResearch={() =>
                        needsResearchSource.mutate(source.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "findings" && (
            <section
              data-ocid="research_queue.findings_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  Proposed Findings ({filteredFindings.length})
                </span>
              </div>
              {filteredFindings.length === 0 ? (
                <div
                  data-ocid="research_queue.findings_empty"
                  className="research-empty"
                >
                  <ClipboardList
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">
                    No findings in this view
                  </p>
                  <p className="research-empty-hint">
                    Findings recorded in Research Intake will appear here for
                    your review and approval. Adjust the status filter to see
                    other states.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {filteredFindings.map((finding, index) => (
                    <FindingCard
                      key={finding.id.toString()}
                      finding={finding}
                      index={index}
                      sources={sourceById}
                      approving={approveFinding.isPending}
                      rejecting={rejectFinding.isPending}
                      needsResearch={needsResearchFinding.isPending}
                      onApprove={() => approveFinding.mutate(finding.id)}
                      onReject={() => rejectFinding.mutate(finding.id)}
                      onNeedsResearch={() =>
                        needsResearchFinding.mutate(finding.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "candidates" && (
            <section
              data-ocid="research_queue.candidates_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  New Person Candidates ({filteredCandidates.length})
                </span>
              </div>
              {filteredCandidates.length === 0 ? (
                <div
                  data-ocid="research_queue.candidates_empty"
                  className="research-empty"
                >
                  <Inbox
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">
                    No candidates in this view
                  </p>
                  <p className="research-empty-hint">
                    New person candidates proposed from research sources will
                    appear here. Adjust the status filter to see other states.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {filteredCandidates.map((candidate, index) => (
                    <CandidateCard
                      key={candidate.id.toString()}
                      candidate={candidate}
                      index={index}
                      sources={sourceById}
                      approving={approveCandidate.isPending}
                      rejecting={rejectCandidate.isPending}
                      needsResearch={needsResearchCandidate.isPending}
                      onApprove={() => approveCandidate.mutate(candidate.id)}
                      onReject={() => rejectCandidate.mutate(candidate.id)}
                      onNeedsResearch={() =>
                        needsResearchCandidate.mutate(candidate.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "relationships" && (
            <section
              data-ocid="research_queue.relationships_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  Relationship Proposals ({filteredProposals.length})
                </span>
              </div>
              {filteredProposals.length === 0 ? (
                <div
                  data-ocid="research_queue.relationships_empty"
                  className="research-empty"
                >
                  <Inbox
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">
                    No proposals in this view
                  </p>
                  <p className="research-empty-hint">
                    Proposed family connections from research sources will
                    appear here. Adjust the status filter to see other states.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {filteredProposals.map((proposal, index) => (
                    <RelationshipCard
                      key={proposal.id.toString()}
                      proposal={proposal}
                      index={index}
                      sources={sourceById}
                      approving={approveProposal.isPending}
                      rejecting={rejectProposal.isPending}
                      needsResearch={needsResearchProposal.isPending}
                      onApprove={() => approveProposal.mutate(proposal.id)}
                      onReject={() => rejectProposal.mutate(proposal.id)}
                      onNeedsResearch={() =>
                        needsResearchProposal.mutate(proposal.id)
                      }
                    />
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "conflicts" && (
            <section
              data-ocid="research_queue.conflicts_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  Conflicts ({filteredConflicts.length})
                </span>
              </div>
              <p className="research-section-hint">
                A proposed finding below contradicts existing canonical family
                data. Compare the existing and proposed values, then choose one
                of the four resolution actions to record the steward's decision.
                Items marked Needs Research stay here so they remain visible and
                actionable.
              </p>
              {filteredConflicts.length === 0 ? (
                <div
                  data-ocid="research_queue.conflicts_empty"
                  className="research-empty"
                >
                  <Scale
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">
                    No conflicts in this view
                  </p>
                  <p className="research-empty-hint">
                    When a proposed finding contradicts existing canonical
                    family data, it will appear here for a steward to resolve.
                    Adjust the status filter to see other states.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {filteredConflicts.map((item) => (
                    <ConflictCard key={item.id.toString()} item={item} />
                  ))}
                </ul>
              )}
            </section>
          )}

          {tab === "audit" && (
            <section
              data-ocid="research_queue.audit_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  Audit History ({audit.length})
                </span>
              </div>
              <p className="research-section-hint">
                Every proposed item and approval action is recorded with its
                actor and timestamp. Approved findings are routed to their
                canonical area — Person facts to the Profile, Relationships to
                the family graph, Timeline events to the Timeline, Stories to
                Family Stories, Mysteries to Family Mysteries, and Sources to
                Profile Sources / Archive.
              </p>
              {audit.length === 0 ? (
                <div
                  data-ocid="research_queue.audit_empty"
                  className="research-empty"
                >
                  <ScrollText
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">No audit history yet</p>
                  <p className="research-empty-hint">
                    Actions taken in Research Intake will be recorded here with
                    full provenance.
                  </p>
                </div>
              ) : (
                <ul className="research-audit">
                  {audit.map((entry, index) => (
                    <AuditEntryRow
                      key={entry.id.toString()}
                      entry={entry}
                      index={index}
                    />
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </div>
  );
}

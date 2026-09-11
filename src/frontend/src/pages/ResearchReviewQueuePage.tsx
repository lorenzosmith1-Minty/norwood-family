import {
  ArrowRight,
  Check,
  ClipboardList,
  Inbox,
  ScrollText,
  ShieldCheck,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import {
  useApproveFinding,
  useGetResearchAuditLog,
  useGetReviewQueue,
  useListFindings,
  useListNewPersonCandidates,
  useListRelationshipProposals,
  useListSources,
  useRejectFinding,
} from "../hooks/useResearchIntake";
import { resolveDisplayName } from "../types/family";
import {
  EVIDENCE_LABEL_LABELS,
  FINDING_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
  ReviewStatus,
  SOURCE_TYPE_LABELS,
} from "../types/research-intake";
import type {
  FindingContent,
  NewPersonCandidate,
  ProposedFinding,
  RelationshipProposal,
  ResearchAuditEntry,
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
        : status === ReviewStatus.Conflicting
          ? "status-pending"
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
  onApprove: () => void;
  onReject: () => void;
}

function FindingCard({
  finding,
  index,
  sources,
  approving,
  rejecting,
  onApprove,
  onReject,
}: FindingCardProps) {
  const reviewable =
    finding.status === ReviewStatus.Pending ||
    finding.status === ReviewStatus.Conflicting;
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
              disabled={approving || rejecting}
              className="approve-action"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Approve
            </button>
            <button
              type="button"
              data-ocid={`research_queue.finding.${index}.reject_button`}
              onClick={onReject}
              disabled={approving || rejecting}
              className="reject-action"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Reject
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
}

function CandidateCard({ candidate, index, sources }: CandidateCardProps) {
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
      </div>
    </li>
  );
}

interface RelationshipCardProps {
  proposal: RelationshipProposal;
  index: number;
  sources: Map<bigint, SourceRecord>;
}

function RelationshipCard({ proposal, index, sources }: RelationshipCardProps) {
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

type QueueTab = "findings" | "candidates" | "relationships" | "audit";

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

  const approveFinding = useApproveFinding();
  const rejectFinding = useRejectFinding();

  const [tab, setTab] = useState<QueueTab>("findings");

  const sourceById = useMemo(
    () => new Map(sources.map((s) => [s.id, s])),
    [sources],
  );

  const pendingCount = reviewQueue ? Number(reviewQueue.pending) : 0;
  const approvedCount = reviewQueue ? Number(reviewQueue.approved) : 0;
  const conflictingCount = reviewQueue ? Number(reviewQueue.conflicting) : 0;

  const isLoading =
    adminLoading || findingsLoading || candidatesLoading || proposalsLoading;

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
    { id: "findings", label: "Findings", count: findings.length },
    { id: "candidates", label: "Candidates", count: candidates.length },
    { id: "relationships", label: "Relationships", count: proposals.length },
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
        className="mb-6 grid grid-cols-3 gap-3"
      >
        <div className="research-section">
          <span className="research-section-title">Pending</span>
          <span className="research-queue-badge">{pendingCount}</span>
        </div>
        <div className="research-section">
          <span className="research-section-title">Approved</span>
          <span className="research-queue-badge">{approvedCount}</span>
        </div>
        <div className="research-section">
          <span className="research-section-title">Conflicting</span>
          <span className="research-queue-badge">{conflictingCount}</span>
        </div>
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
          {tab === "findings" && (
            <section
              data-ocid="research_queue.findings_section"
              className="research-section"
            >
              <div className="research-section-head">
                <span className="research-section-title">
                  Proposed Findings ({findings.length})
                </span>
              </div>
              {findings.length === 0 ? (
                <div
                  data-ocid="research_queue.findings_empty"
                  className="research-empty"
                >
                  <ClipboardList
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">No proposed findings</p>
                  <p className="research-empty-hint">
                    Findings recorded in Research Intake will appear here for
                    your review and approval.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {findings.map((finding, index) => (
                    <FindingCard
                      key={finding.id.toString()}
                      finding={finding}
                      index={index}
                      sources={sourceById}
                      approving={approveFinding.isPending}
                      rejecting={rejectFinding.isPending}
                      onApprove={() => approveFinding.mutate(finding.id)}
                      onReject={() => rejectFinding.mutate(finding.id)}
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
                  New Person Candidates ({candidates.length})
                </span>
              </div>
              {candidates.length === 0 ? (
                <div
                  data-ocid="research_queue.candidates_empty"
                  className="research-empty"
                >
                  <Inbox
                    className="h-8 w-8 text-muted-foreground"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                  <p className="research-empty-title">No person candidates</p>
                  <p className="research-empty-hint">
                    New person candidates proposed from research sources will
                    appear here.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {candidates.map((candidate, index) => (
                    <CandidateCard
                      key={candidate.id.toString()}
                      candidate={candidate}
                      index={index}
                      sources={sourceById}
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
                  Relationship Proposals ({proposals.length})
                </span>
              </div>
              {proposals.length === 0 ? (
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
                    No relationship proposals
                  </p>
                  <p className="research-empty-hint">
                    Proposed family connections from research sources will
                    appear here.
                  </p>
                </div>
              ) : (
                <ul className="research-queue">
                  {proposals.map((proposal, index) => (
                    <RelationshipCard
                      key={proposal.id.toString()}
                      proposal={proposal}
                      index={index}
                      sources={sourceById}
                    />
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

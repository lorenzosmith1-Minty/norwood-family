import { Check, Inbox, ShieldCheck, Undo2, UserCog, X } from "lucide-react";
import { StatusBadge } from "../components/StatusBadge";
import { useIsAdmin } from "../hooks/useArchiveStorage";
import {
  useApproveProfileClaim,
  useListProfileClaims,
  useRejectProfileClaim,
} from "../hooks/useProfileClaims";
import {
  useApproveRelationshipRequest,
  useListRelationshipRequests,
  useRejectRelationshipRequest,
  useSetRelationshipRequestPending,
} from "../hooks/useRelationshipRequests";
import { resolveDisplayName } from "../types/family";
import type { ProfileClaim, RelationshipRequest } from "../types/ownership";
import { RELATIONSHIP_TYPE_LABELS } from "../types/ownership";
import { profiles } from "./PersonProfilePage";

interface FamilyStewardReviewPageProps {
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

/** Shortens a principal to a readable, copy-safe label. */
function formatPrincipal(principal: { toText(): string }): string {
  const text = principal.toText();
  return text.length > 18 ? `${text.slice(0, 5)}…${text.slice(-4)}` : text;
}

/** Resolves a person's display name from the shared profiles record, the
 *  canonical display-name mapping, or the graph id — so graph-only nodes (e.g.
 *  lorenzoSmithJr) surface the canonical name and never leak their raw id. */
function personName(personId: string): string {
  return resolveDisplayName(personId, profiles);
}

export function FamilyStewardReviewPage({
  onBack,
}: FamilyStewardReviewPageProps) {
  const { data: isAdmin = false, isLoading: adminLoading } = useIsAdmin();
  const { data: claims = [], isLoading: claimsLoading } =
    useListProfileClaims();
  const { data: requests = [], isLoading: requestsLoading } =
    useListRelationshipRequests();

  const approveClaim = useApproveProfileClaim();
  const rejectClaim = useRejectProfileClaim();
  const approveRequest = useApproveRelationshipRequest();
  const rejectRequest = useRejectRelationshipRequest();
  const setPending = useSetRelationshipRequestPending();

  const pendingClaims = claims.filter((c) => c.status === "Pending");
  const pendingRequests = requests.filter((r) => r.status === "Pending");

  const isLoading = adminLoading || claimsLoading || requestsLoading;

  if (!adminLoading && !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <button
          type="button"
          data-ocid="steward_review.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">←</span> Back to Home
        </button>
        <div
          data-ocid="steward_review.unauthorized_state"
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
            confirm profile ownership and family connections.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <button
        type="button"
        data-ocid="steward_review.back_button"
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
          Review Requests
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Confirm who owns each profile and which family connections are real.
          Approving a claim grants ownership; approving a relationship confirms
          it in the shared family graph.
        </p>
      </header>

      {isLoading ? (
        <div
          data-ocid="steward_review.loading_state"
          className="space-y-4"
          aria-label="Loading review requests"
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
      ) : pendingClaims.length === 0 && pendingRequests.length === 0 ? (
        <div
          data-ocid="steward_review.empty_state"
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
            New profile claims and relationship requests from family members
            will appear here for your confirmation.
          </p>
        </div>
      ) : (
        <div data-ocid="steward_review.panel" className="steward-panel">
          <section
            data-ocid="steward_review.claims_section"
            className="steward-section"
          >
            <h2 className="steward-section-title">
              Profile Claims ({pendingClaims.length})
            </h2>
            {pendingClaims.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No profile claims awaiting review.
              </p>
            ) : (
              <ul data-ocid="steward_review.claims_list" className="space-y-3">
                {pendingClaims.map((claim, index) => (
                  <ClaimCard
                    key={claim.id.toString()}
                    claim={claim}
                    index={index}
                    approving={approveClaim.isPending}
                    rejecting={rejectClaim.isPending}
                    onApprove={() => approveClaim.mutate(claim.id)}
                    onReject={() => rejectClaim.mutate(claim.id)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section
            data-ocid="steward_review.requests_section"
            className="steward-section"
          >
            <h2 className="steward-section-title">
              Relationship Requests ({pendingRequests.length})
            </h2>
            {pendingRequests.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No relationship requests awaiting review.
              </p>
            ) : (
              <ul
                data-ocid="steward_review.requests_list"
                className="space-y-3"
              >
                {pendingRequests.map((request, index) => (
                  <RelationshipCard
                    key={request.id.toString()}
                    request={request}
                    index={index}
                    approving={approveRequest.isPending}
                    rejecting={rejectRequest.isPending}
                    pending={setPending.isPending}
                    onApprove={() => approveRequest.mutate(request.id)}
                    onReject={() => rejectRequest.mutate(request.id)}
                    onPending={() => setPending.mutate(request.id)}
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

interface ClaimCardProps {
  claim: ProfileClaim;
  index: number;
  approving: boolean;
  rejecting: boolean;
  onApprove: () => void;
  onReject: () => void;
}

function ClaimCard({
  claim,
  index,
  approving,
  rejecting,
  onApprove,
  onReject,
}: ClaimCardProps) {
  const position = index + 1;
  return (
    <li
      data-ocid={`steward_review.claim_item.${position}`}
      className="review-card"
    >
      <div className="review-card-head">
        <div className="min-w-0">
          <h3 className="review-card-title">{personName(claim.personId)}</h3>
          <p className="review-card-meta">
            Claimed by {formatPrincipal(claim.requestingUserId)} · submitted{" "}
            {formatDate(claim.submittedDate)}
          </p>
        </div>
        <StatusBadge kind="claim" status={claim.status} />
      </div>
      <div className="review-card-actions">
        <button
          type="button"
          data-ocid={`steward_review.claim_approve_button.${position}`}
          onClick={onApprove}
          disabled={approving || rejecting}
          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {approving ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          data-ocid={`steward_review.claim_reject_button.${position}`}
          onClick={onReject}
          disabled={approving || rejecting}
          className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
      </div>
    </li>
  );
}

interface RelationshipCardProps {
  request: RelationshipRequest;
  index: number;
  approving: boolean;
  rejecting: boolean;
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
  onPending: () => void;
}

function RelationshipCard({
  request,
  index,
  approving,
  rejecting,
  pending,
  onApprove,
  onReject,
  onPending,
}: RelationshipCardProps) {
  const position = index + 1;
  const relationLabel =
    RELATIONSHIP_TYPE_LABELS[request.proposedRelationship] ??
    request.proposedRelationship;
  return (
    <li
      data-ocid={`steward_review.request_item.${position}`}
      className="review-card"
    >
      <div className="review-card-head">
        <div className="min-w-0">
          <h3 className="review-card-title">
            {personName(request.requestingPersonId)} →{" "}
            {personName(request.relatedPersonId)}
          </h3>
          <p className="review-card-meta">
            Proposed {relationLabel} · submitted{" "}
            {formatDate(request.submittedDate)}
          </p>
        </div>
        <StatusBadge kind="relationshipRequest" status={request.status} />
      </div>
      <div className="review-card-actions">
        <button
          type="button"
          data-ocid={`steward_review.request_approve_button.${position}`}
          onClick={onApprove}
          disabled={approving || rejecting || pending}
          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {approving ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          data-ocid={`steward_review.request_reject_button.${position}`}
          onClick={onReject}
          disabled={approving || rejecting || pending}
          className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
        <button
          type="button"
          data-ocid={`steward_review.request_pending_button.${position}`}
          onClick={onPending}
          disabled={approving || rejecting || pending}
          className="steward-pending-action disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Undo2 className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {pending ? "Setting…" : "Pending"}
        </button>
      </div>
    </li>
  );
}

import { Check, Inbox, Undo2, X } from "lucide-react";
import {
  useApproveProfileClaim,
  useListProfileClaims,
  useRejectProfileClaim,
} from "../../hooks/useProfileClaims";
import {
  useApproveRelationshipRequest,
  useListRelationshipRequests,
  useRejectRelationshipRequest,
  useSetRelationshipRequestPending,
} from "../../hooks/useRelationshipRequests";
import { profiles } from "../../pages/PersonProfilePage";
import { resolveDisplayName } from "../../types/family";
import type { ProfileClaim, RelationshipRequest } from "../../types/ownership";
import { RELATIONSHIP_TYPE_LABELS } from "../../types/ownership";
import { StatusBadge } from "../StatusBadge";

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

export function ReviewRequestsTab() {
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

  const isLoading = claimsLoading || requestsLoading;

  if (isLoading) {
    return (
      <div
        data-ocid="governance.review.loading_state"
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
    );
  }

  if (pendingClaims.length === 0 && pendingRequests.length === 0) {
    return (
      <div data-ocid="governance.review.empty_state" className="gov-empty">
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Inbox
            className="h-6 w-6 text-muted-foreground"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        </div>
        <h2 className="gov-empty-title">Nothing awaiting review</h2>
        <p className="gov-empty-hint">
          New profile claims and relationship requests from family members will
          appear here for your confirmation.
        </p>
      </div>
    );
  }

  return (
    <div data-ocid="governance.review.panel" className="flex flex-col gap-4">
      <section
        data-ocid="governance.review.claims_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">
            Profile Claims ({pendingClaims.length})
          </h2>
        </div>
        {pendingClaims.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No profile claims awaiting review.
          </p>
        ) : (
          <ul data-ocid="governance.review.claims_list" className="space-y-3">
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
        data-ocid="governance.review.requests_section"
        className="gov-section"
      >
        <div className="gov-section-head">
          <h2 className="gov-section-title">
            Relationship Requests ({pendingRequests.length})
          </h2>
        </div>
        {pendingRequests.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No relationship requests awaiting review.
          </p>
        ) : (
          <ul data-ocid="governance.review.requests_list" className="space-y-3">
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
      data-ocid={`governance.review.claim_item.${position}`}
      className="review-card"
    >
      <div className="review-card-head">
        <div className="min-w-0">
          <h3 className="review-card-title">{personName(claim.personId)}</h3>
          <p className="review-card-meta">
            Claimed by {formatPrincipal(claim.requestingUserId)} · submitted{" "}
            {formatDateTime(claim.submittedDate)}
          </p>
        </div>
        <StatusBadge kind="claim" status={claim.status} />
      </div>
      <div className="review-card-actions">
        <button
          type="button"
          data-ocid={`governance.review.claim_approve_button.${position}`}
          onClick={onApprove}
          disabled={approving || rejecting}
          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {approving ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          data-ocid={`governance.review.claim_reject_button.${position}`}
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
      data-ocid={`governance.review.request_item.${position}`}
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
            {formatDateTime(request.submittedDate)}
          </p>
        </div>
        <StatusBadge kind="relationshipRequest" status={request.status} />
      </div>
      <div className="review-card-actions">
        <button
          type="button"
          data-ocid={`governance.review.request_approve_button.${position}`}
          onClick={onApprove}
          disabled={approving || rejecting || pending}
          className="steward-approve disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Check className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {approving ? "Approving…" : "Approve"}
        </button>
        <button
          type="button"
          data-ocid={`governance.review.request_reject_button.${position}`}
          onClick={onReject}
          disabled={approving || rejecting || pending}
          className="steward-reject disabled:cursor-not-allowed disabled:opacity-60"
        >
          <X className="h-4 w-4" strokeWidth={2.25} aria-hidden="true" />
          {rejecting ? "Rejecting…" : "Reject"}
        </button>
        <button
          type="button"
          data-ocid={`governance.review.request_pending_button.${position}`}
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

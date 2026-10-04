import { Inbox, ShieldAlert, ShieldCheck, UserCog } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type { MembershipConfirmationReviewView } from "../backend";
import { DomainEmptyState } from "../components/DomainEmptyState";
import {
  type CaseResult,
  MembershipReviewCaseCard,
} from "../components/MembershipReviewCaseCard";
import { useMembershipReviews } from "../hooks/useMembershipReviews";
import { useIsSteward } from "../hooks/useStewardAuthority";

interface FamilyStewardMembershipReviewsPageProps {
  onBack: () => void;
}

/** A case the Steward resolved on this screen, kept visible read-only. */
interface ResolvedCase {
  review: MembershipConfirmationReviewView;
  result: CaseResult;
}

/**
 * The Family Steward membership-review screen.
 *
 * Lists the membership-confirmation cases in the active family from the
 * canonical, family-scoped `useMembershipReviews` read
 * (`listMembershipConfirmationReviewsForSteward`). The backend returns only the
 * cases that require Steward attention — `#StewardReviewRequired` (conflicting
 * evidence) and `#RejectedByRelative` (a standalone rejection) — and never the
 * ordinary `#AwaitingConfirmation` cases that still belong with trusted
 * relatives. The page does not re-filter client-side.
 *
 * Each case shows the applicant's display name, their simple relationship,
 * their membership status, the related family (as a neutral label), the
 * confirmed / disputed counts, and an explicit conflicting-evidence indicator.
 * It expands to a human-readable confirmation history and offers exactly two
 * Steward resolution actions: Approve Membership and Reject Membership.
 *
 * After a resolution the case stays visible in place in a clear read-only
 * resolved/rejected state with no action buttons, so duplicate submission is
 * impossible even though the backend's unresolved list no longer returns it.
 *
 * The page renders only family-safe fields and never an account principal, a
 * technical id, or sensitive relationship metadata. A failed review request
 * shows a neutral error message with a Retry action and never an empty list.
 *
 * The page self-gates on the canonical Steward authority, mirroring
 * FamilyStewardReviewPage, so a direct navigation by a non-Steward renders an
 * unauthorized state rather than the review data.
 */
export function FamilyStewardMembershipReviewsPage({
  onBack,
}: FamilyStewardMembershipReviewsPageProps) {
  const { data: isSteward = false, isLoading: stewardLoading } = useIsSteward();
  const {
    data: reviews = [],
    isLoading: reviewsLoading,
    isError: reviewsError,
    refetch: refetchReviews,
  } = useMembershipReviews();

  // Cases resolved on this screen, keyed by membership id. The backend's
  // unresolved list drops a resolved case on the next read, so the page keeps
  // it here to render its read-only resolved state in place.
  const [resolvedCases, setResolvedCases] = useState<Map<string, ResolvedCase>>(
    () => new Map(),
  );

  const handleResolved = useCallback(
    (review: MembershipConfirmationReviewView, result: CaseResult) => {
      setResolvedCases((current) => {
        const next = new Map(current);
        next.set(review.membershipId.toString(), { review, result });
        return next;
      });
    },
    [],
  );

  // The rendered list: the backend's unresolved cases, plus any case resolved
  // on this screen that the backend no longer returns, in a stable order.
  const visibleCases = useMemo(() => {
    const backendIds = new Set(reviews.map((r) => r.membershipId.toString()));
    const resolvedOnly = [...resolvedCases.entries()]
      .filter(([id]) => !backendIds.has(id))
      .map(([, entry]) => entry);
    return [
      ...reviews.map((review) => ({ review, result: undefined })),
      ...resolvedOnly.map((entry) => ({
        review: entry.review,
        result: entry.result,
      })),
    ];
  }, [reviews, resolvedCases]);

  const isLoading = stewardLoading || reviewsLoading;

  if (!stewardLoading && !isSteward) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <button
          type="button"
          data-ocid="membership_reviews.back_button"
          onClick={onBack}
          className="mb-6 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden="true">←</span> Back to Home
        </button>
        <div
          data-ocid="membership_reviews.unauthorized_state"
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
            review family connections that need a decision.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <button
        type="button"
        data-ocid="membership_reviews.back_button"
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
          Membership Reviews
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Family connections where members disagreed and a Steward decision is
          needed. Open a case to see who confirmed or disputed it and when.
        </p>
      </header>

      {isLoading ? (
        <div
          data-ocid="membership_reviews.loading_state"
          className="space-y-4"
          aria-label="Loading membership reviews"
        >
          {Array.from({ length: 3 }, (_, i) => `skeleton-${i}`).map((id) => (
            <div
              key={id}
              className="animate-pulse rounded-2xl border border-border bg-card p-5"
            >
              <div className="mb-3 h-4 w-1/3 rounded bg-muted" />
              <div className="mb-2 h-5 w-2/3 rounded bg-muted" />
              <div className="h-4 w-full rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : reviewsError ? (
        <div
          data-ocid="membership_reviews.error_state"
          className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center"
        >
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShieldAlert
              className="h-7 w-7 text-muted-foreground"
              strokeWidth={1.5}
              aria-hidden="true"
            />
          </div>
          <h2 className="font-display text-xl font-semibold text-foreground">
            We couldn&rsquo;t load the reviews
          </h2>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Something went wrong while loading the membership reviews. Please
            try again.
          </p>
          <button
            type="button"
            data-ocid="membership_reviews.retry_button"
            onClick={() => void refetchReviews()}
            className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Retry
          </button>
        </div>
      ) : (
        <div data-ocid="membership_reviews.panel" className="steward-panel">
          <section
            data-ocid="membership_reviews.section"
            className="steward-section"
          >
            <h2 className="steward-section-title">
              Needs Steward review ({visibleCases.length})
            </h2>
            {visibleCases.length === 0 ? (
              <DomainEmptyState
                icon={Inbox}
                title="Nothing needs review"
                hint="Membership connections that need a Steward decision will appear here."
              />
            ) : (
              <ul data-ocid="membership_reviews.list" className="space-y-3">
                {visibleCases.map(({ review, result }, index) => (
                  <MembershipReviewCaseCard
                    key={review.membershipId.toString()}
                    review={review}
                    position={index + 1}
                    onResolved={handleResolved}
                    initialResult={result}
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

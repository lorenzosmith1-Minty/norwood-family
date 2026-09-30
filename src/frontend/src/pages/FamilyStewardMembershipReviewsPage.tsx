import { Inbox, ShieldAlert, ShieldCheck, UserCog } from "lucide-react";
import { DomainEmptyState } from "../components/DomainEmptyState";
import { MembershipReviewCaseCard } from "../components/MembershipReviewCaseCard";
import { useMembershipReviews } from "../hooks/useMembershipReviews";
import { useIsSteward } from "../hooks/useStewardAuthority";

interface FamilyStewardMembershipReviewsPageProps {
  onBack: () => void;
}

/**
 * The Family Steward membership-review screen.
 *
 * Lists the unresolved membership-confirmation cases in the active family from
 * the canonical, family-scoped `useMembershipReviews` read
 * (`listMembershipConfirmationReviewsForSteward`). Each case shows the
 * applicant's display name, their simple relationship, their membership status,
 * and the confirmed / disputed counts, expands to a human-readable confirmation
 * history, and offers the three Steward resolution actions (Approve Membership,
 * Reject Membership, Needs More Information).
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
              Awaiting Review ({reviews.length})
            </h2>
            {reviews.length === 0 ? (
              <DomainEmptyState
                icon={Inbox}
                title="Nothing awaiting review"
                hint="Membership connections that need a Steward decision will appear here."
              />
            ) : (
              <ul data-ocid="membership_reviews.list" className="space-y-3">
                {reviews.map((review, index) => (
                  <MembershipReviewCaseCard
                    key={review.membershipId.toString()}
                    review={review}
                    position={index + 1}
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

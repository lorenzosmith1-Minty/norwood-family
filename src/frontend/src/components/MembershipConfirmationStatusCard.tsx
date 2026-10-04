import {
  type MembershipConfirmationApplicantView,
  MembershipConfirmationState,
  MembershipStatus,
} from "@/backend";
import { useMyMembershipConfirmationState } from "@/hooks/useMembershipConfirmation";
import { MEMBERSHIP_CONFIRMATION_STATE_LABELS } from "@/types/ownership";
import { CheckCircle2, Clock, Info, ShieldQuestion } from "lucide-react";

/**
 * The applicant-safe membership confirmation status card.
 *
 * A user whose own membership is Pending sees this simple status card inside
 * the existing limited onboarding state. It uses the applicant-safe
 * confirmation-state read (`getMyMembershipConfirmationState`), which is
 * redacted: it never reveals who disputed them, any confirmer account id, or
 * sensitive relationship context.
 *
 * The card renders one calm line per derived state:
 *   - AWAITING            -> "Waiting for a family member to confirm your connection."
 *   - APPROVED BY RELATIVE-> "Your family connection has been confirmed."
 *   - REJECTED BY RELATIVE-> "Your family connection needs Family Steward review."
 *     A relative did not confirm the connection, but the case is not final: a
 *     Family Steward still reviews it, so it must never read as a permanent
 *     rejection.
 *   - STEWARD REVIEW      -> "Your family connection needs Family Steward review."
 *   - RESOLVED / APPROVED -> "Your family membership is confirmed."
 *   - RESOLVED / NOT APPROVED -> "Your membership request was not approved."
 */

export interface MembershipConfirmationStatusCardProps {
  /** The caller's own pending membership id in the active family. */
  membershipId: bigint | null;
  /**
   * The caller's own membership status, when known. Used to distinguish a
   * resolved approval from a resolved rejection when the confirmation state is
   * `ResolvedBySteward`.
   */
  membershipStatus?: MembershipStatus | null;
}

interface StatusPresentation {
  icon: typeof Clock;
  title: string;
  body: string;
  tone: string;
}

function presentStatus(
  view: MembershipConfirmationApplicantView,
  membershipStatus: MembershipStatus | null | undefined,
): StatusPresentation {
  switch (view.state) {
    case MembershipConfirmationState.AwaitingConfirmation:
      return {
        icon: Clock,
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[view.state],
        body: "Waiting for a family member to confirm your connection.",
        tone: "confirm-status-pending",
      };
    case MembershipConfirmationState.ApprovedByRelative:
      return {
        icon: CheckCircle2,
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[view.state],
        body: "Your family connection has been confirmed.",
        tone: "confirm-status-success",
      };
    case MembershipConfirmationState.RejectedByRelative:
    case MembershipConfirmationState.StewardReviewRequired:
      // A relative did not confirm the connection, but the case is not final:
      // a Family Steward still reviews it. Both states therefore read as under
      // review, never as a permanent rejection.
      return {
        icon: ShieldQuestion,
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[view.state],
        body: "Your family connection needs Family Steward review.",
        tone: "confirm-status-review",
      };
    case MembershipConfirmationState.ResolvedBySteward:
      return membershipStatus === MembershipStatus.Active
        ? {
            icon: CheckCircle2,
            title: "Approved by Family Steward",
            body: "Your family membership is confirmed.",
            tone: "confirm-status-success",
          }
        : {
            icon: Info,
            title: "Rejected by Family Steward",
            body: "Your membership request was not approved.",
            tone: "confirm-status-neutral",
          };
    default:
      return {
        icon: Clock,
        title:
          MEMBERSHIP_CONFIRMATION_STATE_LABELS[
            MembershipConfirmationState.AwaitingConfirmation
          ],
        body: "Waiting for a family member to confirm your connection.",
        tone: "confirm-status-pending",
      };
  }
}

export function MembershipConfirmationStatusCard({
  membershipId,
  membershipStatus = null,
}: MembershipConfirmationStatusCardProps) {
  const { data: view, isLoading } =
    useMyMembershipConfirmationState(membershipId);

  if (membershipId === null) return null;

  if (isLoading) {
    return (
      <div
        data-ocid="confirmation.status_loading"
        className="confirm-status-card"
        aria-label="Loading your confirmation status"
      >
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-muted border-t-accent" />
        <p className="confirm-status-body">
          Checking your confirmation status…
        </p>
      </div>
    );
  }

  if (!view) return null;

  const presentation = presentStatus(view, membershipStatus);
  const Icon = presentation.icon;

  return (
    <div
      data-ocid="confirmation.status_card"
      className={`confirm-status-card ${presentation.tone}`}
    >
      <span className="confirm-status-mark" aria-hidden="true">
        <Icon className="h-5 w-5" strokeWidth={1.75} />
      </span>
      <div className="confirm-status-text">
        <h3 className="confirm-status-title">{presentation.title}</h3>
        <p className="confirm-status-body">{presentation.body}</p>
      </div>
    </div>
  );
}

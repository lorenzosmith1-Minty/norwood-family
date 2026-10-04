import {
  ConfirmationDecision,
  type EligibleMembershipConfirmationView,
  type MembershipConfirmationError,
  MembershipConfirmationState,
  type PersonProfile,
  SimpleRelationshipType,
} from "@/backend";
import { useActiveFamilyId } from "@/context/FamilyContext";
import {
  isNoLongerNeededError,
  useConfirmPendingMembership,
  useMyConfirmationForMembership,
} from "@/hooks/useMembershipConfirmation";
import { useProfilePhoto } from "@/hooks/usePhotoStorage";
import { resolveBackendDisplayName } from "@/types/family";
import { MEMBERSHIP_CONFIRMATION_STATE_LABELS } from "@/types/ownership";
import { Check, HelpCircle, Loader2, ShieldQuestion } from "lucide-react";
import { useState } from "react";

/**
 * The trusted-relative confirmation request card.
 *
 * An eligible Active family member sees this card for a Pending membership they
 * may confirm. It is surfaced through the existing Notifications surface (no new
 * global navigation section) and is scoped to the active family: a Family A
 * request never renders while Family B is active.
 *
 * The card shows only family-safe profile information already available to the
 * signed-in user: the pending person's display name, their profile photo when
 * one exists, their birth year only when already visible under current family
 * permissions, and the simple relationship to the confirmer (Parent, Child,
 * Sibling, or Spouse / Partner). It never shows sensitive relationship context,
 * private notes, or technical identifiers.
 *
 * The surface discovers the request through the canonical, family-scoped
 * `useMyEligibleMembershipConfirmations` query and passes the resulting
 * `EligibleMembershipConfirmationView` as `eligible`; the card renders its
 * family-safe fields directly. The profile/relationship props remain the
 * fallback so the card renders identically when only those are supplied. The
 * card never parses notification message text.
 *
 * Wording is neutral and family-safe: no accusatory language.
 */

/** Friendly labels for the four simple relationship types. */
const SIMPLE_RELATIONSHIP_LABELS: Record<SimpleRelationshipType, string> = {
  [SimpleRelationshipType.Parent]: "Parent",
  [SimpleRelationshipType.Child]: "Child",
  [SimpleRelationshipType.Sibling]: "Sibling",
  [SimpleRelationshipType.SpousePartner]: "Spouse or Partner",
};

/** The result state the card settles into after a decision. */
type RequestResult =
  | { kind: "confirmed"; name: string }
  | { kind: "disputed" }
  | { kind: "reviewRequired" }
  | { kind: "noLongerNeeded" }
  | { kind: "error" };

/**
 * The calm, read-only presentation for a confirmation case that is no longer
 * actionable. The backend eligible list can include cases that are already
 * settled — `#ApprovedByRelative` (an Active membership already confirmed by
 * another relative), `#RejectedByRelative`, `#StewardReviewRequired`, and
 * `#ResolvedBySteward` — so the card must gate its actions on the case state,
 * not only on the caller's own recorded decision. Returns null for
 * `#AwaitingConfirmation`, the only actionable state.
 */
function presentReadOnlyState(
  state: MembershipConfirmationState,
): { title: string; body: string } | null {
  switch (state) {
    case MembershipConfirmationState.ApprovedByRelative:
      return {
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[state],
        body: "Another family member has already confirmed this connection.",
      };
    case MembershipConfirmationState.RejectedByRelative:
      // A dispute is not a final rejection: a Family Steward still reviews it,
      // so the copy must never read as a permanent "not confirmed" outcome.
      return {
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[state],
        body: "A family member did not confirm this connection. A Family Steward will review it.",
      };
    case MembershipConfirmationState.StewardReviewRequired:
      return {
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[state],
        body: "A Family Steward will review this connection.",
      };
    case MembershipConfirmationState.ResolvedBySteward:
      return {
        title: MEMBERSHIP_CONFIRMATION_STATE_LABELS[state],
        body: "A Family Steward has already reviewed this connection.",
      };
    default:
      return null;
  }
}

/**
 * Extracts the birth year from a profile's birth info, when present. Returns
 * null when no year is available so the card renders nothing rather than a
 * partial or misleading date.
 */
function resolveBirthYear(profile: PersonProfile | null): string | null {
  if (!profile) return null;
  const source = profile.birthDate ?? profile.birthInfo;
  if (!source) return null;
  const match = source.match(/\b(1[0-9]{3}|20[0-9]{2})\b/u);
  return match ? match[1] : null;
}

export interface MembershipConfirmationRequestCardProps {
  /** The pending membership the caller may confirm, in the active family. */
  membershipId: bigint;
  /** The pending person's id, used to resolve their family-safe profile. */
  pendingPersonId: string;
  /** The pending person's family-safe profile, when already available. */
  pendingProfile?: PersonProfile | null;
  /**
   * The simple relationship to the confirmer, when the surface already knows
   * it. Only the four simple labels are ever rendered.
   */
  relationship?: SimpleRelationshipType | null;
  /**
   * The canonical eligible-confirmation view for this request, when the surface
   * discovered it through `useMyEligibleMembershipConfirmations`. When present
   * its family-safe fields (display name, birth year, simple relationship) are
   * the source of truth; the profile/relationship props remain the fallback so
   * the card renders identically when only those are supplied.
   */
  eligible?: EligibleMembershipConfirmationView | null;
  /** Called after a decision settles so the surface can refresh. */
  onResolved?: () => void;
}

export function MembershipConfirmationRequestCard({
  membershipId,
  pendingPersonId,
  pendingProfile = null,
  relationship = null,
  eligible = null,
  onResolved,
}: MembershipConfirmationRequestCardProps) {
  const familyId = useActiveFamilyId();
  const confirm = useConfirmPendingMembership();
  const { data: myDecision } = useMyConfirmationForMembership(membershipId);
  const { data: profilePhoto } = useProfilePhoto(pendingPersonId, familyId);
  const [result, setResult] = useState<RequestResult | null>(null);

  const displayName = eligible
    ? eligible.displayName
    : pendingProfile
      ? resolveBackendDisplayName(pendingPersonId, pendingProfile)
      : pendingPersonId;
  const birthYear = eligible
    ? eligible.birthYear !== undefined
      ? eligible.birthYear.toString()
      : null
    : resolveBirthYear(pendingProfile);
  const photoUrl = profilePhoto ? profilePhoto.blob.getDirectURL() : null;
  const resolvedRelationship = eligible
    ? eligible.simpleRelationship
    : relationship;
  const relationshipLabel = resolvedRelationship
    ? SIMPLE_RELATIONSHIP_LABELS[resolvedRelationship]
    : null;

  // The caller's own recorded decision settles the card without a new submit.
  const settled: RequestResult | null =
    result ??
    (myDecision
      ? myDecision.decision === ConfirmationDecision.Disputed
        ? { kind: "disputed" }
        : { kind: "confirmed", name: displayName }
      : null);

  const submit = (decision: ConfirmationDecision) => {
    confirm.mutate(
      { membershipId, decision },
      {
        onSuccess: (outcome) => {
          switch (outcome.kind) {
            case "confirmed":
              setResult({ kind: "confirmed", name: displayName });
              break;
            case "disputed":
              setResult({ kind: "disputed" });
              break;
            case "reviewRequired":
              setResult({ kind: "reviewRequired" });
              break;
            case "error":
              setResult(
                isNoLongerNeededError(outcome.error)
                  ? { kind: "noLongerNeeded" }
                  : { kind: "error" },
              );
              break;
          }
          onResolved?.();
        },
        onError: () => setResult({ kind: "error" }),
      },
    );
  };

  if (settled) {
    return (
      <div
        data-ocid="confirmation.request_result"
        className="confirm-card confirm-card-result"
      >
        <span className="confirm-mark" aria-hidden="true">
          {settled.kind === "confirmed" ? (
            <Check className="h-6 w-6" strokeWidth={1.75} />
          ) : settled.kind === "disputed" ? (
            <ShieldQuestion className="h-6 w-6" strokeWidth={1.75} />
          ) : (
            <HelpCircle className="h-6 w-6" strokeWidth={1.75} />
          )}
        </span>
        <div className="confirm-body">
          <h3 className="confirm-title">
            {settled.kind === "confirmed"
              ? "Confirmed by a family member"
              : settled.kind === "disputed"
                ? "Disputed"
                : settled.kind === "reviewRequired"
                  ? "Needs Steward review"
                  : settled.kind === "noLongerNeeded"
                    ? "This request no longer needs your confirmation"
                    : "We couldn't record your response"}
          </h3>
          <p className="confirm-hint">
            {settled.kind === "confirmed"
              ? `${settled.name} can now join the family.`
              : settled.kind === "disputed"
                ? "Thanks — a Family Steward will review this connection."
                : settled.kind === "reviewRequired"
                  ? "A Family Steward will review this connection."
                  : settled.kind === "noLongerNeeded"
                    ? "Nothing further is needed from you right now."
                    : "Please try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  // The backend eligible list can include cases that are no longer actionable
  // (already confirmed by another relative, already rejected, under Steward
  // review, or resolved by a Steward). Gate the actions on the case state so an
  // already-settled case renders read-only instead of offering Confirm/Dispute.
  const readOnly =
    eligible &&
    eligible.confirmationState !==
      MembershipConfirmationState.AwaitingConfirmation
      ? presentReadOnlyState(eligible.confirmationState)
      : null;

  if (readOnly) {
    return (
      <div
        data-ocid="confirmation.request_result"
        className="confirm-card confirm-card-result"
      >
        <span className="confirm-mark" aria-hidden="true">
          <HelpCircle className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="confirm-body">
          <h3 className="confirm-title">{readOnly.title}</h3>
          <p className="confirm-hint">{readOnly.body}</p>
        </div>
      </div>
    );
  }

  const isSubmitting = confirm.isPending;

  return (
    <div
      data-ocid="confirmation.request_card"
      className="confirm-card"
      aria-busy={isSubmitting}
    >
      <div className="confirm-head">
        {photoUrl ? (
          <img
            src={photoUrl}
            alt=""
            className="confirm-avatar"
            loading="lazy"
          />
        ) : (
          <span
            className="confirm-avatar confirm-avatar-fallback"
            aria-hidden="true"
          >
            {displayName.slice(0, 1).toUpperCase()}
          </span>
        )}
        <div className="confirm-body">
          <h3 className="confirm-title">
            Can you confirm this family connection?
          </h3>
          <p className="confirm-person">
            {displayName}
            {birthYear ? (
              <span className="confirm-birth"> · Born {birthYear}</span>
            ) : null}
          </p>
          {relationshipLabel ? (
            <p className="confirm-relationship">{relationshipLabel}</p>
          ) : null}
        </div>
      </div>

      <div className="confirm-actions">
        <button
          type="button"
          data-ocid="confirmation.confirm_button"
          onClick={() => submit(ConfirmationDecision.Confirmed)}
          disabled={isSubmitting}
          className="confirm-accept"
        >
          {isSubmitting ? (
            <Loader2
              className="h-4 w-4 animate-spin"
              strokeWidth={2}
              aria-hidden="true"
            />
          ) : (
            <Check className="h-4 w-4" strokeWidth={2} aria-hidden="true" />
          )}
          Yes, I know this person
        </button>
        <button
          type="button"
          data-ocid="confirmation.dispute_button"
          onClick={() => submit(ConfirmationDecision.Disputed)}
          disabled={isSubmitting}
          className="confirm-dispute"
        >
          I don&rsquo;t think this is correct
        </button>
      </div>

      {isSubmitting ? (
        <output
          data-ocid="confirmation.submitting_state"
          className="confirm-submitting"
        >
          Recording your response…
        </output>
      ) : null}
    </div>
  );
}

export { SIMPLE_RELATIONSHIP_LABELS };
export type { MembershipConfirmationError };

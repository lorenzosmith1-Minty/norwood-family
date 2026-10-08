import {
  type StewardRecoveryVerificationView as BackendStewardRecoveryVerificationView,
  type RecoveryAuditView,
  type RecoveryRequest,
  RecoveryStatus,
  RecoveryType,
  type RecoveryVerificationDecision,
} from "@/backend";
import { useActiveFamilyId } from "@/context/FamilyContext";
import { resolveBackendDisplayName } from "../types/family";
import { usePersonProfile } from "./useProfileClaims";

/**
 * Plain-language presentation of a recovery request for the replacement
 * account. This module is the single place the internal `RecoveryStatus` /
 * `RecoveryType` enum names are translated into family-facing language; no
 * component may render a raw enum name, an account principal, or an internal
 * recovery id.
 *
 * The wording is deliberately about restoring access to a family profile — it
 * never presents the flow as password recovery and never implies Google/Apple
 * credential recovery.
 */

/** A family-facing status label plus a short explanation and tone. */
export interface RecoveryStatusPresentation {
  /** Short label, e.g. "Waiting for family review". */
  label: string;
  /** One-sentence explanation of what happens next. */
  description: string;
  /** Visual tone used to pick the status pill styling. */
  tone: "pending" | "approved" | "rejected" | "neutral";
}

/**
 * Translates a recovery status into family-facing language.
 *
 * - `#Pending` / `#AwaitingVerification` / `#ReadyForApproval` all read as
 *   "waiting for family review" — the request is open and a Steward decision is
 *   still to come. The internal distinction between collecting verifications
 *   and being ready for a decision is not meaningful to the family member.
 * - `#Approved` reads as access restored.
 * - `#Rejected` reads as not approved.
 * - `#Cancelled` reads as withdrawn.
 * - `#Expired` reads as lapsed.
 */
export function presentRecoveryStatus(
  status: RecoveryStatus,
): RecoveryStatusPresentation {
  switch (status) {
    case RecoveryStatus.Pending:
    case RecoveryStatus.AwaitingVerification:
    case RecoveryStatus.ReadyForApproval:
      return {
        label: "Waiting for family review",
        description:
          "A family Steward will review your request. You'll be able to sign in to the profile once it's approved.",
        tone: "pending",
      };
    case RecoveryStatus.Approved:
      return {
        label: "Access restored",
        description:
          "Your request was approved. You can now sign in to this family profile.",
        tone: "approved",
      };
    case RecoveryStatus.Rejected:
      return {
        label: "Not approved",
        description:
          "A family Steward did not approve this request. You can ask a Steward if you think this was a mistake.",
        tone: "rejected",
      };
    case RecoveryStatus.Cancelled:
      return {
        label: "Withdrawn",
        description: "This request was withdrawn before it was decided.",
        tone: "neutral",
      };
    case RecoveryStatus.Expired:
      return {
        label: "Expired",
        description:
          "This request lapsed before it was decided. You can start a new request if you still need access.",
        tone: "neutral",
      };
    default:
      return {
        label: "In progress",
        description: "This request is being reviewed.",
        tone: "neutral",
      };
  }
}

/**
 * A family-facing view of one recovery request. Carries only what the
 * replacement account needs to track its own request: the person's display
 * name, the plain-language status, and the request timestamps. It never carries
 * an account principal, a recovery id, or a raw enum name.
 */
export interface RecoveryRequestView {
  /** The person whose profile is being recovered, by display name. */
  personName: string;
  /** The plain-language status presentation. */
  status: RecoveryStatusPresentation;
  /** When the request was created (nanosecond timestamp). */
  createdAt: bigint;
  /** When the request was last updated (nanosecond timestamp). */
  updatedAt: bigint;
}

/**
 * Resolves the display name for a recovery request's target person from the
 * backend profile record, falling back to a neutral placeholder while the
 * profile is still loading or unavailable. The raw person id is never shown.
 */
export function useRecoveryPersonName(personId: string): string {
  const familyId = useActiveFamilyId();
  const { data: profile } = usePersonProfile(personId, { familyId });
  if (!profile) return "this family profile";
  return resolveBackendDisplayName(profile.personId, profile);
}

/**
 * Projects a raw `RecoveryRequest` into the family-safe view the replacement
 * account renders. The person display name is supplied by the caller (resolved
 * through `useRecoveryPersonName`) so this stays a pure function.
 */
export function toRecoveryRequestView(
  request: RecoveryRequest,
  personName: string,
): RecoveryRequestView {
  return {
    personName,
    status: presentRecoveryStatus(request.status),
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  };
}

/**
 * True when a recovery request is an ordinary Account Recovery (a Steward
 * decision) rather than the 2-member quorum path. Used to keep the Steward
 * decision surface scoped to ordinary Account Recovery.
 */
export function isAccountRecovery(request: RecoveryRequest): boolean {
  return request.recoveryType === RecoveryType.AccountRecovery;
}

/**
 * A family-facing view of one Steward Recovery verification entry. Carries only
 * what an eligible verifier needs: the candidate's display name, the
 * plain-language status, the quorum progress, the caller's own decision, and
 * the recovery id the verify action requires. It never carries an account
 * principal, a membership id, or a raw enum name.
 *
 * `recoveryId` is an internal handle passed straight to
 * `verifyStewardRecoveryForFamily`; it is never rendered to the user.
 */
export interface StewardRecoveryVerificationCardView {
  /** The candidate whose profile is being recovered, by display name. */
  candidateName: string;
  /** The plain-language status presentation. */
  status: RecoveryStatusPresentation;
  /** How many family confirmations have been received. */
  confirmationsReceived: number;
  /** How many family confirmations are required. */
  confirmationsRequired: number;
  /** The caller's own recorded decision, when they have already acted. */
  callerDecision: RecoveryVerificationDecision | null;
  /** True when the caller has already submitted a decision. */
  callerHasVerified: boolean;
  /** The internal recovery handle the verify action needs; never rendered. */
  recoveryId: bigint;
}

/**
 * Projects a raw `StewardRecoveryVerificationView` into the family-safe view the
 * verification card renders. The candidate display name is supplied by the
 * caller (resolved through `useRecoveryPersonName`) so this stays a pure
 * function and the raw backend view never reaches a component.
 */
export function toStewardRecoveryVerificationView(
  view: BackendStewardRecoveryVerificationView,
  candidateName: string,
): StewardRecoveryVerificationCardView {
  return {
    candidateName,
    status: presentVerifierRecoveryStatus(view.status),
    confirmationsReceived: Number(view.confirmationsReceived),
    confirmationsRequired: Number(view.confirmationsRequired),
    callerDecision: view.callerDecision ?? null,
    callerHasVerified: view.callerHasVerified,
    recoveryId: view.recoveryId,
  };
}

/**
 * Translates a recovery status into family-facing language from the perspective
 * of an eligible verifier (not the replacement account). The verifier is not
 * the person regaining access, so the copy never says "your request" or "you
 * can sign in" — it describes what the family is deciding.
 */
export function presentVerifierRecoveryStatus(
  status: RecoveryStatus,
): RecoveryStatusPresentation {
  switch (status) {
    case RecoveryStatus.Pending:
    case RecoveryStatus.AwaitingVerification:
      return {
        label: "Waiting for family confirmations",
        description:
          "Family members are confirming this recovery. Your response helps decide whether it goes ahead.",
        tone: "pending",
      };
    case RecoveryStatus.ReadyForApproval:
      return {
        label: "Ready for Steward review",
        description:
          "Enough family confirmations have been received. A family Steward will review the request.",
        tone: "pending",
      };
    case RecoveryStatus.Approved:
      return {
        label: "Access restored",
        description:
          "This recovery was approved and access to the family profile has been restored.",
        tone: "approved",
      };
    case RecoveryStatus.Rejected:
      return {
        label: "Not approved",
        description: "This recovery was not approved.",
        tone: "rejected",
      };
    case RecoveryStatus.Cancelled:
      return {
        label: "Withdrawn",
        description:
          "This recovery request was withdrawn before it was decided.",
        tone: "neutral",
      };
    case RecoveryStatus.Expired:
      return {
        label: "Expired",
        description: "This recovery request expired before it was decided.",
        tone: "neutral",
      };
    default:
      return {
        label: "In progress",
        description: "This recovery request is being reviewed.",
        tone: "neutral",
      };
  }
}

/**
 * Plain-language quorum progress, e.g. "1 of 2 family confirmations received".
 * The candidate is never counted — the backend's `confirmationsReceived`
 * already excludes the candidate, so this only formats the backend value.
 */
export function presentQuorumProgress(
  received: number,
  required: number,
): string {
  const noun = required === 1 ? "confirmation" : "confirmations";
  return `${received} of ${required} family ${noun} received`;
}

/**
 * True when the backend reports the request is ready for a Steward decision.
 * The card uses this to remove verification actions once quorum is reached.
 */
export function isReadyForApproval(status: RecoveryStatus): boolean {
  return status === RecoveryStatus.ReadyForApproval;
}

/**
 * True when a recovery status is terminal (no further verification is valid).
 */
export function isResolvedRecoveryStatus(status: RecoveryStatus): boolean {
  switch (status) {
    case RecoveryStatus.Approved:
    case RecoveryStatus.Rejected:
    case RecoveryStatus.Cancelled:
    case RecoveryStatus.Expired:
      return true;
    default:
      return false;
  }
}

/**
 * A family-facing view of one recovery audit entry. Carries only what the
 * family needs to follow the history: the plain-language action, the actor
 * display label, the affected people display names, and the timestamp. It never
 * carries an account principal, an internal audit id, a recovery id, a family
 * id, or the raw free-text summary.
 */
export interface RecoveryAuditEntryView {
  /** Plain-language description of what happened. */
  actionLabel: string;
  /** Display label of the account that performed the action. */
  actorName: string;
  /** Display names of the people the action affected. */
  affectedNames: string[];
  /** When the action was recorded (nanosecond timestamp). */
  timestamp: bigint;
}

/**
 * Projects the backend's safe `RecoveryAuditView` into the view the history
 * section renders. The backend now resolves the action label, the actor display
 * label, and the affected-person display names server-side, so this is a pure
 * field mapping — no profile lookups and no id translation happen here, and the
 * raw backend view never reaches a component.
 */
export function toRecoveryAuditEntryView(
  view: RecoveryAuditView,
): RecoveryAuditEntryView {
  return {
    actionLabel: view.actionLabel,
    actorName: view.actorDisplayLabel,
    affectedNames: view.affectedDisplayNames,
    timestamp: view.timestamp,
  };
}

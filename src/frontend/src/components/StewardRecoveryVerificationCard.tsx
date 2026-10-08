import {
  type StewardRecoveryVerificationView as BackendStewardRecoveryVerificationView,
  RecoveryVerificationDecision,
} from "@/backend";
import { useVerifyStewardRecovery } from "@/hooks/useRecovery";
import {
  isReadyForApproval,
  isResolvedRecoveryStatus,
  presentQuorumProgress,
  toStewardRecoveryVerificationView,
} from "@/hooks/useRecoveryStatus";
import { Check, Loader2, ShieldQuestion, Users } from "lucide-react";
import { useState } from "react";

/**
 * The Steward Recovery verification card.
 *
 * An eligible approved family member sees this card for a Steward Recovery
 * request they may verify. It is surfaced through the existing Notifications
 * surface (no new global navigation section) and is scoped to the active
 * family: a Family A request never renders while Family B is active.
 *
 * The backend is the authorization boundary. `listStewardRecoveryVerificationsForFamily`
 * already excludes the recovery candidate and every non-approved caller, and it
 * returns already-verified entries too. This card adds a UI guard on top of
 * that: it hides the actions from a caller who has already acted and once the
 * request is no longer open. The guard never widens access.
 *
 * The card shows only minimum family-safe context: the candidate's display
 * name, that the request is for Steward Recovery, the plain-language status,
 * and quorum progress. It never shows an account principal, a recovery request
 * id, a membership id, or any unrelated private family data. The recovery id
 * the action needs is carried internally by the view and is never rendered.
 *
 * Wording is neutral and family-safe: a dispute is not a final rejection — a
 * Steward still reviews the request — so the copy never reads as a permanent
 * outcome, and a confirmation never implies Steward authority has transferred.
 */

/** The result state the card settles into after a decision. */
type VerificationResult =
  | { kind: "confirmed"; name: string }
  | { kind: "disputed" }
  | { kind: "alreadySettled" }
  | { kind: "error" };

export interface StewardRecoveryVerificationCardProps {
  /**
   * The family-safe verification view the backend returned for this request.
   * Its `candidateName` is already a display name and its `recoveryId` is the
   * internal handle the verify action needs, so no extra props are required.
   */
  verification: BackendStewardRecoveryVerificationView;
  /** Called after a decision settles so the surface can refresh. */
  onResolved?: () => void;
}

export function StewardRecoveryVerificationCard({
  verification,
  onResolved,
}: StewardRecoveryVerificationCardProps) {
  const verify = useVerifyStewardRecovery();
  const [result, setResult] = useState<VerificationResult | null>(null);

  const view = toStewardRecoveryVerificationView(
    verification,
    verification.candidateName,
  );
  const candidateName = view.candidateName;
  const status = view.status;
  const quorumLabel = presentQuorumProgress(
    view.confirmationsReceived,
    view.confirmationsRequired,
  );

  // The caller's own recorded decision settles the card without a new submit.
  const settled: VerificationResult | null =
    result ??
    (view.callerHasVerified
      ? view.callerDecision === RecoveryVerificationDecision.Reject
        ? { kind: "disputed" }
        : { kind: "confirmed", name: candidateName }
      : null);

  const submit = (decision: RecoveryVerificationDecision) => {
    verify.mutate(
      { recoveryId: view.recoveryId, decision },
      {
        onSuccess: (outcome) => {
          switch (outcome.kind) {
            case "confirmed":
              setResult({ kind: "confirmed", name: candidateName });
              break;
            case "disputed":
              setResult({ kind: "disputed" });
              break;
            case "alreadySettled":
              setResult({ kind: "alreadySettled" });
              break;
            case "error":
              setResult({ kind: "error" });
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
        data-ocid="recovery_verification.result"
        className="confirm-card confirm-card-result"
      >
        <span className="confirm-mark" aria-hidden="true">
          {settled.kind === "confirmed" ? (
            <Check className="h-6 w-6" strokeWidth={1.75} />
          ) : settled.kind === "disputed" ? (
            <ShieldQuestion className="h-6 w-6" strokeWidth={1.75} />
          ) : (
            <Users className="h-6 w-6" strokeWidth={1.75} />
          )}
        </span>
        <div className="confirm-body">
          <h3 className="confirm-title">
            {settled.kind === "confirmed"
              ? "Thanks — your confirmation was recorded"
              : settled.kind === "disputed"
                ? "Thanks — your response was recorded"
                : settled.kind === "alreadySettled"
                  ? "This request no longer needs your response"
                  : "We couldn't record your response"}
          </h3>
          <p className="confirm-hint">
            {settled.kind === "confirmed"
              ? `Your confirmation for ${candidateName} was recorded. A family Steward will review the request.`
              : settled.kind === "disputed"
                ? "A family Steward will review this request."
                : settled.kind === "alreadySettled"
                  ? "Nothing further is needed from you right now."
                  : "Please try again in a moment."}
          </p>
        </div>
      </div>
    );
  }

  // The backend can return a request that is no longer open (ready for a
  // Steward decision, or already resolved). Gate the actions on the backend
  // status so a non-actionable request renders read-only instead of offering
  // Confirm/Dispute.
  const readOnly =
    isReadyForApproval(verification.status) ||
    isResolvedRecoveryStatus(verification.status);

  if (readOnly) {
    return (
      <div
        data-ocid="recovery_verification.result"
        className="confirm-card confirm-card-result"
      >
        <span className="confirm-mark" aria-hidden="true">
          <Users className="h-6 w-6" strokeWidth={1.75} />
        </span>
        <div className="confirm-body">
          <h3 className="confirm-title">{status.label}</h3>
          <p className="confirm-hint">{status.description}</p>
        </div>
      </div>
    );
  }

  const isSubmitting = verify.isPending;

  return (
    <div
      data-ocid="recovery_verification.card"
      className="confirm-card"
      aria-busy={isSubmitting}
    >
      <div className="confirm-head">
        <span
          className="confirm-avatar confirm-avatar-fallback"
          aria-hidden="true"
        >
          {candidateName.slice(0, 1).toUpperCase()}
        </span>
        <div className="confirm-body">
          <h3 className="confirm-title">
            Can you confirm this Steward Recovery?
          </h3>
          <p className="confirm-person">{candidateName}</p>
          <p className="confirm-relationship">Steward Recovery</p>
        </div>
      </div>

      <div className="confirm-body">
        <p className="confirm-hint">{status.description}</p>
        <p
          data-ocid="recovery_verification.quorum"
          className="confirm-hint font-medium"
        >
          {quorumLabel}
        </p>
      </div>

      <div className="confirm-actions">
        <button
          type="button"
          data-ocid="recovery_verification.confirm_button"
          onClick={() => submit(RecoveryVerificationDecision.Confirm)}
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
          Confirm recovery candidate
        </button>
        <button
          type="button"
          data-ocid="recovery_verification.dispute_button"
          onClick={() => submit(RecoveryVerificationDecision.Reject)}
          disabled={isSubmitting}
          className="confirm-dispute"
        >
          I cannot confirm
        </button>
      </div>

      {isSubmitting ? (
        <output
          data-ocid="recovery_verification.submitting_state"
          className="confirm-submitting"
        >
          Recording your response…
        </output>
      ) : null}
    </div>
  );
}

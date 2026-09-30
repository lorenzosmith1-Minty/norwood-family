import { useActiveFamilyRecord } from "@/hooks/useActiveFamilyRecord";
import { LogOut, ShieldAlert, UserMinus } from "lucide-react";

/**
 * The limited inactive-membership shell for a caller whose active family
 * membership is Suspended or Left.
 *
 * Both states are deliberately minimal and neutral. They expose NO information
 * about who disputed or removed the membership, no confirmer identity, no
 * relationship context, and no normal family navigation. The caller can only
 * sign out.
 *
 *   - Suspended: "Your family connection is under review" — the 1D-H access
 *     rule: a post-activation dispute returns the caller to this limited
 *     review/status shell.
 *   - Left: "You are no longer an active member of this family" — a neutral
 *     state with no accusation and no path back into family data.
 *
 * The shell reuses the existing invite/confirmation visual language
 * (`--invite-*` tokens and the `.invite-*` classes) so it reads as the same
 * quiet onboarding moment as the invite redemption surface. It does not
 * redesign the visual system.
 */

export type InactiveMembershipKind = "suspended" | "left";

export interface MembershipInactiveShellProps {
  /** Which inactive state to render. */
  kind: InactiveMembershipKind;
  /** Signs the current caller out. */
  onSignOut: () => void;
}

export function MembershipInactiveShell({
  kind,
  onSignOut,
}: MembershipInactiveShellProps) {
  const { displayName } = useActiveFamilyRecord();

  const isSuspended = kind === "suspended";
  const Icon = isSuspended ? ShieldAlert : UserMinus;
  const title = isSuspended
    ? "Your family connection is under review"
    : "You are no longer an active member of this family";
  const body = isSuspended
    ? "A family steward is reviewing your connection. You'll regain access once the review is complete."
    : "Your membership in this family has ended. If you believe this is a mistake, contact a family steward.";
  const statusLabel = isSuspended ? "Under review" : "Not a member";

  return (
    <div
      className="invite-screen"
      data-ocid={
        isSuspended ? "membership.suspended_shell" : "membership.left_shell"
      }
      aria-label={isSuspended ? "Membership under review" : "Membership ended"}
    >
      <div
        className="invite-notice"
        data-ocid={
          isSuspended ? "membership.suspended_state" : "membership.left_state"
        }
      >
        <span className="invite-notice-mark" aria-hidden="true">
          <Icon className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {displayName ? `${displayName} Family` : "Family"}
          </p>
          <h1 className="invite-notice-title">{title}</h1>
          <p className="invite-notice-hint">{body}</p>
        </div>
        <span
          className={`invite-status ${
            isSuspended ? "invite-status-expired" : "invite-status-cancelled"
          }`}
        >
          {statusLabel}
        </span>
      </div>

      <button
        type="button"
        data-ocid="membership.sign_out_button"
        onClick={onSignOut}
        className="invite-decline"
      >
        <LogOut className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        Sign out
      </button>
    </div>
  );
}

import type { MembershipStatus } from "@/backend";
import { MembershipConfirmationStatusCard } from "@/components/MembershipConfirmationStatusCard";
import { useActiveFamilyRecord } from "@/hooks/useActiveFamilyRecord";
import { Clock, LogOut, TreePine } from "lucide-react";

/**
 * The limited Pending-membership shell.
 *
 * After authentication and family-context resolution, a caller whose active
 * family membership is Pending sees this shell INSTEAD of the normal family
 * application. It is deliberately minimal: Norwood/family branding, the family
 * display name, the applicant-safe membership confirmation status card, and
 * Sign out. It exposes no normal family navigation (Explore Family, Heritage
 * Branch, Family Archive, Family History, Message Board, Family Steward,
 * unrelated private Notifications content, Add Family Member) and no family
 * data.
 *
 * The shell reuses the existing invite/confirmation visual language
 * (`--invite-*` / `--confirm-*` tokens and the `.invite-*` classes) so it reads
 * as the same quiet onboarding moment as the invite redemption surface. It does
 * not redesign the visual system.
 *
 * The family display name is the active Family record's real `displayName`,
 * read through the centralized FamilyContext and the existing `getFamily`
 * binding — never derived from the technical family id — so the shell stays
 * correct if the active family changes.
 */

export interface MembershipPendingShellProps {
  /** The caller's own pending membership id in the active family, if known. */
  membershipId: bigint | null;
  /** The caller's own membership status, when known. */
  membershipStatus?: MembershipStatus | null;
  /** Signs the current caller out. */
  onSignOut: () => void;
}

export function MembershipPendingShell({
  membershipId,
  membershipStatus = null,
  onSignOut,
}: MembershipPendingShellProps) {
  const { displayName } = useActiveFamilyRecord();

  return (
    <div
      className="invite-screen"
      data-ocid="membership.pending_shell"
      aria-label="Membership pending"
    >
      <div className="invite-card" data-ocid="membership.pending_card">
        <span className="invite-crest" aria-hidden="true">
          <TreePine className="h-7 w-7" strokeWidth={1.75} />
        </span>
        <div className="flex flex-col items-center gap-2">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {displayName ? `${displayName} Family` : "Family"}
          </p>
          <h1 className="invite-title">Waiting for family confirmation</h1>
          <p className="invite-hint">
            Your family connection is waiting for a family member to confirm it.
            If there is a disagreement, a Family Steward will review it.
          </p>
        </div>
        <div className="invite-rule" aria-hidden="true" />
        <span className="invite-status invite-status-expired">
          <Clock
            className="h-3.5 w-3.5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          Pending
        </span>
        <MembershipConfirmationStatusCard
          membershipId={membershipId}
          membershipStatus={membershipStatus}
        />
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

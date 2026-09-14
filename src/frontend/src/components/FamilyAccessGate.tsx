import { Skeleton } from "@/components/ui/skeleton";
import { Lock } from "lucide-react";
import type { ReactNode } from "react";
import { useFamilyAccess } from "../hooks/useFamilyAccess";

interface FamilyAccessGateProps {
  /** The gated content (the family graph) shown only to approved members. */
  children: ReactNode;
  /** Navigates to the shared sign-in surface from the no-access state. */
  onSignIn: () => void;
}

/**
 * Shared gate for the family-graph pages (Explore Family, Heritage Branch).
 * Approved family members (a linked, claimed Person Profile) see the gated
 * content; everyone else sees a clear no-access state instead of the family
 * graph. While the signed-in caller's claim is still resolving, a neutral
 * skeleton is shown so an approved member never flashes a "no access" state.
 *
 * The no-access state uses the design system's gated-state language (a quiet
 * warm plate with a muted lock crest and a sign-in affordance) so it reads as
 * privacy gating, never a broken page.
 */
export function FamilyAccessGate({
  children,
  onSignIn,
}: FamilyAccessGateProps) {
  const { isApprovedFamilyMember, isLoading } = useFamilyAccess();

  // While the signed-in caller's claim is still resolving, show a neutral
  // skeleton instead of flashing "no access" to an approved member.
  if (isLoading) {
    return (
      <div
        data-ocid="family_access.loading_state"
        className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-6 py-16"
      >
        <Skeleton className="h-8 w-56 rounded-full" />
        <Skeleton className="h-4 w-72 rounded-full" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!isApprovedFamilyMember) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-12">
        <div className="gated-state" data-ocid="family_access.no_access">
          <span className="gated-lock">
            <Lock className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <h2 className="gated-title">Family only</h2>
          <div className="gated-rule" aria-hidden="true" />
          <p className="gated-hint">
            The family tree and heritage branches are private to approved family
            members. Sign in and connect your family profile to explore them.
          </p>
          <button
            type="button"
            data-ocid="family_access.sign_in_button"
            onClick={onSignIn}
            className="gated-action"
          >
            Sign in to view
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

import { ClaimStatus } from "@/backend";
import { resolveBackendDisplayName } from "../types/family";
import { useAuth } from "./useAuth";
import { useMyProfile } from "./useProfileClaims";

/**
 * Resolves the signed-in caller's visible identity for the navbar, following
 * the display priority required by the navigation-identity contract:
 *
 *   1. The linked approved/claimed Person Profile's display name.
 *   2. The pending personal profile's display name (a claim awaiting review,
 *      or a newly created profile awaiting a confirmed connection).
 *   3. No profile connected yet -> the caller falls back to 'My Account' /
 *      'Complete Profile' (handled by the Layout, never a raw account ID).
 *
 * The raw auth/account ID is never surfaced here — it stays internal only.
 *
 * The backend exposes the non-admin getMyProfile endpoint, which returns the
 * caller's own linked/claimed profile, else their createMyself-keyed or
 * pending-claim profile, else null. This avoids the admin-gated
 * listProfileClaims endpoint, which traps for non-admin callers. When the
 * caller has no profile (or is not signed in) the hook degrades to the 'none'
 * state so the navbar always shows a safe, non-identifying label.
 */
export interface NavbarIdentity {
  /** The display name to show, or "" when no profile is connected. */
  displayName: string;
  /** How the identity was resolved. */
  status: "linked" | "pending" | "none";
  /** The person id of the linked/pending profile, when one is connected. */
  personId?: string;
  /**
   * The backend claim status of the caller's own connected profile, when one
   * exists. Claimed = approved/owned; Unclaimed = a pending claim awaiting
   * review. Drives claim-aware "My Profile" routing.
   */
  claimStatus?: ClaimStatus;
  /**
   * True while the signed-in caller's own profile/claim state is still
   * resolving from the backend. While this is true the navbar must NOT render
   * permission-dependent navigation (Add Myself / Add Family, Message Board,
   * Family Steward) from incomplete state — the caller may own an approved
   * claim that has not resolved yet, so showing "Add Myself" or hiding
   * authorized features would be wrong. The Layout shows a neutral skeleton
   * until this clears.
   */
  isLoading: boolean;
}

export function useNavbarIdentity(): NavbarIdentity {
  const { isAuthenticated } = useAuth();
  const { data: profile, isLoading } = useMyProfile();

  // A signed-out caller needs no hydration — the public navbar is authoritative.
  if (!isAuthenticated) {
    return { displayName: "", status: "none", isLoading: false };
  }

  // While the signed-in caller's own profile is still resolving we cannot yet
  // decide claim-aware navigation. Report loading so the navbar shows a neutral
  // skeleton instead of rendering permission-dependent nav from incomplete
  // state (e.g. "Add Myself" for an account that owns an approved claim).
  if (isLoading) {
    return { displayName: "", status: "none", isLoading: true };
  }

  if (!profile) {
    return { displayName: "", status: "none", isLoading: false };
  }

  const displayName = resolveBackendDisplayName(profile.personId, profile);
  const status =
    profile.claimStatus === ClaimStatus.Claimed ? "linked" : "pending";

  return {
    displayName,
    status,
    personId: profile.personId,
    claimStatus: profile.claimStatus,
    isLoading: false,
  };
}

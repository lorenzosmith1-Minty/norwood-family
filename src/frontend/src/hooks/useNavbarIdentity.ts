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
}

export function useNavbarIdentity(): NavbarIdentity {
  const { isAuthenticated } = useAuth();
  const { data: profile } = useMyProfile();

  if (!isAuthenticated || !profile) {
    return { displayName: "", status: "none" };
  }

  const displayName = resolveBackendDisplayName(profile.personId, profile);
  const status =
    profile.claimStatus === ClaimStatus.Claimed ? "linked" : "pending";

  return {
    displayName,
    status,
    personId: profile.personId,
    claimStatus: profile.claimStatus,
  };
}

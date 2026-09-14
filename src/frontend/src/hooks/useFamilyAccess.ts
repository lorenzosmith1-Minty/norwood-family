import { ClaimStatus } from "@/backend";
import { useAuth } from "./useAuth";
import { useNavbarIdentity } from "./useNavbarIdentity";

/**
 * Shared guest-access determination for the family-graph pages (Explore Family,
 * Heritage Branch). A caller is an approved family member only when their own
 * profile claim has been approved (ClaimStatus.Claimed) — a linked, owned
 * Person Profile.
 *
 * The hook exposes an `isLoading` flag so consuming pages can render a neutral
 * loading state while the signed-in caller's claim is still resolving from the
 * backend, instead of flashing a "no access" state to an approved member whose
 * claim has not resolved yet (the same hydration discipline the navbar uses).
 *
 * A signed-out caller is never an approved member and is never "loading" — the
 * public no-access state is authoritative for guests.
 */
export interface FamilyAccess {
  /** True when the caller holds an approved family claim (Claimed). */
  isApprovedFamilyMember: boolean;
  /**
   * True while the signed-in caller's own claim is still resolving. While true
   * the caller must NOT be shown the no-access state (they may own an approved
   * claim that has not resolved yet).
   */
  isLoading: boolean;
}

export function useFamilyAccess(): FamilyAccess {
  const { isAuthenticated } = useAuth();
  const { claimStatus, isLoading } = useNavbarIdentity();

  // A signed-out caller needs no hydration — the public no-access state is
  // authoritative for guests.
  if (!isAuthenticated) {
    return { isApprovedFamilyMember: false, isLoading: false };
  }

  // While the signed-in caller's own claim is still resolving we cannot yet
  // decide access. Report loading so the gate shows a neutral skeleton instead
  // of flashing "no access" to an approved member.
  if (isLoading) {
    return { isApprovedFamilyMember: false, isLoading: true };
  }

  return {
    isApprovedFamilyMember: claimStatus === ClaimStatus.Claimed,
    isLoading: false,
  };
}

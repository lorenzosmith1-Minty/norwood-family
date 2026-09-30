import {
  MembershipConfirmationError,
  type MembershipConfirmationResolution,
  createActor,
} from "@/backend";
import type {
  FamilyMembership,
  MembershipConfirmationReviewView,
} from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { membershipConfirmationInvalidation } from "./useMembershipConfirmation";
import { notificationInvalidation } from "./useNotifications";

/**
 * React Query hooks for the Family Steward membership-review surface, following
 * the existing useActor(createActor) + useQuery/useMutation pattern used by
 * useMembershipConfirmation / useProfileClaims / useStewardAuthority.
 *
 * The read is family-scoped: the active family id is read from the centralized
 * FamilyContext and always passed to the backend (default family included), and
 * `familyScopedId ?? ""` occupies query-key index 1 so the family-exact
 * `membershipConfirmationInvalidation` predicate covers it. A Family A review
 * therefore never appears in Family B's cache.
 *
 * The backend endpoint (`listMembershipConfirmationReviewsForSteward`) is
 * Steward-gated and returns only cases that require Steward attention
 * (`#StewardReviewRequired`). The returned `MembershipConfirmationReviewView`
 * carries only family-safe fields — applicant display name, simple relationship
 * label, membership status, confirmation history, and derived counts — and
 * never exposes an account principal, confirmer person id, or relationship id.
 */

/** The membership-review cache key prefix. */
const REVIEW_KEY = "membershipReviews";

/**
 * The canonical, family-scoped list of membership-confirmation cases awaiting
 * Steward review in the active family.
 *
 * A failed read rejects the query so the page can render a neutral error state
 * with a Retry action; the error tag itself is never surfaced to the user. The
 * page must never show an empty review list when the request failed, so the
 * error is not collapsed into an empty array here.
 */
export function useMembershipReviews() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [REVIEW_KEY, familyScopedId ?? "", "list"],
    queryFn: async (): Promise<MembershipConfirmationReviewView[]> => {
      if (!actor) return [];
      const result =
        await actor.listMembershipConfirmationReviewsForSteward(familyId);
      if (result.__kind__ === "err") {
        throw new Error("Membership reviews are unavailable");
      }
      return result.ok;
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The number of unresolved membership cases requiring Steward attention in the
 * active family. Derived from the canonical review list so the hub badge and the
 * review page always agree; zero when the list is empty or still loading.
 */
export function useUnresolvedMembershipReviewCount(): number {
  const { data: reviews = [] } = useMembershipReviews();
  return reviews.length;
}

/**
 * Builds the React Query invalidation filter for the membership-review caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["membershipReviews"]` filter would also match
 * `["membershipReviews", <otherFamily>, ...]` and mark another family's cache
 * stale. The filter is therefore family-exact: the default family
 * (`familyScopedId` undefined) targets only keys whose family slot is the
 * default sentinel `""`, and a non-default family targets only keys whose
 * family slot is that family id (family id at index 1).
 */
export function membershipReviewsInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  const familySlot = familyScopedId ?? "";
  return {
    queryKey: [REVIEW_KEY],
    predicate: (query) => query.queryKey[1] === familySlot,
  };
}

/** The result of a Steward resolution, normalized for the UI. */
export type ResolveMembershipOutcome =
  | { kind: "resolved"; membership: FamilyMembership }
  | { kind: "alreadySettled" }
  | { kind: "error" };

/**
 * Submits a Family Steward's resolution for a membership-confirmation case in
 * the active family. The Steward identity is derived server-side; the caller
 * can never resolve on behalf of another Steward.
 *
 * The backend preserves the existing membership transitions exactly:
 *   - `#Approve` activates a Pending membership or restores a Suspended one.
 *   - `#Reject` leaves the membership non-Active with a resolved rejection.
 *   - `#NeedsMoreInformation` leaves the case open (Pending / Suspended) so it
 *     stays in the Steward review list.
 *
 * A case that changed before the Steward acted (already resolved, no longer
 * pending, membership missing, or the caller is no longer an authorized
 * Steward) maps to `alreadySettled`, which the UI renders as a neutral
 * "already settled" state with no private reason or technical tag exposed.
 *
 * On success only the active family's caches are invalidated: the confirmation
 * caches (via the canonical family-exact predicate), the active family's
 * membership status, the active family's Steward review list, and the active
 * family's notification count. A bare cross-family prefix is never used.
 */
export function useResolveMembershipConfirmation() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      resolution,
    }: {
      membershipId: bigint;
      resolution: MembershipConfirmationResolution;
    }): Promise<ResolveMembershipOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.resolveMembershipConfirmation(
        familyId,
        membershipId,
        resolution,
      );
      if (result.__kind__ === "ok") {
        return { kind: "resolved", membership: result.ok };
      }
      return isAlreadySettledError(result.err)
        ? { kind: "alreadySettled" }
        : { kind: "error" };
    },
    onSuccess: (outcome) => {
      if (outcome.kind === "error") return;
      // Family-exact confirmation caches (request data + applicant status).
      void queryClient.invalidateQueries(
        membershipConfirmationInvalidation(familyScopedId),
      );
      // The active family's membership-related status.
      void queryClient.invalidateQueries({
        queryKey: ["myMembership", familyScopedId ?? ""],
      });
      // The active family's Steward review list. The confirmation predicate
      // above does NOT cover the membershipReviews prefix, so it is invalidated
      // explicitly here.
      void queryClient.invalidateQueries(
        membershipReviewsInvalidation(familyScopedId),
      );
      // The active family's notification count / list.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Maps a resolution error tag to the neutral "this case was already settled"
 * state. Every case-change error collapses to the same neutral state so no
 * private reason is exposed. `#NotSignedIn` and `#NotSteward` are surfaced as
 * errors because they are not case changes.
 */
export function isAlreadySettledError(
  error: MembershipConfirmationError,
): boolean {
  switch (error) {
    case MembershipConfirmationError.MembershipNotPending:
    case MembershipConfirmationError.AlreadyDecided:
    case MembershipConfirmationError.MembershipNotFound:
    case MembershipConfirmationError.FamilyNotFound:
    case MembershipConfirmationError.NoActiveMembership:
    case MembershipConfirmationError.NoQualifyingRelationship:
    case MembershipConfirmationError.ActivationFailed:
      return true;
    default:
      return false;
  }
}

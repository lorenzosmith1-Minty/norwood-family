import {
  ConfirmationDecision,
  MembershipConfirmationError,
  MembershipStatus,
  createActor,
} from "@/backend";
import type {
  EligibleMembershipConfirmationView,
  FamilyMembership,
  MembershipConfirmation,
  MembershipConfirmationApplicantView,
} from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { notificationInvalidation } from "./useNotifications";

/**
 * React Query hooks for the trusted-relative MembershipConfirmation workflow,
 * following the existing useActor(createActor) + useQuery/useMutation pattern
 * used by useNotifications / useProfileClaims / usePendingCount.
 *
 * Every hook is family-aware: the active family is read from the centralized
 * FamilyContext and `familyScopedId` is `undefined` for the default family.
 * The confirmation endpoints are all family-scoped and take an explicit
 * `familyId`, so the active family id is always passed (default family
 * included) and always included in the query key. That is required by the
 * generated bindings, not a hard-coded family id.
 *
 * Reads are split by audience, mirroring the backend:
 *   - `useMyEligibleMembershipConfirmations` is the canonical, family-scoped
 *     discovery read (`listMyEligibleMembershipConfirmationsForFamily`); it is
 *     the single source of truth for which confirmation requests the caller may
 *     act on, and never depends on notification message text.
 *   - `useMyMembershipConfirmationState` is the REDACTED applicant-safe read
 *     (`getMyMembershipConfirmationState`); it never exposes a confirmer
 *     account principal, sensitive relationship context, or private notes.
 *   - `useMyConfirmationForMembership` returns the caller's OWN recorded
 *     decision only (`getMyConfirmationForMembership`), so a confirmer can
 *     render their own resolved state without seeing anyone else's decision.
 *
 * Mutations invalidate family-exact caches only: the active family's
 * confirmation request data, the applicant-safe confirmation status, the
 * active family's membership-related status, and the active family's
 * notification count. A bare cross-family prefix is never used.
 */

/** The confirmation cache key prefix. */
const CONFIRMATION_KEY = "membershipConfirmation";

/**
 * Builds the React Query invalidation filter for the confirmation caches.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["membershipConfirmation"]` filter would also match
 * `["membershipConfirmation", <otherFamily>, ...]` and mark another family's
 * cache stale. Both branches are therefore family-exact: the default family
 * (`familyScopedId` undefined) targets only keys whose family slot is the
 * default sentinel `""`, and a non-default family targets only keys whose
 * family slot is that family id (family id at index 1).
 */
export function membershipConfirmationInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  const familySlot = familyScopedId ?? "";
  return {
    queryKey: [CONFIRMATION_KEY],
    predicate: (query) => query.queryKey[1] === familySlot,
  };
}

/**
 * The signed-in caller's own membership in the active family, or null when the
 * caller has no membership. Used by the applicant status card to discover the
 * caller's own pending membership id, and by the confirmer card to know whether
 * the caller is an Active member of the family.
 *
 * The default family keeps the exact legacy no-argument call shape; a
 * non-default family routes to the canonical `getMyMembershipForFamily`
 * endpoint with the familyId in the key.
 */
export function useMyMembershipForFamily() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [CONFIRMATION_KEY, familyScopedId ?? "", "myMembership"],
    queryFn: async (): Promise<FamilyMembership | null> => {
      if (!actor) return null;
      const result = await actor.getMyMembershipForFamily(familyId);
      return result.__kind__ === "ok" ? result.ok : null;
    },
    enabled: !!actor && !isFetching,
  });
}

/**
 * The REDACTED, applicant-safe confirmation view for the caller's own pending
 * membership in the active family. Returns null when the caller has no
 * membership, the membership is not the caller's, or the read is not
 * authorized. Never exposes a confirmer account principal, sensitive
 * relationship context, or private notes.
 */
export function useMyMembershipConfirmationState(membershipId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      CONFIRMATION_KEY,
      familyScopedId ?? "",
      "applicantState",
      membershipId === null ? "none" : membershipId.toString(),
    ],
    queryFn: async (): Promise<MembershipConfirmationApplicantView | null> => {
      if (!actor || membershipId === null) return null;
      const result = await actor.getMyMembershipConfirmationState(
        familyId,
        membershipId,
      );
      return result.__kind__ === "ok" ? result.ok : null;
    },
    enabled: !!actor && !isFetching && membershipId !== null,
  });
}

/**
 * The signed-in caller's OWN recorded decision for a membership, or null when
 * the caller has not decided. Used by the confirmer card to render the caller's
 * own resolved state without exposing anyone else's decision.
 */
export function useMyConfirmationForMembership(membershipId: bigint | null) {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [
      CONFIRMATION_KEY,
      familyScopedId ?? "",
      "myDecision",
      membershipId === null ? "none" : membershipId.toString(),
    ],
    queryFn: async (): Promise<MembershipConfirmation | null> => {
      if (!actor || membershipId === null) return null;
      const result = await actor.getMyConfirmationForMembership(
        familyId,
        membershipId,
      );
      return result.__kind__ === "ok" ? result.ok : null;
    },
    enabled: !!actor && !isFetching && membershipId !== null,
  });
}

/**
 * The canonical, family-scoped list of confirmation requests the signed-in
 * caller is eligible to act on in the active family.
 *
 * This is the single source of truth for confirmation discovery: the backend
 * derives eligibility from the caller's own `#Active` membership, their
 * `personId`, the active family's confirmed relationships, and each target
 * membership's state — never from notification message text. The returned
 * `EligibleMembershipConfirmationView` carries only family-safe fields (display
 * name, optional photo, optional birth year, simple relationship label, derived
 * case state); it never exposes an account principal or sensitive relationship
 * context.
 *
 * The query is family-scoped: the active family id is always passed to the
 * backend, and `familyScopedId ?? ""` occupies query-key index 1 so the
 * family-exact `membershipConfirmationInvalidation` predicate covers it. A
 * Family A request therefore never appears in Family B's cache.
 */
export function useMyEligibleMembershipConfirmations() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: [CONFIRMATION_KEY, familyScopedId ?? "", "eligible"],
    queryFn: async (): Promise<EligibleMembershipConfirmationView[]> => {
      if (!actor) return [];
      const result =
        await actor.listMyEligibleMembershipConfirmationsForFamily(familyId);
      return result.__kind__ === "ok" ? result.ok : [];
    },
    enabled: !!actor && !isFetching,
  });
}

/** The result of a confirmation submission, normalized for the UI. */
export type ConfirmMembershipOutcome =
  | { kind: "confirmed"; confirmation: MembershipConfirmation }
  | { kind: "disputed"; confirmation: MembershipConfirmation }
  | { kind: "reviewRequired" }
  | { kind: "noLongerNeeded" }
  | { kind: "error"; error: MembershipConfirmationError };

/**
 * Submits the caller's trusted-relative decision about a pending membership in
 * the active family. The confirmer identity and the qualifying relationship are
 * derived server-side; the caller can never spoof another confirmer.
 *
 * The backend returns the recorded confirmation on success. A `#Confirmed`
 * decision that activates the membership is reported as `confirmed`; a
 * `#Disputed` decision that records the dispute and moves the case to Steward
 * review is reported as `disputed`. When the case changed before the caller
 * acted (already Active, already under Steward review, already decided by this
 * user, relationship no longer qualifies, or membership cancelled/left/
 * suspended) the backend returns an error tag that maps to `noLongerNeeded`,
 * which the UI renders as a neutral "no longer needs your confirmation" state
 * with no private reason exposed.
 *
 * The backend echoes the SUBMITTED decision in the returned record, so the
 * echoed decision can never distinguish an activation from a case that stayed
 * at Steward review. The outcome is therefore derived from the resulting
 * membership state: after a `#Confirmed` decision the pending membership is
 * re-read (the confirmer is an approved active member, so
 * `listFamilyMembersForFamily` is authorized) and reported as `confirmed` only
 * when it is now `#Active`. A `#Confirmed` decision on a case that already
 * carries a `#Disputed` leaves the membership `#Pending` at
 * `#StewardReviewRequired`, which is reported as `reviewRequired`.
 *
 * On success only the active family's confirmation request data, the
 * applicant-safe confirmation status, the active family's membership-related
 * status, and the active family's notification count are invalidated — never a
 * bare cross-family prefix.
 */
export function useConfirmPendingMembership() {
  const familyScopedId = useFamilyScopedId();
  const familyId = useActiveFamilyId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      membershipId,
      decision,
    }: {
      membershipId: bigint;
      decision: ConfirmationDecision;
    }): Promise<ConfirmMembershipOutcome> => {
      if (!actor) throw new Error("Backend is not ready");
      const result = await actor.confirmPendingMembership(
        familyId,
        membershipId,
        decision,
      );
      if (result.__kind__ === "ok") {
        // A dispute always records the dispute and moves the case to Steward
        // review; it never activates the membership.
        if (decision === ConfirmationDecision.Disputed) {
          return { kind: "disputed", confirmation: result.ok };
        }
        // A confirmation activates the membership only when the case was still
        // awaiting confirmation. Read the resulting membership state to tell an
        // activation apart from a case that stayed at Steward review. If the
        // read is unavailable, fall back to reporting the confirmation rather
        // than failing the whole submission.
        let membership: FamilyMembership | undefined;
        try {
          const memberships = await actor.listFamilyMembersForFamily(familyId);
          membership =
            memberships.__kind__ === "ok"
              ? memberships.ok.find((m) => m.id === membershipId)
              : undefined;
        } catch {
          membership = undefined;
        }
        return membership && membership.status !== MembershipStatus.Active
          ? { kind: "reviewRequired" }
          : { kind: "confirmed", confirmation: result.ok };
      }
      return { kind: "error", error: result.err };
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
      // The active family's notification count / list. The canonical helper
      // keeps the default family's bare `["notifications"]` prefix (which also
      // covers the concrete `["notifications", "unreadCount", "norwood"]` key)
      // and narrows a non-default family to that family's keys.
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * Maps a confirmation error tag to the neutral "this request no longer needs
 * your confirmation" state. Every case-change error collapses to the same
 * neutral state so no private reason is exposed. `#NotSignedIn` and
 * `#NotAuthorized` are surfaced as errors because they are not case changes.
 */
export function isNoLongerNeededError(
  error: MembershipConfirmationError,
): boolean {
  switch (error) {
    case MembershipConfirmationError.MembershipNotPending:
    case MembershipConfirmationError.AlreadyDecided:
    case MembershipConfirmationError.NoQualifyingRelationship:
    case MembershipConfirmationError.MembershipNotFound:
    case MembershipConfirmationError.FamilyNotFound:
    case MembershipConfirmationError.NoActiveMembership:
    case MembershipConfirmationError.SelfConfirmation:
    case MembershipConfirmationError.ActivationFailed:
      return true;
    default:
      return false;
  }
}

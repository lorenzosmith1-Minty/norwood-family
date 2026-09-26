import { createActor } from "@/backend";
import type { Notification } from "@/backend";
import { useActiveFamilyId, useFamilyScopedId } from "@/context/FamilyContext";
import { useActor } from "@caffeineai/core-infrastructure";
import {
  type InvalidateQueryFilters,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * React Query hooks for the in-app notification workflow, following the
 * existing useActor(createActor) + useQuery/useMutation pattern. Notifications
 * are created for profile-claim and relationship-request activity and are
 * surfaced through the header NotificationBadge and the Notifications page.
 *
 * Every hook is family-aware, following the useRecipes / useBoard /
 * usePendingCount pattern: the active family is read from the centralized
 * FamilyContext and `familyScopedId` is `undefined` for the default family. The
 * default family keeps the exact legacy no-argument call shape and React Query
 * key, while a non-default family routes to the canonical `*ForFamily` endpoint
 * with the familyId appended to the key so caches never collide across
 * families.
 *
 * The unread count has no legacy endpoint, so it always passes the active
 * family id explicitly (default family included) and always includes the
 * familyId in its key. That is required by the generated bindings, not a
 * hard-coded family id.
 *
 * Mutations invalidate family-separated Notification caches. The default family
 * keeps the exact legacy bare-prefix invalidation; a non-default family keeps
 * the same bare prefix (so the recorded filter is unchanged) but adds a
 * predicate that admits only the active family's family-appended keys, so a
 * mutation in one family never marks another family's Notification cache stale.
 */

/**
 * Builds the React Query invalidation filter for a Notification cache.
 *
 * React Query matches `invalidateQueries` by key PREFIX, so a bare
 * `["notifications"]` filter would also match `["notifications", <otherFamily>]`
 * and mark another family's cache stale. The default family keeps the exact
 * legacy bare-prefix filter; a non-default family keeps the same bare prefix but
 * narrows it with a predicate that admits only the active family's keys.
 *
 * The family id sits at a different index per key: the list key is
 * `["notifications", familyId]` (index 1) while the unread-count key is
 * `["notifications", "unreadCount", familyId]` (index 2). The predicate must
 * therefore admit both shapes for the active family — otherwise a mark-read in a
 * non-default family leaves that family's unread count / nav badge stale — while
 * still rejecting every other family's keys.
 */
export function notificationInvalidation(
  familyScopedId: string | undefined,
): InvalidateQueryFilters {
  if (familyScopedId === undefined) {
    return { queryKey: ["notifications"] };
  }
  return {
    queryKey: ["notifications"],
    predicate: (query) =>
      query.queryKey[1] === familyScopedId ||
      (query.queryKey[1] === "unreadCount" &&
        query.queryKey[2] === familyScopedId),
  };
}

/** Lists every notification for the signed-in user in the active family. */
export function useListNotifications() {
  const familyScopedId = useFamilyScopedId();
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey:
      familyScopedId === undefined
        ? ["notifications"]
        : ["notifications", familyScopedId],
    queryFn: async () => {
      if (!actor) return [] as Notification[];
      return familyScopedId === undefined
        ? actor.listNotifications()
        : actor.listNotificationsForFamily(familyScopedId);
    },
    enabled: !!actor && !isFetching,
  });
}

/** Marks a single notification as read in the active family. */
export function useMarkNotificationRead() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return familyScopedId === undefined
        ? actor.markNotificationRead(id)
        : actor.markNotificationReadForFamily(familyScopedId, id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

/**
 * The number of unread notifications for the signed-in user in the active
 * family, used to drive the unread-count badge on the header notification link.
 * Returns 0 when the backend is not ready or the user has no notifications.
 *
 * There is no legacy unread-count endpoint, so the active family id is always
 * passed explicitly (default family included) and always included in the key.
 */
export function useUnreadNotificationCount() {
  const familyId = useActiveFamilyId();
  const { actor, isFetching } = useActor(createActor);
  const { data: count = 0 } = useQuery({
    queryKey: ["notifications", "unreadCount", familyId],
    queryFn: async () => {
      if (!actor) return 0;
      const unread = await actor.unreadNotificationCountForFamily(familyId);
      return Number(unread);
    },
    enabled: !!actor && !isFetching,
  });
  return count;
}

/**
 * Reconciles stale claim notifications for a claim: marks the pending
 * `ProfileClaimRequested` notification for the claimant as read/resolved and
 * ensures the `ProfileClaimReviewed` notification reflects the final claim
 * state. Returns the number of notifications reconciled.
 */
export function useReconcileClaimNotifications() {
  const familyScopedId = useFamilyScopedId();
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (claimId: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.reconcileClaimNotifications(claimId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries(
        notificationInvalidation(familyScopedId),
      );
    },
  });
}

export type { Notification };

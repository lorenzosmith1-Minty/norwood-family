import { createActor } from "@/backend";
import type { Notification } from "@/backend";
import { useActor } from "@caffeineai/core-infrastructure";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * React Query hooks for the in-app notification workflow, following the
 * existing useActor(createActor) + useQuery/useMutation pattern. Notifications
 * are created for profile-claim and relationship-request activity and are
 * surfaced through the header NotificationBadge and the Notifications page.
 */

/** Lists every notification for the signed-in user. */
export function useListNotifications() {
  const { actor, isFetching } = useActor(createActor);
  return useQuery({
    queryKey: ["notifications"],
    queryFn: async () => {
      if (!actor) return [] as Notification[];
      return actor.listNotifications();
    },
    enabled: !!actor && !isFetching,
  });
}

/** Marks a single notification as read. */
export function useMarkNotificationRead() {
  const { actor } = useActor(createActor);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: bigint) => {
      if (!actor) throw new Error("Backend is not ready");
      return actor.markNotificationRead(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
}

/**
 * The number of unread notifications for the signed-in user, used to drive
 * the unread-count badge on the header notification link. Returns 0 when the
 * backend is not ready or the user has no notifications.
 */
export function useUnreadNotificationCount() {
  const { data: notifications = [] } = useListNotifications();
  return notifications.filter((notification) => !notification.read).length;
}

export type { Notification };

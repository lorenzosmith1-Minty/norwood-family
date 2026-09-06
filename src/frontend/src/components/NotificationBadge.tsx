import { useUnreadNotificationCount } from "../hooks/useNotifications";

/**
 * The unread-count badge shown on the header notification link. It reads the
 * signed-in user's unread notification count from the backend and renders a
 * small count pill only when there is at least one unread notification. An
 * explicit `count` prop overrides the backend value for callers that already
 * have the count in hand.
 */
export interface NotificationBadgeProps {
  /** Optional explicit unread count; defaults to the backend-derived count. */
  count?: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps) {
  const derived = useUnreadNotificationCount();
  const unread = count ?? derived;
  if (unread <= 0) return null;

  return (
    <span
      data-ocid="notification_badge"
      aria-label={`${unread} unread notification${unread === 1 ? "" : "s"}`}
      className="notif-badge"
    >
      {unread > 99 ? "99+" : unread}
    </span>
  );
}

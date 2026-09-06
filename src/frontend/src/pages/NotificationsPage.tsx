import { Bell, Check, Inbox } from "lucide-react";
import {
  useListNotifications,
  useMarkNotificationRead,
} from "../hooks/useNotifications";
import { NOTIFICATION_TYPE_LABELS } from "../types/ownership";

/**
 * The in-app notifications page. Lists the signed-in user's notifications
 * (useListNotifications), showing each notification's message, type, and
 * created time with read/unread styling from the notif-* design tokens. Each
 * unread notification can be marked as read (useMarkNotificationRead).
 */

/** Converts a backend nanosecond timestamp to a readable relative time. */
function formatNotificationTime(timestamp: bigint): string {
  const date = new Date(Number(timestamp / 1_000_000n));
  if (Number.isNaN(date.getTime())) return "";
  const now = Date.now();
  const diffMs = now - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year:
      date.getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  });
}

export function NotificationsPage() {
  const { data: notifications = [], isLoading } = useListNotifications();
  const markRead = useMarkNotificationRead();

  const unreadCount = notifications.filter(
    (notification) => !notification.read,
  ).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-6 py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-accent/15 text-accent-foreground">
            <Bell className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
          </span>
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              Notifications
            </h1>
            <p className="text-sm text-muted-foreground">
              {unreadCount > 0
                ? `${unreadCount} unread`
                : "You're all caught up"}
            </p>
          </div>
        </div>
      </header>

      {isLoading ? (
        <div
          data-ocid="notifications.loading_state"
          className="flex flex-col gap-2"
          aria-label="Loading notifications"
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="h-20 animate-pulse rounded-xl border border-border/60 bg-card"
            />
          ))}
        </div>
      ) : notifications.length === 0 ? (
        <div
          data-ocid="notifications.empty_state"
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-card/50 px-6 py-16 text-center"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <Inbox className="h-6 w-6" strokeWidth={1.5} aria-hidden="true" />
          </span>
          <h2 className="font-display text-xl font-semibold text-foreground">
            No notifications yet
          </h2>
          <p className="max-w-sm text-sm text-muted-foreground">
            When someone requests a profile claim or a relationship connection,
            the activity will show up here.
          </p>
        </div>
      ) : (
        <ul data-ocid="notifications.list" className="notif-list">
          {notifications.map((notification, index) => {
            const isUnread = !notification.read;
            const typeLabel =
              NOTIFICATION_TYPE_LABELS[notification.notificationType] ??
              "Notification";
            return (
              <li
                key={notification.id}
                data-ocid={`notifications.item.${index}`}
                className={`notif-item ${isUnread ? "notif-item-unread" : "notif-item-read"}`}
              >
                <span className="notif-dot" aria-hidden="true" />
                <div className="notif-body">
                  <p className="notif-title">{notification.message}</p>
                  <p className="notif-detail">{typeLabel}</p>
                  <p className="notif-time">
                    {formatNotificationTime(notification.createdAt)}
                  </p>
                </div>
                {isUnread ? (
                  <button
                    type="button"
                    data-ocid={`notifications.mark_read_button.${index}`}
                    onClick={() => markRead.mutate(notification.id)}
                    disabled={markRead.isPending}
                    aria-label="Mark as read"
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:border-accent/50 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-60"
                  >
                    <Check
                      className="h-3.5 w-3.5 text-accent-foreground"
                      strokeWidth={2}
                      aria-hidden="true"
                    />
                    Mark read
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

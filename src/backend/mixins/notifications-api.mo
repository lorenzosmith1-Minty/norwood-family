import List "mo:core/List";
import Types "../types/notifications";
import NotificationsLib "../lib/notifications";

mixin (notifications : List.List<Types.Notification>) {
  /// Marks one of the signed-in caller's notifications as read. Returns the
  /// updated notification, or `null` when it does not exist or is not addressed
  /// to the caller.
  public shared ({ caller }) func markNotificationRead(
    id : Types.NotificationId,
  ) : async ?Types.Notification {
    NotificationsLib.markRead(notifications, id, caller);
  };
};

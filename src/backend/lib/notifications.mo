import List "mo:core/List";
import Principal "mo:core/Principal";
import Types "../types/notifications";

module {
  /// Marks a notification as read. Returns the updated notification, or `null`
  /// when the notification does not exist or is not addressed to `recipient`.
  public func markRead(
    notifications : List.List<Types.Notification>,
    id : Types.NotificationId,
    recipient : Principal.Principal,
  ) : ?Types.Notification {
    switch (notifications.find(func n = n.id == id and n.recipient == recipient)) {
      case null { null };
      case (?n) {
        let updated : Types.Notification = { n with read = true };
        let snapshot = notifications.toArray();
        notifications.clear();
        for (item in snapshot.values()) {
          if (item.id == id) { notifications.add(updated) } else { notifications.add(item) };
        };
        ?updated;
      };
    };
  };
};

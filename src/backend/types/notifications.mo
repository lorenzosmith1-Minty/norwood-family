import Ownership "ownership";

module {
  /// Identifier of a single in-app notification.
  public type NotificationId = Nat;

  /// Re-exported from the canonical ownership types so there is exactly ONE
  /// definition of each shared notification type.
  public type NotificationType = Ownership.NotificationType;
  public type Notification = Ownership.Notification;
};

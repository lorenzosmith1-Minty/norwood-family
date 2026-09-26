import Ownership "ownership";

module {
  /// Identifier of a single in-app notification.
  public type NotificationId = Nat;

  /// Re-exported from the canonical ownership types so there is exactly ONE
  /// definition of each shared notification type.
  public type NotificationType = Ownership.NotificationType;
  public type Notification = Ownership.Notification;

  /// Flattened, OQL-exposable view of an in-app notification record. Carries
  /// `familyId` so a notification row is always attributable to its family.
  public type NotificationRow = Ownership.NotificationRow;
};

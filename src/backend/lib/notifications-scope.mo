import Int "mo:core/Int";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Types "../types/notifications";
import FamilyTypes "../types/family";

/// Tenancy 1C-D5-A canonical family-scoped Notification domain logic.
///
/// Every function below takes the requested `familyId` explicitly and evaluates
/// data access against it. A notification is only ever read, counted, created,
/// or mutated when its `familyId` equals the requested family AND its
/// `recipient` is the caller, so a `notificationId` alone never crosses a
/// family boundary. The legacy single-family signatures are retained only as
/// TEMPORARY Tenancy 1C compatibility wrappers that delegate here with
/// `FamilyTypes.DEFAULT_FAMILY_ID`; they contain no logic of their own.
module {
  /// The next notification id: one greater than the largest existing id, or `0`
  /// when there are no notifications. Shared by every notification creation
  /// path so ids stay unique across families.
  public func nextNotificationId(
    notifications : List.List<Types.Notification>,
  ) : Nat {
    var maxId = 0;
    for (notification in notifications.toArray().values()) {
      if (notification.id >= maxId) { maxId := notification.id + 1 };
    };
    maxId;
  };

  /// The single canonical notification creation helper. Requires an explicit
  /// `familyId`; the stored record's `familyId` is exactly that value, never a
  /// default. Returns the created notification.
  public func createForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    recipient : Principal.Principal,
    notificationType : Types.NotificationType,
    message : Text,
    now : Int,
  ) : Types.Notification {
    let notification : Types.Notification = {
      familyId;
      id = nextNotificationId(notifications);
      recipient;
      notificationType;
      message;
      createdAt = now;
      read = false;
    };
    notifications.add(notification);
    notification;
  };

  /// The single canonical deduplicating notification creation helper. Requires
  /// an explicit `familyId`. A notification is only added when no identical
  /// (same family, recipient, type, and message) notification already exists,
  /// so a repeated action never duplicates it. Returns the existing or newly
  /// created notification.
  public func createUniqueForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    recipient : Principal.Principal,
    notificationType : Types.NotificationType,
    message : Text,
    now : Int,
  ) : Types.Notification {
    let existing = notifications.toArray().find(func n =
      n.familyId == familyId and n.recipient == recipient and n.notificationType == notificationType and n.message == message
    );
    switch (existing) {
      case (?notification) { notification };
      case null {
        createForFamily(notifications, familyId, recipient, notificationType, message, now);
      };
    };
  };

  /// Lists the caller's notifications in `familyId`, newest first. Only records
  /// whose `familyId` equals `familyId` and whose `recipient` is `caller` are
  /// returned, so Family A notifications never appear in a Family B read.
  public func listForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal.Principal,
  ) : [Types.Notification] {
    notifications.toArray().filter(func n =
      n.familyId == familyId and n.recipient == caller
    ).sort(func (a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Lists the caller's unread notifications in `familyId`, newest first. Only
  /// records whose `familyId` equals `familyId`, whose `recipient` is `caller`,
  /// and whose `read` is `false` are returned.
  public func listUnreadForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal.Principal,
  ) : [Types.Notification] {
    notifications.toArray().filter(func n =
      n.familyId == familyId and n.recipient == caller and not n.read
    ).sort(func (a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Counts the caller's unread notifications in `familyId`. Only records whose
  /// `familyId` equals `familyId`, whose `recipient` is `caller`, and whose
  /// `read` is `false` are counted, so Family B unread notifications never
  /// inflate a Family A count.
  public func unreadCountForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal.Principal,
  ) : Nat {
    notifications.toArray().filter(func n =
      n.familyId == familyId and n.recipient == caller and not n.read
    ).size();
  };

  /// Returns the caller's notification with `id` in `familyId`, or `null` when
  /// no notification with that id belongs to `familyId` and is addressed to
  /// `caller`. A notification id from another family never resolves here.
  public func getForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    id : Types.NotificationId,
    caller : Principal.Principal,
  ) : ?Types.Notification {
    notifications.toArray().find(func n =
      n.id == id and n.familyId == familyId and n.recipient == caller
    );
  };

  /// Marks the caller's notification with `id` in `familyId` as read. Returns
  /// the updated notification, or `null` when no notification with that id
  /// belongs to `familyId` and is addressed to `caller`. A Family A action can
  /// never mutate a Family B notification.
  public func markReadForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    id : Types.NotificationId,
    caller : Principal.Principal,
  ) : ?Types.Notification {
    switch (getForFamily(notifications, familyId, id, caller)) {
      case null { null };
      case (?notification) {
        let updated : Types.Notification = { notification with read = true };
        replaceNotification(notifications, updated);
        ?updated;
      };
    };
  };

  /// Marks every unread notification addressed to `caller` in `familyId` as
  /// read. Returns the number of notifications marked. Notifications in other
  /// families are never touched.
  public func markAllReadForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal.Principal,
  ) : Nat {
    var marked = 0;
    let snapshot = notifications.toArray();
    notifications.clear();
    for (notification in snapshot.values()) {
      if (notification.familyId == familyId and notification.recipient == caller and not notification.read) {
        notifications.add({ notification with read = true });
        marked += 1;
      } else {
        notifications.add(notification);
      };
    };
    marked;
  };

  /// Dismisses (deletes) the caller's notification with `id` in `familyId`.
  /// Returns `true` when a matching notification was removed, `false` when none
  /// belongs to `familyId` and is addressed to `caller`. A Family A action can
  /// never delete a Family B notification.
  public func dismissForFamily(
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    id : Types.NotificationId,
    caller : Principal.Principal,
  ) : Bool {
    var removed = false;
    let snapshot = notifications.toArray();
    notifications.clear();
    for (notification in snapshot.values()) {
      if (notification.id == id and notification.familyId == familyId and notification.recipient == caller) {
        removed := true;
      } else {
        notifications.add(notification);
      };
    };
    removed;
  };

  /// Flattens every in-app notification record into OQL-exposable rows. The row
  /// carries `familyId`, so a notification row is always attributable to its
  /// family.
  public func notificationRows(
    notifications : List.List<Types.Notification>,
  ) : Iter.Iter<Types.NotificationRow> {
    notifications.toArray().values().map(func notification = {
      familyId = notification.familyId;
      id = notification.id;
      recipient = notification.recipient.toText();
      notificationType = notificationTypeText(notification.notificationType);
      message = notification.message;
      createdAt = notification.createdAt;
      read = notification.read;
    });
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listForFamily`.
  public func listNotifications(
    notifications : List.List<Types.Notification>,
    caller : Principal.Principal,
  ) : [Types.Notification] {
    listForFamily(notifications, FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `markReadForFamily`.
  public func markRead(
    notifications : List.List<Types.Notification>,
    id : Types.NotificationId,
    recipient : Principal.Principal,
  ) : ?Types.Notification {
    markReadForFamily(notifications, FamilyTypes.DEFAULT_FAMILY_ID, id, recipient);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /// Replaces the stored notification with the same id, preserving list order.
  func replaceNotification(
    notifications : List.List<Types.Notification>,
    updated : Types.Notification,
  ) {
    let snapshot = notifications.toArray();
    notifications.clear();
    for (notification in snapshot.values()) {
      if (notification.id == updated.id) { notifications.add(updated) } else { notifications.add(notification) };
    };
  };

  /// Renders a notification type as its tag text for OQL rows.
  func notificationTypeText(notificationType : Types.NotificationType) : Text {
    switch (notificationType) {
      case (#ProfileClaimRequested) "ProfileClaimRequested";
      case (#ProfileClaimReviewed) "ProfileClaimReviewed";
      case (#RelationshipRequested) "RelationshipRequested";
      case (#RelationshipReviewed) "RelationshipReviewed";
      case (#BoardReply) "BoardReply";
      case (#BoardMention) "BoardMention";
      case (#NewMessage) "NewMessage";
      case (#ResearchSubmission) "ResearchSubmission";
      case (#ResearchApproved) "ResearchApproved";
      case (#ResearchRejected) "ResearchRejected";
      case (#ArchiveApproved) "ArchiveApproved";
      case (#ArchiveRejected) "ArchiveRejected";
    };
  };
};

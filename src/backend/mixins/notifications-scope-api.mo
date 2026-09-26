import List "mo:core/List";
import Types "../types/notifications";
import FamilyTypes "../types/family";
import NotificationsScopeLib "../lib/notifications-scope";

/// Tenancy 1C-D5-A canonical family-scoped Notification public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. A
/// notification is only ever read, counted, or mutated when its `familyId`
/// equals the requested family AND its `recipient` is the caller, so a
/// `notificationId` alone never crosses a family boundary and Family A
/// notifications never appear in a Family B read or count.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (notifications : List.List<Types.Notification>) {
  /// Lists the signed-in caller's notifications in `familyId`, newest first.
  /// Only notifications whose `familyId` equals `familyId` and whose recipient
  /// is the caller are returned.
  public query ({ caller }) func listNotificationsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Notification] {
    NotificationsScopeLib.listForFamily(notifications, familyId, caller);
  };

  /// Lists the signed-in caller's unread notifications in `familyId`, newest
  /// first. Only notifications whose `familyId` equals `familyId`, whose
  /// recipient is the caller, and whose `read` is `false` are returned.
  public query ({ caller }) func listUnreadNotificationsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Notification] {
    NotificationsScopeLib.listUnreadForFamily(notifications, familyId, caller);
  };

  /// Counts the signed-in caller's unread notifications in `familyId`. Only
  /// notifications whose `familyId` equals `familyId`, whose recipient is the
  /// caller, and whose `read` is `false` are counted.
  public query ({ caller }) func unreadNotificationCountForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async Nat {
    NotificationsScopeLib.unreadCountForFamily(notifications, familyId, caller);
  };

  /// Returns the signed-in caller's notification with `id` in `familyId`, or
  /// `null` when no notification with that id belongs to `familyId` and is
  /// addressed to the caller. A notification id from another family never
  /// resolves here.
  public query ({ caller }) func getNotificationForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.NotificationId,
  ) : async ?Types.Notification {
    NotificationsScopeLib.getForFamily(notifications, familyId, id, caller);
  };

  /// Marks the signed-in caller's notification with `id` in `familyId` as read.
  /// Returns the updated notification, or `null` when no notification with that
  /// id belongs to `familyId` and is addressed to the caller. A Family A action
  /// can never mutate a Family B notification.
  public shared ({ caller }) func markNotificationReadForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.NotificationId,
  ) : async ?Types.Notification {
    NotificationsScopeLib.markReadForFamily(notifications, familyId, id, caller);
  };

  /// Marks every unread notification addressed to the signed-in caller in
  /// `familyId` as read. Returns the number of notifications marked.
  /// Notifications in other families are never touched.
  public shared ({ caller }) func markAllNotificationsReadForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async Nat {
    NotificationsScopeLib.markAllReadForFamily(notifications, familyId, caller);
  };

  /// Dismisses (deletes) the signed-in caller's notification with `id` in
  /// `familyId`. Returns `true` when a matching notification was removed,
  /// `false` when none belongs to `familyId` and is addressed to the caller. A
  /// Family A action can never delete a Family B notification.
  public shared ({ caller }) func dismissNotificationForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.NotificationId,
  ) : async Bool {
    NotificationsScopeLib.dismissForFamily(notifications, familyId, id, caller);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listNotificationsForFamily`.
  public query ({ caller }) func listNotifications() : async [Types.Notification] {
    NotificationsScopeLib.listForFamily(notifications, FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `markNotificationReadForFamily`.
  public shared ({ caller }) func markNotificationRead(
    id : Types.NotificationId,
  ) : async ?Types.Notification {
    NotificationsScopeLib.markReadForFamily(notifications, FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };
};

import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-D5-A: family-scope in-app Notifications.
  //
  // Adds a `familyId` field to every `Notification`. Every pre-existing
  // notification migrates to familyId = "norwood", matching the default family
  // that owns all pre-tenancy data. Existing ids, recipients, notification
  // types, messages, creation timestamps, and read state are preserved as-is.
  // No reset, no reseed, and no duplicate entries: the list is rebuilt exactly
  // once from the old list, so a repeated upgrade is idempotent. No other stable
  // collection changes shape — every other collection carries through unchanged.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldNotification = {
    id : Nat;
    recipient : Principal;
    notificationType : {
      #ProfileClaimRequested;
      #ProfileClaimReviewed;
      #RelationshipRequested;
      #RelationshipReviewed;
      #BoardReply;
      #BoardMention;
      #NewMessage;
      #ResearchSubmission;
      #ResearchApproved;
      #ResearchRejected;
      #ArchiveApproved;
      #ArchiveRejected;
    };
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type NewNotification = {
    familyId : FamilyId;
    id : Nat;
    recipient : Principal;
    notificationType : {
      #ProfileClaimRequested;
      #ProfileClaimReviewed;
      #RelationshipRequested;
      #RelationshipReviewed;
      #BoardReply;
      #BoardMention;
      #NewMessage;
      #ResearchSubmission;
      #ResearchApproved;
      #ResearchRejected;
      #ArchiveApproved;
      #ArchiveRejected;
    };
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    notifications : List.List<OldNotification>;
  };

  type NewActor = {
    notifications : List.List<NewNotification>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let notifications = List.empty<NewNotification>();
    for (n in old.notifications.toArray().values()) {
      notifications.add({
        familyId = defaultFamilyId;
        id = n.id;
        recipient = n.recipient;
        notificationType = n.notificationType;
        message = n.message;
        createdAt = n.createdAt;
        read = n.read;
      });
    };

    { notifications };
  };
};

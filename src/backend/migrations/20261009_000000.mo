import List "mo:core/List";

module {
  // ---------------------------------------------------------------------------
  // Phase 4D: Recovery notifications.
  //
  // The canonical `NotificationType` gains four recovery variants
  // (#RecoveryRequestSubmitted, #RecoveryApproved, #RecoveryVerificationRecorded,
  // #RecoveryRejected). Because `NotificationType` is nested inside the stable
  // `notifications : List<Notification>` field, adding variant constructors is
  // not an implicit stable-compatible change: the deployed signature's nested
  // variant type must be widened explicitly.
  //
  // This migration is additive only. Every existing notification is carried
  // through unchanged; only its `notificationType` is widened to the new variant
  // type. No notification is created, dropped, reseeded, or reordered, and no
  // other stable collection is read or modified (subset form).
  //
  // `OldActor` is the `NewActor` of the preceding migration
  // (20261008_000000.mo), which declared the three recovery collections; none of
  // the existing fields change here, so only `notifications` is declared.
  // ---------------------------------------------------------------------------

  type OldNotificationType = {
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

  type NewNotificationType = {
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
    #RecoveryRequestSubmitted;
    #RecoveryApproved;
    #RecoveryVerificationRecorded;
    #RecoveryRejected;
  };

  type OldNotification = {
    familyId : Text;
    id : Nat;
    recipient : Principal;
    notificationType : OldNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type NewNotification = {
    familyId : Text;
    id : Nat;
    recipient : Principal;
    notificationType : NewNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type OldActor = {
    notifications : List.List<OldNotification>;
  };

  type NewActor = {
    notifications : List.List<NewNotification>;
  };

  public func migration(old : OldActor) : NewActor {
    {
      notifications = old.notifications.map(
        func(n) {
          {
            familyId = n.familyId;
            id = n.id;
            recipient = n.recipient;
            notificationType = n.notificationType : NewNotificationType;
            message = n.message;
            createdAt = n.createdAt;
            read = n.read;
          };
        }
      );
    };
  };
};

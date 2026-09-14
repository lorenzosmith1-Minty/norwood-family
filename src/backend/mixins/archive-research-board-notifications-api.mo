import Result "mo:core/Result";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Storage "mo:caffeineai-object-storage/Storage";
import AccessControl "mo:caffeineai-authorization/access-control";
import ArchiveTypes "../types/archive";
import ResearchIntakeTypes "../types/research-intake";
import BoardTypes "../types/board";
import OwnershipTypes "../types/ownership";
import Types "../types/archive-research-board-notifications";
import Lib "../lib/archive-research-board-notifications";

/// Public API for the cross-cutting archive / research-intake / board /
/// notifications features: archive tag search, research source upload that
/// creates a canonical Archive item, board posts with media attachments, and
/// stale claim notification reconciliation.
mixin (
  accessControlState : AccessControl.AccessControlState,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  researchSources : List.List<ResearchIntakeTypes.SourceRecord>,
  researchState : { var nextSourceId : Nat },
  posts : List.List<BoardTypes.Post>,
  notifications : List.List<OwnershipTypes.Notification>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
) {
  /// Traps unless the caller is a signed-in approved family member.
  func requireBoardMemberForMedia(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only approved family members can access the message board");
    };
  };

  /// Computes the next board post id: one greater than the largest existing id,
  /// or `0` when there are no posts.
  func nextPostId() : Nat {
    var maxId = 0;
    for (p in posts.toArray().values()) {
      if (p.postId >= maxId) { maxId := p.postId + 1 };
    };
    maxId;
  };

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Searches/filters approved archive items by title query, tags, item type,
  /// related family member, and era. Returns only `#Approved` items visible to
  /// the caller under the archive privacy rules.
  public query ({ caller }) func searchArchiveItems(filter : Types.ArchiveSearchFilter) : async [ArchiveTypes.ArchiveItem] {
    let isAdmin = AccessControl.isAdmin(accessControlState, caller);
    let isApprovedFamilyMember = isAdmin or claims.toArray().any(func c = c.requestingUserId == caller and c.status == #Approved);
    Lib.searchArchiveItems(archiveItems, filter, caller, isAdmin, isApprovedFamilyMember);
  };

  /// Uploads a research source file: creates one canonical Archive item
  /// (pending) and links a new Research Source record to it, so no manually
  /// typed Archive Item ID is required. Requires a signed-in caller; the caller
  /// is recorded as the contributor of both records.
  public shared ({ caller }) func createSourceWithUpload(
    title : Text,
    sourceType : ResearchIntakeTypes.SourceType,
    description : Text,
    blob : Storage.ExternalBlob,
    tags : [Text],
    era : Text,
    year : ?Nat,
    relatedMemberIds : [Text],
    privacyLevel : ArchiveTypes.PrivacyLevel,
    classification : ArchiveTypes.ArchiveItemClassification,
    primarySpeaker : ?ArchiveTypes.OralHistorySpeaker,
  ) : async Result.Result<Types.SourceUploadResult, ResearchIntakeTypes.ResearchError> {
    if (caller.isAnonymous()) {
      return #err(#notAuthorized);
    };
    if (classification == #OralHistory and primarySpeaker == null) {
      return #err(#invalidState("A primary speaker is required for Oral History items"));
    };
    if (classification == #Standard and primarySpeaker != null) {
      return #err(#invalidState("A primary speaker is only allowed on Oral History items"));
    };
    let result = Lib.createSourceWithUpload(
      archiveItems,
      researchSources,
      researchState,
      title,
      sourceType,
      description,
      blob,
      tags,
      era,
      year,
      relatedMemberIds,
      privacyLevel,
      classification,
      primarySpeaker,
      caller,
      Time.now(),
    );
    // Notify the contributor that the research submission awaits steward review.
    let exists = notifications.toArray().any(func n = n.recipient == caller and n.notificationType == #ResearchSubmission and n.message == "Your research submission is awaiting Family Steward review.");
    if (not exists) {
      notifications.add({
        id = nextNotificationId();
        recipient = caller;
        notificationType = #ResearchSubmission;
        message = "Your research submission is awaiting Family Steward review.";
        createdAt = Time.now();
        read = false;
      });
    };
    #ok(result);
  };

  /// Creates a board post that attaches existing Archive items (by id) and/or
  /// new uploads. Each new upload creates one canonical Archive item (pending)
  /// linked to the post; the underlying file is never duplicated. Approved
  /// family members only.
  public shared ({ caller }) func createBoardPostWithMedia(
    postType : BoardTypes.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    existingArchiveItemIds : [Nat],
    newUploads : [Types.BoardMediaUpload],
    tags : [Text],
  ) : async BoardTypes.Post {
    requireBoardMemberForMedia(caller);
    let post : BoardTypes.Post = {
      postId = nextPostId();
      authorAccountId = caller;
      authorPersonId = caller.toText();
      title;
      body;
      postType;
      relatedPersonIds;
      linkedMediaIds = [];
      tags;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Active;
      privacyScope = #FamilyOnly;
    };
    Lib.createBoardPostWithMedia(posts, archiveItems, post, existingArchiveItemIds, newUploads);
  };

  /// Reconciles stale claim notifications for a claim: when the claim is
  /// `#Approved`, marks the pending `#ProfileClaimRequested` notification for
  /// the claimant as read/resolved. The profile status stays `#Claimed` and no
  /// new claim is created. Returns the number of notifications reconciled.
  public shared ({ caller }) func reconcileClaimNotifications(claimId : Nat) : async Nat {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    switch (claims.find(func c = c.id == claimId)) {
      case null { 0 };
      case (?claim) {
        if (claim.status != #Approved) {
          0;
        } else {
          Lib.reconcileClaimNotifications(notifications, claim);
        };
      };
    };
  };
};

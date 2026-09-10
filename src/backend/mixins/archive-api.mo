import AccessControl "mo:caffeineai-authorization/access-control";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Storage "mo:caffeineai-object-storage/Storage";
import Time "mo:core/Time";
import Types "../types/archive";
import ArchiveLib "../lib/archive";

mixin (
  accessControlState : AccessControl.AccessControlState,
  items : List.List<Types.ArchiveItem>,
) {
  /// Computes the next archive item id: one greater than the largest existing
  /// id, or `0` when the archive is empty.
  func nextArchiveItemId() : Types.ArchiveItemId {
    var maxId = 0;
    for (item in items.toArray().values()) {
      if (item.id >= maxId) { maxId := item.id + 1 };
    };
    maxId;
  };

  /// Submits a new archive item. Requires sign-in; the signed-in caller is
  /// recorded as the contributor. The item is stored in pending state and waits
  /// for admin approval before appearing in the archive.
  ///
  /// `classification` marks the item as Oral History (distinct from `itemType`).
  /// When `#OralHistory`, `primarySpeaker` is required (exactly one primary
  /// speaker); when `#Standard`, `primarySpeaker` must be `null`. The reserved
  /// future-ready fields (transcript, searchable transcript, chapter markers,
  /// AI summary, extracted names) are initialized to `null` and are not
  /// populated by any logic yet.
  public shared ({ caller }) func submitArchiveItem(
    title : Text,
    description : Text,
    itemType : Types.ArchiveItemType,
    blob : Storage.ExternalBlob,
    era : Text,
    year : ?Nat,
    tags : [Text],
    relatedMemberIds : [Text],
    relatedBranchId : ?Text,
    sourceStatus : Types.SourceStatus,
    privacyLevel : Types.PrivacyLevel,
    classification : Types.ArchiveItemClassification,
    primarySpeaker : ?Types.OralHistorySpeaker,
  ) : async Types.ArchiveItem {
    if (caller.isAnonymous()) {
      Runtime.trap("Sign-in required to submit an archive item");
    };
    if (classification == #OralHistory and primarySpeaker == null) {
      Runtime.trap("A primary speaker is required for Oral History items");
    };
    if (classification == #Standard and primarySpeaker != null) {
      Runtime.trap("A primary speaker is only allowed on Oral History items");
    };
    let item : Types.ArchiveItem = {
      id = nextArchiveItemId();
      title;
      description;
      itemType;
      blob;
      era;
      year;
      tags;
      contributor = caller;
      relatedMemberIds;
      relatedBranchId;
      sourceStatus;
      privacyLevel;
      status = #Pending;
      createdAt = Time.now();
      classification;
      primarySpeaker;
      transcript = null;
      searchableTranscript = null;
      chapterMarkers = null;
      aiSummary = null;
      extractedNames = null;
    };
    ArchiveLib.submit(items, item);
  };

  /// Lists all archive items in pending state (admin only).
  public query ({ caller }) func listPendingArchiveItems() : async [Types.ArchiveItem] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can list pending archive items");
    };
    ArchiveLib.listPending(items);
  };

  /// Approves a pending archive item (admin only). Returns the updated item, or
  /// `null` when the item does not exist or is not pending.
  public shared ({ caller }) func approveArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can approve archive items");
    };
    ArchiveLib.approve(items, id);
  };

  /// Rejects a pending archive item (admin only). Returns the updated item, or
  /// `null` when the item does not exist or is not pending.
  public shared ({ caller }) func rejectArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only admins can reject archive items");
    };
    ArchiveLib.reject(items, id);
  };

  /// Lists all archive items in approved state (visible in the archive).
  public query func listApprovedArchiveItems() : async [Types.ArchiveItem] {
    ArchiveLib.listApproved(items);
  };
};

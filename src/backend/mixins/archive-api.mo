import List "mo:core/List";
import Runtime "mo:core/Runtime";
import Storage "mo:caffeineai-object-storage/Storage";
import Time "mo:core/Time";
import Types "../types/archive";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import StewardAuthorityLib "../lib/steward-authority";

mixin (
  items : List.List<Types.ArchiveItem>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
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

  /// Submits a new archive item. Requires an approved family member; the caller
  /// is recorded as the contributor. The item is stored in pending state and
  /// waits for admin approval before appearing in the archive.
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
    FamilyAuthorizationLib.requireApprovedFamilyMember(stewards, claims, caller);
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
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
    ArchiveLib.listPending(items);
  };

  /// Approves a pending archive item (admin only). Returns the updated item, or
  /// `null` when the item does not exist or is not pending.
  public shared ({ caller }) func approveArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
    ArchiveLib.approve(items, id);
  };

  /// Rejects a pending archive item (admin only). Returns the updated item, or
  /// `null` when the item does not exist or is not pending.
  public shared ({ caller }) func rejectArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
    ArchiveLib.reject(items, id);
  };

  /// Lists all archive items in approved state visible to the caller. Privacy
  /// is enforced server-side: guests and non-approved members see only Public
  /// items; FamilyOnly items require approved family membership; Private items
  /// are visible only to their contributor or an admin.
  public query ({ caller }) func listApprovedArchiveItems() : async [Types.ArchiveItem] {
    ArchiveLib.listApproved(
      items,
      caller,
      StewardAuthorityLib.isActiveSteward(stewards, caller),
      FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller),
    );
  };
};

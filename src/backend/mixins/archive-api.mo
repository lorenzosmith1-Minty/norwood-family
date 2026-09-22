import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Set "mo:core/Set";
import Storage "mo:caffeineai-object-storage/Storage";
import Time "mo:core/Time";
import Types "../types/archive";
import ResearchTypes "../types/research-intake";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import StewardAuthorityLib "../lib/steward-authority";
import InputValidation "../lib/input-validation";
import InputValidationTypes "../types/input-validation";

mixin (
  items : List.List<Types.ArchiveItem>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  notifications : List.List<OwnershipTypes.Notification>,
  sources : List.List<ResearchTypes.SourceRecord>,
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

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextArchiveNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Appends an archive review notification for the given recipient, avoiding
  /// duplicates. A notification is only added when no identical (same
  /// recipient, type, and message) notification already exists, so a repeated
  /// approve/reject call on an already-reviewed item never duplicates it.
  func addArchiveNotification(recipient : Principal, notificationType : OwnershipTypes.NotificationType, message : Text) {
    let exists = notifications.toArray().any(func n = n.recipient == recipient and n.notificationType == notificationType and n.message == message);
    if (not exists) {
      notifications.add({
        id = nextArchiveNotificationId();
        recipient;
        notificationType;
        message;
        createdAt = Time.now();
        read = false;
      });
    };
  };

  /// Maps an archive item type to the upload surface whose MIME allowlist and
  /// byte ceiling apply. The itemType is not trusted on its own: the caller's
  /// MIME type must be allowed for the surface the itemType selects, so a
  /// `#Photo` item cannot carry a video and a `#Video` item cannot carry an
  /// image. `#WrittenStoryNote`, `#Research`, `#WorkBusiness`, and `#Other`
  /// accept documents (PDF, plain text, CSV, or Word/Excel).
  func archiveSurfaceFor(itemType : Types.ArchiveItemType) : InputValidationTypes.UploadSurface {
    switch (itemType) {
      case (#Photo) #ArchiveImage;
      case (#Document) #ArchiveDocument;
      case (#Audio) #ArchiveAudio;
      case (#Video) #ArchiveVideo;
      case (#WrittenStoryNote) #ArchiveDocument;
      case (#Research) #ArchiveDocument;
      case (#WorkBusiness) #ArchiveDocument;
      case (#Other) #ArchiveDocument;
    };
  };

  /// Submits a new archive item. Requires an approved family member; the caller
  /// is recorded as the contributor. The item is stored in pending state and
  /// waits for admin approval before appearing in the archive.
  public shared ({ caller }) func submitArchiveItem(
    title : Text,
    description : Text,
    itemType : Types.ArchiveItemType,
    mimeType : Text,
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
    filename : Text,
  ) : async Types.ArchiveItem {
    FamilyAuthorizationLib.requireApprovedFamilyMember(stewards, claims, caller);
    if (classification == #OralHistory and primarySpeaker == null) {
      Runtime.trap("A primary speaker is required for Oral History items");
    };
    if (classification == #Standard and primarySpeaker != null) {
      Runtime.trap("A primary speaker is only allowed on Oral History items");
    };
    // Feature/content-type consistency: the archive item type determines which
    // upload surface (and therefore which MIME allowlist and byte ceiling)
    // applies. The itemType is not trusted on its own — the MIME type must be
    // allowed for the surface the itemType selects.
    InputValidation.requireUpload(archiveSurfaceFor(itemType), mimeType, blob);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    // Era is an optional field in the UI: an empty/whitespace-only value is
    // allowed and stored as "", a non-empty value is trimmed and bounded, and an
    // overlong value is rejected rather than silently truncated.
    let cleanEra = InputValidation.requireOptionalOrEmptyText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanTags = InputValidation.requireTags(tags);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanBranch = InputValidation.requireOptionalText("relatedBranchId", relatedBranchId, InputValidation.MAX_LOCATION_CHARS);
    let cleanFilename = InputValidation.requireFilename(filename);
    let item : Types.ArchiveItem = {
      familyId = FamilyTypes.DEFAULT_FAMILY_ID;
      id = nextArchiveItemId();
      title = cleanTitle;
      description = cleanDescription;
      itemType;
      blob;
      mimeType = ?InputValidation.normalizeMimeType(mimeType);
      filename = ?cleanFilename;
      era = cleanEra;
      year;
      tags = cleanTags;
      contributor = caller;
      relatedMemberIds = cleanRelated;
      relatedBranchId = cleanBranch;
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

  /// Lists all archive items in pending state (admin only). Pending items whose
  /// id is referenced by a Research Source are excluded: those are reviewed
  /// through the Research Intake queue, so approving or rejecting the Source
  /// cascades to the linked Archive item and the item is never actionable here.
  /// Ordinary archive contributions remain listed unchanged.
  public query ({ caller }) func listPendingArchiveItems() : async [Types.ArchiveItem] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
    let linkedIds = Set.empty<Types.ArchiveItemId>();
    for (s in sources.toArray().values()) {
      switch (s.archiveItemId) {
        case (?archiveItemId) { linkedIds.add(archiveItemId) };
        case null {};
      };
    };
    ArchiveLib.listPending(items, linkedIds);
  };

  /// Approves a pending archive item (admin only). Returns the updated item, or
  /// `null` when the item does not exist or is not pending. On the actual
  /// transition out of pending, notifies only the contributor; a repeated call
  /// on an already-reviewed item returns `null` and creates no notification.
  public shared ({ caller }) func approveArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
    switch (ArchiveLib.approve(items, id)) {
      case (?updated) {
        addArchiveNotification(
          updated.contributor,
          #ArchiveApproved,
          "Your archive contribution \"" # updated.title # "\" was approved.",
        );
        ?updated;
      };
      case null { null };
    };
  };

  /// Rejects a pending archive item (admin only). Returns the updated item, or
  /// `null` when the item does not exist or is not pending. The rejected record
  /// is retained, not deleted. On the actual transition out of pending, notifies
  /// only the contributor; a repeated call on an already-reviewed item returns
  /// `null` and creates no notification.
  public shared ({ caller }) func rejectArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
    switch (ArchiveLib.reject(items, id)) {
      case (?updated) {
        addArchiveNotification(
          updated.contributor,
          #ArchiveRejected,
          "Your archive contribution \"" # updated.title # "\" was not approved.",
        );
        ?updated;
      };
      case null { null };
    };
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

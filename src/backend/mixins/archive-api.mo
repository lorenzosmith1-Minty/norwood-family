import List "mo:core/List";
import Map "mo:core/Map";
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
import ResearchSourceScopeLib "../lib/research-source-scope";
import FamilyAuthorizationLib "../lib/family-authorization";
import InputValidation "../lib/input-validation";
import InputValidationTypes "../types/input-validation";

/// Tenancy 1C-B1 family-scoped archive public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Member
/// access resolves through `isApprovedFamilyMemberForFamily` /
/// `requireApprovedFamilyMemberForFamily`; Steward access resolves through
/// `isActiveStewardForFamily` / `requireActiveStewardForFamily`. Every returned
/// or mutated record must carry `ArchiveItem.familyId == familyId`, so an
/// `archiveItemId` alone never crosses a family boundary.
///
/// The legacy single-family endpoints are retained only as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  items : List.List<Types.ArchiveItem>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
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

  /// Builds the set of archive item ids referenced by a Research Source **in
  /// `familyId`**. Those items are reviewed through the Research Intake queue,
  /// so they are excluded from ordinary Pending Contributions. Only a source
  /// whose `familyId` equals `familyId` contributes its `archiveItemId`, so a
  /// Research Source in Family A suppresses only its linked Archive A item and
  /// leaves Family B items unaffected. Shared by the family-scoped pending list
  /// and its temporary compatibility wrapper so the two never diverge.
  func researchLinkedArchiveIds(familyId : FamilyTypes.FamilyId) : Set.Set<Types.ArchiveItemId> {
    ResearchSourceScopeLib.researchLinkedArchiveIdsForFamily(sources, familyId);
  };

  /// Validates and normalizes a family-scoped archive submission, then stores
  /// it. Shared by the family-scoped endpoint and its temporary compatibility
  /// wrapper so MIME, size, filename, and text validation never diverge. The
  /// stored item's `familyId` is the requested `familyId`, and every
  /// `relatedMemberIds` entry must belong to that same family.
  func submitArchiveItemForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
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
    caller : Principal,
  ) : Types.ArchiveItem {
    if (classification == #OralHistory and primarySpeaker == null) {
      Runtime.trap("A primary speaker is required for Oral History items");
    };
    if (classification == #Standard and primarySpeaker != null) {
      Runtime.trap("A primary speaker is only allowed on Oral History items");
    };
    // Feature/content-type consistency: the itemType is not trusted on its own,
    // so the caller's MIME type must be allowed for the surface the itemType
    // selects. The byte ceiling for that surface is enforced too.
    InputValidation.requireUpload(archiveSurfaceFor(itemType), mimeType, blob);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    // Era is optional: an empty/whitespace-only value is stored as "", a
    // non-empty value is trimmed and bounded, and an overlong value is rejected
    // rather than silently truncated.
    let cleanEra = InputValidation.requireOptionalOrEmptyText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanTags = InputValidation.requireTags(tags);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanFilename = InputValidation.requireFilename(filename);
    // Every related person must belong to the requested family: Family A may
    // never reference Family B people. The canonical `requirePeopleInFamily`
    // predicate accepts a person tracked in `familyId` (which keeps the seeded
    // Norwood profiles with no claim working exactly as before) or one with an
    // approved claim in `familyId`, and rejects a person that exists only in
    // another family.
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    ArchiveLib.submitForFamily(
      items,
      {
        familyId;
        title = cleanTitle;
        description = cleanDescription;
        itemType;
        mimeType = InputValidation.normalizeMimeType(mimeType);
        blob;
        era = cleanEra;
        year;
        tags = cleanTags;
        relatedMemberIds = cleanRelated;
        relatedBranchId;
        sourceStatus;
        privacyLevel;
        classification;
        primarySpeaker;
        filename = cleanFilename;
      },
      caller,
      Time.now(),
    );
  };

  /// Submits a new archive item into `familyId`. Requires an approved member or
  /// active Steward of `familyId`; the caller is recorded as the contributor.
  /// The stored item's `familyId` is the requested `familyId`, and every
  /// `relatedMemberIds` entry must belong to that same family — Family A may
  /// never reference Family B people. The item is stored in pending state and
  /// waits for Steward approval before appearing in the archive.
  public shared ({ caller }) func submitArchiveItemForFamily(
    familyId : FamilyTypes.FamilyId,
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
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    submitArchiveItemForFamilyInternal(
      familyId,
      title,
      description,
      itemType,
      mimeType,
      blob,
      era,
      year,
      tags,
      relatedMemberIds,
      relatedBranchId,
      sourceStatus,
      privacyLevel,
      classification,
      primarySpeaker,
      filename,
      caller,
    );
  };

  /// Lists all archive items in `familyId` in pending state. Requires an active
  /// Steward of `familyId`. Pending items whose id is referenced by a Research
  /// Source are excluded: those are reviewed through the Research Intake queue,
  /// so approving or rejecting the Source cascades to the linked Archive item
  /// and the item is never actionable here. Only items whose `familyId` equals
  /// `familyId` are returned.
  public query ({ caller }) func listPendingArchiveItemsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.ArchiveItem] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    ArchiveLib.listPendingForFamily(items, familyId, researchLinkedArchiveIds(familyId));
  };

  /// Approves the pending archive item with `id` in `familyId`. Requires an
  /// active Steward of `familyId`; a Steward of another family cannot approve
  /// it. Returns the updated item, or `null` when no pending item with that id
  /// belongs to `familyId`. On the actual transition out of pending, notifies
  /// only the contributor; a repeated call on an already-reviewed item returns
  /// `null` and creates no notification.
  public shared ({ caller }) func approveArchiveItemForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    switch (ArchiveLib.approveForFamily(items, familyId, id)) {
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

  /// Rejects the pending archive item with `id` in `familyId`. Requires an
  /// active Steward of `familyId`; a Steward of another family cannot reject
  /// it. Returns the updated item, or `null` when no pending item with that id
  /// belongs to `familyId`. The rejected record is retained, not deleted. On the
  /// actual transition out of pending, notifies only the contributor; a repeated
  /// call on an already-reviewed item returns `null` and creates no
  /// notification.
  public shared ({ caller }) func rejectArchiveItemForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    switch (ArchiveLib.rejectForFamily(items, familyId, id)) {
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

  /// Lists all archive items in `familyId` in approved state visible to the
  /// caller. Privacy is enforced server-side: guests and non-approved members
  /// see only Public items; FamilyOnly items require approved family membership
  /// in `familyId`; Private items are visible only to their contributor or an
  /// active Steward of `familyId`. Only items whose `familyId` equals
  /// `familyId` are returned.
  public query ({ caller }) func listApprovedArchiveItemsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.ArchiveItem] {
    let isApprovedFamilyMember = FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    ArchiveLib.listApprovedForFamily(items, familyId, caller, false, isApprovedFamilyMember);
  };

  /// Returns the archive item with `id` when it belongs to `familyId` and is
  /// visible to the caller under the archive privacy rules, or `null`
  /// otherwise. Requires an approved member or active Steward of `familyId`. A
  /// record that exists under another family is never returned, so an
  /// `archiveItemId` alone cannot cross the family boundary.
  public query ({ caller }) func getArchiveItemForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    let isApprovedFamilyMember = FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    switch (ArchiveLib.getForFamily(items, familyId, id)) {
      case (?item) {
        if (ArchiveLib.isVisibleForFamily(item, familyId, caller, false, isApprovedFamilyMember)) {
          ?item;
        } else {
          null;
        };
      };
      case null { null };
    };
  };

  /// Searches/filters approved archive items in `familyId` by title query, tags,
  /// item type, related family member, and era. Requires an approved member or
  /// active Steward of `familyId`. Returns only `#Approved` items whose
  /// `familyId` equals `familyId` and that are visible to the caller under the
  /// archive privacy rules.
  public query ({ caller }) func searchArchiveItemsForFamily(
    familyId : FamilyTypes.FamilyId,
    filter : Types.ArchiveSearchQuery,
  ) : async [Types.ArchiveItem] {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    let isApprovedFamilyMember = FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    ArchiveLib.searchForFamily(items, familyId, filter, caller, false, isApprovedFamilyMember);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `submitArchiveItemForFamily`.
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
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    submitArchiveItemForFamilyInternal(
      FamilyTypes.DEFAULT_FAMILY_ID,
      title,
      description,
      itemType,
      mimeType,
      blob,
      era,
      year,
      tags,
      relatedMemberIds,
      relatedBranchId,
      sourceStatus,
      privacyLevel,
      classification,
      primarySpeaker,
      filename,
      caller,
    );
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listPendingArchiveItemsForFamily`.
  public query ({ caller }) func listPendingArchiveItems() : async [Types.ArchiveItem] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ArchiveLib.listPendingForFamily(items, FamilyTypes.DEFAULT_FAMILY_ID, researchLinkedArchiveIds(FamilyTypes.DEFAULT_FAMILY_ID));
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `approveArchiveItemForFamily`.
  public shared ({ caller }) func approveArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    switch (ArchiveLib.approveForFamily(items, FamilyTypes.DEFAULT_FAMILY_ID, id)) {
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `rejectArchiveItemForFamily`.
  public shared ({ caller }) func rejectArchiveItem(
    id : Types.ArchiveItemId,
  ) : async ?Types.ArchiveItem {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    switch (ArchiveLib.rejectForFamily(items, FamilyTypes.DEFAULT_FAMILY_ID, id)) {
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listApprovedArchiveItemsForFamily`.
  public query ({ caller }) func listApprovedArchiveItems() : async [Types.ArchiveItem] {
    let isApprovedFamilyMember = FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ArchiveLib.listApprovedForFamily(items, FamilyTypes.DEFAULT_FAMILY_ID, caller, false, isApprovedFamilyMember);
  };
};

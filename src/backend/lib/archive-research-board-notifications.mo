import List "mo:core/List";
import Principal "mo:core/Principal";
import Storage "mo:caffeineai-object-storage/Storage";
import ArchiveTypes "../types/archive";
import ResearchIntakeTypes "../types/research-intake";
import BoardTypes "../types/board";
import OwnershipTypes "../types/ownership";
import Types "../types/archive-research-board-notifications";
import ArchiveLib "../lib/archive";

module {
  /// Computes the next archive item id: one greater than the largest existing
  /// id, or `0` when the archive is empty.
  func nextArchiveItemId(items : List.List<ArchiveTypes.ArchiveItem>) : Nat {
    var maxId = 0;
    for (item in items.toArray().values()) {
      if (item.id >= maxId) { maxId := item.id + 1 };
    };
    maxId;
  };

  /// Maps a research source type to the canonical archive item type used for
  /// the uploaded source file. Research notes become `#Research`; the other
  /// source types are document-oriented and become `#Document`.
  func itemTypeForSource(t : ResearchIntakeTypes.SourceType) : ArchiveTypes.ArchiveItemType {
    switch (t) {
      case (#ResearchNotes) #Research;
      case _ #Document;
    };
  };

  /// Searches/filters approved archive items by title query, tags, item type,
  /// related family member, and era. Returns only `#Approved` items visible to
  /// the given caller under the archive privacy rules. The title
  /// query and tags match case-insensitively and by substring; an item must
  /// carry ALL of the given tags.
  public func searchArchiveItems(
    items : List.List<ArchiveTypes.ArchiveItem>,
    filter : Types.ArchiveSearchFilter,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : [ArchiveTypes.ArchiveItem] {
    let queryText = switch (filter.searchTerm) { case (?q) q.toLower(); case null "" };
    let tags = filter.tags.map(func t = t.toLower());
    items.toArray().filter(func it =
      it.status == #Approved and
      ArchiveLib.isVisible(it, caller, isAdmin, isApprovedFamilyMember) and
      (queryText == "" or it.title.toLower().contains(#text queryText)) and
      (tags.size() == 0 or tags.all(func t = it.tags.any(func tag = tag.toLower().contains(#text t)))) and
      (switch (filter.itemType) { case (?t) it.itemType == t; case null true }) and
      (switch (filter.relatedMemberId) { case (?m) it.relatedMemberIds.any(func id = id == m); case null true }) and
      (switch (filter.era) { case (?e) it.era.toLower().contains(#text (e.toLower())); case null true })
    );
  };

  /// Creates one canonical Archive item (pending) from an uploaded source file
  /// and links a new Research Source record to it via `archiveItemId`. The
  /// caller is recorded as the contributor of both records. No manually typed
  /// Archive Item ID is required.
  public func createSourceWithUpload(
    items : List.List<ArchiveTypes.ArchiveItem>,
    sources : List.List<ResearchIntakeTypes.SourceRecord>,
    state : { var nextSourceId : Nat },
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
    contributor : Principal,
    now : Int,
  ) : Types.SourceUploadResult {
    let archiveItem : ArchiveTypes.ArchiveItem = {
      id = nextArchiveItemId(items);
      title;
      description;
      itemType = itemTypeForSource(sourceType);
      blob;
      era;
      year;
      tags;
      contributor;
      relatedMemberIds;
      relatedBranchId = null;
      sourceStatus = #Original;
      privacyLevel;
      status = #Pending;
      createdAt = now;
      classification;
      primarySpeaker;
      transcript = null;
      searchableTranscript = null;
      chapterMarkers = null;
      aiSummary = null;
      extractedNames = null;
    };
    items.add(archiveItem);
    let sourceId = state.nextSourceId;
    state.nextSourceId += 1;
    let source : ResearchIntakeTypes.SourceRecord = {
      id = sourceId;
      title;
      sourceType;
      description;
      archiveItemId = ?archiveItem.id;
      contributor;
      status = #Pending;
      createdAt = now;
      updatedAt = now;
    };
    sources.add(source);
    { source; archiveItem };
  };

  /// Creates a board post that attaches existing Archive items (by id) and/or
  /// new uploads. Each new upload creates one canonical Archive item (pending)
  /// linked to the post; the underlying file is never duplicated. Existing
  /// Archive items are attached by id without re-uploading.
  public func createBoardPostWithMedia(
    posts : List.List<BoardTypes.Post>,
    items : List.List<ArchiveTypes.ArchiveItem>,
    post : BoardTypes.Post,
    existingArchiveItemIds : [Nat],
    newUploads : [Types.BoardMediaUpload],
  ) : BoardTypes.Post {
    let linked = List.empty<Nat>();
    for (id in existingArchiveItemIds.values()) {
      if (items.find(func it = it.id == id) != null) {
        linked.add(id);
      };
    };
    for (upload in newUploads.values()) {
      let item : ArchiveTypes.ArchiveItem = {
        id = nextArchiveItemId(items);
        title = upload.title;
        description = upload.description;
        itemType = upload.itemType;
        blob = upload.blob;
        era = upload.era;
        year = upload.year;
        tags = upload.tags;
        contributor = post.authorAccountId;
        relatedMemberIds = upload.relatedMemberIds;
        relatedBranchId = upload.relatedBranchId;
        sourceStatus = upload.sourceStatus;
        privacyLevel = upload.privacyLevel;
        status = #Pending;
        createdAt = post.createdAt;
        classification = upload.classification;
        primarySpeaker = upload.primarySpeaker;
        transcript = null;
        searchableTranscript = null;
        chapterMarkers = null;
        aiSummary = null;
        extractedNames = null;
      };
      items.add(item);
      linked.add(item.id);
    };
    let updated : BoardTypes.Post = { post with linkedMediaIds = linked.toArray() };
    posts.add(updated);
    updated;
  };

  /// Reconciles stale claim notifications for a claim: marks the pending
  /// `#ProfileClaimRequested` notification for the claimant as read/resolved.
  /// The `#ProfileClaimReviewed` notification already reflects the final claim
  /// state. Returns the number of notifications reconciled.
  public func reconcileClaimNotifications(
    notifications : List.List<OwnershipTypes.Notification>,
    claim : OwnershipTypes.ProfileClaim,
  ) : Nat {
    var reconciled = 0;
    let snapshot = notifications.toArray();
    notifications.clear();
    for (n in snapshot.values()) {
      if (n.recipient == claim.requestingUserId and n.notificationType == #ProfileClaimRequested) {
        notifications.add({ n with read = true });
        reconciled += 1;
      } else {
        notifications.add(n);
      };
    };
    reconciled;
  };
};

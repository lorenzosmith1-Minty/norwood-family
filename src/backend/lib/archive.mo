import Iter "mo:core/Iter";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Set "mo:core/Set";
import Types "../types/archive";

module {
  /// Whether an approved archive item is visible to the given caller. Public
  /// items are visible to everyone; FamilyOnly items require approved family
  /// membership or admin; Private items are visible only to their contributor
  /// or an admin.
  public func isVisible(
    item : Types.ArchiveItem,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : Bool {
    switch (item.privacyLevel) {
      case (#Public) true;
      case (#FamilyOnly) isAdmin or isApprovedFamilyMember;
      case (#Private) isAdmin or item.contributor == caller;
    };
  };

  /// Submits a new archive item in pending state. The caller is recorded as the
  /// contributor. Returns the stored item.
  public func submit(
    items : List.List<Types.ArchiveItem>,
    item : Types.ArchiveItem,
  ) : Types.ArchiveItem {
    items.add(item);
    item;
  };

  /// Lists all archive items currently in pending state (admin only). Items
  /// whose id is referenced by a Research Source (`linkedIds`) are excluded:
  /// those are reviewed through the Research Intake queue, so they are not
  /// actionable in Pending Contributions. Ordinary archive contributions with
  /// no linked Research Source remain listed unchanged.
  public func listPending(
    items : List.List<Types.ArchiveItem>,
    linkedIds : Set.Set<Types.ArchiveItemId>,
  ) : [Types.ArchiveItem] {
    items.toArray().filter(
      func it = it.status == #Pending and not linkedIds.contains(it.id)
    );
  };

  /// Transitions a pending archive item to the given status without emitting any
  /// notification. Used when a Research Source approval/rejection cascades to
  /// its linked Archive item, so the item is not double-reviewed and no Archive
  /// notification is sent. Every other field — metadata, blob, and ids — is
  /// preserved. Returns the updated item, or `null` when the item does not exist
  /// or is not pending.
  public func transitionStatus(
    items : List.List<Types.ArchiveItem>,
    id : Types.ArchiveItemId,
    status : Types.ArchiveItemStatus,
  ) : ?Types.ArchiveItem {
    switch (items.find(func it = it.id == id and it.status == #Pending)) {
      case (?it) {
        let updated : Types.ArchiveItem = { it with status };
        let snapshot = items.toArray();
        items.clear();
        for (item in snapshot.values()) {
          if (item.id == id) { items.add(updated) } else { items.add(item) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Approves a pending item, moving it to approved state. Returns the updated
  /// item, or `null` when the item does not exist or is not pending.
  public func approve(
    items : List.List<Types.ArchiveItem>,
    id : Types.ArchiveItemId,
  ) : ?Types.ArchiveItem {
    switch (items.find(func it = it.id == id and it.status == #Pending)) {
      case (?it) {
        let updated : Types.ArchiveItem = { it with status = #Approved };
        let snapshot = items.toArray();
        items.clear();
        for (item in snapshot.values()) {
          if (item.id == id) { items.add(updated) } else { items.add(item) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Rejects a pending item, moving it to rejected state. Returns the updated
  /// item, or `null` when the item does not exist or is not pending.
  public func reject(
    items : List.List<Types.ArchiveItem>,
    id : Types.ArchiveItemId,
  ) : ?Types.ArchiveItem {
    switch (items.find(func it = it.id == id and it.status == #Pending)) {
      case (?it) {
        let updated : Types.ArchiveItem = { it with status = #Rejected };
        let snapshot = items.toArray();
        items.clear();
        for (item in snapshot.values()) {
          if (item.id == id) { items.add(updated) } else { items.add(item) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Lists all archive items in approved state visible to the given caller.
  /// Privacy is enforced server-side: Public items are visible to everyone;
  /// FamilyOnly items require approved family membership; Private items are
  /// visible only to their contributor or an admin.
  public func listApproved(
    items : List.List<Types.ArchiveItem>,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : [Types.ArchiveItem] {
    items.toArray().filter(
      func it = it.status == #Approved and isVisible(it, caller, isAdmin, isApprovedFamilyMember)
    );
  };

  // ---------------------------------------------------------------------------
  // Tenancy 1C-B1 canonical family-scoped archive logic.
  //
  // Every function below takes an explicit `familyId` and only ever considers
  // records whose `ArchiveItem.familyId` equals it. An `archiveItemId` alone is
  // never a tenant boundary: a lookup that finds a record belonging to another
  // family behaves exactly like a lookup that found nothing.
  // ---------------------------------------------------------------------------

  /// Whether an archive item belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped read and mutation funnels through.
  public func belongsToFamily(item : Types.ArchiveItem, familyId : Text) : Bool {
    item.familyId == familyId;
  };

  /// Whether an approved archive item in `familyId` is visible to the given
  /// caller. Identical privacy semantics to `isVisible`, but the item must
  /// belong to `familyId` first.
  public func isVisibleForFamily(
    item : Types.ArchiveItem,
    familyId : Text,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : Bool {
    belongsToFamily(item, familyId) and isVisible(item, caller, isAdmin, isApprovedFamilyMember);
  };

  /// Lists every archive item in `familyId` in pending state, excluding items
  /// whose id is referenced by a Research Source (`linkedIds`). Only items whose
  /// `familyId` equals `familyId` are considered.
  public func listPendingForFamily(
    items : List.List<Types.ArchiveItem>,
    familyId : Text,
    linkedIds : Set.Set<Types.ArchiveItemId>,
  ) : [Types.ArchiveItem] {
    items.toArray().filter(
      func it = belongsToFamily(it, familyId) and it.status == #Pending and not linkedIds.contains(it.id)
    );
  };

  /// Lists every archive item in `familyId` in approved state visible to the
  /// given caller. Only items whose `familyId` equals `familyId` are considered.
  public func listApprovedForFamily(
    items : List.List<Types.ArchiveItem>,
    familyId : Text,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : [Types.ArchiveItem] {
    items.toArray().filter(
      func it = it.status == #Approved and isVisibleForFamily(it, familyId, caller, isAdmin, isApprovedFamilyMember)
    );
  };

  /// Returns the archive item with `id` when it belongs to `familyId`, or `null`
  /// otherwise. A record that exists under another family is never returned.
  public func getForFamily(
    items : List.List<Types.ArchiveItem>,
    familyId : Text,
    id : Types.ArchiveItemId,
  ) : ?Types.ArchiveItem {
    items.find(func it = it.id == id and belongsToFamily(it, familyId));
  };

  /// Searches/filters approved archive items in `familyId` by title query, tags,
  /// item type, related family member, and era. Only items whose `familyId`
  /// equals `familyId` are considered, and only `#Approved` items visible to the
  /// caller under the archive privacy rules are returned.
  public func searchForFamily(
    items : List.List<Types.ArchiveItem>,
    familyId : Text,
    filter : Types.ArchiveSearchQuery,
    caller : Principal,
    isAdmin : Bool,
    isApprovedFamilyMember : Bool,
  ) : [Types.ArchiveItem] {
    let queryText = switch (filter.searchTerm) { case (?q) q.toLower(); case null "" };
    let tags = filter.tags.map(func t = t.toLower());
    items.toArray().filter(func it =
      it.status == #Approved and
      isVisibleForFamily(it, familyId, caller, isAdmin, isApprovedFamilyMember) and
      (queryText == "" or it.title.toLower().contains(#text queryText)) and
      (tags.size() == 0 or tags.all(func t = it.tags.any(func tag = tag.toLower().contains(#text t)))) and
      (switch (filter.itemType) { case (?t) it.itemType == t; case null true }) and
      (switch (filter.relatedMemberId) { case (?m) it.relatedMemberIds.any(func id = id == m); case null true }) and
      (switch (filter.era) { case (?e) it.era.toLower().contains(#text (e.toLower())); case null true })
    );
  };

  /// Submits a new archive item into `familyId`. The stored item's `familyId` is
  /// the requested `familyId`, and every `relatedMemberIds` entry must belong to
  /// that same family. Returns the stored item.
  public func submitForFamily(
    items : List.List<Types.ArchiveItem>,
    submission : Types.ArchiveSubmission,
    contributor : Principal,
    now : Int,
  ) : Types.ArchiveItem {
    let item : Types.ArchiveItem = {
      familyId = submission.familyId;
      id = nextId(items);
      title = submission.title;
      description = submission.description;
      itemType = submission.itemType;
      blob = submission.blob;
      mimeType = ?submission.mimeType;
      filename = ?submission.filename;
      era = submission.era;
      year = submission.year;
      tags = submission.tags;
      contributor;
      relatedMemberIds = submission.relatedMemberIds;
      relatedBranchId = submission.relatedBranchId;
      sourceStatus = submission.sourceStatus;
      privacyLevel = submission.privacyLevel;
      status = #Pending;
      createdAt = now;
      classification = submission.classification;
      primarySpeaker = submission.primarySpeaker;
      transcript = null;
      searchableTranscript = null;
      chapterMarkers = null;
      aiSummary = null;
      extractedNames = null;
    };
    items.add(item);
    item;
  };

  /// Approves the pending archive item with `id` in `familyId`, moving it to
  /// approved state. Returns the updated item, or `null` when no pending item
  /// with that id belongs to `familyId`.
  public func approveForFamily(
    items : List.List<Types.ArchiveItem>,
    familyId : Text,
    id : Types.ArchiveItemId,
  ) : ?Types.ArchiveItem {
    switch (items.find(func it = it.id == id and belongsToFamily(it, familyId) and it.status == #Pending)) {
      case (?it) {
        let updated : Types.ArchiveItem = { it with status = #Approved };
        replaceById(items, id, updated);
        ?updated;
      };
      case null { null };
    };
  };

  /// Rejects the pending archive item with `id` in `familyId`, moving it to
  /// rejected state. Returns the updated item, or `null` when no pending item
  /// with that id belongs to `familyId`.
  public func rejectForFamily(
    items : List.List<Types.ArchiveItem>,
    familyId : Text,
    id : Types.ArchiveItemId,
  ) : ?Types.ArchiveItem {
    switch (items.find(func it = it.id == id and belongsToFamily(it, familyId) and it.status == #Pending)) {
      case (?it) {
        let updated : Types.ArchiveItem = { it with status = #Rejected };
        replaceById(items, id, updated);
        ?updated;
      };
      case null { null };
    };
  };

  /// Computes the next archive item id: one greater than the largest existing
  /// id, or `0` when the archive is empty.
  func nextId(items : List.List<Types.ArchiveItem>) : Types.ArchiveItemId {
    var maxId = 0;
    for (item in items.toArray().values()) {
      if (item.id >= maxId) { maxId := item.id + 1 };
    };
    maxId;
  };

  /// Replaces the item with `id` in place, preserving list order.
  func replaceById(
    items : List.List<Types.ArchiveItem>,
    id : Types.ArchiveItemId,
    updated : Types.ArchiveItem,
  ) {
    let snapshot = items.toArray();
    items.clear();
    for (item in snapshot.values()) {
      if (item.id == id) { items.add(updated) } else { items.add(item) };
    };
  };

  /// Flattens every archive item into OQL-exposable rows. The raw blob bytes
  /// are excluded — they live off-chain as external references. Enumerated
  /// variants are rendered as their tag text.
  public func archiveRows(
    items : List.List<Types.ArchiveItem>,
  ) : Iter.Iter<Types.ArchiveItemRow> {
    items.toArray().map(
      func it : Types.ArchiveItemRow = {
        id = it.id;
        familyId = it.familyId;
        title = it.title;
        itemType = switch (it.itemType) {
          case (#Photo) "Photo";
          case (#Document) "Document";
          case (#Audio) "Audio";
          case (#Video) "Video";
          case (#WrittenStoryNote) "WrittenStoryNote";
          case (#Research) "Research";
          case (#WorkBusiness) "WorkBusiness";
          case (#Other) "Other";
        };
        era = it.era;
        year = it.year;
        contributor = it.contributor;
        sourceStatus = switch (it.sourceStatus) {
          case (#Original) "Original";
          case (#Copy) "Copy";
          case (#Transcribed) "Transcribed";
          case (#Unverified) "Unverified";
        };
        privacyLevel = switch (it.privacyLevel) {
          case (#Public) "Public";
          case (#FamilyOnly) "FamilyOnly";
          case (#Private) "Private";
        };
        status = switch (it.status) {
          case (#Pending) "Pending";
          case (#Approved) "Approved";
          case (#Rejected) "Rejected";
        };
        createdAt = it.createdAt;
        classification = switch (it.classification) {
          case (#Standard) "Standard";
          case (#OralHistory) "OralHistory";
        };
        primarySpeakerName = switch (it.primarySpeaker) {
          case (?s) s.name;
          case null "";
        };
        mimeType = it.mimeType ?? "";
        filename = it.filename ?? "";
        tags = it.tags.values().join(", ");
      }
    ).values();
  };
};

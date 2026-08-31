import Iter "mo:core/Iter";
import List "mo:core/List";
import Types "../types/archive";

module {
  /// Submits a new archive item in pending state. The caller is recorded as the
  /// contributor. Returns the stored item.
  public func submit(
    items : List.List<Types.ArchiveItem>,
    item : Types.ArchiveItem,
  ) : Types.ArchiveItem {
    items.add(item);
    item;
  };

  /// Lists all archive items currently in pending state (admin only).
  public func listPending(
    items : List.List<Types.ArchiveItem>,
  ) : [Types.ArchiveItem] {
    items.toArray().filter(func it = it.status == #Pending);
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

  /// Lists all archive items in approved state (visible in the archive).
  public func listApproved(
    items : List.List<Types.ArchiveItem>,
  ) : [Types.ArchiveItem] {
    items.toArray().filter(func it = it.status == #Approved);
  };

  /// Flattens every archive item into OQL-exposable rows. The raw blob bytes
  /// are excluded — they live off-chain as external references. Enumerated
  /// variants are rendered as their tag text.
  public func archiveRows(
    items : List.List<Types.ArchiveItem>,
  ) : Iter.Iter<Types.ArchiveItemRow> {
    let rows = List.empty<Types.ArchiveItemRow>();
    for (item in items.toArray().values()) {
      rows.add({
        id = item.id;
        title = item.title;
        itemType = switch (item.itemType) {
          case (#Photo) "Photo";
          case (#Document) "Document";
          case (#Audio) "Audio";
          case (#Video) "Video";
          case (#WrittenStoryNote) "WrittenStoryNote";
          case (#Research) "Research";
          case (#WorkBusiness) "WorkBusiness";
          case (#Other) "Other";
        };
        era = item.era;
        year = item.year;
        contributor = item.contributor;
        sourceStatus = switch (item.sourceStatus) {
          case (#Original) "Original";
          case (#Copy) "Copy";
          case (#Transcribed) "Transcribed";
          case (#Unverified) "Unverified";
        };
        privacyLevel = switch (item.privacyLevel) {
          case (#Public) "Public";
          case (#FamilyOnly) "FamilyOnly";
          case (#Private) "Private";
        };
        status = switch (item.status) {
          case (#Pending) "Pending";
          case (#Approved) "Approved";
          case (#Rejected) "Rejected";
        };
        createdAt = item.createdAt;
      });
    };
    rows.toArray().values();
  };
};

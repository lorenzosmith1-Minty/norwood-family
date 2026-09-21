import Iter "mo:core/Iter";
import List "mo:core/List";
import Principal "mo:core/Principal";
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

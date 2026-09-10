import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Time "mo:core/Time";
import Types "../types/family-history";
import OwnershipTypes "../types/ownership";
import ArchiveTypes "../types/archive";

module {
  /// Adds a newly submitted story in pending state. The caller is recorded as
  /// the contributor. Returns the stored story.
  public func submit(items : List.List<Types.Story>, story : Types.Story) : Types.Story {
    items.add(story);
    story;
  };

  /// Lists all stories currently in pending state (steward only).
  public func listPending(items : List.List<Types.Story>) : [Types.Story] {
    items.toArray().filter(func s = s.status == #Pending);
  };

  /// Lists all stories in approved state (visible to viewers).
  public func listApproved(items : List.List<Types.Story>) : [Types.Story] {
    items.toArray().filter(func s = s.status == #Approved);
  };

  /// Approves a pending story, moving it to approved state. Returns the updated
  /// story, or `null` when the story does not exist or is not pending.
  public func approve(items : List.List<Types.Story>, id : Types.StoryId) : ?Types.Story {
    switch (items.find(func s = s.id == id and s.status == #Pending)) {
      case (?s) {
        let updated : Types.Story = { s with status = #Approved; updatedAt = Time.now() };
        let snapshot = items.toArray();
        items.clear();
        for (story in snapshot.values()) {
          if (story.id == id) { items.add(updated) } else { items.add(story) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Rejects a pending story, moving it to rejected state. Returns the updated
  /// story, or `null` when the story does not exist or is not pending.
  public func reject(items : List.List<Types.Story>, id : Types.StoryId) : ?Types.Story {
    switch (items.find(func s = s.id == id and s.status == #Pending)) {
      case (?s) {
        let updated : Types.Story = { s with status = #Rejected; updatedAt = Time.now() };
        let snapshot = items.toArray();
        items.clear();
        for (story in snapshot.values()) {
          if (story.id == id) { items.add(updated) } else { items.add(story) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Adds a canonical story directly (steward only), already approved. Returns
  /// the stored story.
  public func addCanonical(items : List.List<Types.Story>, story : Types.Story) : Types.Story {
    items.add(story);
    story;
  };

  /// Updates a canonical story (steward only), replacing the story with the
  /// matching id. Returns the updated story, or `null` when it does not exist.
  public func updateCanonical(items : List.List<Types.Story>, story : Types.Story) : ?Types.Story {
    switch (items.find(func s = s.id == story.id)) {
      case (?_) {
        let snapshot = items.toArray();
        items.clear();
        for (existing in snapshot.values()) {
          if (existing.id == story.id) { items.add(story) } else { items.add(existing) };
        };
        ?story;
      };
      case null { null };
    };
  };

  /// Adds a newly submitted mystery contribution in pending state. Returns the
  /// stored contribution.
  public func submitContribution(items : List.List<Types.MysteryContribution>, contribution : Types.MysteryContribution) : Types.MysteryContribution {
    items.add(contribution);
    contribution;
  };

  /// Lists all mystery contributions currently in pending state (steward only).
  public func listPendingContributions(items : List.List<Types.MysteryContribution>) : [Types.MysteryContribution] {
    items.toArray().filter(func c = c.status == #Pending);
  };

  /// Approves or rejects a pending mystery contribution (steward only),
  /// recording the reviewer and review time. Returns the updated contribution,
  /// or `null` when it does not exist or is not pending.
  public func reviewContribution(items : List.List<Types.MysteryContribution>, id : Types.MysteryContributionId, approve : Bool, reviewer : Principal) : ?Types.MysteryContribution {
    switch (items.find(func c = c.id == id and c.status == #Pending)) {
      case (?c) {
        let updated : Types.MysteryContribution = {
          c with
          status = if (approve) { #Approved } else { #Rejected };
          reviewedBy = ?reviewer;
          reviewedAt = ?Time.now();
        };
        let snapshot = items.toArray();
        items.clear();
        for (contribution in snapshot.values()) {
          if (contribution.id == id) { items.add(updated) } else { items.add(contribution) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Creates a canonical mystery directly (steward only). Returns the stored
  /// mystery.
  public func createCanonical(items : List.List<Types.Mystery>, mystery : Types.Mystery) : Types.Mystery {
    items.add(mystery);
    mystery;
  };

  /// Updates a canonical mystery (steward only), replacing the mystery with the
  /// matching id. Returns the updated mystery, or `null` when it does not exist.
  public func updateCanonicalMystery(items : List.List<Types.Mystery>, mystery : Types.Mystery) : ?Types.Mystery {
    switch (items.find(func m = m.id == mystery.id)) {
      case (?_) {
        let snapshot = items.toArray();
        items.clear();
        for (existing in snapshot.values()) {
          if (existing.id == mystery.id) { items.add(mystery) } else { items.add(existing) };
        };
        ?mystery;
      };
      case null { null };
    };
  };

  /// Marks a mystery resolved (steward only), recording the resolution summary
  /// and supporting evidence while preserving the prior theories/history.
  /// Returns the updated mystery, or `null` when it does not exist.
  public func markResolved(items : List.List<Types.Mystery>, id : Types.MysteryId, resolution : Types.Resolution) : ?Types.Mystery {
    switch (items.find(func m = m.id == id)) {
      case (?m) {
        let updated : Types.Mystery = { m with status = #Resolved; resolution = ?resolution; updatedAt = Time.now() };
        let snapshot = items.toArray();
        items.clear();
        for (existing in snapshot.values()) {
          if (existing.id == id) { items.add(updated) } else { items.add(existing) };
        };
        ?updated;
      };
      case null { null };
    };
  };

  /// Lists all mysteries (visible to viewers).
  public func listMysteries(items : List.List<Types.Mystery>) : [Types.Mystery] {
    items.toArray();
  };

  /// Aggregates timeline events from existing canonical data: PersonProfile
  /// timeline entries, ArchiveItem year/era, Story era/date, and Mystery
  /// records. Empty eras are never fabricated — only actual stored data is
  /// surfaced.
  public func listTimelineEvents(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    stories : List.List<Types.Story>,
    mysteries : List.List<Types.Mystery>,
  ) : [Types.TimelineEvent] {
    let events = List.empty<Types.TimelineEvent>();

    // Person profile timeline entries (free-text family history).
    for ((personId, profile) in profiles.entries()) {
      switch (profile.timeline) {
        case (?entries) {
          var i = 0;
          for (entry in entries.values()) {
            events.add({
              id = "person-" # personId # "-" # i.toText();
              eventType = #FamilyEvent;
              title = entry;
              description = "";
              era = null;
              year = null;
              evidenceStatus = #FamilyHistory;
              linkTarget = #Person(personId);
            });
            i += 1;
          };
        };
        case null {};
      };
    };

    // Archive items (documents, photos, etc.).
    for (item in archiveItems.toArray().values()) {
      events.add({
        id = "archive-" # item.id.toText();
        eventType = archiveEventType(item.itemType);
        title = item.title;
        description = item.description;
        era = if (item.era == "") { null } else { ?item.era };
        year = item.year;
        evidenceStatus = archiveEvidence(item.sourceStatus);
        linkTarget = #ArchiveItem(item.id);
      });
    };

    // Stories.
    for (story in stories.toArray().values()) {
      events.add({
        id = "story-" # story.id.toText();
        eventType = #Story;
        title = story.title;
        description = story.storyText;
        era = story.era;
        year = story.year;
        evidenceStatus = story.evidenceStatus;
        linkTarget = #Story(story.id);
      });
    };

    // Mysteries (unresolved questions).
    for (mystery in mysteries.toArray().values()) {
      events.add({
        id = "mystery-" # mystery.id.toText();
        eventType = #Mystery;
        title = mystery.title;
        description = mystery.description;
        era = null;
        year = null;
        evidenceStatus = #Unresolved;
        linkTarget = #Mystery(mystery.id);
      });
    };

    events.toArray();
  };

  /// Maps an archive item type to a timeline event type.
  func archiveEventType(t : ArchiveTypes.ArchiveItemType) : Types.TimelineEventType {
    switch (t) {
      case (#Photo) #PhotoDocument;
      case (#Document) #CensusDocument;
      case (#Audio) #PhotoDocument;
      case (#Video) #PhotoDocument;
      case (#WrittenStoryNote) #Story;
      case (#Research) #CensusDocument;
      case (#WorkBusiness) #FamilyEvent;
      case (#Other) #FamilyEvent;
    };
  };

  /// Maps an archive source status to an evidence badge. Original, Copy, and
  /// Transcribed are treated as documented; Unverified is unresolved.
  func archiveEvidence(s : ArchiveTypes.SourceStatus) : Types.EvidenceStatus {
    switch (s) {
      case (#Original) #Documented;
      case (#Copy) #Documented;
      case (#Transcribed) #Documented;
      case (#Unverified) #Unresolved;
    };
  };
};

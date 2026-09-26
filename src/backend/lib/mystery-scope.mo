import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Time "mo:core/Time";
import Types "../types/family-history";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import ArchiveTypes "../types/archive";

/// Tenancy 1C-D4-A canonical family-scoped Family Mystery domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `Mystery` or `MysteryContribution` whose `familyId` equals it. A `mysteryId`
/// or `contributionId` alone is never a tenant boundary: a lookup that finds a
/// record belonging to another family behaves exactly like a lookup that found
/// nothing. The API mixin owns authorization and state wiring; this module is
/// pure over the injected collections.
///
/// This mirrors `lib/family-history-scope.mo` (the canonical family-scoped
/// Story logic) and supersedes the pre-tenancy `lib/mystery.mo`, which is now
/// an inert stub.
module {
  /// Whether a mystery belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped mystery read and action funnels through.
  public func belongsToFamily(mystery : Types.Mystery, familyId : FamilyTypes.FamilyId) : Bool {
    mystery.familyId == familyId;
  };

  /// Whether a mystery contribution belongs to `familyId`. The single
  /// family-boundary predicate every family-scoped contribution read and action
  /// funnels through.
  public func contributionBelongsToFamily(contribution : Types.MysteryContribution, familyId : FamilyTypes.FamilyId) : Bool {
    contribution.familyId == familyId;
  };

  /// Lists every mystery in `familyId`, newest first. Only mysteries whose
  /// `familyId` equals `familyId` are considered, so Family A mysteries never
  /// appear in a Family B call.
  public func listMysteriesForFamily(
    mysteries : List.List<Types.Mystery>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Mystery] {
    mysteries.toArray()
      .filter(func m = belongsToFamily(m, familyId))
      .sort(func(a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Returns the mystery with `mysteryId` when it belongs to `familyId`, or
  /// `null` otherwise. A mystery that exists under another family is never
  /// returned, so a `mysteryId` alone cannot cross the family boundary.
  public func getForFamily(
    mysteries : List.List<Types.Mystery>,
    familyId : FamilyTypes.FamilyId,
    mysteryId : Types.MysteryId,
  ) : ?Types.Mystery {
    mysteries.find(func m = m.id == mysteryId and belongsToFamily(m, familyId));
  };

  /// Lists every contribution to `mysteryId` in `familyId`. Only contributions
  /// whose `familyId` equals `familyId` and whose `mysteryId` equals
  /// `mysteryId` are considered, so a contribution id or mystery id alone never
  /// crosses the family boundary. Returns `[]` when the mystery does not belong
  /// to `familyId`.
  public func listContributionsForFamily(
    contributions : List.List<Types.MysteryContribution>,
    familyId : FamilyTypes.FamilyId,
    mysteryId : Types.MysteryId,
  ) : [Types.MysteryContribution] {
    contributions.toArray().filter(func c =
      contributionBelongsToFamily(c, familyId) and c.mysteryId == mysteryId
    );
  };

  /// Lists every mystery contribution in `familyId` currently in pending state
  /// (Steward only). Only contributions whose `familyId` equals `familyId` are
  /// considered.
  public func listPendingContributionsForFamily(
    contributions : List.List<Types.MysteryContribution>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.MysteryContribution] {
    contributions.toArray().filter(func c =
      contributionBelongsToFamily(c, familyId) and c.status == #Pending
    );
  };

  /// Appends a newly submitted mystery contribution. The contribution's
  /// `familyId` is set by the caller; this module never rewrites it.
  public func submitContributionForFamily(
    contributions : List.List<Types.MysteryContribution>,
    contribution : Types.MysteryContribution,
  ) : Types.MysteryContribution {
    contributions.add(contribution);
    contribution;
  };

  /// Approves or rejects the pending contribution with `id` in `familyId`,
  /// recording the reviewer and review time. Returns the updated contribution,
  /// or `null` when no pending contribution with that id belongs to `familyId`.
  /// A contribution in another family is never touched.
  public func reviewContributionForFamily(
    contributions : List.List<Types.MysteryContribution>,
    familyId : FamilyTypes.FamilyId,
    id : Types.MysteryContributionId,
    approve : Bool,
    reviewer : Principal,
  ) : ?Types.MysteryContribution {
    switch (contributions.find(func c =
      c.id == id and contributionBelongsToFamily(c, familyId) and c.status == #Pending
    )) {
      case null { null };
      case (?c) {
        let updated : Types.MysteryContribution = {
          c with
          status = if (approve) { #Approved } else { #Rejected };
          reviewedBy = ?reviewer;
          reviewedAt = ?Time.now();
        };
        let snapshot = contributions.toArray();
        contributions.clear();
        for (contribution in snapshot.values()) {
          if (contribution.id == id and contributionBelongsToFamily(contribution, familyId)) {
            contributions.add(updated);
          } else {
            contributions.add(contribution);
          };
        };
        ?updated;
      };
    };
  };

  /// Appends a canonical mystery directly (Steward only). The mystery's
  /// `familyId` is set by the caller; this module never rewrites it.
  public func createCanonicalForFamily(
    mysteries : List.List<Types.Mystery>,
    mystery : Types.Mystery,
  ) : Types.Mystery {
    mysteries.add(mystery);
    mystery;
  };

  /// Replaces the mystery with `mystery.id` when it belongs to `familyId`.
  /// Returns the updated mystery, or `null` when no mystery with that id belongs
  /// to `familyId`. A mystery in another family is never touched.
  public func updateCanonicalForFamily(
    mysteries : List.List<Types.Mystery>,
    familyId : FamilyTypes.FamilyId,
    mystery : Types.Mystery,
  ) : ?Types.Mystery {
    switch (mysteries.find(func m = m.id == mystery.id and belongsToFamily(m, familyId))) {
      case null { null };
      case (?_) {
        let snapshot = mysteries.toArray();
        mysteries.clear();
        for (existing in snapshot.values()) {
          if (existing.id == mystery.id and belongsToFamily(existing, familyId)) {
            mysteries.add(mystery);
          } else {
            mysteries.add(existing);
          };
        };
        ?mystery;
      };
    };
  };

  /// Marks the mystery with `id` in `familyId` resolved, recording the
  /// resolution summary and supporting evidence while preserving the prior
  /// theories/history. Returns the updated mystery, or `null` when no mystery
  /// with that id belongs to `familyId`. A mystery in another family is never
  /// touched.
  public func markResolvedForFamily(
    mysteries : List.List<Types.Mystery>,
    familyId : FamilyTypes.FamilyId,
    id : Types.MysteryId,
    resolution : Types.Resolution,
  ) : ?Types.Mystery {
    switch (mysteries.find(func m = m.id == id and belongsToFamily(m, familyId))) {
      case null { null };
      case (?m) {
        let updated : Types.Mystery = { m with status = #Resolved; resolution = ?resolution; updatedAt = Time.now() };
        let snapshot = mysteries.toArray();
        mysteries.clear();
        for (existing in snapshot.values()) {
          if (existing.id == id and belongsToFamily(existing, familyId)) {
            mysteries.add(updated);
          } else {
            mysteries.add(existing);
          };
        };
        ?updated;
      };
    };
  };

  /// Aggregates timeline events from existing canonical data in `familyId`:
  /// PersonProfile timeline entries, ArchiveItem year/era, Story era/date, and
  /// Mystery records. Only records whose `familyId` equals `familyId` are
  /// considered, so Family A timeline events never appear in a Family B call.
  /// Empty eras are never fabricated — only actual stored data is surfaced.
  public func listTimelineEventsForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    stories : List.List<Types.Story>,
    mysteries : List.List<Types.Mystery>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.TimelineEvent] {
    let events = List.empty<Types.TimelineEvent>();

    // Person profile timeline entries (free-text family history).
    for ((personId, profile) in profiles.entries()) {
      if (profile.familyId == familyId) {
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
    };

    // Archive items (documents, photos, etc.).
    for (item in archiveItems.toArray().values()) {
      if (item.familyId == familyId) {
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
    };

    // Stories.
    for (story in stories.toArray().values()) {
      if (story.familyId == familyId) {
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
    };

    // Mysteries (unresolved questions).
    for (mystery in mysteries.toArray().values()) {
      if (belongsToFamily(mystery, familyId)) {
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
    };

    events.toArray();
  };

  /// Flattens every mystery into OQL-exposable rows, including the tenant
  /// boundary `familyId`. Enumerated variants render as their tag text; optional
  /// fields render as empty text when absent; array fields render as counts.
  public func mysteryRows(mysteries : List.List<Types.Mystery>) : Iter.Iter<Types.MysteryRow> {
    mysteries.toArray().map(
      func m : Types.MysteryRow = {
        familyId = m.familyId;
        id = m.id;
        title = m.title;
        description = m.description;
        relatedMemberCount = m.relatedMemberIds.size();
        relatedBranchId = m.relatedBranchId ?? "";
        knownFactCount = m.knownFacts.size();
        possibilityCount = m.possibilities.size();
        relatedSourceCount = m.relatedSourceIds.size();
        relatedArchiveItemCount = m.relatedArchiveItemIds.size();
        status = switch (m.status) {
          case (#Open) "Open";
          case (#Researching) "Researching";
          case (#PartiallyResolved) "PartiallyResolved";
          case (#Resolved) "Resolved";
        };
        contributor = m.contributor.toText();
        createdAt = m.createdAt;
        updatedAt = m.updatedAt;
        resolved = m.resolution != null;
      }
    ).values();
  };

  // --- helpers ---

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

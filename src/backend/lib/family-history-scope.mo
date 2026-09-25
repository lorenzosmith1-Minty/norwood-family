import Iter "mo:core/Iter";
import List "mo:core/List";
import Time "mo:core/Time";
import Types "../types/family-history";
import FamilyTypes "../types/family";

/// Tenancy 1C-D3-A canonical family-scoped Family Stories domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `Story` whose `familyId` equals it. A `storyId` alone is never a tenant
/// boundary: a lookup that finds a story belonging to another family behaves
/// exactly like a lookup that found nothing. The API mixin owns authorization
/// and state wiring; this module is pure over the injected collections.
///
/// Mystery domain logic is deliberately NOT part of this module: mysteries are
/// not family-scoped by this build and remain in `lib/family-history.mo`.
module {
  /// Whether a story belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped story read and action funnels through.
  public func belongsToFamily(story : Types.Story, familyId : FamilyTypes.FamilyId) : Bool {
    story.familyId == familyId;
  };

  /// Lists every story in `familyId`, newest first. Only stories whose
  /// `familyId` equals `familyId` are considered, so Family A stories never
  /// appear in a Family B call.
  public func listStoriesForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Story] {
    stories.toArray()
      .filter(func s = belongsToFamily(s, familyId))
      .sort(func(a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Returns the story with `storyId` when it belongs to `familyId`, or `null`
  /// otherwise. A story that exists under another family is never returned, so
  /// a `storyId` alone cannot cross the family boundary.
  public func getForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
  ) : ?Types.Story {
    stories.find(func s = s.id == storyId and belongsToFamily(s, familyId));
  };

  /// Lists every story in `familyId` currently in pending state (Steward only).
  /// Only stories whose `familyId` equals `familyId` are considered.
  public func listPendingForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Story] {
    stories.toArray().filter(func s = belongsToFamily(s, familyId) and s.status == #Pending);
  };

  /// Lists every approved story in `familyId` (visible to viewers). Only stories
  /// whose `familyId` equals `familyId` are considered.
  public func listApprovedForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Story] {
    stories.toArray().filter(func s = belongsToFamily(s, familyId) and s.status == #Approved);
  };

  /// Appends a newly submitted story. The story's `familyId` is set by the
  /// caller; this module never rewrites it.
  public func submitForFamily(
    stories : List.List<Types.Story>,
    story : Types.Story,
  ) : Types.Story {
    stories.add(story);
    story;
  };

  /// Appends a canonical story directly (Steward only), already approved. The
  /// story's `familyId` is set by the caller; this module never rewrites it.
  public func addCanonicalForFamily(
    stories : List.List<Types.Story>,
    story : Types.Story,
  ) : Types.Story {
    stories.add(story);
    story;
  };

  /// Replaces the story with `story.id` when it belongs to `familyId`. Returns
  /// the updated story, or `null` when no story with that id belongs to
  /// `familyId`. A story in another family is never touched.
  public func updateCanonicalForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
    story : Types.Story,
  ) : ?Types.Story {
    switch (stories.find(func s = s.id == story.id and belongsToFamily(s, familyId))) {
      case null { null };
      case (?_) {
        let snapshot = stories.toArray();
        stories.clear();
        for (existing in snapshot.values()) {
          if (existing.id == story.id and belongsToFamily(existing, familyId)) {
            stories.add(story);
          } else {
            stories.add(existing);
          };
        };
        ?story;
      };
    };
  };

  /// Approves the pending story with `storyId` in `familyId`, moving it to
  /// approved state. Returns the updated story, or `null` when no pending story
  /// with that id belongs to `familyId`. A story in another family is never
  /// touched.
  public func approveForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
  ) : ?Types.Story {
    transitionStatusForFamily(stories, familyId, storyId, #Approved);
  };

  /// Rejects the pending story with `storyId` in `familyId`, moving it to
  /// rejected state. Returns the updated story, or `null` when no pending story
  /// with that id belongs to `familyId`. A story in another family is never
  /// touched.
  public func rejectForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
  ) : ?Types.Story {
    transitionStatusForFamily(stories, familyId, storyId, #Rejected);
  };

  /// Flattens every story into OQL-exposable rows, including the tenant boundary
  /// `familyId`. Enumerated variants render as their tag text; optional fields
  /// render as empty text when absent; array fields render as counts.
  public func storyRows(stories : List.List<Types.Story>) : Iter.Iter<Types.StoryRow> {
    stories.toArray().map(
      func s : Types.StoryRow = {
        familyId = s.familyId;
        id = s.id;
        title = s.title;
        storyText = s.storyText;
        relatedMemberCount = s.relatedMemberIds.size();
        era = s.era ?? "";
        year = s.year;
        location = s.location ?? "";
        contributor = s.contributor.toText();
        evidenceStatus = switch (s.evidenceStatus) {
          case (#Documented) "Documented";
          case (#FamilyHistory) "FamilyHistory";
          case (#PersonalMemory) "PersonalMemory";
          case (#Unresolved) "Unresolved";
        };
        relatedArchiveItemCount = s.relatedArchiveItemIds.size();
        createdAt = s.createdAt;
        updatedAt = s.updatedAt;
        status = switch (s.status) {
          case (#Pending) "Pending";
          case (#Approved) "Approved";
          case (#Rejected) "Rejected";
        };
      }
    ).values();
  };

  // --- helpers ---

  /// Transitions the pending story with `storyId` in `familyId` to `status`,
  /// preserving every other field and list order. Returns the updated story, or
  /// `null` when no pending story with that id belongs to `familyId`.
  func transitionStatusForFamily(
    stories : List.List<Types.Story>,
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
    status : Types.StoryStatus,
  ) : ?Types.Story {
    switch (stories.find(func s = s.id == storyId and belongsToFamily(s, familyId) and s.status == #Pending)) {
      case null { null };
      case (?story) {
        // Preserve the pre-tenancy approve/reject behavior: the transition
        // advances `updatedAt` alongside `status`.
        let updated : Types.Story = { story with status; updatedAt = Time.now() };
        let snapshot = stories.toArray();
        stories.clear();
        for (s in snapshot.values()) {
          if (s.id == storyId and belongsToFamily(s, familyId)) {
            stories.add(updated);
          } else {
            stories.add(s);
          };
        };
        ?updated;
      };
    };
  };
};

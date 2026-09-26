import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/family-history";
import ArchiveTypes "../types/archive";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyHistoryScopeLib "../lib/family-history-scope";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import TenancyLib "../lib/tenancy";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-D3-A canonical family-scoped Family Stories public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Reads
/// gate on `FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily`;
/// Steward review (pending list, approve, reject, canonical add/edit) gates on
/// `requireActiveStewardForFamily`. Every returned or mutated story must carry
/// `familyId == familyId`, and every related person and linked Archive media id
/// must belong to the same family, so a `storyId` alone never crosses a family
/// boundary.
///
/// The legacy single-family Story endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
///
/// The Story review flow emits no notifications (OwnershipTypes.NotificationType
/// has no Story variants), so this mixin takes no notifications parameter.
///
/// Mystery endpoints are NOT part of this mixin: they live in the canonical
/// family-scoped `mixins/mystery-scope-api.mo` (Tenancy 1C-D4-A).
mixin (
  stories : List.List<Types.Story>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
) {
  // ---------------------------------------------------------------------------
  // Canonical family-scoped endpoints.
  // ---------------------------------------------------------------------------

  /// Lists every story in `familyId`, newest first. Approved members of
  /// `familyId` only. A story whose `familyId` differs is never returned, so
  /// Family A stories never appear in a Family B call.
  public query ({ caller }) func listStoriesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Story] {
    requireStoryMemberForFamily(caller, familyId);
    FamilyHistoryScopeLib.listStoriesForFamily(stories, familyId);
  };

  /// Returns a single story by id when it belongs to `familyId`. Approved
  /// members of `familyId` only. A story that exists under another family is
  /// never returned, so a `storyId` alone cannot cross the family boundary.
  public query ({ caller }) func getStoryForFamily(
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
  ) : async ?Types.Story {
    requireStoryMemberForFamily(caller, familyId);
    FamilyHistoryScopeLib.getForFamily(stories, familyId, storyId);
  };

  /// Lists every story in `familyId` currently in pending state. Active Steward
  /// of `familyId` only. A story whose `familyId` differs is never returned.
  public query ({ caller }) func listPendingStoriesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Story] {
    requireStoryStewardForFamily(caller, familyId);
    FamilyHistoryScopeLib.listPendingForFamily(stories, familyId);
  };

  /// Lists every approved story in `familyId` (visible to viewers). Approved
  /// members of `familyId` only. A story whose `familyId` differs is never
  /// returned.
  public query ({ caller }) func listApprovedStoriesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Story] {
    requireStoryMemberForFamily(caller, familyId);
    FamilyHistoryScopeLib.listApprovedForFamily(stories, familyId);
  };

  /// Submits a new story into `familyId`. Approved members or Stewards of
  /// `familyId` only. The new story's `familyId` is the requested `familyId`;
  /// every related person must belong to `familyId`, and every linked Archive
  /// media id must belong to `familyId`. The story is stored in pending state
  /// and waits for a Steward of `familyId` to approve it.
  public shared ({ caller }) func submitStoryForFamily(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
  ) : async Types.Story {
    submitStoryForFamilyInternal(familyId, title, storyText, relatedMemberIds, era, year, location, evidenceStatus, relatedArchiveItemIds, caller);
  };

  /// Adds a canonical story directly into `familyId` (Steward only), already
  /// approved. Active Steward of `familyId` only. The new story's `familyId` is
  /// the requested `familyId`; every related person must belong to `familyId`,
  /// and every linked Archive media id must belong to `familyId`.
  public shared ({ caller }) func addCanonicalStoryForFamily(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
  ) : async Types.Story {
    addCanonicalStoryForFamilyInternal(familyId, title, storyText, relatedMemberIds, era, year, location, evidenceStatus, relatedArchiveItemIds, caller);
  };

  /// Edits a canonical story in `familyId` (Steward only). Active Steward of
  /// `familyId` only; a Steward of another family cannot edit the story. Returns
  /// the updated story, or `null` when no story with that id belongs to
  /// `familyId`. A story in another family is never touched.
  public shared ({ caller }) func updateCanonicalStoryForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.StoryId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
  ) : async ?Types.Story {
    updateCanonicalStoryForFamilyInternal(familyId, id, title, storyText, relatedMemberIds, era, year, location, evidenceStatus, relatedArchiveItemIds, caller);
  };

  /// Approves a pending story in `familyId`. Active Steward of `familyId` only;
  /// a Steward of another family cannot approve the story. Returns the updated
  /// story, or `null` when no pending story with that id belongs to `familyId`.
  /// A story in another family is never touched.
  public shared ({ caller }) func approveStoryForFamily(
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
  ) : async ?Types.Story {
    approveStoryForFamilyInternal(familyId, storyId, caller);
  };

  /// Rejects a pending story in `familyId`. Active Steward of `familyId` only;
  /// a Steward of another family cannot reject the story. Returns the updated
  /// story, or `null` when no pending story with that id belongs to `familyId`.
  /// A story in another family is never touched.
  public shared ({ caller }) func rejectStoryForFamily(
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
  ) : async ?Types.Story {
    rejectStoryForFamilyInternal(familyId, storyId, caller);
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listApprovedStoriesForFamily`.
  public query ({ caller }) func listApprovedStories() : async [Types.Story] {
    requireStoryMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    FamilyHistoryScopeLib.listApprovedForFamily(stories, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listPendingStoriesForFamily`.
  public query ({ caller }) func listPendingStories() : async [Types.Story] {
    requireStoryStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    FamilyHistoryScopeLib.listPendingForFamily(stories, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `submitStoryForFamily`.
  public shared ({ caller }) func submitStory(
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
  ) : async Types.Story {
    submitStoryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, storyText, relatedMemberIds, era, year, location, evidenceStatus, relatedArchiveItemIds, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveStoryForFamily`.
  public shared ({ caller }) func approveStory(id : Types.StoryId) : async ?Types.Story {
    approveStoryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectStoryForFamily`.
  public shared ({ caller }) func rejectStory(id : Types.StoryId) : async ?Types.Story {
    rejectStoryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `addCanonicalStoryForFamily`.
  public shared ({ caller }) func addCanonicalStory(
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
  ) : async Types.Story {
    addCanonicalStoryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, storyText, relatedMemberIds, era, year, location, evidenceStatus, relatedArchiveItemIds, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `updateCanonicalStoryForFamily`.
  public shared ({ caller }) func updateCanonicalStory(
    id : Types.StoryId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
  ) : async ?Types.Story {
    updateCanonicalStoryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, title, storyText, relatedMemberIds, era, year, location, evidenceStatus, relatedArchiveItemIds, caller);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Traps unless the caller is a signed-in approved member or Steward of
  /// `familyId`, using the canonical family-scoped membership helper.
  func requireStoryMemberForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the canonical family-scoped Steward helper. A Steward of one family can
  /// never review another family's stories.
  func requireStoryStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Traps unless every related person id resolves to an existing person in
  /// `familyId`. This restores the pre-tenancy existence guard explicitly:
  /// `isPersonInFamily` accepts any well-formed person id for the default
  /// Norwood family, so without this check a Norwood caller could submit a story
  /// referencing a person that does not exist, where the pre-tenancy endpoint
  /// trapped. A person is considered to exist in `familyId` when a profile for
  /// them is tracked in that family; the guard runs before
  /// `requirePeopleInFamily`, which then enforces the cross-family boundary.
  func requireStoryPeopleExistInFamily(personIds : [Text], familyId : FamilyTypes.FamilyId) {
    for (personId in personIds.values()) {
      if (TenancyLib.getProfileForFamily(profiles, familyId, personId) == null) {
        Runtime.trap("Related family member not found");
      };
    };
  };

  /// Traps unless every linked media id resolves to an Archive item in
  /// `familyId`. A media id from another family is never attached. Named
  /// `requireStoryLinkedMediaInFamily` so it does not collide with the Board or
  /// Recipes mixins' same-purpose helpers when all are included in `main.mo`.
  func requireStoryLinkedMediaInFamily(mediaIds : [Nat], familyId : FamilyTypes.FamilyId) {
    for (mediaId in mediaIds.values()) {
      if (archiveItems.find(func it = it.id == mediaId and ArchiveLib.belongsToFamily(it, familyId)) == null) {
        Runtime.trap("Unauthorized: Linked media must belong to the same family");
      };
    };
  };

  /// Computes the next story id: one greater than the largest existing id, or
  /// `0` when there are no stories.
  func nextStoryId() : Types.StoryId {
    var maxId = 0;
    for (story in stories.toArray().values()) {
      if (story.id >= maxId) { maxId := story.id + 1 };
    };
    maxId;
  };

  /// Internal implementation of `submitStoryForFamily` that takes the caller
  /// explicitly, so the membership gate always evaluates the real caller rather
  /// than the canister principal a shared-to-shared call would otherwise
  /// present. Validates the submission, enforces the family boundary on every
  /// related person and every linked media id, and stores the story in pending
  /// state.
  func submitStoryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
    caller : Principal,
  ) : Types.Story {
    requireStoryMemberForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanStoryText = InputValidation.requireText("storyText", storyText, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanEra = InputValidation.requireOptionalText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanLocation = InputValidation.requireOptionalText("location", location, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    // Every related person must belong to the requested family: Family A may
    // never reference Family B people. This runs first so a foreign-family
    // person is rejected with the family-boundary message.
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    // Every related person must also exist in the requested family. This
    // restores the pre-tenancy existence guard explicitly: `isPersonInFamily`
    // accepts any well-formed person id for the default Norwood family, so
    // without this check a Norwood caller could reference a nonexistent person.
    requireStoryPeopleExistInFamily(cleanRelated, familyId);
    // Every linked media id must resolve to an Archive item in the same family.
    requireStoryLinkedMediaInFamily(relatedArchiveItemIds, familyId);
    let story : Types.Story = {
      familyId;
      id = nextStoryId();
      title = cleanTitle;
      storyText = cleanStoryText;
      relatedMemberIds = cleanRelated;
      era = cleanEra;
      year;
      location = cleanLocation;
      contributor = caller;
      evidenceStatus;
      relatedArchiveItemIds;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Pending;
    };
    ignore (FamilyHistoryScopeLib.submitForFamily(stories, story));
    story;
  };

  /// Internal implementation of `addCanonicalStoryForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  /// Stores an already-approved canonical story in `familyId`.
  func addCanonicalStoryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
    caller : Principal,
  ) : Types.Story {
    requireStoryStewardForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanStoryText = InputValidation.requireText("storyText", storyText, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanEra = InputValidation.requireOptionalText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanLocation = InputValidation.requireOptionalText("location", location, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    requireStoryPeopleExistInFamily(cleanRelated, familyId);
    requireStoryLinkedMediaInFamily(relatedArchiveItemIds, familyId);
    let story : Types.Story = {
      familyId;
      id = nextStoryId();
      title = cleanTitle;
      storyText = cleanStoryText;
      relatedMemberIds = cleanRelated;
      era = cleanEra;
      year;
      location = cleanLocation;
      contributor = caller;
      evidenceStatus;
      relatedArchiveItemIds;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Approved;
    };
    ignore (FamilyHistoryScopeLib.addCanonicalForFamily(stories, story));
    story;
  };

  /// Internal implementation of `updateCanonicalStoryForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  /// Returns the updated story, or `null` when no story with that id belongs to
  /// `familyId`.
  func updateCanonicalStoryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    id : Types.StoryId,
    title : Text,
    storyText : Text,
    relatedMemberIds : [Text],
    era : ?Text,
    year : ?Nat,
    location : ?Text,
    evidenceStatus : Types.EvidenceStatus,
    relatedArchiveItemIds : [Nat],
    caller : Principal,
  ) : ?Types.Story {
    requireStoryStewardForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanStoryText = InputValidation.requireText("storyText", storyText, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanEra = InputValidation.requireOptionalText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanLocation = InputValidation.requireOptionalText("location", location, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    requireStoryPeopleExistInFamily(cleanRelated, familyId);
    requireStoryLinkedMediaInFamily(relatedArchiveItemIds, familyId);
    switch (FamilyHistoryScopeLib.getForFamily(stories, familyId, id)) {
      case null { null };
      case (?existing) {
        let updated : Types.Story = {
          familyId;
          id;
          title = cleanTitle;
          storyText = cleanStoryText;
          relatedMemberIds = cleanRelated;
          era = cleanEra;
          year;
          location = cleanLocation;
          contributor = existing.contributor;
          evidenceStatus;
          relatedArchiveItemIds;
          createdAt = existing.createdAt;
          updatedAt = Time.now();
          status = existing.status;
        };
        FamilyHistoryScopeLib.updateCanonicalForFamily(stories, familyId, updated);
      };
    };
  };

  /// Internal implementation of `approveStoryForFamily` that takes the caller
  /// explicitly, so the Steward gate always evaluates the real caller. Returns
  /// the updated story, or `null` when no pending story with that id belongs to
  /// `familyId`.
  func approveStoryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
    caller : Principal,
  ) : ?Types.Story {
    requireStoryStewardForFamily(caller, familyId);
    FamilyHistoryScopeLib.approveForFamily(stories, familyId, storyId);
  };

  /// Internal implementation of `rejectStoryForFamily` that takes the caller
  /// explicitly, so the Steward gate always evaluates the real caller. Returns
  /// the updated story, or `null` when no pending story with that id belongs to
  /// `familyId`.
  func rejectStoryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    storyId : Types.StoryId,
    caller : Principal,
  ) : ?Types.Story {
    requireStoryStewardForFamily(caller, familyId);
    FamilyHistoryScopeLib.rejectForFamily(stories, familyId, storyId);
  };
};

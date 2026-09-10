import AccessControl "mo:caffeineai-authorization/access-control";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/family-history";
import OwnershipTypes "../types/ownership";
import ArchiveTypes "../types/archive";
import FamilyHistoryLib "../lib/family-history";

mixin (
  accessControlState : AccessControl.AccessControlState,
  stories : List.List<Types.Story>,
  mysteries : List.List<Types.Mystery>,
  mysteryContributions : List.List<Types.MysteryContribution>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
) {
  /// Computes the next story id: one greater than the largest existing id, or
  /// `0` when there are no stories.
  func nextStoryId() : Types.StoryId {
    var maxId = 0;
    for (story in stories.toArray().values()) {
      if (story.id >= maxId) { maxId := story.id + 1 };
    };
    maxId;
  };

  /// Computes the next mystery id: one greater than the largest existing id, or
  /// `0` when there are no mysteries.
  func nextMysteryId() : Types.MysteryId {
    var maxId = 0;
    for (mystery in mysteries.toArray().values()) {
      if (mystery.id >= maxId) { maxId := mystery.id + 1 };
    };
    maxId;
  };

  /// Computes the next mystery contribution id: one greater than the largest
  /// existing id, or `0` when there are no contributions.
  func nextContributionId() : Types.MysteryContributionId {
    var maxId = 0;
    for (contribution in mysteryContributions.toArray().values()) {
      if (contribution.id >= maxId) { maxId := contribution.id + 1 };
    };
    maxId;
  };

  /// Lists all approved stories (visible to viewers).
  public query func listApprovedStories() : async [Types.Story] {
    FamilyHistoryLib.listApproved(stories);
  };

  /// Lists all stories in pending state (steward only).
  public query ({ caller }) func listPendingStories() : async [Types.Story] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list pending stories");
    };
    FamilyHistoryLib.listPending(stories);
  };

  /// Submits a new story. Requires sign-in; the signed-in caller is recorded as
  /// the contributor. The story is stored in pending state and waits for a
  /// Family Steward to approve it before becoming visible.
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
    if (caller.isAnonymous()) {
      Runtime.trap("Sign-in required to submit a story");
    };
    let story : Types.Story = {
      id = nextStoryId();
      title;
      storyText;
      relatedMemberIds;
      era;
      year;
      location;
      contributor = caller;
      evidenceStatus;
      relatedArchiveItemIds;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Pending;
    };
    FamilyHistoryLib.submit(stories, story);
  };

  /// Approves a pending story (steward only). Returns the updated story, or
  /// `null` when the story does not exist or is not pending.
  public shared ({ caller }) func approveStory(id : Types.StoryId) : async ?Types.Story {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve stories");
    };
    FamilyHistoryLib.approve(stories, id);
  };

  /// Rejects a pending story (steward only). Returns the updated story, or
  /// `null` when the story does not exist or is not pending.
  public shared ({ caller }) func rejectStory(id : Types.StoryId) : async ?Types.Story {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject stories");
    };
    FamilyHistoryLib.reject(stories, id);
  };

  /// Adds a canonical story directly (steward only), already approved.
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
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can add canonical stories");
    };
    let story : Types.Story = {
      id = nextStoryId();
      title;
      storyText;
      relatedMemberIds;
      era;
      year;
      location;
      contributor = caller;
      evidenceStatus;
      relatedArchiveItemIds;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Approved;
    };
    FamilyHistoryLib.addCanonical(stories, story);
  };

  /// Edits a canonical story (steward only). Returns the updated story, or
  /// `null` when the story does not exist.
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
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can edit canonical stories");
    };
    switch (stories.find(func s = s.id == id)) {
      case (?existing) {
        let updated : Types.Story = {
          id;
          title;
          storyText;
          relatedMemberIds;
          era;
          year;
          location;
          contributor = existing.contributor;
          evidenceStatus;
          relatedArchiveItemIds;
          createdAt = existing.createdAt;
          updatedAt = Time.now();
          status = existing.status;
        };
        FamilyHistoryLib.updateCanonical(stories, updated);
      };
      case null { null };
    };
  };

  /// Lists all mysteries (visible to viewers).
  public query func listMysteries() : async [Types.Mystery] {
    FamilyHistoryLib.listMysteries(mysteries);
  };

  /// Submits a mystery contribution (a note, memory, possible lead, or
  /// source/document reference). Requires sign-in; the signed-in caller is
  /// recorded as the contributor. The contribution is stored in pending state
  /// and waits for a Family Steward to review it before altering the canonical
  /// mystery record.
  public shared ({ caller }) func submitMysteryContribution(
    mysteryId : Types.MysteryId,
    contributionType : Types.MysteryContributionType,
    text : Text,
  ) : async Types.MysteryContribution {
    if (caller.isAnonymous()) {
      Runtime.trap("Sign-in required to contribute to a mystery");
    };
    let contribution : Types.MysteryContribution = {
      id = nextContributionId();
      mysteryId;
      contributionType;
      text;
      contributor = caller;
      status = #Pending;
      createdAt = Time.now();
      reviewedBy = null;
      reviewedAt = null;
    };
    FamilyHistoryLib.submitContribution(mysteryContributions, contribution);
  };

  /// Lists all mystery contributions in pending state (steward only).
  public query ({ caller }) func listPendingMysteryContributions() : async [Types.MysteryContribution] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list pending mystery contributions");
    };
    FamilyHistoryLib.listPendingContributions(mysteryContributions);
  };

  /// Approves or rejects a pending mystery contribution (steward only). Returns
  /// the updated contribution, or `null` when it does not exist or is not
  /// pending.
  public shared ({ caller }) func reviewMysteryContribution(id : Types.MysteryContributionId, approve : Bool) : async ?Types.MysteryContribution {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can review mystery contributions");
    };
    FamilyHistoryLib.reviewContribution(mysteryContributions, id, approve, caller);
  };

  /// Creates a canonical mystery directly (steward only).
  public shared ({ caller }) func createCanonicalMystery(
    title : Text,
    description : Text,
    relatedMemberIds : [Text],
    relatedBranchId : ?Text,
    knownFacts : [Text],
    possibilities : [Text],
    relatedSourceIds : [Nat],
    relatedArchiveItemIds : [Nat],
    status : Types.MysteryStatus,
  ) : async Types.Mystery {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can create canonical mysteries");
    };
    let mystery : Types.Mystery = {
      id = nextMysteryId();
      title;
      description;
      relatedMemberIds;
      relatedBranchId;
      knownFacts;
      possibilities;
      relatedSourceIds;
      relatedArchiveItemIds;
      status;
      contributor = caller;
      createdAt = Time.now();
      updatedAt = Time.now();
      resolution = null;
    };
    FamilyHistoryLib.createCanonical(mysteries, mystery);
  };

  /// Edits a canonical mystery (steward only). Returns the updated mystery, or
  /// `null` when it does not exist.
  public shared ({ caller }) func updateCanonicalMystery(
    id : Types.MysteryId,
    title : Text,
    description : Text,
    relatedMemberIds : [Text],
    relatedBranchId : ?Text,
    knownFacts : [Text],
    possibilities : [Text],
    relatedSourceIds : [Nat],
    relatedArchiveItemIds : [Nat],
    status : Types.MysteryStatus,
  ) : async ?Types.Mystery {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can edit canonical mysteries");
    };
    switch (mysteries.find(func m = m.id == id)) {
      case (?existing) {
        let updated : Types.Mystery = {
          id;
          title;
          description;
          relatedMemberIds;
          relatedBranchId;
          knownFacts;
          possibilities;
          relatedSourceIds;
          relatedArchiveItemIds;
          status;
          contributor = existing.contributor;
          createdAt = existing.createdAt;
          updatedAt = Time.now();
          resolution = existing.resolution;
        };
        FamilyHistoryLib.updateCanonicalMystery(mysteries, updated);
      };
      case null { null };
    };
  };

  /// Marks a mystery resolved (steward only), recording the resolution summary
  /// and supporting evidence while preserving the prior theories/history.
  /// Returns the updated mystery, or `null` when it does not exist.
  public shared ({ caller }) func markMysteryResolved(
    id : Types.MysteryId,
    summary : Text,
    supportingEvidence : [Text],
  ) : async ?Types.Mystery {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can mark mysteries resolved");
    };
    let resolution : Types.Resolution = {
      summary;
      supportingEvidence;
      resolvedAt = Time.now();
      resolvedBy = caller;
    };
    FamilyHistoryLib.markResolved(mysteries, id, resolution);
  };

  /// Lists timeline events aggregated from existing canonical data (visible to
  /// viewers).
  public query func listTimelineEvents() : async [Types.TimelineEvent] {
    FamilyHistoryLib.listTimelineEvents(profiles, archiveItems, stories, mysteries);
  };
};

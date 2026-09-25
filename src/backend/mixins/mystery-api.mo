import List "mo:core/List";
import Map "mo:core/Map";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/family-history";
import OwnershipTypes "../types/ownership";
import ArchiveTypes "../types/archive";
import GovernanceTypes "../types/governance";
import MysteryLib "../lib/mystery";
import FamilyAuthorizationLib "../lib/family-authorization";
import StewardAuthorityLib "../lib/steward-authority";
import InputValidation "../lib/input-validation";

/// Mystery public API, extracted verbatim from the pre-Tenancy-1C-D3-A
/// `mixins/family-history-api.mo` when the Story endpoints moved to the
/// canonical family-scoped `mixins/family-history-scope-api.mo`.
///
/// Mysteries are NOT family-scoped by this build: every endpoint here keeps its
/// original single-family behavior, authorization, and signature. Family-scoping
/// Mysteries is a separate later Tenancy build.
mixin (
  stories : List.List<Types.Story>,
  mysteries : List.List<Types.Mystery>,
  mysteryContributions : List.List<Types.MysteryContribution>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
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

  /// Lists all mysteries (visible to viewers).
  public query func listMysteries() : async [Types.Mystery] {
    MysteryLib.listMysteries(mysteries);
  };

  /// Submits a mystery contribution (a note, memory, possible lead, or
  /// source/document reference). Requires an approved family member; the caller
  /// is recorded as the contributor. The contribution is stored in pending state
  /// and waits for a Family Steward to review it before altering the canonical
  /// mystery record.
  public shared ({ caller }) func submitMysteryContribution(
    mysteryId : Types.MysteryId,
    contributionType : Types.MysteryContributionType,
    text : Text,
  ) : async Types.MysteryContribution {
    FamilyAuthorizationLib.requireApprovedFamilyMember(stewards, claims, caller);
    let cleanText = InputValidation.requireText("text", text, InputValidation.MAX_DESCRIPTION_CHARS);
    let contribution : Types.MysteryContribution = {
      id = nextContributionId();
      mysteryId;
      contributionType;
      text = cleanText;
      contributor = caller;
      status = #Pending;
      createdAt = Time.now();
      reviewedBy = null;
      reviewedAt = null;
    };
    MysteryLib.submitContribution(mysteryContributions, contribution);
  };

  /// Lists all mystery contributions in pending state (steward only).
  public query ({ caller }) func listPendingMysteryContributions() : async [Types.MysteryContribution] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list pending mystery contributions");
    };
    MysteryLib.listPendingContributions(mysteryContributions);
  };

  /// Approves or rejects a pending mystery contribution (steward only). Returns
  /// the updated contribution, or `null` when it does not exist or is not
  /// pending.
  public shared ({ caller }) func reviewMysteryContribution(id : Types.MysteryContributionId, approve : Bool) : async ?Types.MysteryContribution {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can review mystery contributions");
    };
    MysteryLib.reviewContribution(mysteryContributions, id, approve, caller);
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
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can create canonical mysteries");
    };
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanBranch = InputValidation.requireOptionalText("relatedBranchId", relatedBranchId, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedSourceIds", relatedSourceIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    let mystery : Types.Mystery = {
      id = nextMysteryId();
      title = cleanTitle;
      description = cleanDescription;
      relatedMemberIds = cleanRelated;
      relatedBranchId = cleanBranch;
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
    MysteryLib.createCanonical(mysteries, mystery);
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
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can edit canonical mysteries");
    };
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanBranch = InputValidation.requireOptionalText("relatedBranchId", relatedBranchId, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedSourceIds", relatedSourceIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    switch (mysteries.find(func m = m.id == id)) {
      case (?existing) {
        let updated : Types.Mystery = {
          id;
          title = cleanTitle;
          description = cleanDescription;
          relatedMemberIds = cleanRelated;
          relatedBranchId = cleanBranch;
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
        MysteryLib.updateCanonicalMystery(mysteries, updated);
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
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can mark mysteries resolved");
    };
    let cleanSummary = InputValidation.requireText("summary", summary, InputValidation.MAX_DESCRIPTION_CHARS);
    InputValidation.requireArraySize("supportingEvidence", supportingEvidence.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    let resolution : Types.Resolution = {
      summary = cleanSummary;
      supportingEvidence;
      resolvedAt = Time.now();
      resolvedBy = caller;
    };
    MysteryLib.markResolved(mysteries, id, resolution);
  };

  /// Lists timeline events aggregated from existing canonical data (visible to
  /// viewers).
  public query func listTimelineEvents() : async [Types.TimelineEvent] {
    MysteryLib.listTimelineEvents(profiles, archiveItems, stories, mysteries);
  };
};

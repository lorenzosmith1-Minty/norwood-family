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
import MysteryScopeLib "../lib/mystery-scope";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import TenancyLib "../lib/tenancy";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-D4-A canonical family-scoped Family Mystery public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Reads
/// gate on `FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily`;
/// Steward actions (pending list, review, canonical create/edit, resolve) gate
/// on `requireActiveStewardForFamily`. Every returned or mutated mystery and
/// contribution must carry `familyId == familyId`, and every related person and
/// linked Archive media id must belong to the same family, so a `mysteryId` or
/// `contributionId` alone never crosses a family boundary.
///
/// The legacy single-family Mystery endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
///
/// The Mystery review flow emits no notifications (OwnershipTypes.NotificationType
/// has no Mystery variants), so this mixin takes no notifications parameter.
mixin (
  stories : List.List<Types.Story>,
  mysteries : List.List<Types.Mystery>,
  mysteryContributions : List.List<Types.MysteryContribution>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  // ---------------------------------------------------------------------------
  // Canonical family-scoped endpoints.
  // ---------------------------------------------------------------------------

  /// Lists every mystery in `familyId`, newest first. Approved members of
  /// `familyId` only. A mystery whose `familyId` differs is never returned, so
  /// Family A mysteries never appear in a Family B call.
  public query ({ caller }) func listMysteriesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Mystery] {
    requireMysteryMemberForFamily(caller, familyId);
    MysteryScopeLib.listMysteriesForFamily(mysteries, familyId);
  };

  /// Returns a single mystery by id when it belongs to `familyId`. Approved
  /// members of `familyId` only. A mystery that exists under another family is
  /// never returned, so a `mysteryId` alone cannot cross the family boundary.
  public query ({ caller }) func getMysteryForFamily(
    familyId : FamilyTypes.FamilyId,
    mysteryId : Types.MysteryId,
  ) : async ?Types.Mystery {
    requireMysteryMemberForFamily(caller, familyId);
    MysteryScopeLib.getForFamily(mysteries, familyId, mysteryId);
  };

  /// Lists every contribution to `mysteryId` in `familyId`. Approved members of
  /// `familyId` only. A contribution whose `familyId` differs, or whose target
  /// mystery belongs to another family, is never returned, so a `mysteryId` or
  /// `contributionId` alone cannot cross the family boundary.
  public query ({ caller }) func listMysteryContributionsForFamily(
    familyId : FamilyTypes.FamilyId,
    mysteryId : Types.MysteryId,
  ) : async [Types.MysteryContribution] {
    requireMysteryMemberForFamily(caller, familyId);
    MysteryScopeLib.listContributionsForFamily(mysteryContributions, familyId, mysteryId);
  };

  /// Lists every mystery contribution in `familyId` currently in pending state.
  /// Active Steward of `familyId` only. A contribution whose `familyId` differs
  /// is never returned.
  public query ({ caller }) func listPendingMysteryContributionsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.MysteryContribution] {
    requireMysteryStewardForFamily(caller, familyId);
    MysteryScopeLib.listPendingContributionsForFamily(mysteryContributions, familyId);
  };

  /// Submits a mystery contribution (a note, memory, possible lead, or
  /// source/document reference) to a mystery in `familyId`. Approved members or
  /// Stewards of `familyId` only. The contribution's `familyId` is the requested
  /// `familyId`, its target mystery must belong to `familyId`, and every related
  /// person must belong to `familyId`. The contribution is stored in pending
  /// state and waits for a Steward of `familyId` to review it before altering
  /// the canonical mystery record.
  public shared ({ caller }) func submitMysteryContributionForFamily(
    familyId : FamilyTypes.FamilyId,
    mysteryId : Types.MysteryId,
    contributionType : Types.MysteryContributionType,
    text : Text,
  ) : async Types.MysteryContribution {
    submitMysteryContributionForFamilyInternal(familyId, mysteryId, contributionType, text, caller);
  };

  /// Approves or rejects a pending mystery contribution in `familyId`. Active
  /// Steward of `familyId` only; a Steward of another family cannot review the
  /// contribution. Returns the updated contribution, or `null` when no pending
  /// contribution with that id belongs to `familyId`. A contribution in another
  /// family is never touched.
  public shared ({ caller }) func reviewMysteryContributionForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.MysteryContributionId,
    approve : Bool,
  ) : async ?Types.MysteryContribution {
    reviewMysteryContributionForFamilyInternal(familyId, id, approve, caller);
  };

  /// Creates a canonical mystery directly in `familyId` (Steward only). Active
  /// Steward of `familyId` only. The new mystery's `familyId` is the requested
  /// `familyId`; every related person must belong to `familyId`, and every
  /// linked Archive media id must belong to `familyId`.
  public shared ({ caller }) func createCanonicalMysteryForFamily(
    familyId : FamilyTypes.FamilyId,
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
    createCanonicalMysteryForFamilyInternal(familyId, title, description, relatedMemberIds, relatedBranchId, knownFacts, possibilities, relatedSourceIds, relatedArchiveItemIds, status, caller);
  };

  /// Edits a canonical mystery in `familyId` (Steward only). Active Steward of
  /// `familyId` only; a Steward of another family cannot edit the mystery.
  /// Returns the updated mystery, or `null` when no mystery with that id belongs
  /// to `familyId`. A mystery in another family is never touched.
  public shared ({ caller }) func updateCanonicalMysteryForFamily(
    familyId : FamilyTypes.FamilyId,
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
    updateCanonicalMysteryForFamilyInternal(familyId, id, title, description, relatedMemberIds, relatedBranchId, knownFacts, possibilities, relatedSourceIds, relatedArchiveItemIds, status, caller);
  };

  /// Marks a mystery in `familyId` resolved (Steward only), recording the
  /// resolution summary and supporting evidence while preserving the prior
  /// theories/history. Active Steward of `familyId` only; a Steward of another
  /// family cannot resolve the mystery. Returns the updated mystery, or `null`
  /// when no mystery with that id belongs to `familyId`.
  public shared ({ caller }) func markMysteryResolvedForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Types.MysteryId,
    summary : Text,
    supportingEvidence : [Text],
  ) : async ?Types.Mystery {
    markMysteryResolvedForFamilyInternal(familyId, id, summary, supportingEvidence, caller);
  };

  /// Lists timeline events aggregated from existing canonical data in `familyId`
  /// (visible to approved members of `familyId`). Only records whose `familyId`
  /// equals `familyId` are considered.
  public query ({ caller }) func listTimelineEventsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.TimelineEvent] {
    requireMysteryMemberForFamily(caller, familyId);
    MysteryScopeLib.listTimelineEventsForFamily(profiles, archiveItems, stories, mysteries, familyId);
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listMysteriesForFamily`.
  /// Preserves the pre-tenancy behavior exactly: the legacy `listMysteries` was
  /// an ungated public query, so this wrapper does not add a membership gate.
  public query func listMysteries() : async [Types.Mystery] {
    MysteryScopeLib.listMysteriesForFamily(mysteries, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `submitMysteryContributionForFamily`.
  public shared ({ caller }) func submitMysteryContribution(
    mysteryId : Types.MysteryId,
    contributionType : Types.MysteryContributionType,
    text : Text,
  ) : async Types.MysteryContribution {
    submitMysteryContributionForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, mysteryId, contributionType, text, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listPendingMysteryContributionsForFamily`.
  public query ({ caller }) func listPendingMysteryContributions() : async [Types.MysteryContribution] {
    requireMysteryStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    MysteryScopeLib.listPendingContributionsForFamily(mysteryContributions, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `reviewMysteryContributionForFamily`.
  public shared ({ caller }) func reviewMysteryContribution(id : Types.MysteryContributionId, approve : Bool) : async ?Types.MysteryContribution {
    reviewMysteryContributionForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, approve, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `createCanonicalMysteryForFamily`.
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
    createCanonicalMysteryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, title, description, relatedMemberIds, relatedBranchId, knownFacts, possibilities, relatedSourceIds, relatedArchiveItemIds, status, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `updateCanonicalMysteryForFamily`.
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
    updateCanonicalMysteryForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, title, description, relatedMemberIds, relatedBranchId, knownFacts, possibilities, relatedSourceIds, relatedArchiveItemIds, status, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `markMysteryResolvedForFamily`.
  public shared ({ caller }) func markMysteryResolved(
    id : Types.MysteryId,
    summary : Text,
    supportingEvidence : [Text],
  ) : async ?Types.Mystery {
    markMysteryResolvedForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, summary, supportingEvidence, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listTimelineEventsForFamily`. Preserves the pre-tenancy behavior exactly:
  /// the legacy `listTimelineEvents` was an ungated public query, so this
  /// wrapper does not add a membership gate.
  public query func listTimelineEvents() : async [Types.TimelineEvent] {
    MysteryScopeLib.listTimelineEventsForFamily(profiles, archiveItems, stories, mysteries, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Traps unless the caller is a signed-in approved member or Steward of
  /// `familyId`, using the canonical family-scoped membership helper.
  func requireMysteryMemberForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the canonical family-scoped Steward helper. A Steward of one family can
  /// never review another family's mysteries.
  func requireMysteryStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Traps unless every related person id resolves to an existing person in
  /// `familyId`. This restores the pre-tenancy existence guard explicitly:
  /// `isPersonInFamily` accepts any well-formed person id for the default
  /// Norwood family, so without this check a Norwood caller could submit a
  /// mystery referencing a person that does not exist, where the pre-tenancy
  /// endpoint trapped. A person is considered to exist in `familyId` when a
  /// profile for them is tracked in that family; the guard runs before
  /// `requirePeopleInFamily`, which then enforces the cross-family boundary.
  func requireMysteryPeopleExistInFamily(personIds : [Text], familyId : FamilyTypes.FamilyId) {
    for (personId in personIds.values()) {
      if (TenancyLib.getProfileForFamily(profiles, familyId, personId) == null) {
        Runtime.trap("Related family member not found");
      };
    };
  };

  /// Traps unless every linked media id resolves to an Archive item in
  /// `familyId`. A media id from another family is never attached. Named
  /// `requireMysteryLinkedMediaInFamily` so it does not collide with the Board,
  /// Recipes, or Stories mixins' same-purpose helpers when all are included in
  /// `main.mo`.
  func requireMysteryLinkedMediaInFamily(mediaIds : [Nat], familyId : FamilyTypes.FamilyId) {
    for (mediaId in mediaIds.values()) {
      if (archiveItems.find(func it = it.id == mediaId and ArchiveLib.belongsToFamily(it, familyId)) == null) {
        Runtime.trap("Unauthorized: Linked media must belong to the same family");
      };
    };
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

  /// Internal implementation of `submitMysteryContributionForFamily` that takes
  /// the caller explicitly, so the membership gate always evaluates the real
  /// caller rather than the canister principal a shared-to-shared call would
  /// otherwise present. Validates the submission, enforces the family boundary
  /// on the target mystery and every related person, and stores the contribution
  /// in pending state.
  func submitMysteryContributionForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    mysteryId : Types.MysteryId,
    contributionType : Types.MysteryContributionType,
    text : Text,
    caller : Principal,
  ) : Types.MysteryContribution {
    requireMysteryMemberForFamily(caller, familyId);
    // The target mystery must belong to the requested family: a Family A member
    // can never contribute to a Family B mystery. A foreign-family mystery id
    // behaves as not-found.
    switch (MysteryScopeLib.getForFamily(mysteries, familyId, mysteryId)) {
      case null { Runtime.trap("Mystery not found") };
      case (?_) {};
    };
    let cleanText = InputValidation.requireText("text", text, InputValidation.MAX_DESCRIPTION_CHARS);
    let contribution : Types.MysteryContribution = {
      familyId;
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
    MysteryScopeLib.submitContributionForFamily(mysteryContributions, contribution);
  };

  /// Internal implementation of `reviewMysteryContributionForFamily` that takes
  /// the caller explicitly, so the Steward gate always evaluates the real
  /// caller. Returns the updated contribution, or `null` when no pending
  /// contribution with that id belongs to `familyId`.
  func reviewMysteryContributionForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    id : Types.MysteryContributionId,
    approve : Bool,
    caller : Principal,
  ) : ?Types.MysteryContribution {
    requireMysteryStewardForFamily(caller, familyId);
    MysteryScopeLib.reviewContributionForFamily(mysteryContributions, familyId, id, approve, caller);
  };

  /// Internal implementation of `createCanonicalMysteryForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  /// Validates the submission and enforces the family boundary on every related
  /// person and every linked media id.
  func createCanonicalMysteryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    title : Text,
    description : Text,
    relatedMemberIds : [Text],
    relatedBranchId : ?Text,
    knownFacts : [Text],
    possibilities : [Text],
    relatedSourceIds : [Nat],
    relatedArchiveItemIds : [Nat],
    status : Types.MysteryStatus,
    caller : Principal,
  ) : Types.Mystery {
    requireMysteryStewardForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanBranch = InputValidation.requireOptionalText("relatedBranchId", relatedBranchId, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedSourceIds", relatedSourceIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    // Every related person must belong to the requested family: Family A may
    // never reference Family B people. This runs first so a foreign-family
    // person is rejected with the family-boundary message.
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    // Every related person must also exist in the requested family. This
    // restores the pre-tenancy existence guard explicitly: `isPersonInFamily`
    // accepts any well-formed person id for the default Norwood family, so
    // without this check a Norwood caller could reference a nonexistent person.
    requireMysteryPeopleExistInFamily(cleanRelated, familyId);
    // Every linked media id must resolve to an Archive item in the same family.
    requireMysteryLinkedMediaInFamily(relatedArchiveItemIds, familyId);
    let mystery : Types.Mystery = {
      familyId;
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
    MysteryScopeLib.createCanonicalForFamily(mysteries, mystery);
  };

  /// Internal implementation of `updateCanonicalMysteryForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  /// Returns the updated mystery, or `null` when no mystery with that id belongs
  /// to `familyId`.
  func updateCanonicalMysteryForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
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
    caller : Principal,
  ) : ?Types.Mystery {
    requireMysteryStewardForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanBranch = InputValidation.requireOptionalText("relatedBranchId", relatedBranchId, InputValidation.MAX_LOCATION_CHARS);
    InputValidation.requireArraySize("relatedSourceIds", relatedSourceIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    InputValidation.requireArraySize("relatedArchiveItemIds", relatedArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    requireMysteryPeopleExistInFamily(cleanRelated, familyId);
    requireMysteryLinkedMediaInFamily(relatedArchiveItemIds, familyId);
    switch (MysteryScopeLib.getForFamily(mysteries, familyId, id)) {
      case null { null };
      case (?existing) {
        let updated : Types.Mystery = {
          familyId;
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
        MysteryScopeLib.updateCanonicalForFamily(mysteries, familyId, updated);
      };
    };
  };

  /// Internal implementation of `markMysteryResolvedForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  /// Returns the updated mystery, or `null` when no mystery with that id belongs
  /// to `familyId`.
  func markMysteryResolvedForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    id : Types.MysteryId,
    summary : Text,
    supportingEvidence : [Text],
    caller : Principal,
  ) : ?Types.Mystery {
    requireMysteryStewardForFamily(caller, familyId);
    let cleanSummary = InputValidation.requireText("summary", summary, InputValidation.MAX_DESCRIPTION_CHARS);
    InputValidation.requireArraySize("supportingEvidence", supportingEvidence.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    let resolution : Types.Resolution = {
      summary = cleanSummary;
      supportingEvidence;
      resolvedAt = Time.now();
      resolvedBy = caller;
    };
    MysteryScopeLib.markResolvedForFamily(mysteries, familyId, id, resolution);
  };
};

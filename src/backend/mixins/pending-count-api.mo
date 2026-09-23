import List "mo:core/List";
import Principal "mo:core/Principal";
import AccessControl "mo:caffeineai-authorization/access-control";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";
import FamilyTypes "../types/family";
import GovernanceTypes "../types/governance";
import ResearchTypes "../types/research-intake";
import PendingCountLib "../lib/pending-count";
import ResearchSourceScopeLib "../lib/research-source-scope";
import FamilyAuthorizationLib "../lib/family-authorization";

mixin (
  accessControlState : AccessControl.AccessControlState,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  recipes : List.List<RecipeTypes.Recipe>,
  stories : List.List<FamilyHistoryTypes.Story>,
  mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  sources : List.List<ResearchTypes.SourceRecord>,
) {
  /// Canonical family-scoped pending-contributions count. Shared by the
  /// family-scoped endpoint and its temporary compatibility wrapper so the
  /// authorization sequence and the Research-linked id set never diverge. The
  /// Research-linked exclusion is family-correct: only a Research Source in
  /// `familyId` suppresses its linked Archive item, so a Family A source never
  /// affects a Family B pending count.
  func pendingContributionsCountForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) : Nat {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    let linkedIds = ResearchSourceScopeLib.researchLinkedArchiveIdsForFamily(sources, familyId);
    PendingCountLib.countPendingForFamily(
      familyId,
      archiveItems,
      recipes,
      stories,
      mysteryContributions,
      linkedIds,
    );
  };

  /// Returns the count of all current pending review items (archive/media,
  /// video/audio, recipes, recipe media, stories, and mystery contributions)
  /// for the Steward-facing Pending Contributions badge, scoped to `familyId`.
  /// Research Intake review items are NOT included — they resolve exclusively
  /// through the Research Review Queue (getReviewQueue) — and neither is a
  /// pending Archive item linked to a Research Source, which is reviewed through
  /// that same queue. Family Steward of `familyId` only: a Steward of one family
  /// cannot read another family's pending count. The count is derived from
  /// canonical pending data, so it increments on new pending items and
  /// decrements on Approve/Reject automatically, and it always agrees with the
  /// Pending Contributions list.
  public query ({ caller }) func getPendingContributionsCountForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async Nat {
    pendingContributionsCountForFamily(caller, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to the canonical family-scoped implementation with the default
  /// family id so current Norwood behavior is unchanged. Contains no duplicated
  /// business logic.
  public query ({ caller }) func getPendingContributionsCount() : async Nat {
    pendingContributionsCountForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };
};

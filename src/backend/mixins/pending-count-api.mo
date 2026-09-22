import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Set "mo:core/Set";
import AccessControl "mo:caffeineai-authorization/access-control";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";
import GovernanceTypes "../types/governance";
import ResearchTypes "../types/research-intake";
import PendingCountLib "../lib/pending-count";
import StewardAuthorityLib "../lib/steward-authority";

mixin (
  accessControlState : AccessControl.AccessControlState,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  recipes : List.List<RecipeTypes.Recipe>,
  stories : List.List<FamilyHistoryTypes.Story>,
  mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  sources : List.List<ResearchTypes.SourceRecord>,
) {
  /// Returns the count of all current pending review items (archive/media,
  /// video/audio, recipes, recipe media, stories, and mystery contributions)
  /// for the Steward-facing Pending Contributions badge. Research Intake review
  /// items are NOT included — they resolve exclusively through the Research
  /// Review Queue (getReviewQueue) — and neither is a pending Archive item
  /// linked to a Research Source, which is reviewed through that same queue.
  /// Family Steward only. The count is derived from canonical pending data, so
  /// it increments on new pending items and decrements on Approve/Reject
  /// automatically, and it always agrees with the Pending Contributions list.
  public query ({ caller }) func getPendingContributionsCount() : async Nat {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view the pending contributions count");
    };
    let linkedIds = Set.empty<ArchiveTypes.ArchiveItemId>();
    for (s in sources.toArray().values()) {
      switch (s.archiveItemId) {
        case (?archiveItemId) { linkedIds.add(archiveItemId) };
        case null {};
      };
    };
    PendingCountLib.countPending(
      archiveItems,
      recipes,
      stories,
      mysteryContributions,
      linkedIds,
    );
  };
};

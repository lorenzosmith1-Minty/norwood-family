import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";
import GovernanceTypes "../types/governance";
import PendingCountLib "../lib/pending-count";
import StewardAuthorityLib "../lib/steward-authority";

mixin (
  accessControlState : AccessControl.AccessControlState,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  recipes : List.List<RecipeTypes.Recipe>,
  stories : List.List<FamilyHistoryTypes.Story>,
  mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Returns the count of all current pending review items (archive/media,
  /// video/audio, recipes, recipe media, stories, and mystery contributions)
  /// for the Steward-facing Pending Contributions badge. Research Intake review
  /// items are NOT included — they resolve exclusively through the Research
  /// Review Queue (getReviewQueue). Family Steward only. The count is derived
  /// from canonical pending data, so it increments on new pending items and
  /// decrements on Approve/Reject automatically.
  public query ({ caller }) func getPendingContributionsCount() : async Nat {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view the pending contributions count");
    };
    PendingCountLib.countPending(
      archiveItems,
      recipes,
      stories,
      mysteryContributions,
    );
  };
};

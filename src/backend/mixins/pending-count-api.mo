import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";
import PendingCountLib "../lib/pending-count";

mixin (
  accessControlState : AccessControl.AccessControlState,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  recipes : List.List<RecipeTypes.Recipe>,
  stories : List.List<FamilyHistoryTypes.Story>,
  mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
) {
  /// Returns the count of all current pending review items (archive/media,
  /// video/audio, recipes, recipe media, and other contribution types) for the
  /// Steward-facing Pending Contributions badge. Family Steward only. The count
  /// is derived from canonical pending data, so it increments on new pending
  /// items and decrements on Approve/Reject automatically.
  public query ({ caller }) func getPendingContributionsCount() : async Nat {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view the pending contributions count");
    };
    PendingCountLib.countPending(archiveItems, recipes, stories, mysteryContributions);
  };
};

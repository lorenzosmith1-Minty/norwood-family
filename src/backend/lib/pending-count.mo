import List "mo:core/List";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";

module {
  /// Counts all current pending review items across contribution types:
  /// pending archive/media (including video/audio), pending recipes (including
  /// recipe media), pending stories, and pending mystery contributions. This is
  /// the canonical aggregate backing the Steward-facing Pending Contributions
  /// badge.
  public func countPending(
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    recipes : List.List<RecipeTypes.Recipe>,
    stories : List.List<FamilyHistoryTypes.Story>,
    mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
  ) : Nat {
    let pendingArchive = archiveItems.toArray().filter(func a = a.status == #Pending).size();
    let pendingRecipes = recipes.toArray().filter(func r = r.status == #Pending).size();
    let pendingStories = stories.toArray().filter(func s = s.status == #Pending).size();
    let pendingMystery = mysteryContributions.toArray().filter(func m = m.status == #Pending).size();
    pendingArchive + pendingRecipes + pendingStories + pendingMystery;
  };
};

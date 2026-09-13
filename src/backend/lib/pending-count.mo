import List "mo:core/List";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";

module {
  /// Counts all current pending review items across the contribution types the
  /// Pending Contributions page actually renders and resolves: pending
  /// archive/media (including video/audio), pending recipes (including recipe
  /// media), pending stories, and pending mystery contributions. Research Intake
  /// review items (Sources, Proposed Findings, New Person Candidates,
  /// Relationship Proposals, and Conflict Review items) are deliberately NOT
  /// counted here — they resolve exclusively through the Research Review Queue
  /// (getReviewQueue) under Family Steward → Research Intake, so they must not
  /// inflate the Pending Contributions badge. This is the canonical aggregate
  /// backing the Steward-facing Pending Contributions badge.
  public func countPending(
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    recipes : List.List<RecipeTypes.Recipe>,
    stories : List.List<FamilyHistoryTypes.Story>,
    mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
  ) : Nat {
    var count = 0;
    for (a in archiveItems.toArray().values()) {
      if (a.status == #Pending) { count += 1 };
    };
    for (r in recipes.toArray().values()) {
      if (r.status == #Pending) { count += 1 };
    };
    for (s in stories.toArray().values()) {
      if (s.status == #Pending) { count += 1 };
    };
    for (m in mysteryContributions.toArray().values()) {
      if (m.status == #Pending) { count += 1 };
    };
    count;
  };
};

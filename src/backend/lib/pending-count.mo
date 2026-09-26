import List "mo:core/List";
import Set "mo:core/Set";
import ArchiveTypes "../types/archive";
import RecipeTypes "../types/recipes";
import FamilyHistoryTypes "../types/family-history";
import FamilyTypes "../types/family";

module {
  /// Counts all current pending review items across the contribution types the
  /// Pending Contributions page actually renders and resolves: pending
  /// archive/media (including video/audio), pending recipes (including recipe
  /// media), pending stories, and pending mystery contributions. Research Intake
  /// review items (Sources, Proposed Findings, New Person Candidates,
  /// Relationship Proposals, and Conflict Review items) are deliberately NOT
  /// counted here — they resolve exclusively through the Research Review Queue
  /// (getReviewQueue) under Family Steward → Research Intake, so they must not
  /// inflate the Pending Contributions badge. A pending Archive item whose id is
  /// referenced by a Research Source (`linkedIds`) is likewise excluded: it is
  /// reviewed through the Research Intake queue and is not actionable in Pending
  /// Contributions, so counting it would disagree with the Pending Contributions
  /// list. This is the canonical aggregate backing the Steward-facing Pending
  /// Contributions badge.
  ///
  /// Tenancy 1C-B1: `familyId` is explicit and canonical. A pending Archive item
  /// is counted only when `item.familyId == familyId`, so Family A's pending
  /// Archive never appears in Family B's count. Tenancy 1C-D3-A extends the same
  /// rule to Stories: a pending Story is counted only when
  /// `story.familyId == familyId`. Tenancy 1C-D4-A extends it to Mystery
  /// contributions: a pending contribution is counted only when
  /// `contribution.familyId == familyId`. The Research-linked exclusion
  /// (`linkedIds`) is applied after the family filter and is unchanged.
  public func countPendingForFamily(
    familyId : FamilyTypes.FamilyId,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    recipes : List.List<RecipeTypes.Recipe>,
    stories : List.List<FamilyHistoryTypes.Story>,
    mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
    linkedIds : Set.Set<ArchiveTypes.ArchiveItemId>,
  ) : Nat {
    var count = 0;
    for (a in archiveItems.toArray().values()) {
      if (a.familyId == familyId and a.status == #Pending and not linkedIds.contains(a.id)) {
        count += 1;
      };
    };
    for (r in recipes.toArray().values()) {
      if (r.familyId == familyId and r.status == #Pending) { count += 1 };
    };
    for (s in stories.toArray().values()) {
      if (s.familyId == familyId and s.status == #Pending) { count += 1 };
    };
    for (m in mysteryContributions.toArray().values()) {
      if (m.familyId == familyId and m.status == #Pending) { count += 1 };
    };
    count;
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `countPendingForFamily` with the default family id so current
  /// Norwood behavior is unchanged. Contains no duplicated business logic.
  public func countPending(
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    recipes : List.List<RecipeTypes.Recipe>,
    stories : List.List<FamilyHistoryTypes.Story>,
    mysteryContributions : List.List<FamilyHistoryTypes.MysteryContribution>,
    linkedIds : Set.Set<ArchiveTypes.ArchiveItemId>,
  ) : Nat {
    countPendingForFamily(
      FamilyTypes.DEFAULT_FAMILY_ID,
      archiveItems,
      recipes,
      stories,
      mysteryContributions,
      linkedIds,
    );
  };
};

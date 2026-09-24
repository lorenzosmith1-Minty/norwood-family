import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";

/// Tenancy 1C-B2-B4 canonical family-scoped Conflict Review domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `ConflictReviewItem` whose `familyId` equals it. A `conflictId` alone is
/// never a tenant boundary: a lookup that finds a conflict belonging to another
/// family behaves exactly like a lookup that found nothing. The API mixin owns
/// authorization and state wiring; this module is pure over the injected
/// collections.
module {
  /// Whether a conflict review item belongs to `familyId`. The single
  /// family-boundary predicate every family-scoped conflict read and action
  /// funnels through.
  public func belongsToFamily(conflict : Types.ConflictReviewItem, familyId : Text) : Bool {
    conflict.familyId == familyId;
  };

  /// Lists every conflict review item in `familyId`. A conflict whose `familyId`
  /// differs is never returned, so Family A conflicts never appear in a Family B
  /// call.
  public func listForFamily(
    conflicts : List.List<Types.ConflictReviewItem>,
    familyId : Text,
  ) : [Types.ConflictReviewItem] {
    conflicts.toArray().filter(func c = belongsToFamily(c, familyId));
  };

  /// Returns the conflict with `id` when it belongs to `familyId`, or `null`
  /// otherwise. A record that exists under another family is never returned.
  public func getForFamily(
    conflicts : List.List<Types.ConflictReviewItem>,
    familyId : Text,
    id : Nat,
  ) : ?Types.ConflictReviewItem {
    conflicts.find(func c = c.id == id and belongsToFamily(c, familyId));
  };

  /// Resolves the conflict with `id` in `familyId` according to the steward's
  /// chosen action. Keep Existing and Replace Existing resolve the item
  /// (`#Approved`); Preserve Both keeps it `#Conflicting` (unresolved); Needs
  /// Research moves it to `#NeedsResearch` (unresolved). The steward's notes are
  /// recorded on the item and the reviewer/timestamp are set only when the item
  /// is resolved. A conflict whose `familyId` differs is never touched, so a
  /// `conflictId` alone cannot cross a family boundary. Returns the updated
  /// item, or `null` when no conflict with that id belongs to `familyId`.
  public func resolveForFamily(
    conflicts : List.List<Types.ConflictReviewItem>,
    familyId : Text,
    id : Nat,
    action : Types.ConflictResolutionAction,
    notes : Text,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ConflictReviewItem {
    var updated : ?Types.ConflictReviewItem = null;
    let snapshot = conflicts.toArray();
    conflicts.clear();
    for (c in snapshot.values()) {
      if (c.id == id and belongsToFamily(c, familyId)) {
        let (newStatus, resolved) = switch (action) {
          case (#KeepExisting) (#Approved, true);
          case (#ReplaceExisting) (#Approved, true);
          case (#PreserveBoth) (#Conflicting, false);
          case (#NeedsResearch) (#NeedsResearch, false);
        };
        let resolvedItem : Types.ConflictReviewItem = {
          c with
          status = newStatus;
          stewardNotes = notes;
          resolvedBy = if (resolved) ?reviewer else c.resolvedBy;
          resolvedAt = if (resolved) ?now else c.resolvedAt;
        };
        conflicts.add(resolvedItem);
        updated := ?resolvedItem;
      } else {
        conflicts.add(c);
      };
    };
    updated;
  };

  /// Returns the facts on a Person Profile in `familyId` that have an unresolved
  /// conflict (`#Conflicting` or `#NeedsResearch`), so the Person Profile can
  /// show a subtle disputed indicator on each disputed fact. Only conflicts whose
  /// `familyId` equals `familyId` are considered, so a disputed indicator in one
  /// family never reflects another family's conflicts. Includes conflicts where
  /// the canonical value is blank but a proposed value exists. Resolved
  /// conflicts are never returned.
  public func disputedFactsForPersonForFamily(
    conflicts : List.List<Types.ConflictReviewItem>,
    familyId : Text,
    personId : Text,
  ) : [Types.DisputedFact] {
    conflicts.toArray()
      .filter(func c =
        belongsToFamily(c, familyId) and c.personId == ?personId and
        (c.status == #Conflicting or c.status == #NeedsResearch)
      )
      .map(func c = {
        field = c.field;
        canonicalValue = c.canonicalValue;
        proposedValue = c.proposedValue;
        status = c.status;
      });
  };

  /// Whether the linked Source of a conflict belongs to `familyId`. A conflict
  /// whose `proposedSourceId` points at another family's source is not
  /// actionable in `familyId`.
  public func sourceBelongsToFamily(
    sources : List.List<Types.SourceRecord>,
    familyId : Text,
    sourceId : Types.SourceId,
  ) : Bool {
    sources.any(func s = s.id == sourceId and s.familyId == familyId);
  };

  /// Whether the linked Finding of a conflict belongs to `familyId`. A conflict
  /// whose `findingId` points at another family's finding is not actionable in
  /// `familyId`.
  public func findingBelongsToFamily(
    findings : List.List<Types.ProposedFinding>,
    familyId : Text,
    findingId : Types.FindingId,
  ) : Bool {
    findings.any(func f = f.id == findingId and f.familyId == familyId);
  };

  /// Whether the referenced PersonProfile of a conflict belongs to `familyId`,
  /// using the family-qualified profile lookup. A conflict whose `personId`
  /// resolves to a profile in another family is not actionable in `familyId`.
  public func profileBelongsToFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Text,
  ) : Bool {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case (?_) { true };
      case null { false };
    };
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func listConflicts(
    conflicts : List.List<Types.ConflictReviewItem>,
  ) : [Types.ConflictReviewItem] {
    listForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getForFamily`. Deprecated
  /// single-family form: delegates with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func getConflict(
    conflicts : List.List<Types.ConflictReviewItem>,
    id : Nat,
  ) : ?Types.ConflictReviewItem {
    getForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID, id);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `resolveForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func resolveConflict(
    conflicts : List.List<Types.ConflictReviewItem>,
    id : Nat,
    action : Types.ConflictResolutionAction,
    notes : Text,
    reviewer : Principal,
    now : Int,
  ) : ?Types.ConflictReviewItem {
    resolveForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID, id, action, notes, reviewer, now);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `disputedFactsForPersonForFamily`. Deprecated single-family form: delegates
  /// with `FamilyTypes.DEFAULT_FAMILY_ID`.
  public func disputedFactsForPerson(
    conflicts : List.List<Types.ConflictReviewItem>,
    personId : Text,
  ) : [Types.DisputedFact] {
    disputedFactsForPersonForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };
};

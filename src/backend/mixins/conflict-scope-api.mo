import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import ConflictScopeLib "../lib/conflict-scope";
import FindingScopeLib "../lib/finding-scope";
import FamilyAuthorizationLib "../lib/family-authorization";
import ResearchAuditLib "../lib/research-intake";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-B2-B4 canonical family-scoped Conflict Review public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Steward
/// review access resolves through `requireConflictStewardForFamily`, which uses
/// the existing Steward-access denial behavior evaluated for that family. Every
/// returned or mutated conflict must carry `ConflictReviewItem.familyId ==
/// familyId`, and the linked Finding, linked Source, and referenced
/// PersonProfile must all belong to the same family, so a `conflictId` alone
/// never crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  conflicts : List.List<Types.ConflictReviewItem>,
  findings : List.List<Types.ProposedFinding>,
  sources : List.List<Types.SourceRecord>,
  auditLog : List.List<Types.ResearchAuditEntry>,
  state : {
    var nextSourceId : Nat;
    var nextFindingId : Nat;
    var nextCandidateId : Nat;
    var nextProposalId : Nat;
    var nextConflictId : Nat;
    var nextAuditId : Nat;
  },
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the existing Steward-access denial behavior. A Steward of one family can
  /// never resolve another family's conflict.
  func requireConflictStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Whether the linked Finding, linked Source, and referenced PersonProfile of
  /// a conflict all belong to `familyId`. IDs alone are never trusted: a
  /// conflict whose linked records live in another family is not actionable in
  /// `familyId`.
  func conflictReferencesInFamily(c : Types.ConflictReviewItem, familyId : FamilyTypes.FamilyId) : Bool {
    if (not ConflictScopeLib.findingBelongsToFamily(findings, familyId, c.findingId)) {
      return false;
    };
    switch (c.proposedSourceId) {
      case (?sid) {
        if (not ConflictScopeLib.sourceBelongsToFamily(sources, familyId, sid)) {
          return false;
        };
      };
      case null {};
    };
    switch (c.existingSourceId) {
      case (?sid) {
        if (not ConflictScopeLib.sourceBelongsToFamily(sources, familyId, sid)) {
          return false;
        };
      };
      case null {};
    };
    switch (c.personId) {
      case (?pid) {
        if (not ConflictScopeLib.profileBelongsToFamily(profiles, familyId, pid)) {
          return false;
        };
      };
      case null {};
    };
    true;
  };

  /// Internal implementation of `resolveConflictForFamily` that takes the caller
  /// explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the Steward gate
  /// always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func resolveConflictForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    id : Nat,
    action : Types.ConflictResolutionAction,
    notes : Text,
    caller : Principal,
  ) : Result.Result<Types.ConflictReviewItem, Types.ResearchError> {
    requireConflictStewardForFamily(caller, familyId);
    let cleanNotes = InputValidation.requireText("notes", notes, InputValidation.MAX_DESCRIPTION_CHARS);
    let now = Time.now();
    switch (ConflictScopeLib.getForFamily(conflicts, familyId, id)) {
      case null { #err(#notFound(id)) };
      case (?c) {
        // Every conflict action validates that the conflict and its linked
        // Finding, linked Source, and referenced PersonProfile all belong to
        // `familyId`. IDs alone are never trusted.
        if (not conflictReferencesInFamily(c, familyId)) {
          return #err(#notFound(id));
        };
        // Only Replace Existing writes the proposed value into canonical data.
        // Keep Existing, Preserve Both, and Needs Research leave canonical data
        // unchanged — no silent overwrite.
        if (action == #ReplaceExisting) {
          switch (findings.find(func f = f.id == c.findingId and f.familyId == familyId)) {
            case (?f) {
              // Unknown Person Fact fields must not silently resolve Replace
              // Existing as successful. Return a clear unsupported-field error,
              // leave the conflict unresolved, and do not alter canonical data.
              switch (f.content) {
                case (#PersonFact pf) {
                  switch (FindingScopeLib.normalizePersonFactField(pf.field)) {
                    case null {
                      return #err(#invalidState("Unsupported Person Fact field: '" # pf.field # "'"));
                    };
                    case (?_) {};
                  };
                };
                case _ {};
              };
              // Canonical promotion is family-scoped: the profile read/write is
              // qualified by `familyId`, so a Family A conflict never mutates a
              // Family B profile. Delegates to the shared promotion helper so
              // the conflict path and the finding endpoints promote identically.
              FindingScopeLib.routeToCanonicalForFamily(profiles, f, familyId);
            };
            case null {};
          };
        };
        let updated = ConflictScopeLib.resolveForFamily(conflicts, familyId, id, action, cleanNotes, caller, now)
          ?? Runtime.trap("Conflict not found");
        // Reflect the resolution outcome on the linked finding so it no longer
        // counts as an unresolved conflict after Keep/Replace, and so Preserve
        // Both / Needs Research keep it visible as unresolved.
        switch (action) {
          case (#KeepExisting) {
            ignore FindingScopeLib.updateStatusForFamily(findings, familyId, c.findingId, #Rejected, caller, now);
          };
          case (#ReplaceExisting) {
            ignore FindingScopeLib.updateStatusForFamily(findings, familyId, c.findingId, #Approved, caller, now);
          };
          case (#PreserveBoth) {};
          case (#NeedsResearch) {
            ignore FindingScopeLib.updateStatusForFamily(findings, familyId, c.findingId, #NeedsResearch, caller, now);
          };
        };
        ignore appendConflictAudit(
          "ConflictResolved",
          ?c.findingId,
          null,
          caller,
          now,
          "Conflict Review item #" # id.toText() # " resolved (" # conflictActionText(action) # ")",
        );
        #ok(updated);
      };
    };
  };

  /// Lists every conflict review item in `familyId`. Requires an active Steward
  /// of `familyId`, matching the pre-tenancy Steward-only conflict-read
  /// behavior. A conflict whose `familyId` differs is never returned, so Family
  /// A conflicts never appear in a Family B call.
  public query ({ caller }) func listConflictReviewItemsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.ConflictReviewItem] {
    requireConflictStewardForFamily(caller, familyId);
    ConflictScopeLib.listForFamily(conflicts, familyId);
  };

  /// Returns the conflict with `conflictId` when it belongs to `familyId`, or
  /// `null` otherwise. Requires an active Steward of `familyId`, matching the
  /// pre-tenancy Steward-only conflict-read behavior. A record that exists under
  /// another family is never returned, so a `conflictId` alone cannot cross the
  /// family boundary.
  public query ({ caller }) func getConflictReviewItemForFamily(
    familyId : FamilyTypes.FamilyId,
    conflictId : Nat,
  ) : async ?Types.ConflictReviewItem {
    requireConflictStewardForFamily(caller, familyId);
    ConflictScopeLib.getForFamily(conflicts, familyId, conflictId);
  };

  /// Internal implementation of `listConflictsForPersonForFamily` that takes
  /// the caller explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the
  /// anonymous-caller behavior and the family filter never diverge.
  func listConflictsForPersonForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
    caller : Principal,
  ) : [Types.ConflictReviewItem] {
    if (caller.isAnonymous()) {
      return [];
    };
    conflicts.toArray().filter(func c =
      ConflictScopeLib.belongsToFamily(c, familyId) and
      c.personId == ?personId and
      (c.status == #Conflicting or c.status == #NeedsResearch)
    );
  };

  /// Lists the unresolved conflict review items (`#Conflicting` and
  /// `#NeedsResearch`) affecting a given Person in `familyId`, so the frontend
  /// can surface them alongside canonical values on the person profile and
  /// source history views. Requires a signed-in (non-anonymous) caller;
  /// anonymous callers receive `[]`. Only conflicts whose `familyId` equals
  /// `familyId` are returned, so Family A conflicts never appear in a Family B
  /// call. Resolved conflicts are never returned.
  public query ({ caller }) func listConflictsForPersonForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
  ) : async [Types.ConflictReviewItem] {
    listConflictsForPersonForFamilyInternal(familyId, personId, caller);
  };

  /// Internal implementation of `listDisputedFactsForPersonForFamily` that takes
  /// the caller explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the
  /// anonymous-caller behavior and the family filter never diverge.
  func listDisputedFactsForPersonForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
    caller : Principal,
  ) : [Types.DisputedFact] {
    if (caller.isAnonymous()) {
      return [];
    };
    ConflictScopeLib.disputedFactsForPersonForFamily(conflicts, familyId, personId);
  };

  /// Returns the facts on a Person Profile in `familyId` that have an unresolved
  /// conflict, so the Person Profile can show a subtle disputed indicator on
  /// each disputed fact. Requires a signed-in (non-anonymous) caller; anonymous
  /// callers receive `[]`. Only conflicts whose `familyId` equals `familyId`
  /// contribute, so a disputed indicator in one family never reflects another
  /// family's conflicts. Resolved conflicts are never returned.
  public query ({ caller }) func listDisputedFactsForPersonForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Text,
  ) : async [Types.DisputedFact] {
    listDisputedFactsForPersonForFamilyInternal(familyId, personId, caller);
  };

  /// Resolves a conflict review item in `familyId` (Steward of `familyId` only)
  /// with an explicit decision. `#KeepExisting` leaves canonical data unchanged
  /// and resolves the conflict; `#ReplaceExisting` writes the proposed value
  /// into the canonical profile in `familyId` exactly once (preserving the old
  /// value and its provenance in the conflict/audit history and the new Source);
  /// `#PreserveBoth` keeps both values visible as an unresolved `#Conflicting`
  /// conflict; `#NeedsResearch` leaves canonical data unchanged and retains the
  /// conflict with `#NeedsResearch` status. Every conflict action validates that
  /// the conflict and its linked Finding, linked Source, and referenced
  /// PersonProfile all belong to `familyId`. Every resolution records an audit
  /// entry. Returns the updated item, or `#err(#notFound(id))` when no conflict
  /// with that id belongs to `familyId`.
  public shared ({ caller }) func resolveConflictForFamily(
    familyId : FamilyTypes.FamilyId,
    id : Nat,
    action : Types.ConflictResolutionAction,
    notes : Text,
  ) : async Result.Result<Types.ConflictReviewItem, Types.ResearchError> {
    resolveConflictForFamilyInternal(familyId, id, action, notes, caller);
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listConflictReviewItemsForFamily`.
  public query ({ caller }) func listConflictReviewItems() : async [Types.ConflictReviewItem] {
    requireConflictStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    ConflictScopeLib.listForFamily(conflicts, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listConflictsForPersonForFamily`.
  public query ({ caller }) func listConflictsForPerson(personId : Text) : async [Types.ConflictReviewItem] {
    listConflictsForPersonForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listDisputedFactsForPersonForFamily`.
  public query ({ caller }) func listDisputedFactsForPerson(personId : Text) : async [Types.DisputedFact] {
    listDisputedFactsForPersonForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `resolveConflictForFamily`.
  public shared ({ caller }) func resolveConflict(
    id : Nat,
    action : Types.ConflictResolutionAction,
    notes : Text,
  ) : async Result.Result<Types.ConflictReviewItem, Types.ResearchError> {
    resolveConflictForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, action, notes, caller);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Appends a research audit entry for a conflict action, advancing the shared
  /// audit id counter.
  func appendConflictAudit(
    action : Text,
    findingId : ?Types.FindingId,
    sourceId : ?Types.SourceId,
    actorId : Principal,
    now : Int,
    summary : Text,
  ) : Types.ResearchAuditEntry {
    let entry = ResearchAuditLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      action,
      findingId,
      sourceId,
      actorId,
      now,
      summary,
    );
    state.nextAuditId := state.nextAuditId + 1;
    entry;
  };

  /// Renders a conflict resolution action variant as its tag text for audit
  /// summaries.
  func conflictActionText(a : Types.ConflictResolutionAction) : Text {
    switch (a) {
      case (#KeepExisting) "KeepExisting";
      case (#ReplaceExisting) "ReplaceExisting";
      case (#PreserveBoth) "PreserveBoth";
      case (#NeedsResearch) "NeedsResearch";
    };
  };
};

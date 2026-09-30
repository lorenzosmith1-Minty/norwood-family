import List "mo:core/List";
import Map "mo:core/Map";
import Int "mo:core/Int";
import Text "mo:core/Text";
import GovernanceTypes "../types/governance";
import ResearchIntakeTypes "../types/research-intake";
import OwnershipTypes "../types/ownership";
import FamilyTypes "../types/family";
import FamilyAuthorizationLib "family-authorization";
import StewardAuthorityLib "steward-authority";
import Types "../types/audit-and-workload";

/// Domain logic for the merged Family Steward Audit History and steward
/// workload visibility. Pure helpers over the injected collections; the API
/// mixin owns authorization and state wiring.
module {
  /// Renders a governance audit action type variant as its tag text.
  func auditActionText(a : GovernanceTypes.AuditActionType) : Text {
    switch (a) {
      case (#ClaimApproved) "ClaimApproved";
      case (#ClaimRejected) "ClaimRejected";
      case (#RelationshipRequestApproved) "RelationshipRequestApproved";
      case (#RelationshipRequestRejected) "RelationshipRequestRejected";
      case (#RelationshipRequestPending) "RelationshipRequestPending";
      case (#StewardPromoted) "StewardPromoted";
      case (#StewardRemoved) "StewardRemoved";
      case (#SuccessorDesignated) "SuccessorDesignated";
      case (#SuccessorActivated) "SuccessorActivated";
      case (#ProfileArchived) "ProfileArchived";
      case (#ProfileRestored) "ProfileRestored";
      case (#ProfilePermanentlyDeleted) "ProfilePermanentlyDeleted";
      case (#ProfileRemovalRequested) "ProfileRemovalRequested";
      case (#ProfileRemovalReviewed) "ProfileRemovalReviewed";
      case (#DuplicateMerged) "DuplicateMerged";
      case (#RelationshipAdded) "RelationshipAdded";
      case (#RelationshipRemoved) "RelationshipRemoved";
      case (#RelationshipTypeCorrected) "RelationshipTypeCorrected";
      case (#BoardPostArchived) "BoardPostArchived";
      case (#BoardPostRestored) "BoardPostRestored";
      case (#BoardReplyRemoved) "BoardReplyRemoved";
    };
  };

  /// Extracts the resolution action text from a ConflictResolved research audit
  /// summary of the form "Conflict Review item #<id> resolved (<action>)".
  /// Returns `null` when the summary does not carry a parenthesized action.
  func resolutionFromSummary(summary : Text) : ?Text {
    let parts = summary.split(#text "(").toArray();
    if (parts.size() == 0) {
      return null;
    };
    let last = parts[parts.size() - 1];
    switch (last.stripEnd(#text ")")) {
      case (?res) { ?res };
      case null { null };
    };
  };

  /// Maps a governance audit entry to a `#Governance` StewardAuditEntry. The
  /// conflict-specific fields are left `null`/empty.
  func governanceEntry(e : GovernanceTypes.AuditEntry) : Types.StewardAuditEntry {
    {
      id = e.id;
      kind = #Governance;
      actionType = auditActionText(e.actionType);
      actorAccountId = e.actorAccountId;
      timestamp = e.timestamp;
      summary = e.summary;
      affectedPersonIds = e.affectedPersonIds;
      personId = null;
      field = null;
      existingValue = null;
      proposedValue = null;
      resolution = null;
      stewardNotes = null;
      existingSourceId = null;
      proposedSourceId = null;
    };
  };

  /// Maps a ConflictResolved research audit entry to a `#ConflictResolution`
  /// StewardAuditEntry, enriched from the linked ConflictReviewItem when one is
  /// found (matched by `findingId`). When no linked item exists the entry is
  /// still surfaced with the conflict-specific fields left `null`.
  func conflictEntry(
    e : ResearchIntakeTypes.ResearchAuditEntry,
    conflict : ?ResearchIntakeTypes.ConflictReviewItem,
  ) : Types.StewardAuditEntry {
    let affected = switch (conflict) {
      case (?c) {
        switch (c.personId) {
          case (?p) [p];
          case null [];
        };
      };
      case null [];
    };
    {
      id = e.id;
      kind = #ConflictResolution;
      actionType = "ConflictResolved";
      actorAccountId = e.actorId;
      timestamp = e.timestamp;
      summary = e.summary;
      affectedPersonIds = affected;
      personId = switch (conflict) { case (?c) c.personId; case null null };
      field = switch (conflict) { case (?c) ?c.field; case null null };
      existingValue = switch (conflict) { case (?c) ?c.canonicalValue; case null null };
      proposedValue = switch (conflict) { case (?c) ?c.proposedValue; case null null };
      resolution = resolutionFromSummary(e.summary);
      stewardNotes = switch (conflict) {
        case (?c) { if (c.stewardNotes == "") { null } else { ?c.stewardNotes } };
        case null null;
      };
      existingSourceId = switch (conflict) { case (?c) c.existingSourceId; case null null };
      proposedSourceId = switch (conflict) { case (?c) c.proposedSourceId; case null null };
    };
  };

  /// Whether a governance audit entry belongs to `familyId`.
  ///
  /// `GovernanceTypes.AuditEntry` carries no `familyId` field (adding one would
  /// require a migration and would change governance audit creation, both out of
  /// scope for this patch). A governance entry is therefore attributed to the
  /// family in which the action occurred, derived from data the entry already
  /// carries: the acting account (`actorAccountId`) and the affected people.
  ///
  /// The acting family is the family in which the actor held active Steward
  /// authority when the action was performed — every family-scoped governance
  /// action (`promoteToStewardForFamily`, `designateSuccessorForFamily`,
  /// `activateSuccessorForFamily`, `addRelationshipForFamily`) requires the
  /// caller to be an active Steward of the family it acts in, and the legacy
  /// single-family actions delegate to the default family. An entry therefore
  /// belongs to `familyId` only when its actor is an active Steward of
  /// `familyId` AND every affected person belongs to `familyId`. Attribution is
  /// keyed on the actor's family, not on the affected people, so a person
  /// tracked in both Family A and Family B no longer makes one governance entry
  /// appear in both histories: the entry belongs to exactly one family — the one
  /// the actor acted in.
  ///
  /// The default Norwood family is the legacy family tree and the only family
  /// with a Steward, so every governance entry still appears in the Norwood
  /// history exactly as before tenancy — including legacy entries whose actor is
  /// not a Steward (such as a profile owner's removal request) and entries with
  /// no affected people (such as a steward removal). A non-default family is
  /// strictly scoped: no actor is ever an active Steward of it through the
  /// public API, so no governance entry is attributed to it and it can never
  /// leak into that family's history.
  func governanceEntryBelongsToFamily(
    e : GovernanceTypes.AuditEntry,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    if (familyId == FamilyTypes.DEFAULT_FAMILY_ID) {
      return true;
    };
    StewardAuthorityLib.isActiveStewardForFamily(stewards, e.actorAccountId, familyId)
      and e.affectedPersonIds.all(func personId =
        FamilyAuthorizationLib.isPersonInFamily(profiles, claims, personId, familyId)
      );
  };

  /// Merges the governance audit log with the conflict-resolution entries from
  /// the research audit log into a single chronological `[StewardAuditEntry]`
  /// list, newest first, scoped to `familyId`. Each governance `AuditEntry`
  /// maps to a `#Governance` entry; each research `ResearchAuditEntry` whose
  /// `action == "ConflictResolved"` maps to a `#ConflictResolution` entry
  /// enriched from the linked `ConflictReviewItem` (matched by `findingId`):
  /// `personId`, `field`, `existingValue` (canonicalValue), `proposedValue`,
  /// `stewardNotes`, `existingSourceId`, `proposedSourceId`, and `resolution`
  /// (the resolution action text carried in the research audit summary).
  /// Conflict-resolution entries appear exactly once — no duplication with
  /// governance entries.
  ///
  /// Both sources are filtered by `familyId` before merging: a governance entry
  /// is included only when it belongs to `familyId` (see
  /// `governanceEntryBelongsToFamily`), and a research entry is included only
  /// when its own `familyId` equals `familyId`. Family A therefore never
  /// receives Family B audit entries. The chronological ordering, item shapes,
  /// labels/details, and conflict-resolution entries are unchanged.
  public func mergeAuditHistoryForFamily(
    governanceLog : List.List<GovernanceTypes.AuditEntry>,
    researchLog : List.List<ResearchIntakeTypes.ResearchAuditEntry>,
    conflicts : List.List<ResearchIntakeTypes.ConflictReviewItem>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.StewardAuditEntry] {
    let merged = List.empty<Types.StewardAuditEntry>();
    for (e in governanceLog.toArray().values()) {
      if (governanceEntryBelongsToFamily(e, stewards, profiles, claims, familyId)) {
        merged.add(governanceEntry(e));
      };
    };
    for (e in researchLog.toArray().values()) {
      if (e.action == "ConflictResolved" and e.familyId == familyId) {
        switch (e.findingId) {
          case (?fid) {
            let linked = conflicts.find(func c = c.findingId == fid);
            merged.add(conflictEntry(e, linked));
          };
          case null {};
        };
      };
    };
    merged.toArray().sort(func (a, b) = Int.compare(b.timestamp, a.timestamp));
  };

  /// TEMPORARY compatibility wrapper for `mergeAuditHistoryForFamily`.
  /// Deprecated single-family form: delegates with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`, so the current Norwood merged history is
  /// unchanged. Contains no duplicated merge logic.
  public func mergeAuditHistory(
    governanceLog : List.List<GovernanceTypes.AuditEntry>,
    researchLog : List.List<ResearchIntakeTypes.ResearchAuditEntry>,
    conflicts : List.List<ResearchIntakeTypes.ConflictReviewItem>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
  ) : [Types.StewardAuditEntry] {
    mergeAuditHistoryForFamily(
      governanceLog,
      researchLog,
      conflicts,
      stewards,
      profiles,
      claims,
      FamilyTypes.DEFAULT_FAMILY_ID,
    );
  };
};

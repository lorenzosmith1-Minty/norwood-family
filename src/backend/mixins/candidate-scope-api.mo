import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/research-intake";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import CandidateScopeLib "../lib/candidate-scope";
import FamilyAuthorizationLib "../lib/family-authorization";
import ResearchAuditLib "../lib/research-intake";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-B2-B2 canonical family-scoped New Person Candidate public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Steward
/// review access resolves through `requireCandidateStewardForFamily`, which uses
/// the existing Steward-access denial behavior evaluated for that family. Every
/// returned or mutated candidate must carry `NewPersonCandidate.familyId ==
/// familyId`, and the linked Source and any referenced people must belong to the
/// same family, so a `candidateId` alone never crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  candidates : List.List<Types.NewPersonCandidate>,
  sources : List.List<Types.SourceRecord>,
  findings : List.List<Types.ProposedFinding>,
  proposals : List.List<Types.RelationshipProposal>,
  conflicts : List.List<Types.ConflictReviewItem>,
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
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  notifications : List.List<OwnershipTypes.Notification>,
) {
  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the existing Steward-access denial behavior. A Steward of one family can
  /// never review another family's candidate.
  func requireCandidateStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// The linked SourceRecord for `sourceId` when it belongs to `familyId`, or
  /// `null` otherwise. A source in another family is never returned, so a Source
  /// in Family A can never back a Candidate in Family B.
  func candidateSourceInFamily(sourceId : Types.SourceId, familyId : FamilyTypes.FamilyId) : ?Types.SourceRecord {
    sources.find(func s = s.id == sourceId and s.familyId == familyId);
  };

  /// Internal implementation of `createNewPersonCandidateForFamily` that takes
  /// the caller explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createNewPersonCandidateForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
    caller : Principal,
  ) : Result.Result<Types.NewPersonCandidate, Types.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return #err(#notAuthorized);
    };
    if (candidateSourceInFamily(sourceId, familyId) == null) {
      return #err(#notFound(sourceId));
    };
    let cleanName = InputValidation.requireText("name", name, InputValidation.MAX_TITLE_CHARS);
    let cleanDetails = InputValidation.requireText("details", details, InputValidation.MAX_DESCRIPTION_CHARS);
    let now = Time.now();
    let candidate = CandidateScopeLib.createForFamily(
      candidates,
      { var next = state.nextCandidateId },
      familyId,
      cleanName,
      cleanDetails,
      sourceId,
      caller,
      now,
    );
    state.nextCandidateId := state.nextCandidateId + 1;
    ignore appendCandidateAudit(
      familyId,
      "NewPersonCandidateSubmitted",
      ?sourceId,
      caller,
      now,
      "New Person Candidate '" # cleanName # "' submitted",
    );
    addCandidateNotification(caller, #ResearchSubmission, "Your research submission is awaiting Family Steward review.");
    #ok(candidate);
  };

  /// Internal implementation of `approveNewPersonCandidateForFamily` that takes
  /// the caller explicitly. See `createNewPersonCandidateForFamilyInternal`.
  func approveNewPersonCandidateForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
    caller : Principal,
  ) : ?Types.NewPersonCandidate {
    requireCandidateStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (CandidateScopeLib.getForFamily(candidates, familyId, candidateId)) {
      case null { null };
      case (?c) {
        if (c.status != #Pending) {
          return null;
        };
        // The linked Source must belong to the same family as the candidate.
        if (candidateSourceInFamily(c.sourceId, familyId) == null) {
          return null;
        };
        // The candidate's own familyId must match the requested family.
        if (not CandidateScopeLib.belongsToFamily(c, familyId)) {
          return null;
        };
        // Family-scoped duplicate detection: a candidate whose name/details
        // duplicate an existing canonical Person profile in the same family is
        // not approved, so no second profile is created. Only profiles whose
        // familyId equals the candidate's familyId are compared, so a same
        // name/person details in another family never blocks approval.
        if (CandidateScopeLib.isDuplicateInFamily(profiles, familyId, c.name, c.details)) {
          return null;
        };
        CandidateScopeLib.createCanonicalPersonForFamily(profiles, c, familyId);
        let updated = CandidateScopeLib.approveForFamily(candidates, familyId, candidateId, caller, now);
        ignore appendCandidateAudit(
          familyId,
          "NewPersonCandidateApproved",
          ?c.sourceId,
          caller,
          now,
          "New Person Candidate '" # c.name # "' approved and created as a canonical Person",
        );
        addCandidateNotification(c.submittedBy, #ResearchApproved, "Your research submission was approved.");
        updated;
      };
    };
  };

  /// Internal implementation of `rejectNewPersonCandidateForFamily` that takes
  /// the caller explicitly. See `createNewPersonCandidateForFamilyInternal`.
  func rejectNewPersonCandidateForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
    caller : Principal,
  ) : ?Types.NewPersonCandidate {
    requireCandidateStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (CandidateScopeLib.getForFamily(candidates, familyId, candidateId)) {
      case null { null };
      case (?c) {
        if (c.status != #Pending) {
          return null;
        };
        let updated = CandidateScopeLib.rejectForFamily(candidates, familyId, candidateId, caller, now);
        ignore appendCandidateAudit(
          familyId,
          "NewPersonCandidateRejected",
          ?c.sourceId,
          caller,
          now,
          "New Person Candidate '" # c.name # "' rejected",
        );
        addCandidateNotification(c.submittedBy, #ResearchRejected, "Your research submission was not approved.");
        updated;
      };
    };
  };

  /// Internal implementation of `needsResearchNewPersonCandidateForFamily` that
  /// takes the caller explicitly. See `createNewPersonCandidateForFamilyInternal`.
  func needsResearchNewPersonCandidateForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
    caller : Principal,
  ) : ?Types.NewPersonCandidate {
    requireCandidateStewardForFamily(caller, familyId);
    let now = Time.now();
    switch (CandidateScopeLib.getForFamily(candidates, familyId, candidateId)) {
      case null { null };
      case (?c) {
        if (c.status != #Pending) {
          return null;
        };
        let updated = CandidateScopeLib.needsResearchForFamily(candidates, familyId, candidateId, caller, now);
        ignore appendCandidateAudit(
          familyId,
          "NewPersonCandidateNeedsResearch",
          ?c.sourceId,
          caller,
          now,
          "New Person Candidate '" # c.name # "' marked as needing research",
        );
        updated;
      };
    };
  };

  /// Creates a new New Person candidate in `familyId`. Requires an approved
  /// member of `familyId`; the caller is recorded as the submitter. The linked
  /// SourceRecord must belong to `familyId` and any referenced people must belong
  /// to `familyId`, so a Source or person in Family A can never create a
  /// Candidate in Family B. The candidate enters as `#Pending` and its `familyId`
  /// is the requested `familyId`.
  public shared ({ caller }) func createNewPersonCandidateForFamily(
    familyId : FamilyTypes.FamilyId,
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.NewPersonCandidate, Types.ResearchError> {
    createNewPersonCandidateForFamilyInternal(familyId, name, details, sourceId, caller);
  };

  /// Lists every New Person candidate in `familyId`. Requires an active Steward
  /// of `familyId`, matching the pre-tenancy Steward-only candidate-read
  /// behavior. A candidate whose `familyId` differs is never returned, so Family
  /// A candidates never appear in a Family B call.
  public query ({ caller }) func listNewPersonCandidatesForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.NewPersonCandidate] {
    requireCandidateStewardForFamily(caller, familyId);
    CandidateScopeLib.listForFamily(candidates, familyId);
  };

  /// Returns the candidate with `candidateId` when it belongs to `familyId`, or
  /// `null` otherwise. Requires an active Steward of `familyId`, matching the
  /// pre-tenancy Steward-only candidate-read behavior. A record that exists
  /// under another family is never returned, so a `candidateId` alone cannot
  /// cross the family boundary.
  public query ({ caller }) func getNewPersonCandidateForFamily(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
  ) : async ?Types.NewPersonCandidate {
    requireCandidateStewardForFamily(caller, familyId);
    CandidateScopeLib.getForFamily(candidates, familyId, candidateId);
  };

  /// Approves the pending candidate with `candidateId` in `familyId`. Requires
  /// an active Steward of `familyId`. The linked Source must belong to
  /// `familyId`. Approval creates exactly one canonical Person record
  /// (PersonProfile) in the candidate's own `familyId` through the
  /// family-qualified profile storage, so a Family A candidate never creates or
  /// alters a Family B profile. Returns the updated candidate, or `null` when no
  /// pending candidate with that id belongs to `familyId`.
  public shared ({ caller }) func approveNewPersonCandidateForFamily(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
  ) : async ?Types.NewPersonCandidate {
    approveNewPersonCandidateForFamilyInternal(familyId, candidateId, caller);
  };

  /// Rejects the pending candidate with `candidateId` in `familyId`. Requires an
  /// active Steward of `familyId`. No canonical Person is created. Returns the
  /// updated candidate, or `null` when no pending candidate with that id belongs
  /// to `familyId`.
  public shared ({ caller }) func rejectNewPersonCandidateForFamily(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
  ) : async ?Types.NewPersonCandidate {
    rejectNewPersonCandidateForFamilyInternal(familyId, candidateId, caller);
  };

  /// Marks the pending candidate with `candidateId` in `familyId` as needing
  /// research. Requires an active Steward of `familyId`. No canonical Person is
  /// created. Returns the updated candidate, or `null` when no pending candidate
  /// with that id belongs to `familyId`.
  public shared ({ caller }) func needsResearchNewPersonCandidateForFamily(
    familyId : FamilyTypes.FamilyId,
    candidateId : Nat,
  ) : async ?Types.NewPersonCandidate {
    needsResearchNewPersonCandidateForFamilyInternal(familyId, candidateId, caller);
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
  /// `createNewPersonCandidateForFamily`.
  public shared ({ caller }) func createNewPersonCandidate(
    name : Text,
    details : Text,
    sourceId : Types.SourceId,
  ) : async Result.Result<Types.NewPersonCandidate, Types.ResearchError> {
    createNewPersonCandidateForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, name, details, sourceId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listNewPersonCandidatesForFamily`.
  public query ({ caller }) func listNewPersonCandidates() : async [Types.NewPersonCandidate] {
    requireCandidateStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    CandidateScopeLib.listForFamily(candidates, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `approveNewPersonCandidateForFamily`.
  public shared ({ caller }) func approveNewPersonCandidate(id : Nat) : async ?Types.NewPersonCandidate {
    approveNewPersonCandidateForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `rejectNewPersonCandidateForFamily`.
  public shared ({ caller }) func rejectNewPersonCandidate(id : Nat) : async ?Types.NewPersonCandidate {
    rejectNewPersonCandidateForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `needsResearchNewPersonCandidateForFamily`.
  public shared ({ caller }) func needsResearchNewPersonCandidate(id : Nat) : async ?Types.NewPersonCandidate {
    needsResearchNewPersonCandidateForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, id, caller);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Appends a research audit entry for a candidate action in `familyId`,
  /// advancing the shared audit id counter. The entry is written to the same
  /// family as the candidate action, never inferred from the default family.
  func appendCandidateAudit(
    familyId : FamilyTypes.FamilyId,
    action : Text,
    sourceId : ?Types.SourceId,
    actorId : Principal,
    now : Int,
    summary : Text,
  ) : Types.ResearchAuditEntry {
    let entry = ResearchAuditLib.appendAudit(
      auditLog,
      { var next = state.nextAuditId },
      familyId,
      action,
      null,
      sourceId,
      actorId,
      now,
      summary,
    );
    state.nextAuditId := state.nextAuditId + 1;
    entry;
  };

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextCandidateNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Appends a research notification for the given recipient, avoiding
  /// duplicates. Shared by the family-scoped candidate endpoints and their
  /// temporary compatibility wrappers so notification behavior never diverges.
  func addCandidateNotification(
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    let exists = notifications.toArray().any(func n = n.recipient == recipient and n.notificationType == notificationType and n.message == message);
    if (not exists) {
      notifications.add({
        id = nextCandidateNotificationId();
        recipient;
        notificationType;
        message;
        createdAt = Time.now();
        read = false;
      });
    };
  };
};

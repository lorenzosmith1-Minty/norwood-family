import Principal "mo:core/Principal";
import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/governance";
import ObjectStorageTypes "../types/object-storage";
import ArchiveTypes "../types/archive";
import GovernanceLib "../lib/governance";
import StewardAuthorityLib "../lib/steward-authority";

mixin (
  accessControlState : AccessControl.AccessControlState,
  profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  confirmedRelationships : List.List<Types.Relationship>,
  stewards : List.List<Types.StewardRecord>,
  successors : List.List<Types.SuccessorDesignation>,
  removalRequests : List.List<Types.ProfileRemovalRequest>,
  auditLog : List.List<Types.AuditEntry>,
  mergeConflicts : List.List<Types.MergeConflict>,
  archivedProfiles : List.List<Types.PersonId>,
  galleries : Map.Map<ObjectStorageTypes.PersonId, ObjectStorageTypes.PhotoGallery>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  dismissedDuplicates : List.List<Types.DismissedPair>,
) {
  // ---------------------------------------------------------------------------
  // Steward Management & Succession
  // ---------------------------------------------------------------------------

  /// Lists the current Family Stewards of `familyId` with role status and
  /// account identity. Canonical family-scoped form: the caller must be an
  /// active Steward of `familyId`, and only steward records stamped with
  /// `familyId` are returned, so a Steward of one family can never read another
  /// family's roster. Existing ordering and record shape are preserved.
  public query ({ caller }) func listStewardsForFamily(familyId : Text) : async [Types.StewardRecord] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list stewards");
    };
    GovernanceLib.listStewardsForFamily(stewards, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listStewardsForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public query ({ caller }) func listStewards() : async [Types.StewardRecord] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list stewards");
    };
    GovernanceLib.listStewards(stewards);
  };

  /// Promotes an existing approved claimed member of `familyId` to Family
  /// Steward. Canonical family-scoped form: the caller must be an active Steward
  /// of `familyId`, the target profile must belong to `familyId`, and the new
  /// Steward record is stamped with `familyId`. A Steward of one family can never
  /// promote a member of another family.
  public shared ({ caller }) func promoteToStewardForFamily(familyId : Text, personId : Types.PersonId) : async Result.Result<Types.StewardRecord, Types.StewardError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can promote stewards");
    };
    GovernanceLib.promoteToStewardForFamily(stewards, auditLog, profiles, familyId, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `promoteToStewardForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func promoteToSteward(personId : Types.PersonId) : async Result.Result<Types.StewardRecord, Types.StewardError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can promote stewards");
    };
    GovernanceLib.promoteToSteward(stewards, auditLog, profiles, personId, caller);
  };

  /// Removes the steward role from another steward of `familyId`, never allowing
  /// the last steward of that family to be removed. Canonical family-scoped
  /// form: the caller must be an active Steward of `familyId`, the target
  /// `StewardRecord` is matched on both `stewardAccountId` and `familyId`, and
  /// the last-Steward guard counts only active stewards of `familyId`. A Steward
  /// of one family can never remove a steward of another family.
  public shared ({ caller }) func removeStewardForFamily(familyId : Text, stewardAccountId : Principal) : async Result.Result<(), Types.StewardError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove stewards");
    };
    GovernanceLib.removeStewardForFamily(stewards, auditLog, familyId, stewardAccountId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `removeStewardForFamily` with the default family id so current
  /// Norwood behavior is unchanged. Family Steward only.
  public shared ({ caller }) func removeSteward(stewardAccountId : Principal) : async Result.Result<(), Types.StewardError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove stewards");
    };
    GovernanceLib.removeSteward(stewards, auditLog, stewardAccountId, caller);
  };

  /// Designates an approved claimed member of `familyId` as a successor steward
  /// with a priority/order. Canonical family-scoped form: the caller must be an
  /// active Steward of `familyId`, the target profile must belong to `familyId`,
  /// the duplicate-designation check is scoped by `familyId`, and the new
  /// designation is stamped with `familyId`. A successor is a designation only
  /// until activated. A Steward of one family can never designate a member of
  /// another family.
  public shared ({ caller }) func designateSuccessorForFamily(familyId : Text, personId : Types.PersonId, priority : Nat) : async Result.Result<Types.SuccessorDesignation, Types.StewardError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can designate successors");
    };
    GovernanceLib.designateSuccessorForFamily(stewards, successors, auditLog, profiles, familyId, personId, priority, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `designateSuccessorForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func designateSuccessor(personId : Types.PersonId, priority : Nat) : async Result.Result<Types.SuccessorDesignation, Types.StewardError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can designate successors");
    };
    GovernanceLib.designateSuccessor(stewards, successors, auditLog, profiles, personId, priority, caller);
  };

  /// Activates/promotes a designated successor into the active steward role in
  /// `familyId`. Canonical family-scoped form: the caller must be an active
  /// Steward of `familyId`, all Steward and profile lookups are filtered by
  /// `familyId`, and the activated Steward record remains in `familyId`.
  /// Activating a successor in one family never modifies another family's state.
  public shared ({ caller }) func activateSuccessorForFamily(familyId : Text, personId : Types.PersonId) : async Result.Result<Types.StewardRecord, Types.StewardError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can activate successors");
    };
    GovernanceLib.activateSuccessorForFamily(stewards, successors, auditLog, profiles, familyId, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `activateSuccessorForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func activateSuccessor(personId : Types.PersonId) : async Result.Result<Types.StewardRecord, Types.StewardError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can activate successors");
    };
    GovernanceLib.activateSuccessor(stewards, successors, auditLog, profiles, personId, caller);
  };

  /// Lists all successor designations in `familyId`. Canonical family-scoped
  /// form: the caller must be an active Steward of `familyId`, and a designation
  /// stamped with another family is never returned. Family Steward of `familyId`
  /// only.
  public query ({ caller }) func listSuccessorsForFamily(familyId : Text) : async [Types.SuccessorDesignation] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list successors");
    };
    GovernanceLib.listSuccessorsForFamily(successors, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listSuccessorsForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public query ({ caller }) func listSuccessors() : async [Types.SuccessorDesignation] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list successors");
    };
    GovernanceLib.listSuccessors(successors);
  };

  /// Returns a warning encouraging successor designation when only one steward
  /// of `familyId` exists, or `null` when there are multiple stewards of that
  /// family. Canonical family-scoped form: the caller must be an active Steward
  /// of `familyId`, and only steward records stamped with `familyId` are
  /// counted, so a Steward of one family can never read another family's
  /// warning. Family Steward of `familyId` only.
  public query ({ caller }) func getSingleStewardWarningForFamily(familyId : Text) : async ?Text {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view steward warnings");
    };
    GovernanceLib.getSingleStewardWarningForFamily(stewards, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `getSingleStewardWarningForFamily` with the default family id
  /// so current Norwood behavior is unchanged. Family Steward only.
  public query ({ caller }) func getSingleStewardWarning() : async ?Text {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view steward warnings");
    };
    GovernanceLib.getSingleStewardWarning(stewards);
  };

  /// Returns each current Steward and designated Successor of `familyId`
  /// enriched with the linked approved Person identity (personId,
  /// preferred/display name, and canonical full person name), resolved via
  /// steward accountId -> approved linked personId
  /// (PersonProfile.claimedByUserId) -> canonical Person Profile. Canonical
  /// family-scoped form: only Steward records and successor designations stamped
  /// with `familyId` are considered, so Family A never sees Family B identities.
  /// The internal account id is carried only for authorization/audit. Family
  /// Steward of `familyId` only.
  public query ({ caller }) func listStewardIdentitiesForFamily(familyId : Text) : async [Types.StewardIdentity] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list steward identities");
    };
    GovernanceLib.listStewardIdentitiesForFamily(stewards, successors, profiles, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listStewardIdentitiesForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public query ({ caller }) func listStewardIdentities() : async [Types.StewardIdentity] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list steward identities");
    };
    GovernanceLib.listStewardIdentities(stewards, successors, profiles);
  };

  /// Returns the eligible promotion/successor candidate list of `familyId`: all
  /// people who belong to `familyId`, are living, have an APPROVED/CLAIMED
  /// profile, are linked to a valid account, are not already an active Steward
  /// of `familyId`, and are not archived. Canonical family-scoped form: the
  /// caller must be an active Steward of `familyId`, only profiles belonging to
  /// `familyId` are considered, and the already-a-Steward exclusion is filtered
  /// by `familyId`, so a Steward of one family can never read another family's
  /// candidates and an account that is an active Steward of Family A remains
  /// eligible in Family B when current rules otherwise permit. This is
  /// data-driven — as additional family members claim and receive approval they
  /// automatically appear without code changes. Family Steward of `familyId`
  /// only.
  public query ({ caller }) func listEligibleStewardCandidatesForFamily(familyId : Text) : async [Types.StewardIdentity] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list eligible steward candidates");
    };
    GovernanceLib.listEligibleStewardCandidatesForFamily(stewards, profiles, archivedProfiles, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listEligibleStewardCandidatesForFamily` with the default
  /// family id so current Norwood behavior is unchanged. Family Steward only.
  public query ({ caller }) func listEligibleStewardCandidates() : async [Types.StewardIdentity] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list eligible steward candidates");
    };
    GovernanceLib.listEligibleStewardCandidates(stewards, profiles, archivedProfiles);
  };

  // ---------------------------------------------------------------------------
  // Safe Profile Removal, Archive & Restore
  // ---------------------------------------------------------------------------

  /// A claimed living profile owner requests removal of their own profile in
  /// `familyId`. Canonical family-scoped form: the target profile must belong to
  /// `familyId`, and the request is stamped with `familyId`, so a `personId`
  /// alone never crosses a family boundary. A Family Steward of `familyId`
  /// reviews the request.
  public shared ({ caller }) func requestProfileRemovalForFamily(familyId : Text, personId : Types.PersonId, reason : Text) : async Result.Result<Types.ProfileRemovalRequest, Types.RemovalError> {
    GovernanceLib.requestProfileRemovalForFamily(removalRequests, auditLog, profiles, familyId, personId, reason, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `requestProfileRemovalForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func requestProfileRemoval(personId : Types.PersonId, reason : Text) : async Result.Result<Types.ProfileRemovalRequest, Types.RemovalError> {
    GovernanceLib.requestProfileRemoval(removalRequests, auditLog, profiles, personId, reason, caller);
  };

  /// Lists the profile removal requests of `familyId` for steward review.
  /// Canonical family-scoped form: the caller must be an active Steward of
  /// `familyId`, and a request stamped with another family is never returned.
  /// Family Steward of `familyId` only.
  public query ({ caller }) func listProfileRemovalRequestsForFamily(familyId : Text) : async [Types.ProfileRemovalRequest] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list profile removal requests");
    };
    GovernanceLib.listProfileRemovalRequestsForFamily(removalRequests, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listProfileRemovalRequestsForFamily` with the default family
  /// id so current Norwood behavior is unchanged.
  public query ({ caller }) func listProfileRemovalRequests() : async [Types.ProfileRemovalRequest] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list profile removal requests");
    };
    GovernanceLib.listProfileRemovalRequests(removalRequests);
  };

  /// Approves a profile removal request in `familyId`, archiving the profile.
  /// Canonical family-scoped form: the caller must be an active Steward of
  /// `familyId`, and the request must belong to `familyId`, so a request id
  /// alone never crosses a family boundary. Family Steward of `familyId` only.
  public shared ({ caller }) func approveProfileRemovalForFamily(familyId : Text, requestId : Nat) : async ?Types.ProfileRemovalRequest {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve profile removal requests");
    };
    GovernanceLib.approveProfileRemovalForFamily(removalRequests, archivedProfiles, auditLog, familyId, requestId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `approveProfileRemovalForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func approveProfileRemoval(requestId : Nat) : async ?Types.ProfileRemovalRequest {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve profile removal requests");
    };
    GovernanceLib.approveProfileRemoval(removalRequests, archivedProfiles, auditLog, requestId, caller);
  };

  /// Rejects a profile removal request in `familyId`. Canonical family-scoped
  /// form: the caller must be an active Steward of `familyId`, and the request
  /// must belong to `familyId`, so a request id alone never crosses a family
  /// boundary. Family Steward of `familyId` only.
  public shared ({ caller }) func rejectProfileRemovalForFamily(familyId : Text, requestId : Nat) : async ?Types.ProfileRemovalRequest {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject profile removal requests");
    };
    GovernanceLib.rejectProfileRemovalForFamily(removalRequests, auditLog, familyId, requestId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `rejectProfileRemovalForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func rejectProfileRemoval(requestId : Nat) : async ?Types.ProfileRemovalRequest {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject profile removal requests");
    };
    GovernanceLib.rejectProfileRemoval(removalRequests, auditLog, requestId, caller);
  };

  /// Archives a profile in `familyId`, removing it from normal family browsing
  /// while preserving relationships, media, timeline, sources, and ownership
  /// history. Canonical family-scoped form: the caller must be an active Steward
  /// of `familyId`, and the target profile must belong to `familyId`, so a
  /// `personId` alone never crosses a family boundary. Family Steward of
  /// `familyId` only.
  public shared ({ caller }) func archiveProfileForFamily(familyId : Text, personId : Types.PersonId) : async Result.Result<(), Types.ArchiveError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can archive profiles");
    };
    GovernanceLib.archiveProfileForFamily(archivedProfiles, auditLog, profiles, familyId, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `archiveProfileForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func archiveProfile(personId : Types.PersonId) : async Result.Result<(), Types.ArchiveError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can archive profiles");
    };
    GovernanceLib.archiveProfile(archivedProfiles, auditLog, profiles, personId, caller);
  };

  /// Restores an archived profile in `familyId` to normal family browsing.
  /// Canonical family-scoped form: the caller must be an active Steward of
  /// `familyId`, and the target profile must belong to `familyId`, so a
  /// `personId` alone never crosses a family boundary. Family Steward of
  /// `familyId` only.
  public shared ({ caller }) func restoreProfileForFamily(familyId : Text, personId : Types.PersonId) : async Result.Result<(), Types.ArchiveError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can restore profiles");
    };
    GovernanceLib.restoreProfileForFamily(archivedProfiles, auditLog, profiles, familyId, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `restoreProfileForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func restoreProfile(personId : Types.PersonId) : async Result.Result<(), Types.ArchiveError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can restore profiles");
    };
    GovernanceLib.restoreProfile(archivedProfiles, auditLog, profiles, personId, caller);
  };

  /// Lists the archived profiles of `familyId`. Canonical family-scoped form:
  /// the caller must be an active Steward of `familyId`, and only archived
  /// profiles belonging to `familyId` are returned. Family Steward of `familyId`
  /// only.
  public query ({ caller }) func listArchivedProfilesForFamily(familyId : Text) : async [Types.PersonProfile] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list archived profiles");
    };
    GovernanceLib.listArchivedProfilesForFamily(archivedProfiles, profiles, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listArchivedProfilesForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public query ({ caller }) func listArchivedProfiles() : async [Types.PersonProfile] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list archived profiles");
    };
    GovernanceLib.listArchivedProfiles(archivedProfiles, profiles);
  };

  /// Returns the ids of the archived profiles of `familyId` so normal family
  /// browsing can filter them out. Canonical family-scoped form: only archived
  /// ids whose profile belongs to `familyId` are returned, so one family's
  /// archived ids never hide another family's profiles. Not gated to stewards —
  /// any caller may read archived ids.
  public query func listArchivedProfileIdsForFamily(familyId : Text) : async [Types.PersonId] {
    GovernanceLib.listArchivedProfileIdsForFamily(archivedProfiles, profiles, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listArchivedProfileIdsForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public query func listArchivedProfileIds() : async [Types.PersonId] {
    GovernanceLib.listArchivedProfileIds(archivedProfiles, profiles);
  };

  /// Returns the archived profile for `personId` in `familyId`, or `null` when
  /// the person is not archived in that family. Canonical family-scoped direct
  /// lookup: the caller must be an active Steward of `familyId`, and a
  /// `personId` alone never crosses a family boundary. Family Steward of
  /// `familyId` only.
  public query ({ caller }) func getArchivedProfileForFamily(familyId : Text, personId : Types.PersonId) : async ?Types.PersonProfile {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view archived profiles");
    };
    GovernanceLib.getArchivedProfileForFamily(archivedProfiles, profiles, familyId, personId);
  };

  /// Permanently deletes a profile in `familyId` only when it is empty of
  /// archive items, media, timeline/history, approved relationships, and
  /// ownership history, and explicit confirmation is given. Canonical
  /// family-scoped form: the caller must be an active Steward of `familyId`, and
  /// the target profile must belong to `familyId`, so a `personId` alone never
  /// crosses a family boundary. Family Steward of `familyId` only.
  public shared ({ caller }) func permanentlyDeleteProfileForFamily(familyId : Text, personId : Types.PersonId, confirmation : Bool) : async Result.Result<(), Types.DeleteError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can permanently delete profiles");
    };
    GovernanceLib.permanentlyDeleteProfileForFamily(archivedProfiles, auditLog, profiles, confirmedRelationships, galleries, archiveItems, familyId, personId, confirmation, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `permanentlyDeleteProfileForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public shared ({ caller }) func permanentlyDeleteProfile(personId : Types.PersonId, confirmation : Bool) : async Result.Result<(), Types.DeleteError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can permanently delete profiles");
    };
    GovernanceLib.permanentlyDeleteProfile(archivedProfiles, auditLog, profiles, confirmedRelationships, galleries, archiveItems, personId, confirmation, caller);
  };

  // ---------------------------------------------------------------------------
  // Duplicate Profile Review & Merge
  // ---------------------------------------------------------------------------

  /// Lists suspected duplicate Person records of `familyId` with comparison
  /// data. Canonical family-scoped form: the caller must be an active Steward of
  /// `familyId`, and only profiles belonging to `familyId` are compared, so a
  /// Family A duplicate candidate never includes a Family B profile. Family
  /// Steward of `familyId` only.
  public query ({ caller }) func listDuplicateCandidatesForFamily(familyId : Text) : async [Types.DuplicatePair] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list duplicate candidates");
    };
    GovernanceLib.listDuplicateCandidatesForFamily(profiles, confirmedRelationships, galleries, archiveItems, dismissedDuplicates, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listDuplicateCandidatesForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public query ({ caller }) func listDuplicateCandidates() : async [Types.DuplicatePair] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list duplicate candidates");
    };
    GovernanceLib.listDuplicateCandidates(profiles, confirmedRelationships, galleries, archiveItems, dismissedDuplicates);
  };

  /// Marks two suspected duplicates in `familyId` as not a duplicate. Canonical
  /// family-scoped form: the caller must be an active Steward of `familyId`,
  /// both people must belong to `familyId`, and the dismissal is stamped with
  /// `familyId`, so a dismissal in one family never hides a candidate in
  /// another. Family Steward of `familyId` only.
  public shared ({ caller }) func notDuplicateForFamily(familyId : Text, personIdA : Types.PersonId, personIdB : Types.PersonId) : async Result.Result<(), Types.MergeError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can review duplicates");
    };
    GovernanceLib.notDuplicateForFamily(dismissedDuplicates, auditLog, profiles, familyId, personIdA, personIdB, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `notDuplicateForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public shared ({ caller }) func notDuplicate(personIdA : Types.PersonId, personIdB : Types.PersonId) : async Result.Result<(), Types.MergeError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can review duplicates");
    };
    GovernanceLib.notDuplicate(dismissedDuplicates, auditLog, profiles, personIdA, personIdB, caller);
  };

  /// Merges two duplicate profiles in `familyId` into one canonical record,
  /// preserving all valid relationships, media, timeline, stories, sources,
  /// archive references, and ownership/claim history without duplicating shared
  /// items. Canonical family-scoped form: the caller must be an active Steward
  /// of `familyId`, and both profiles must belong to `familyId`, so a merge
  /// never crosses families and Family B remains unchanged. Conflicting fields
  /// are preserved as conflict/review items. The merged-away record is archived
  /// rather than hard-deleted. Family Steward of `familyId` only.
  public shared ({ caller }) func mergeProfilesForFamily(familyId : Text, canonicalPersonId : Types.PersonId, mergedAwayPersonId : Types.PersonId) : async Result.Result<Types.MergeResult, Types.MergeError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can merge profiles");
    };
    GovernanceLib.mergeProfilesForFamily(archivedProfiles, mergeConflicts, auditLog, profiles, confirmedRelationships, galleries, archiveItems, familyId, canonicalPersonId, mergedAwayPersonId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `mergeProfilesForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public shared ({ caller }) func mergeProfiles(canonicalPersonId : Types.PersonId, mergedAwayPersonId : Types.PersonId) : async Result.Result<Types.MergeResult, Types.MergeError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can merge profiles");
    };
    GovernanceLib.mergeProfiles(archivedProfiles, mergeConflicts, auditLog, profiles, confirmedRelationships, galleries, archiveItems, canonicalPersonId, mergedAwayPersonId, caller);
  };

  /// Resolves a merge conflict in `familyId` by choosing the canonical display
  /// value. Canonical family-scoped form: the caller must be an active Steward
  /// of `familyId`, and the conflict must belong to `familyId`, so a conflict id
  /// alone never crosses a family boundary. Family Steward of `familyId` only.
  public shared ({ caller }) func resolveMergeConflictForFamily(familyId : Text, conflictId : Nat, canonicalValue : Text) : async ?Types.MergeConflict {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can resolve merge conflicts");
    };
    GovernanceLib.resolveMergeConflictForFamily(mergeConflicts, familyId, conflictId, canonicalValue, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `resolveMergeConflictForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func resolveMergeConflict(conflictId : Nat, canonicalValue : Text) : async ?Types.MergeConflict {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can resolve merge conflicts");
    };
    GovernanceLib.resolveMergeConflict(mergeConflicts, conflictId, canonicalValue, caller);
  };

  // ---------------------------------------------------------------------------
  // Relationship Administration
  // ---------------------------------------------------------------------------

  /// Returns the current relationships for a person in `familyId`. Canonical
  /// family-scoped form: the caller must be an active Steward of `familyId`, the
  /// target profile must belong to `familyId`, and only relationships stamped
  /// with `familyId` are returned, so a `personId` alone never crosses a family
  /// boundary. Existing relationship ordering and record shape are preserved.
  public query ({ caller }) func listPersonRelationshipsForFamily(familyId : Text, personId : Types.PersonId) : async [Types.Relationship] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list relationships");
    };
    GovernanceLib.listPersonRelationshipsForFamily(confirmedRelationships, profiles, familyId, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listPersonRelationshipsForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public query ({ caller }) func listPersonRelationships(personId : Types.PersonId) : async [Types.Relationship] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list relationships");
    };
    GovernanceLib.listPersonRelationships(confirmedRelationships, profiles, personId);
  };

  /// Adds a missing relationship to `familyId`'s family graph. Canonical
  /// family-scoped form: the caller must be an active Steward of `familyId`,
  /// both people must belong to `familyId`, the duplicate check is filtered by
  /// `familyId`, and the new Relationship is stamped with `familyId`, so no
  /// cross-family relationship edge can be created.
  public shared ({ caller }) func addRelationshipForFamily(familyId : Text, fromPersonId : Types.PersonId, toPersonId : Types.PersonId, relationshipType : Types.RelationshipType) : async Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can add relationships");
    };
    GovernanceLib.addRelationshipForFamily(confirmedRelationships, auditLog, profiles, familyId, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `addRelationshipForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func addRelationship(fromPersonId : Types.PersonId, toPersonId : Types.PersonId, relationshipType : Types.RelationshipType) : async Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can add relationships");
    };
    GovernanceLib.addRelationship(confirmedRelationships, auditLog, profiles, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// Removes an incorrect relationship from `familyId`'s family graph. Canonical
  /// family-scoped form: the caller must be an active Steward of `familyId`, the
  /// relationship must belong to `familyId`, and only that family's relationship
  /// is removed, so a `relationshipId` alone never crosses a family boundary.
  /// Existing audit/governance behavior is preserved.
  public shared ({ caller }) func removeRelationshipForFamily(familyId : Text, relationshipId : Nat) : async Result.Result<(), Types.RelationshipAdminError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove relationships");
    };
    GovernanceLib.removeRelationshipForFamily(confirmedRelationships, auditLog, familyId, relationshipId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `removeRelationshipForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public shared ({ caller }) func removeRelationship(relationshipId : Nat) : async Result.Result<(), Types.RelationshipAdminError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove relationships");
    };
    GovernanceLib.removeRelationship(confirmedRelationships, auditLog, relationshipId, caller);
  };

  /// Corrects the relationship type of an existing relationship in `familyId`.
  /// Canonical family-scoped form: the caller must be an active Steward of
  /// `familyId`, the relationship must belong to `familyId`, and both referenced
  /// people must still belong to `familyId`, so a `relationshipId` alone never
  /// crosses a family boundary and only that family's relationship is updated.
  /// Existing correction/audit semantics are preserved.
  public shared ({ caller }) func correctRelationshipTypeForFamily(familyId : Text, relationshipId : Nat, relationshipType : Types.RelationshipType) : async Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can correct relationships");
    };
    GovernanceLib.correctRelationshipTypeForFamily(confirmedRelationships, auditLog, profiles, familyId, relationshipId, relationshipType, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `correctRelationshipTypeForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public shared ({ caller }) func correctRelationshipType(relationshipId : Nat, relationshipType : Types.RelationshipType) : async Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can correct relationships");
    };
    GovernanceLib.correctRelationshipType(confirmedRelationships, auditLog, profiles, relationshipId, relationshipType, caller);
  };

  // ---------------------------------------------------------------------------
  // Audit History
  // ---------------------------------------------------------------------------

  /// Returns the governance audit log of `familyId`. Canonical family-scoped
  /// form: the caller must be an active Steward of `familyId`, and only audit
  /// entries stamped with `familyId` are returned, so a Steward of one family
  /// can never read another family's audit history. Existing entry shape,
  /// chronological ordering, and action labels/details are preserved.
  public query ({ caller }) func listAuditHistoryForFamily(familyId : Text) : async [Types.AuditEntry] {
    if (not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view audit history");
    };
    GovernanceLib.listAuditHistoryForFamily(auditLog, familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listAuditHistoryForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public query ({ caller }) func listAuditHistory() : async [Types.AuditEntry] {
    if (not StewardAuthorityLib.isActiveSteward(stewards, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view audit history");
    };
    GovernanceLib.listAuditHistory(auditLog);
  };
};

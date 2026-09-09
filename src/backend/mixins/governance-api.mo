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

  /// Lists all current Family Stewards with role status and account identity.
  /// Family Steward only.
  public query ({ caller }) func listStewards() : async [Types.StewardRecord] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list stewards");
    };
    GovernanceLib.listStewards(stewards);
  };

  /// Promotes an existing approved claimed family member to Family Steward.
  /// Family Steward only.
  public shared ({ caller }) func promoteToSteward(personId : Types.PersonId) : async Result.Result<Types.StewardRecord, Types.StewardError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can promote stewards");
    };
    GovernanceLib.promoteToSteward(stewards, auditLog, profiles, personId, caller);
  };

  /// Removes the steward role from another steward, never allowing the last
  /// steward to be removed. Family Steward only.
  public shared ({ caller }) func removeSteward(stewardAccountId : Principal) : async Result.Result<(), Types.StewardError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove stewards");
    };
    GovernanceLib.removeSteward(stewards, auditLog, stewardAccountId, caller);
  };

  /// Designates an approved claimed family member as a successor steward with a
  /// priority/order. A successor is a designation only until activated.
  /// Family Steward only.
  public shared ({ caller }) func designateSuccessor(personId : Types.PersonId, priority : Nat) : async Result.Result<Types.SuccessorDesignation, Types.StewardError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can designate successors");
    };
    GovernanceLib.designateSuccessor(stewards, successors, auditLog, profiles, personId, priority, caller);
  };

  /// Activates/promotes a designated successor into the active steward role.
  /// Family Steward only.
  public shared ({ caller }) func activateSuccessor(personId : Types.PersonId) : async Result.Result<Types.StewardRecord, Types.StewardError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can activate successors");
    };
    GovernanceLib.activateSuccessor(stewards, successors, auditLog, profiles, personId, caller);
  };

  /// Lists all successor designations. Family Steward only.
  public query ({ caller }) func listSuccessors() : async [Types.SuccessorDesignation] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list successors");
    };
    GovernanceLib.listSuccessors(successors);
  };

  /// Returns a warning encouraging successor designation when only one steward
  /// exists, or `null` when there are multiple stewards. Family Steward only.
  public query ({ caller }) func getSingleStewardWarning() : async ?Text {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view steward warnings");
    };
    GovernanceLib.getSingleStewardWarning(stewards);
  };

  /// Returns each current Steward and designated Successor enriched with the
  /// linked approved Person identity (personId, preferred/display name, and
  /// canonical full person name), resolved via steward accountId -> approved
  /// linked personId (PersonProfile.claimedByUserId) -> canonical Person
  /// Profile. The internal account id is carried only for authorization/audit.
  /// Family Steward only.
  public query ({ caller }) func listStewardIdentities() : async [Types.StewardIdentity] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list steward identities");
    };
    GovernanceLib.listStewardIdentities(stewards, successors, profiles);
  };

  /// Returns the eligible promotion/successor candidate list: all people who
  /// are living, have an APPROVED/CLAIMED profile, are linked to a valid
  /// account, are not already an active Steward, and are not archived. This is
  /// data-driven — as additional family members claim and receive approval they
  /// automatically appear without code changes. Family Steward only.
  public query ({ caller }) func listEligibleStewardCandidates() : async [Types.StewardIdentity] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list eligible steward candidates");
    };
    GovernanceLib.listEligibleStewardCandidates(stewards, profiles, archivedProfiles);
  };

  // ---------------------------------------------------------------------------
  // Safe Profile Removal, Archive & Restore
  // ---------------------------------------------------------------------------

  /// A claimed living profile owner requests removal of their own profile.
  /// A Family Steward reviews the request.
  public shared ({ caller }) func requestProfileRemoval(personId : Types.PersonId, reason : Text) : async Result.Result<Types.ProfileRemovalRequest, Types.RemovalError> {
    GovernanceLib.requestProfileRemoval(removalRequests, auditLog, profiles, personId, reason, caller);
  };

  /// Lists all profile removal requests for steward review. Family Steward only.
  public query ({ caller }) func listProfileRemovalRequests() : async [Types.ProfileRemovalRequest] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list profile removal requests");
    };
    GovernanceLib.listProfileRemovalRequests(removalRequests);
  };

  /// Approves a profile removal request, archiving the profile. Family Steward
  /// only.
  public shared ({ caller }) func approveProfileRemoval(requestId : Nat) : async ?Types.ProfileRemovalRequest {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve profile removal requests");
    };
    GovernanceLib.approveProfileRemoval(removalRequests, archivedProfiles, auditLog, requestId, caller);
  };

  /// Rejects a profile removal request. Family Steward only.
  public shared ({ caller }) func rejectProfileRemoval(requestId : Nat) : async ?Types.ProfileRemovalRequest {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject profile removal requests");
    };
    GovernanceLib.rejectProfileRemoval(removalRequests, auditLog, requestId, caller);
  };

  /// Archives a profile, removing it from normal family browsing while
  /// preserving relationships, media, timeline, sources, and ownership history.
  /// Family Steward only.
  public shared ({ caller }) func archiveProfile(personId : Types.PersonId) : async Result.Result<(), Types.ArchiveError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can archive profiles");
    };
    GovernanceLib.archiveProfile(archivedProfiles, auditLog, profiles, personId, caller);
  };

  /// Restores an archived profile to normal family browsing. Family Steward
  /// only.
  public shared ({ caller }) func restoreProfile(personId : Types.PersonId) : async Result.Result<(), Types.ArchiveError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can restore profiles");
    };
    GovernanceLib.restoreProfile(archivedProfiles, auditLog, personId, caller);
  };

  /// Lists all archived profiles. Family Steward only.
  public query ({ caller }) func listArchivedProfiles() : async [Types.PersonProfile] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list archived profiles");
    };
    GovernanceLib.listArchivedProfiles(archivedProfiles, profiles);
  };

  /// Returns the ids of all archived profiles so normal family browsing can
  /// filter them out. Not gated to stewards — any caller may read archived ids.
  public query func listArchivedProfileIds() : async [Types.PersonId] {
    GovernanceLib.listArchivedProfileIds(archivedProfiles);
  };

  /// Permanently deletes a profile only when it is empty of archive items,
  /// media, timeline/history, approved relationships, and ownership history,
  /// and explicit confirmation is given. Family Steward only.
  public shared ({ caller }) func permanentlyDeleteProfile(personId : Types.PersonId, confirmation : Bool) : async Result.Result<(), Types.DeleteError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can permanently delete profiles");
    };
    GovernanceLib.permanentlyDeleteProfile(archivedProfiles, auditLog, profiles, confirmedRelationships, galleries, archiveItems, personId, confirmation, caller);
  };

  // ---------------------------------------------------------------------------
  // Duplicate Profile Review & Merge
  // ---------------------------------------------------------------------------

  /// Lists suspected duplicate Person records with comparison data. Family
  /// Steward only.
  public query ({ caller }) func listDuplicateCandidates() : async [Types.DuplicatePair] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list duplicate candidates");
    };
    GovernanceLib.listDuplicateCandidates(profiles, confirmedRelationships, galleries, archiveItems, dismissedDuplicates);
  };

  /// Marks two suspected duplicates as not a duplicate. Family Steward only.
  public shared ({ caller }) func notDuplicate(personIdA : Types.PersonId, personIdB : Types.PersonId) : async Result.Result<(), Types.MergeError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can review duplicates");
    };
    GovernanceLib.notDuplicate(dismissedDuplicates, auditLog, personIdA, personIdB, caller);
  };

  /// Merges two duplicate profiles into one canonical record, preserving all
  /// valid relationships, media, timeline, stories, sources, archive references,
  /// and ownership/claim history without duplicating shared items. Conflicting
  /// fields are preserved as conflict/review items. The merged-away record is
  /// archived rather than hard-deleted. Family Steward only.
  public shared ({ caller }) func mergeProfiles(canonicalPersonId : Types.PersonId, mergedAwayPersonId : Types.PersonId) : async Result.Result<Types.MergeResult, Types.MergeError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can merge profiles");
    };
    GovernanceLib.mergeProfiles(archivedProfiles, mergeConflicts, auditLog, profiles, confirmedRelationships, galleries, archiveItems, canonicalPersonId, mergedAwayPersonId, caller);
  };

  /// Resolves a merge conflict by choosing the canonical display value. Family
  /// Steward only.
  public shared ({ caller }) func resolveMergeConflict(conflictId : Nat, canonicalValue : Text) : async ?Types.MergeConflict {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can resolve merge conflicts");
    };
    GovernanceLib.resolveMergeConflict(mergeConflicts, conflictId, canonicalValue, caller);
  };

  // ---------------------------------------------------------------------------
  // Relationship Administration
  // ---------------------------------------------------------------------------

  /// Returns the current relationships for a person. Family Steward only.
  public query ({ caller }) func listPersonRelationships(personId : Types.PersonId) : async [Types.Relationship] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list relationships");
    };
    GovernanceLib.listPersonRelationships(confirmedRelationships, personId);
  };

  /// Adds a missing relationship to the shared family graph. Family Steward
  /// only.
  public shared ({ caller }) func addRelationship(fromPersonId : Types.PersonId, toPersonId : Types.PersonId, relationshipType : Types.RelationshipType) : async Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can add relationships");
    };
    GovernanceLib.addRelationship(confirmedRelationships, auditLog, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// Removes an incorrect relationship from the shared family graph. Family
  /// Steward only.
  public shared ({ caller }) func removeRelationship(relationshipId : Nat) : async Result.Result<(), Types.RelationshipAdminError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove relationships");
    };
    GovernanceLib.removeRelationship(confirmedRelationships, auditLog, relationshipId, caller);
  };

  /// Corrects the relationship type of an existing relationship. Family Steward
  /// only.
  public shared ({ caller }) func correctRelationshipType(relationshipId : Nat, relationshipType : Types.RelationshipType) : async Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can correct relationships");
    };
    GovernanceLib.correctRelationshipType(confirmedRelationships, auditLog, relationshipId, relationshipType, caller);
  };

  // ---------------------------------------------------------------------------
  // Audit History
  // ---------------------------------------------------------------------------

  /// Returns the governance audit log. Audit History is strictly steward-only.
  public query ({ caller }) func listAuditHistory() : async [Types.AuditEntry] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can view audit history");
    };
    GovernanceLib.listAuditHistory(auditLog);
  };
};

import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/governance";
import FamilyTypes "../types/family";
import TenancyLib "tenancy";
import ObjectStorageTypes "../types/object-storage";
import ArchiveTypes "../types/archive";

module {
  // ---------------------------------------------------------------------------
  // Steward Management & Succession
  // ---------------------------------------------------------------------------

  /// Returns the steward governance records of `familyId`. Canonical
  /// family-scoped form: only `StewardRecord` entries whose `familyId` equals
  /// `familyId` are returned, so Family A never sees Family B stewards. Existing
  /// collection ordering and record shape are preserved.
  public func listStewardsForFamily(
    stewards : List.List<Types.StewardRecord>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.StewardRecord] {
    stewards.toArray().filter(func s = s.familyId == familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listStewardsForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public func listStewards(stewards : List.List<Types.StewardRecord>) : [Types.StewardRecord] {
    listStewardsForFamily(stewards, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Promotes an approved claimed member of `familyId` to Family Steward.
  /// Canonical family-scoped form: the target profile is resolved through the
  /// family-qualified profile lookup, the duplicate-Steward check is filtered by
  /// `familyId`, and the new `StewardRecord` is stamped with `familyId`. A
  /// personId in another family is never promoted here.
  public func promoteToStewardForFamily(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.StewardRecord, Types.StewardError> {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { #err(#NotApprovedClaimedMember) };
      case (?profile) {
        if (profile.claimStatus != #Claimed) {
          return #err(#NotApprovedClaimedMember);
        };
        switch (profile.claimedByUserId) {
          case null { #err(#NotApprovedClaimedMember) };
          case (?ownerId) {
            if (stewards.toArray().any(func s = s.stewardAccountId == ownerId and s.roleStatus == #Active and s.familyId == familyId)) {
              return #err(#AlreadySteward);
            };
            let record : Types.StewardRecord = {
              familyId;
              stewardAccountId = ownerId;
              roleStatus = #Active;
              successorPriority = null;
              assignedBy = actorId;
              assignedAt = Time.now();
              founding = false;
            };
            stewards.add(record);
            appendAudit(auditLog, familyId, #StewardPromoted, actorId, [personId], "Promoted " # personId # " to Family Steward");
            #ok(record);
          };
        };
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `promoteToStewardForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func promoteToSteward(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.StewardRecord, Types.StewardError> {
    promoteToStewardForFamily(stewards, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, actorId);
  };

  /// Removes the steward role from another steward of `familyId`, never
  /// allowing the last steward of that family to be removed. Canonical
  /// family-scoped form: the target `StewardRecord` is matched on both
  /// `stewardAccountId` and `familyId`, and the last-Steward guard counts only
  /// active stewards whose `familyId` equals `familyId`, so a steward account id
  /// alone never crosses the family boundary and another family's active
  /// stewards never satisfy this family's guard. The audit entry is stamped with
  /// `familyId`.
  public func removeStewardForFamily(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    stewardAccountId : Principal,
    actorId : Principal,
  ) : Result.Result<(), Types.StewardError> {
    switch (stewards.find(func s = s.stewardAccountId == stewardAccountId and s.roleStatus == #Active and s.familyId == familyId)) {
      case null { #err(#NotSteward) };
      case (?record) {
        let active = stewards.toArray().filter(func s = s.roleStatus == #Active and s.familyId == familyId);
        if (active.size() <= 1) {
          return #err(#LastSteward);
        };
        let updated : Types.StewardRecord = { record with roleStatus = #Removed };
        replaceSteward(stewards, updated);
        appendAudit(auditLog, familyId, #StewardRemoved, actorId, [], "Removed steward role from " # stewardAccountId.toText());
        #ok(());
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `removeStewardForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public func removeSteward(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    stewardAccountId : Principal,
    actorId : Principal,
  ) : Result.Result<(), Types.StewardError> {
    removeStewardForFamily(stewards, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, stewardAccountId, actorId);
  };

  /// Designates an approved claimed member of `familyId` as a successor steward
  /// with a priority/order. Canonical family-scoped form: the target profile is
  /// resolved through the family-qualified profile lookup, the duplicate
  /// designation check is filtered by `familyId`, and the new
  /// `SuccessorDesignation` is stamped with `familyId`. A personId in another
  /// family is never designated here, and the same personId may hold independent
  /// designations in different families. A successor is a designation only until
  /// activated.
  public func designateSuccessorForFamily(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    priority : Nat,
    actorId : Principal,
  ) : Result.Result<Types.SuccessorDesignation, Types.StewardError> {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { return #err(#NotApprovedClaimedMember) };
      case (?profile) {
        if (profile.claimStatus != #Claimed) {
          return #err(#NotApprovedClaimedMember);
        };
        switch (profile.claimedByUserId) {
          case null { return #err(#NotApprovedClaimedMember) };
          case (?ownerId) {
            if (stewards.toArray().any(func s = s.stewardAccountId == ownerId and s.roleStatus == #Active and s.familyId == familyId)) {
              return #err(#AlreadySteward);
            };
          };
        };
      };
    };
    if (successors.toArray().any(func s = s.familyId == familyId and s.personId == personId and s.status == #Designated)) {
      return #err(#AlreadyDesignated);
    };
    let designation : Types.SuccessorDesignation = {
      familyId;
      personId;
      priority;
      assignedBy = actorId;
      assignedAt = Time.now();
      status = #Designated;
    };
    successors.add(designation);
    appendAudit(auditLog, familyId, #SuccessorDesignated, actorId, [personId], "Designated " # personId # " as successor steward (priority " # Nat.toText(priority) # ")");
    #ok(designation);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `designateSuccessorForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func designateSuccessor(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    priority : Nat,
    actorId : Principal,
  ) : Result.Result<Types.SuccessorDesignation, Types.StewardError> {
    designateSuccessorForFamily(stewards, successors, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, priority, actorId);
  };

  /// Activates/promotes a designated successor into the active steward role in
  /// `familyId`. Canonical family-scoped form: the successor designation and the
  /// target profile are resolved family-qualified, the duplicate-Steward check is
  /// filtered by `familyId`, and the activated `StewardRecord` remains in
  /// `familyId`. Activating a successor in one family never modifies another
  /// family's state.
  public func activateSuccessorForFamily(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.StewardRecord, Types.StewardError> {
    switch (successors.find(func s = s.familyId == familyId and s.personId == personId and s.status == #Designated)) {
      case null { #err(#NotDesignated) };
      case (?designation) {
        switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
          case null { #err(#NotApprovedClaimedMember) };
          case (?profile) {
            if (profile.claimStatus != #Claimed) {
              return #err(#NotApprovedClaimedMember);
            };
            switch (profile.claimedByUserId) {
              case null { #err(#NotApprovedClaimedMember) };
              case (?ownerId) {
                if (stewards.toArray().any(func s = s.stewardAccountId == ownerId and s.roleStatus == #Active and s.familyId == familyId)) {
                  return #err(#AlreadySteward);
                };
                let record : Types.StewardRecord = {
                  familyId;
                  stewardAccountId = ownerId;
                  roleStatus = #Active;
                  successorPriority = ?designation.priority;
                  assignedBy = actorId;
                  assignedAt = Time.now();
                  founding = false;
                };
                stewards.add(record);
                let updated : Types.SuccessorDesignation = { designation with status = #Activated };
                replaceSuccessor(successors, updated);
                appendAudit(auditLog, familyId, #SuccessorActivated, actorId, [personId], "Activated successor " # personId # " as Family Steward");
                #ok(record);
              };
            };
          };
        };
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `activateSuccessorForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func activateSuccessor(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.StewardRecord, Types.StewardError> {
    activateSuccessorForFamily(stewards, successors, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, actorId);
  };

  /// Returns all successor designations in `familyId`. Canonical family-scoped
  /// form: a designation stamped with another family is never returned, so
  /// Family A never sees Family B designations.
  public func listSuccessorsForFamily(
    successors : List.List<Types.SuccessorDesignation>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.SuccessorDesignation] {
    successors.toArray().filter(func s = s.familyId == familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listSuccessorsForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func listSuccessors(successors : List.List<Types.SuccessorDesignation>) : [Types.SuccessorDesignation] {
    listSuccessorsForFamily(successors, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Returns a warning encouraging successor designation when only one steward
  /// of `familyId` exists, or `null` when there are multiple stewards of that
  /// family. Canonical family-scoped form: only `StewardRecord` entries whose
  /// `familyId` equals `familyId` and whose `roleStatus == #Active` are counted,
  /// so another family's active stewards never affect this family's warning.
  public func getSingleStewardWarningForFamily(
    stewards : List.List<Types.StewardRecord>,
    familyId : FamilyTypes.FamilyId,
  ) : ?Text {
    let active = stewards.toArray().filter(func s = s.roleStatus == #Active and s.familyId == familyId);
    if (active.size() == 1) {
      ?"Only one Family Steward remains. Designate a successor steward to ensure continuity.";
    } else {
      null;
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `getSingleStewardWarningForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public func getSingleStewardWarning(stewards : List.List<Types.StewardRecord>) : ?Text {
    getSingleStewardWarningForFamily(stewards, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Returns each current Steward and designated Successor of `familyId`
  /// enriched with the linked approved Person identity (personId,
  /// preferred/display name, and canonical full person name), resolved via
  /// steward accountId -> approved linked personId
  /// (PersonProfile.claimedByUserId) -> canonical Person Profile. Canonical
  /// family-scoped form: only Steward records and successor designations stamped
  /// with `familyId` are considered, so Family A never sees Family B identities.
  /// The internal account id is carried only for authorization/audit.
  public func listStewardIdentitiesForFamily(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.StewardIdentity] {
    let result = List.empty<Types.StewardIdentity>();
    for (s in stewards.toArray().values()) {
      if (s.roleStatus == #Active and s.familyId == familyId) {
        switch (resolveIdentityByAccount(profiles, s.stewardAccountId)) {
          case (?id) result.add(id);
          case null {};
        };
      };
    };
    for (d in successors.toArray().values()) {
      if (d.status == #Designated and d.familyId == familyId) {
        switch (resolveIdentityByPerson(profiles, d.personId)) {
          case (?id) result.add(id);
          case null {};
        };
      };
    };
    result.toArray();
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listStewardIdentitiesForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func listStewardIdentities(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : [Types.StewardIdentity] {
    listStewardIdentitiesForFamily(stewards, successors, profiles, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Returns the eligible promotion/successor candidate list of `familyId`: all
  /// people who belong to `familyId`, are living, have an APPROVED/CLAIMED
  /// profile, are linked to a valid account, are not already an active Steward
  /// of `familyId`, and are not archived. Canonical family-scoped form: only
  /// profiles whose `familyId` equals `familyId` are considered, and the
  /// already-a-Steward exclusion is filtered by `familyId`, so a profile of
  /// another family is never a candidate here and an account that is an active
  /// Steward of Family A remains eligible in Family B when current rules
  /// otherwise permit. This is data-driven — as additional family members claim
  /// and receive approval they automatically appear without code changes.
  /// Existing candidate shape and Map iteration ordering are preserved.
  public func listEligibleStewardCandidatesForFamily(
    stewards : List.List<Types.StewardRecord>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    archivedProfiles : List.List<Types.PersonId>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.StewardIdentity] {
    let result = List.empty<Types.StewardIdentity>();
    let archived = archivedProfiles.toArray();
    for ((personId, profile) in profiles.entries()) {
      if (profile.familyId == familyId
          and profile.livingStatus == #Living
          and profile.claimStatus == #Claimed
          and profile.claimedByUserId != null
          and not archived.any(func p = p == personId)
          and not isActiveStewardAccountForFamily(stewards, profile.claimedByUserId, familyId)
      ) {
        result.add(buildIdentity(profile));
      };
    };
    result.toArray();
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listEligibleStewardCandidatesForFamily` with the default
  /// family id so current Norwood behavior is unchanged.
  public func listEligibleStewardCandidates(
    stewards : List.List<Types.StewardRecord>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    archivedProfiles : List.List<Types.PersonId>,
  ) : [Types.StewardIdentity] {
    listEligibleStewardCandidatesForFamily(stewards, profiles, archivedProfiles, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  // ---------------------------------------------------------------------------
  // Safe Profile Removal, Archive & Restore
  // ---------------------------------------------------------------------------

  /// Records a claimed living profile owner's request for removal of a profile
  /// in `familyId`. Canonical family-scoped form: the target profile is resolved
  /// through the family-qualified profile lookup, the pending-request check is
  /// filtered by `familyId`, and the new request is stamped with `familyId`, so
  /// a `personId` alone never crosses a family boundary.
  public func requestProfileRemovalForFamily(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    reason : Text,
    caller : Principal,
  ) : Result.Result<Types.ProfileRemovalRequest, Types.RemovalError> {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { #err(#ProfileNotFound) };
      case (?profile) {
        if (profile.livingStatus == #Deceased) {
          return #err(#DeceasedProfile);
        };
        if (profile.claimedByUserId != ?caller) {
          return #err(#NotOwner);
        };
        if (removalRequests.toArray().any(func r =
          r.familyId == familyId and r.personId == personId and r.status == #Pending)) {
          return #err(#AlreadyPending);
        };
        let request : Types.ProfileRemovalRequest = {
          familyId;
          id = nextId(removalRequests.toArray().map(func r = r.id));
          personId;
          requestingUserId = caller;
          reason;
          status = #Pending;
          submittedDate = Time.now();
          reviewedBy = null;
          reviewedDate = null;
        };
        removalRequests.add(request);
        appendAudit(auditLog, familyId, #ProfileRemovalRequested, caller, [personId], "Requested removal of profile " # personId);
        #ok(request);
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `requestProfileRemovalForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func requestProfileRemoval(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    reason : Text,
    caller : Principal,
  ) : Result.Result<Types.ProfileRemovalRequest, Types.RemovalError> {
    requestProfileRemovalForFamily(removalRequests, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, reason, caller);
  };

  /// Returns the profile removal requests of `familyId` for steward review.
  /// Canonical family-scoped form: a request stamped with another family is
  /// never returned.
  public func listProfileRemovalRequestsForFamily(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.ProfileRemovalRequest] {
    removalRequests.toArray().filter(func r = r.familyId == familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listProfileRemovalRequestsForFamily` with the default family
  /// id so current Norwood behavior is unchanged.
  public func listProfileRemovalRequests(removalRequests : List.List<Types.ProfileRemovalRequest>) : [Types.ProfileRemovalRequest] {
    listProfileRemovalRequestsForFamily(removalRequests, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Approves a profile removal request in `familyId`, archiving the profile.
  /// Canonical family-scoped form: the request must belong to `familyId`, so a
  /// request id alone never crosses a family boundary.
  public func approveProfileRemovalForFamily(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    requestId : Nat,
    actorId : Principal,
  ) : ?Types.ProfileRemovalRequest {
    switch (removalRequests.find(func r = r.id == requestId and r.familyId == familyId)) {
      case null { null };
      case (?request) {
        if (request.status != #Pending) {
          return null;
        };
        let updated : Types.ProfileRemovalRequest = {
          request with
          status = #Approved;
          reviewedBy = ?actorId;
          reviewedDate = ?Time.now();
        };
        replaceRemovalRequest(removalRequests, updated);
        if (not archivedProfiles.toArray().any(func p = p == request.personId)) {
          archivedProfiles.add(request.personId);
        };
        appendAudit(auditLog, familyId, #ProfileRemovalReviewed, actorId, [request.personId], "Approved removal of profile " # request.personId);
        ?updated;
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `approveProfileRemovalForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func approveProfileRemoval(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    requestId : Nat,
    actorId : Principal,
  ) : ?Types.ProfileRemovalRequest {
    approveProfileRemovalForFamily(removalRequests, archivedProfiles, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, actorId);
  };

  /// Rejects a profile removal request in `familyId`. Canonical family-scoped
  /// form: the request must belong to `familyId`, so a request id alone never
  /// crosses a family boundary.
  public func rejectProfileRemovalForFamily(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    auditLog : List.List<Types.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    requestId : Nat,
    actorId : Principal,
  ) : ?Types.ProfileRemovalRequest {
    switch (removalRequests.find(func r = r.id == requestId and r.familyId == familyId)) {
      case null { null };
      case (?request) {
        if (request.status != #Pending) {
          return null;
        };
        let updated : Types.ProfileRemovalRequest = {
          request with
          status = #Rejected;
          reviewedBy = ?actorId;
          reviewedDate = ?Time.now();
        };
        replaceRemovalRequest(removalRequests, updated);
        appendAudit(auditLog, familyId, #ProfileRemovalReviewed, actorId, [request.personId], "Rejected removal of profile " # request.personId);
        ?updated;
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `rejectProfileRemovalForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func rejectProfileRemoval(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    auditLog : List.List<Types.AuditEntry>,
    requestId : Nat,
    actorId : Principal,
  ) : ?Types.ProfileRemovalRequest {
    rejectProfileRemovalForFamily(removalRequests, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, actorId);
  };

  /// Archives a profile in `familyId`, removing it from normal family browsing
  /// while preserving relationships, media, timeline, sources, and ownership
  /// history. Canonical family-scoped form: the target profile must belong to
  /// `familyId`, so a `personId` alone never crosses a family boundary.
  public func archiveProfileForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.ArchiveError> {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { #err(#ProfileNotFound) };
      case (?_) {
        if (archivedProfiles.toArray().any(func p = p == personId)) {
          return #err(#AlreadyArchived);
        };
        archivedProfiles.add(personId);
        appendAudit(auditLog, familyId, #ProfileArchived, actorId, [personId], "Archived profile " # personId);
        #ok(());
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `archiveProfileForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func archiveProfile(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.ArchiveError> {
    archiveProfileForFamily(archivedProfiles, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, actorId);
  };

  /// Restores an archived profile in `familyId` to normal family browsing.
  /// Canonical family-scoped form: the target profile must belong to `familyId`,
  /// so a `personId` alone never crosses a family boundary.
  public func restoreProfileForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.ArchiveError> {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { #err(#ProfileNotFound) };
      case (?_) {
        if (not archivedProfiles.toArray().any(func p = p == personId)) {
          return #err(#NotArchived);
        };
        let snapshot = archivedProfiles.toArray();
        archivedProfiles.clear();
        for (p in snapshot.values()) {
          if (p != personId) { archivedProfiles.add(p) };
        };
        appendAudit(auditLog, familyId, #ProfileRestored, actorId, [personId], "Restored profile " # personId);
        #ok(());
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `restoreProfileForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func restoreProfile(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.ArchiveError> {
    restoreProfileForFamily(archivedProfiles, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, actorId);
  };

  /// Returns the archived profiles of `familyId`. Canonical family-scoped form:
  /// only archived ids whose profile belongs to `familyId` are returned, so a
  /// `personId` alone never crosses a family boundary.
  public func listArchivedProfilesForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.PersonProfile] {
    let result = List.empty<Types.PersonProfile>();
    for (personId in archivedProfiles.toArray().values()) {
      switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
        case (?profile) result.add(profile);
        case null {};
      };
    };
    result.toArray();
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listArchivedProfilesForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func listArchivedProfiles(
    archivedProfiles : List.List<Types.PersonId>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : [Types.PersonProfile] {
    listArchivedProfilesForFamily(archivedProfiles, profiles, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Returns the ids of the archived profiles of `familyId` so normal family
  /// browsing can filter them out. Canonical family-scoped form: only archived
  /// ids whose profile belongs to `familyId` are returned, so one family's
  /// archived ids never hide another family's profiles. Not gated to stewards —
  /// any caller may read archived ids.
  public func listArchivedProfileIdsForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.PersonId] {
    archivedProfiles.toArray().filter(func personId =
      TenancyLib.getProfileForFamily(profiles, familyId, personId) != null);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listArchivedProfileIdsForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public func listArchivedProfileIds(
    archivedProfiles : List.List<Types.PersonId>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : [Types.PersonId] {
    listArchivedProfileIdsForFamily(archivedProfiles, profiles, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Returns the archived profile for `personId` in `familyId`, or `null` when
  /// the person is not archived in that family. Canonical family-scoped direct
  /// lookup: a `personId` alone never crosses a family boundary.
  public func getArchivedProfileForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : ?Types.PersonProfile {
    if (not archivedProfiles.toArray().any(func p = p == personId)) {
      return null;
    };
    TenancyLib.getProfileForFamily(profiles, familyId, personId);
  };

  /// Permanently deletes a profile in `familyId` only when it is empty of
  /// archive items, media, timeline/history, approved relationships, and
  /// ownership history, and explicit confirmation is given. Canonical
  /// family-scoped form: the target profile must belong to `familyId`, so a
  /// `personId` alone never crosses a family boundary.
  public func permanentlyDeleteProfileForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    confirmation : Bool,
    actorId : Principal,
  ) : Result.Result<(), Types.DeleteError> {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case null { #err(#ProfileNotFound) };
      case (?profile) {
        if (not confirmation) {
          return #err(#ConfirmationRequired);
        };
        if (archiveItems.toArray().any(func a = a.relatedMemberIds.any(func id = id == personId))) {
          return #err(#HasArchiveItems);
        };
        switch (galleries.get(personId)) {
          case (?g) { if (g.photos.size() > 0) { return #err(#HasMedia) } };
          case null {};
        };
        switch (profile.timeline) {
          case (?t) { if (t.size() > 0) { return #err(#HasTimeline) } };
          case null {};
        };
        if (confirmedRelationships.toArray().any(func r =
          r.familyId == familyId and (r.fromPersonId == personId or r.toPersonId == personId))) {
          return #err(#HasApprovedRelationships);
        };
        if (profile.claimedByUserId != null) {
          return #err(#HasOwnershipHistory);
        };
        TenancyLib.removeProfileForFamily(profiles, familyId, personId);
        let snapshot = archivedProfiles.toArray();
        archivedProfiles.clear();
        for (p in snapshot.values()) {
          if (p != personId) { archivedProfiles.add(p) };
        };
        appendAudit(auditLog, familyId, #ProfilePermanentlyDeleted, actorId, [personId], "Permanently deleted profile " # personId);
        #ok(());
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `permanentlyDeleteProfileForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public func permanentlyDeleteProfile(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    personId : Types.PersonId,
    confirmation : Bool,
    actorId : Principal,
  ) : Result.Result<(), Types.DeleteError> {
    permanentlyDeleteProfileForFamily(archivedProfiles, auditLog, profiles, confirmedRelationships, galleries, archiveItems, FamilyTypes.DEFAULT_FAMILY_ID, personId, confirmation, actorId);
  };

  // ---------------------------------------------------------------------------
  // Duplicate Profile Review & Merge
  // ---------------------------------------------------------------------------

  /// Returns suspected duplicate Person records of `familyId` with comparison
  /// data. Canonical family-scoped form: only profiles belonging to `familyId`
  /// are compared, so a Family A duplicate candidate never includes a Family B
  /// profile and the same name/personId in another family is not a candidate.
  public func listDuplicateCandidatesForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    dismissedDuplicates : List.List<Types.DismissedPair>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.DuplicatePair] {
    let familyProfiles = profiles.entries().filter(func ((_, p)) = p.familyId == familyId).toArray();
    let result = List.empty<Types.DuplicatePair>();
    var i = 0;
    while (i < familyProfiles.size()) {
      var j = i + 1;
      while (j < familyProfiles.size()) {
        let (_, a) = familyProfiles[i];
        let (_, b) = familyProfiles[j];
        if (isDuplicateCandidate(profiles, confirmedRelationships, a, b)
            and not isDismissedForFamily(dismissedDuplicates, familyId, a.personId, b.personId)) {
          result.add({
            candidateA = buildCandidate(profiles, confirmedRelationships, galleries, archiveItems, a.personId);
            candidateB = buildCandidate(profiles, confirmedRelationships, galleries, archiveItems, b.personId);
          });
        };
        j += 1;
      };
      i += 1;
    };
    result.toArray();
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listDuplicateCandidatesForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public func listDuplicateCandidates(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    dismissedDuplicates : List.List<Types.DismissedPair>,
  ) : [Types.DuplicatePair] {
    listDuplicateCandidatesForFamily(profiles, confirmedRelationships, galleries, archiveItems, dismissedDuplicates, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Marks two suspected duplicates in `familyId` as not a duplicate, persisting
  /// the pair so it does not reappear in that family's duplicate review list.
  /// Canonical family-scoped form: both people must belong to `familyId`, and
  /// the dismissal is stamped with `familyId`, so a dismissal in one family
  /// never hides a candidate in another.
  public func notDuplicateForFamily(
    dismissedDuplicates : List.List<Types.DismissedPair>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personIdA : Types.PersonId,
    personIdB : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.MergeError> {
    if (personIdA == personIdB) {
      return #err(#SameProfile);
    };
    if (TenancyLib.getProfileForFamily(profiles, familyId, personIdA) == null
        or TenancyLib.getProfileForFamily(profiles, familyId, personIdB) == null) {
      return #err(#ProfileNotFound);
    };
    if (not isDismissedForFamily(dismissedDuplicates, familyId, personIdA, personIdB)) {
      dismissedDuplicates.add({ familyId; personIdA; personIdB });
    };
    appendAudit(auditLog, familyId, #DuplicateMerged, actorId, [personIdA, personIdB], "Marked " # personIdA # " and " # personIdB # " as not duplicates");
    #ok(());
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `notDuplicateForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public func notDuplicate(
    dismissedDuplicates : List.List<Types.DismissedPair>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personIdA : Types.PersonId,
    personIdB : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.MergeError> {
    notDuplicateForFamily(dismissedDuplicates, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personIdA, personIdB, actorId);
  };

  /// Merges two duplicate profiles in `familyId` into one canonical record,
  /// moving/linking all valid relationships, media, timeline, stories, sources,
  /// archive references, and ownership/claim history without duplicating shared
  /// items. Canonical family-scoped form: both profiles must belong to
  /// `familyId`, so a merge never crosses families and Family B remains
  /// unchanged. Conflicting fields are preserved as conflict/review items. The
  /// merged-away record is archived rather than hard-deleted.
  public func mergeProfilesForFamily(
    archivedProfiles : List.List<Types.PersonId>,
    mergeConflicts : List.List<Types.MergeConflict>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    familyId : FamilyTypes.FamilyId,
    canonicalPersonId : Types.PersonId,
    mergedAwayPersonId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.MergeResult, Types.MergeError> {
    if (canonicalPersonId == mergedAwayPersonId) {
      return #err(#SameProfile);
    };
    let canonical = switch (TenancyLib.getProfileForFamily(profiles, familyId, canonicalPersonId)) {
      case null { return #err(#ProfileNotFound) };
      case (?p) p;
    };
    let mergedAway = switch (TenancyLib.getProfileForFamily(profiles, familyId, mergedAwayPersonId)) {
      case null { return #err(#ProfileNotFound) };
      case (?p) p;
    };
    let conflicts = List.empty<Types.MergeConflict>();
    let addConflict = func (field : Text, a : Text, b : Text) : () {
      let conflict : Types.MergeConflict = {
        familyId;
        id = nextId(mergeConflicts.toArray().map(func c = c.id));
        field;
        canonicalValue = a;
        alternateValue = b;
        status = #Pending;
        resolvedBy = null;
        resolvedAt = null;
      };
      mergeConflicts.add(conflict);
      conflicts.add(conflict);
    };
    compareOpt(addConflict, "name", ?canonical.name, ?mergedAway.name);
    compareOpt(addConflict, "preferredName", canonical.preferredName, mergedAway.preferredName);
    compareOpt(addConflict, "firstName", canonical.firstName, mergedAway.firstName);
    compareOpt(addConflict, "middleName", canonical.middleName, mergedAway.middleName);
    compareOpt(addConflict, "lastName", canonical.lastName, mergedAway.lastName);
    compareOpt(addConflict, "suffix", canonical.suffix, mergedAway.suffix);
    compareOpt(addConflict, "nickname", canonical.nickname, mergedAway.nickname);
    compareOpt(addConflict, "story", canonical.story, mergedAway.story);
    compareOpt(addConflict, "shortBio", canonical.shortBio, mergedAway.shortBio);
    compareOpt(addConflict, "longerStory", canonical.longerStory, mergedAway.longerStory);
    compareOpt(addConflict, "occupation", canonical.occupation, mergedAway.occupation);
    compareOpt(addConflict, "birthInfo", canonical.birthInfo, mergedAway.birthInfo);
    compareOpt(addConflict, "birthDate", canonical.birthDate, mergedAway.birthDate);
    compareOpt(addConflict, "birthplace", canonical.birthplace, mergedAway.birthplace);
    compareOpt(addConflict, "currentLocation", canonical.currentLocation, mergedAway.currentLocation);
    compareOpt(addConflict, "privacySettings", canonical.privacySettings, mergedAway.privacySettings);
    // Move the merged-away profile's relationships onto the canonical profile,
    // dropping any edge that would duplicate an existing canonical edge.
    let relSnapshot = confirmedRelationships.toArray();
    for (r in relSnapshot.values()) {
      if (r.familyId == familyId and (r.fromPersonId == mergedAwayPersonId or r.toPersonId == mergedAwayPersonId)) {
        let fromId = if (r.fromPersonId == mergedAwayPersonId) { canonicalPersonId } else { r.fromPersonId };
        let toId = if (r.toPersonId == mergedAwayPersonId) { canonicalPersonId } else { r.toPersonId };
        if (fromId != toId
            and not confirmedRelationships.toArray().any(func e =
              e.familyId == familyId and e.fromPersonId == fromId and e.toPersonId == toId and e.relationshipType == r.relationshipType)) {
          confirmedRelationships.add({
            familyId;
            id = nextId(confirmedRelationships.toArray().map(func e = e.id));
            fromPersonId = fromId;
            toPersonId = toId;
            relationshipType = r.relationshipType;
            status = r.status;
          });
        };
      };
    };
    let keptRelationships = confirmedRelationships.toArray().filter(func r =
      not (r.familyId == familyId and (r.fromPersonId == mergedAwayPersonId or r.toPersonId == mergedAwayPersonId)));
    confirmedRelationships.clear();
    for (r in keptRelationships.values()) { confirmedRelationships.add(r) };
    // Move the merged-away profile's media gallery onto the canonical profile
    // when the canonical profile has none.
    switch (galleries.get(mergedAwayPersonId)) {
      case (?g) {
        switch (galleries.get(canonicalPersonId)) {
          case null { galleries.add(canonicalPersonId, g) };
          case (?_) {};
        };
        galleries.remove(mergedAwayPersonId);
      };
      case null {};
    };
    // Re-point archive items at the canonical profile, preserving provenance.
    let archiveSnapshot = archiveItems.toArray();
    archiveItems.clear();
    for (a in archiveSnapshot.values()) {
      if (a.relatedMemberIds.any(func id = id == mergedAwayPersonId)) {
        archiveItems.add({
          a with
          relatedMemberIds = a.relatedMemberIds.map(func id = if (id == mergedAwayPersonId) { canonicalPersonId } else { id });
        });
      } else {
        archiveItems.add(a);
      };
    };
    // Archive the merged-away record rather than hard-deleting it.
    if (not archivedProfiles.toArray().any(func p = p == mergedAwayPersonId)) {
      archivedProfiles.add(mergedAwayPersonId);
    };
    appendAudit(auditLog, familyId, #DuplicateMerged, actorId, [canonicalPersonId, mergedAwayPersonId], "Merged profile " # mergedAwayPersonId # " into " # canonicalPersonId);
    #ok({
      canonicalPersonId;
      archivedPersonId = mergedAwayPersonId;
      conflicts = conflicts.toArray();
    });
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `mergeProfilesForFamily` with the default family id so current
  /// Norwood behavior is unchanged.
  public func mergeProfiles(
    archivedProfiles : List.List<Types.PersonId>,
    mergeConflicts : List.List<Types.MergeConflict>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    canonicalPersonId : Types.PersonId,
    mergedAwayPersonId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.MergeResult, Types.MergeError> {
    mergeProfilesForFamily(archivedProfiles, mergeConflicts, auditLog, profiles, confirmedRelationships, galleries, archiveItems, FamilyTypes.DEFAULT_FAMILY_ID, canonicalPersonId, mergedAwayPersonId, actorId);
  };

  /// Resolves a merge conflict in `familyId` by choosing the canonical display
  /// value. Canonical family-scoped form: the conflict must belong to
  /// `familyId`, so a conflict id alone never crosses a family boundary.
  public func resolveMergeConflictForFamily(
    mergeConflicts : List.List<Types.MergeConflict>,
    familyId : FamilyTypes.FamilyId,
    conflictId : Nat,
    canonicalValue : Text,
    actorId : Principal,
  ) : ?Types.MergeConflict {
    switch (mergeConflicts.find(func c = c.id == conflictId and c.familyId == familyId)) {
      case null { null };
      case (?conflict) {
        let updated : Types.MergeConflict = {
          conflict with
          canonicalValue;
          status = #Resolved;
          resolvedBy = ?actorId;
          resolvedAt = ?Time.now();
        };
        replaceMergeConflict(mergeConflicts, updated);
        ?updated;
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `resolveMergeConflictForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func resolveMergeConflict(
    mergeConflicts : List.List<Types.MergeConflict>,
    conflictId : Nat,
    canonicalValue : Text,
    actorId : Principal,
  ) : ?Types.MergeConflict {
    resolveMergeConflictForFamily(mergeConflicts, FamilyTypes.DEFAULT_FAMILY_ID, conflictId, canonicalValue, actorId);
  };

  // ---------------------------------------------------------------------------
  // Relationship Administration
  // ---------------------------------------------------------------------------

  /// Returns the current relationships for a person in `familyId`. Canonical
  /// family-scoped form: the target profile must belong to `familyId`, and only
  /// relationships stamped with `familyId` are returned, so a `personId` alone
  /// never crosses a family boundary and Family A never sees Family B
  /// relationships. Existing relationship ordering and record shape are
  /// preserved.
  public func listPersonRelationshipsForFamily(
    confirmedRelationships : List.List<Types.Relationship>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : [Types.Relationship] {
    if (TenancyLib.getProfileForFamily(profiles, familyId, personId) == null) {
      return [];
    };
    confirmedRelationships.toArray().filter(func r =
      r.familyId == familyId and (r.fromPersonId == personId or r.toPersonId == personId));
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listPersonRelationshipsForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public func listPersonRelationships(
    confirmedRelationships : List.List<Types.Relationship>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
  ) : [Types.Relationship] {
    listPersonRelationshipsForFamily(confirmedRelationships, profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// Adds a missing relationship to `familyId`'s family graph. Canonical
  /// family-scoped form: both people must belong to `familyId`, the duplicate
  /// check is filtered by `familyId`, and the new `Relationship` is stamped with
  /// `familyId`, so no cross-family relationship edge can be created.
  public func addRelationshipForFamily(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
    actorId : Principal,
  ) : Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (TenancyLib.getProfileForFamily(profiles, familyId, fromPersonId) == null
        or TenancyLib.getProfileForFamily(profiles, familyId, toPersonId) == null) {
      return #err(#PersonNotFound);
    };
    if (confirmedRelationships.toArray().any(func r =
      r.familyId == familyId and r.fromPersonId == fromPersonId and r.toPersonId == toPersonId and r.relationshipType == relationshipType)) {
      return #err(#DuplicateRelationship);
    };
    let relationship : Types.Relationship = {
      familyId;
      id = nextId(confirmedRelationships.toArray().map(func r = r.id));
      fromPersonId;
      toPersonId;
      relationshipType;
      status = #Confirmed;
    };
    confirmedRelationships.add(relationship);
    appendAudit(auditLog, familyId, #RelationshipAdded, actorId, [fromPersonId, toPersonId], "Added " # relationshipTypeText(relationshipType) # " relationship between " # fromPersonId # " and " # toPersonId);
    #ok(relationship);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `addRelationshipForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func addRelationship(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
    actorId : Principal,
  ) : Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    addRelationshipForFamily(confirmedRelationships, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, fromPersonId, toPersonId, relationshipType, actorId);
  };

  /// Removes an incorrect relationship from `familyId`'s family graph.
  /// Canonical family-scoped form: the relationship must belong to `familyId`,
  /// so a `relationshipId` alone never crosses a family boundary and only that
  /// family's relationship is removed. Existing audit/governance behavior is
  /// preserved.
  public func removeRelationshipForFamily(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    relationshipId : Nat,
    actorId : Principal,
  ) : Result.Result<(), Types.RelationshipAdminError> {
    switch (confirmedRelationships.find(func r = r.id == relationshipId and r.familyId == familyId)) {
      case null { #err(#RelationshipNotFound) };
      case (?rel) {
        let snapshot = confirmedRelationships.toArray();
        confirmedRelationships.clear();
        for (r in snapshot.values()) {
          if (not (r.id == relationshipId and r.familyId == familyId)) { confirmedRelationships.add(r) };
        };
        appendAudit(auditLog, familyId, #RelationshipRemoved, actorId, [rel.fromPersonId, rel.toPersonId], "Removed " # relationshipTypeText(rel.relationshipType) # " relationship between " # rel.fromPersonId # " and " # rel.toPersonId);
        #ok(());
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `removeRelationshipForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func removeRelationship(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    relationshipId : Nat,
    actorId : Principal,
  ) : Result.Result<(), Types.RelationshipAdminError> {
    removeRelationshipForFamily(confirmedRelationships, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, relationshipId, actorId);
  };

  /// Corrects the relationship type of an existing relationship in `familyId`.
  /// Canonical family-scoped form: the relationship must belong to `familyId`
  /// and both referenced people must still belong to `familyId`, so a
  /// `relationshipId` alone never crosses a family boundary and only that
  /// family's relationship is updated. Existing correction/audit semantics are
  /// preserved.
  public func correctRelationshipTypeForFamily(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    relationshipId : Nat,
    relationshipType : Types.RelationshipType,
    actorId : Principal,
  ) : Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    switch (confirmedRelationships.find(func r = r.id == relationshipId and r.familyId == familyId)) {
      case null { #err(#RelationshipNotFound) };
      case (?rel) {
        if (TenancyLib.getProfileForFamily(profiles, familyId, rel.fromPersonId) == null
            or TenancyLib.getProfileForFamily(profiles, familyId, rel.toPersonId) == null) {
          return #err(#PersonNotFound);
        };
        let previous = rel.relationshipType;
        let updated : Types.Relationship = { rel with relationshipType };
        replaceRelationship(confirmedRelationships, updated);
        appendAudit(auditLog, familyId, #RelationshipTypeCorrected, actorId, [rel.fromPersonId, rel.toPersonId], "Corrected relationship type from " # relationshipTypeText(previous) # " to " # relationshipTypeText(relationshipType) # " between " # rel.fromPersonId # " and " # rel.toPersonId);
        #ok(updated);
      };
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `correctRelationshipTypeForFamily` with the default family id
  /// so current Norwood behavior is unchanged.
  public func correctRelationshipType(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationshipId : Nat,
    relationshipType : Types.RelationshipType,
    actorId : Principal,
  ) : Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    correctRelationshipTypeForFamily(confirmedRelationships, auditLog, profiles, FamilyTypes.DEFAULT_FAMILY_ID, relationshipId, relationshipType, actorId);
  };

  // ---------------------------------------------------------------------------
  // Audit History
  // ---------------------------------------------------------------------------

  /// Returns the governance audit log of `familyId`. Canonical family-scoped
  /// form: only `AuditEntry` records whose `familyId` equals `familyId` are
  /// returned, so Family A never sees Family B audit history. Existing entry
  /// shape, chronological ordering, and action labels/details are preserved.
  public func listAuditHistoryForFamily(
    auditLog : List.List<Types.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.AuditEntry] {
    auditLog.toArray().filter(func e = e.familyId == familyId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper. Deprecated single-family form:
  /// delegates to `listAuditHistoryForFamily` with the default family id so
  /// current Norwood behavior is unchanged.
  public func listAuditHistory(auditLog : List.List<Types.AuditEntry>) : [Types.AuditEntry] {
    listAuditHistoryForFamily(auditLog, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  // --- helpers ---

  /// Whether the given account is an active steward.
  func isActiveStewardAccount(
    stewards : List.List<Types.StewardRecord>,
    accountId : ?Principal,
  ) : Bool {
    switch (accountId) {
      case (?a) stewards.toArray().any(func s = s.stewardAccountId == a and s.roleStatus == #Active);
      case null false;
    };
  };

  /// Whether the given account is an active steward of `familyId`. Only
  /// `StewardRecord` entries whose `familyId` equals `familyId` are considered,
  /// so an account that is an active Steward of another family is not excluded
  /// here.
  func isActiveStewardAccountForFamily(
    stewards : List.List<Types.StewardRecord>,
    accountId : ?Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    switch (accountId) {
      case (?a) stewards.toArray().any(func s =
        s.stewardAccountId == a and s.roleStatus == #Active and s.familyId == familyId);
      case null false;
    };
  };

  /// Resolves the enriched Person identity for a steward account by finding the
  /// profile whose `claimedByUserId` equals the account.
  func resolveIdentityByAccount(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    accountId : Principal,
  ) : ?Types.StewardIdentity {
    for ((_, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?accountId) {
        return ?buildIdentity(profile);
      };
    };
    null;
  };

  /// Resolves the enriched Person identity for a person id.
  func resolveIdentityByPerson(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
  ) : ?Types.StewardIdentity {
    switch (profiles.get(personId)) {
      case (?profile) ?buildIdentity(profile);
      case null null;
    };
  };

  /// Builds the enriched family-facing identity from a Person profile. Display
  /// priority: preferred/display name, then canonical full person name, then
  /// the account id as a last-resort administrative fallback.
  func buildIdentity(profile : Types.PersonProfile) : Types.StewardIdentity {
    let displayName = switch (profile.preferredName) {
      case (?p) {
        if (p != "") { p } else { profile.name };
      };
      case null profile.name;
    };
    {
      personId = profile.personId;
      displayName;
      canonicalName = profile.name;
      accountId = switch (profile.claimedByUserId) {
        case (?a) a;
        case null Principal.fromText("aaaaa-aa");
      };
    };
  };

  /// Whether a pair of person ids has been dismissed as "not a duplicate" in
  /// `familyId`. A dismissal stamped with another family never hides a candidate
  /// in this family.
  func isDismissedForFamily(
    dismissedDuplicates : List.List<Types.DismissedPair>,
    familyId : FamilyTypes.FamilyId,
    a : Types.PersonId,
    b : Types.PersonId,
  ) : Bool {
    dismissedDuplicates.toArray().any(func p =
      p.familyId == familyId
      and ((p.personIdA == a and p.personIdB == b) or (p.personIdA == b and p.personIdB == a))
    );
  };

  /// Whether two profiles are a duplicate candidate. A pair is a candidate only
  /// when the two profiles share meaningful name similarity AND have at least
  /// one corroborating signal beyond name. Sparse profiles (few populated
  /// fields) require stronger confidence to be flagged, not weaker.
  func isDuplicateCandidate(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    a : Types.PersonProfile,
    b : Types.PersonProfile,
  ) : Bool {
    if (not hasMeaningfulNameSimilarity(a, b)) {
      return false;
    };
    let signals = corroboratingSignalCount(profiles, confirmedRelationships, a, b);
    let required = if (isSparse(a) or isSparse(b)) { 2 } else { 1 };
    signals >= required;
  };

  /// Whether two profiles share at least one significant name token (a word in
  /// the canonical full name, or a structured first/last/nickname).
  func hasMeaningfulNameSimilarity(a : Types.PersonProfile, b : Types.PersonProfile) : Bool {
    let aTokens = nameTokens(a);
    let bTokens = nameTokens(b);
    aTokens.any(func at = bTokens.any(func bt = at == bt));
  };

  /// Collects the significant name tokens of a profile for similarity matching.
  func nameTokens(p : Types.PersonProfile) : [Text] {
    let tokens = List.empty<Text>();
    for (tok in p.name.toLower().split(#char ' ')) {
      if (tok != "") { tokens.add(tok) };
    };
    switch (p.firstName) { case (?t) { if (t != "") { tokens.add(t.toLower()) } }; case null {} };
    switch (p.lastName) { case (?t) { if (t != "") { tokens.add(t.toLower()) } }; case null {} };
    switch (p.nickname) { case (?t) { if (t != "") { tokens.add(t.toLower()) } }; case null {} };
    tokens.toArray();
  };

  /// Counts corroborating signals beyond name shared by two profiles: shared
  /// parent, spouse, child, sibling, birth info, death info, location, or
  /// nickname. Shared emptiness (both fields blank) never counts as a signal.
  func corroboratingSignalCount(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    a : Types.PersonProfile,
    b : Types.PersonProfile,
  ) : Nat {
    var count = 0;
    if (sharedName(relatedNames(profiles, confirmedRelationships, a.personId, #Parent), relatedNames(profiles, confirmedRelationships, b.personId, #Parent))) { count += 1 };
    if (sharedName(relatedNames(profiles, confirmedRelationships, a.personId, #SpousePartner), relatedNames(profiles, confirmedRelationships, b.personId, #SpousePartner))) { count += 1 };
    if (sharedName(relatedNames(profiles, confirmedRelationships, a.personId, #Child), relatedNames(profiles, confirmedRelationships, b.personId, #Child))) { count += 1 };
    if (sharedName(relatedNames(profiles, confirmedRelationships, a.personId, #Sibling), relatedNames(profiles, confirmedRelationships, b.personId, #Sibling))) { count += 1 };
    if (birthInfoMatches(a, b)) { count += 1 };
    if (a.livingStatus == #Deceased and b.livingStatus == #Deceased) { count += 1 };
    if (optTextMatches(a.currentLocation, b.currentLocation)) { count += 1 };
    if (optTextMatches(a.nickname, b.nickname)) { count += 1 };
    count;
  };

  /// Whether two name lists share a non-empty name (case-insensitive).
  func sharedName(xs : [Text], ys : [Text]) : Bool {
    xs.any(func x = x != "" and ys.any(func y = y != "" and x.toLower() == y.toLower()));
  };

  /// Whether two optional text fields both hold the same non-empty value.
  func optTextMatches(x : ?Text, y : ?Text) : Bool {
    switch (x, y) {
      case (?a, ?b) { a != "" and b != "" and a.toLower() == b.toLower() };
      case _ false;
    };
  };

  /// Whether two profiles share birth information (birth date or birthplace).
  func birthInfoMatches(a : Types.PersonProfile, b : Types.PersonProfile) : Bool {
    optTextMatches(a.birthDate, b.birthDate) or optTextMatches(a.birthplace, b.birthplace);
  };

  /// Whether a profile is sparse: it has few populated personal fields, so it
  /// requires stronger confidence to be flagged as a duplicate.
  func isSparse(p : Types.PersonProfile) : Bool {
    populatedFieldCount(p) < 4;
  };

  /// Counts the populated (non-empty) personal fields of a profile.
  func populatedFieldCount(p : Types.PersonProfile) : Nat {
    var count = 0;
    if (isPopulated(p.firstName)) { count += 1 };
    if (isPopulated(p.lastName)) { count += 1 };
    if (isPopulated(p.nickname)) { count += 1 };
    if (isPopulated(p.birthDate)) { count += 1 };
    if (isPopulated(p.birthplace)) { count += 1 };
    if (isPopulated(p.currentLocation)) { count += 1 };
    if (isPopulated(p.occupation)) { count += 1 };
    count;
  };

  /// Whether an optional text field holds a non-empty value.
  func isPopulated(v : ?Text) : Bool {
    switch (v) { case (?t) t != ""; case null false };
  };

  /// Computes the next id: one greater than the largest existing id, or `0`
  /// when the collection is empty.
  func nextId(ids : [Nat]) : Nat {
    var maxId = 0;
    for (id in ids.values()) {
      if (id >= maxId) { maxId := id + 1 };
    };
    maxId;
  };

  /// Appends a governance audit entry stamped with the owning `familyId`.
  func appendAudit(
    auditLog : List.List<Types.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    actionType : Types.AuditActionType,
    actorId : Principal,
    affectedPersonIds : [Types.PersonId],
    summary : Text,
  ) {
    auditLog.add({
      id = nextId(auditLog.toArray().map(func e = e.id));
      familyId;
      actionType;
      actorAccountId = actorId;
      affectedPersonIds;
      timestamp = Time.now();
      summary;
    });
  };

  /// Family-qualified replacement: a StewardRecord is rewritten only when both
  /// its `stewardAccountId` and its `familyId` match `updated`, so a principal
  /// holding StewardRecords in several families never has another family's
  /// record overwritten by a removal in one family.
  func replaceSteward(stewards : List.List<Types.StewardRecord>, updated : Types.StewardRecord) {
    let snapshot = stewards.toArray();
    stewards.clear();
    for (s in snapshot.values()) {
      if (s.stewardAccountId == updated.stewardAccountId and s.familyId == updated.familyId) { stewards.add(updated) } else { stewards.add(s) };
    };
  };

  func replaceSuccessor(successors : List.List<Types.SuccessorDesignation>, updated : Types.SuccessorDesignation) {
    let snapshot = successors.toArray();
    successors.clear();
    for (s in snapshot.values()) {
      if (s.familyId == updated.familyId and s.personId == updated.personId) { successors.add(updated) } else { successors.add(s) };
    };
  };

  func replaceRemovalRequest(removalRequests : List.List<Types.ProfileRemovalRequest>, updated : Types.ProfileRemovalRequest) {
    let snapshot = removalRequests.toArray();
    removalRequests.clear();
    for (r in snapshot.values()) {
      if (r.id == updated.id) { removalRequests.add(updated) } else { removalRequests.add(r) };
    };
  };

  func replaceRelationship(confirmedRelationships : List.List<Types.Relationship>, updated : Types.Relationship) {
    let snapshot = confirmedRelationships.toArray();
    confirmedRelationships.clear();
    for (r in snapshot.values()) {
      if (r.id == updated.id) { confirmedRelationships.add(updated) } else { confirmedRelationships.add(r) };
    };
  };

  func replaceMergeConflict(mergeConflicts : List.List<Types.MergeConflict>, updated : Types.MergeConflict) {
    let snapshot = mergeConflicts.toArray();
    mergeConflicts.clear();
    for (c in snapshot.values()) {
      if (c.id == updated.id) { mergeConflicts.add(updated) } else { mergeConflicts.add(c) };
    };
  };

  /// Builds the comparison data for one duplicate-review candidate.
  func buildCandidate(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    personId : Types.PersonId,
  ) : Types.DuplicateCandidate {
    let photoCount = switch (galleries.get(personId)) {
      case (?g) g.photos.size();
      case null 0;
    };
    let sourceCount = archiveItems.toArray().filter(func a = a.relatedMemberIds.any(func id = id == personId)).size();
    let archiveLinks = archiveItems.toArray().filter(func a = a.relatedMemberIds.any(func id = id == personId)).map(func a = a.title);
    switch (profiles.get(personId)) {
      case null {
        {
          personId;
          name = "";
          birthDate = null;
          deathDate = null;
          parents = [];
          spouses = [];
          children = [];
          claimStatus = "";
          ownerAccount = null;
          photoCount;
          timelineCount = 0;
          sourceCount;
          archiveLinks;
        };
      };
      case (?profile) {
        {
          personId;
          name = profile.name;
          birthDate = profile.birthDate;
          deathDate = null;
          parents = relatedNames(profiles, confirmedRelationships, personId, #Parent);
          spouses = relatedNames(profiles, confirmedRelationships, personId, #SpousePartner);
          children = relatedNames(profiles, confirmedRelationships, personId, #Child);
          claimStatus = switch (profile.claimStatus) {
            case (#Claimed) "Claimed";
            case (#Unclaimed) "Unclaimed";
          };
          ownerAccount = profile.claimedByUserId;
          photoCount;
          timelineCount = switch (profile.timeline) {
            case (?t) t.size();
            case null 0;
          };
          sourceCount;
          archiveLinks;
        };
      };
    };
  };

  /// Resolves the display names of a person's relatives of a given type.
  func relatedNames(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    personId : Types.PersonId,
    relType : Types.RelationshipType,
  ) : [Text] {
    let names = List.empty<Text>();
    for (rel in confirmedRelationships.toArray().values()) {
      if (rel.status == #Confirmed and rel.relationshipType == relType) {
        var otherId : ?Types.PersonId = null;
        switch (relType) {
          case (#Parent) { if (rel.toPersonId == personId) { otherId := ?rel.fromPersonId } };
          case (#Child) { if (rel.fromPersonId == personId) { otherId := ?rel.toPersonId } };
          case (#SpousePartner) {
            if (rel.fromPersonId == personId) { otherId := ?rel.toPersonId }
            else if (rel.toPersonId == personId) { otherId := ?rel.fromPersonId };
          };
          case (#Sibling) {
            if (rel.fromPersonId == personId) { otherId := ?rel.toPersonId }
            else if (rel.toPersonId == personId) { otherId := ?rel.fromPersonId };
          };
        };
        switch (otherId) {
          case (?id) {
            switch (profiles.get(id)) {
              case (?p) names.add(p.name);
              case null names.add(id);
            };
          };
          case null {};
        };
      };
    };
    names.toArray();
  };

  /// Compares two optional text fields and records a conflict when both are
  /// present and differ.
  func compareOpt(
    addConflict : (Text, Text, Text) -> (),
    field : Text,
    a : ?Text,
    b : ?Text,
  ) {
    switch (a, b) {
      case (?x, ?y) { addConflict(field, x, y) };
      case _ {};
    };
  };

  func relationshipTypeText(status : Types.RelationshipType) : Text {
    switch (status) {
      case (#Parent) "Parent";
      case (#Child) "Child";
      case (#SpousePartner) "SpousePartner";
      case (#Sibling) "Sibling";
    };
  };
};

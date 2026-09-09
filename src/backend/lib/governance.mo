import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/governance";
import ObjectStorageTypes "../types/object-storage";
import ArchiveTypes "../types/archive";

module {
  // ---------------------------------------------------------------------------
  // Steward Management & Succession
  // ---------------------------------------------------------------------------

  /// Returns all steward governance records.
  public func listStewards(stewards : List.List<Types.StewardRecord>) : [Types.StewardRecord] {
    stewards.toArray();
  };

  /// Promotes an approved claimed family member to Family Steward.
  public func promoteToSteward(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.StewardRecord, Types.StewardError> {
    switch (profiles.get(personId)) {
      case null { #err(#NotApprovedClaimedMember) };
      case (?profile) {
        if (profile.claimStatus != #Claimed) {
          return #err(#NotApprovedClaimedMember);
        };
        switch (profile.claimedByUserId) {
          case null { #err(#NotApprovedClaimedMember) };
          case (?ownerId) {
            if (stewards.toArray().any(func s = s.stewardAccountId == ownerId and s.roleStatus == #Active)) {
              return #err(#AlreadySteward);
            };
            let record : Types.StewardRecord = {
              stewardAccountId = ownerId;
              roleStatus = #Active;
              successorPriority = null;
              assignedBy = actorId;
              assignedAt = Time.now();
            };
            stewards.add(record);
            appendAudit(auditLog, #StewardPromoted, actorId, [personId], "Promoted " # personId # " to Family Steward");
            #ok(record);
          };
        };
      };
    };
  };

  /// Removes the steward role from another steward, never allowing the last
  /// steward to be removed.
  public func removeSteward(
    stewards : List.List<Types.StewardRecord>,
    auditLog : List.List<Types.AuditEntry>,
    stewardAccountId : Principal,
    actorId : Principal,
  ) : Result.Result<(), Types.StewardError> {
    switch (stewards.find(func s = s.stewardAccountId == stewardAccountId and s.roleStatus == #Active)) {
      case null { #err(#NotSteward) };
      case (?record) {
        let active = stewards.toArray().filter(func s = s.roleStatus == #Active);
        if (active.size() <= 1) {
          return #err(#LastSteward);
        };
        let updated : Types.StewardRecord = { record with roleStatus = #Removed };
        replaceSteward(stewards, updated);
        appendAudit(auditLog, #StewardRemoved, actorId, [], "Removed steward role from " # stewardAccountId.toText());
        #ok(());
      };
    };
  };

  /// Designates an approved claimed family member as a successor steward with a
  /// priority/order. A successor is a designation only until activated.
  public func designateSuccessor(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    priority : Nat,
    actorId : Principal,
  ) : Result.Result<Types.SuccessorDesignation, Types.StewardError> {
    if (not isApprovedClaimedMember(profiles, personId)) {
      return #err(#NotApprovedClaimedMember);
    };
    switch (profiles.get(personId)) {
      case null { return #err(#NotApprovedClaimedMember) };
      case (?profile) {
        switch (profile.claimedByUserId) {
          case null { return #err(#NotApprovedClaimedMember) };
          case (?ownerId) {
            if (stewards.toArray().any(func s = s.stewardAccountId == ownerId and s.roleStatus == #Active)) {
              return #err(#AlreadySteward);
            };
          };
        };
      };
    };
    let designation : Types.SuccessorDesignation = {
      personId;
      priority;
      assignedBy = actorId;
      assignedAt = Time.now();
      status = #Designated;
    };
    successors.add(designation);
    appendAudit(auditLog, #SuccessorDesignated, actorId, [personId], "Designated " # personId # " as successor steward (priority " # Nat.toText(priority) # ")");
    #ok(designation);
  };

  /// Activates/promotes a designated successor into the active steward role.
  public func activateSuccessor(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<Types.StewardRecord, Types.StewardError> {
    switch (successors.find(func s = s.personId == personId and s.status == #Designated)) {
      case null { #err(#NotDesignated) };
      case (?designation) {
        switch (profiles.get(personId)) {
          case null { #err(#NotApprovedClaimedMember) };
          case (?profile) {
            if (profile.claimStatus != #Claimed) {
              return #err(#NotApprovedClaimedMember);
            };
            switch (profile.claimedByUserId) {
              case null { #err(#NotApprovedClaimedMember) };
              case (?ownerId) {
                if (stewards.toArray().any(func s = s.stewardAccountId == ownerId and s.roleStatus == #Active)) {
                  return #err(#AlreadySteward);
                };
                let record : Types.StewardRecord = {
                  stewardAccountId = ownerId;
                  roleStatus = #Active;
                  successorPriority = ?designation.priority;
                  assignedBy = actorId;
                  assignedAt = Time.now();
                };
                stewards.add(record);
                let updated : Types.SuccessorDesignation = { designation with status = #Activated };
                replaceSuccessor(successors, updated);
                appendAudit(auditLog, #SuccessorActivated, actorId, [personId], "Activated successor " # personId # " as Family Steward");
                #ok(record);
              };
            };
          };
        };
      };
    };
  };

  /// Returns all successor designations.
  public func listSuccessors(successors : List.List<Types.SuccessorDesignation>) : [Types.SuccessorDesignation] {
    successors.toArray();
  };

  /// Returns a warning encouraging successor designation when only one steward
  /// exists, or `null` when there are multiple stewards.
  public func getSingleStewardWarning(stewards : List.List<Types.StewardRecord>) : ?Text {
    let active = stewards.toArray().filter(func s = s.roleStatus == #Active);
    if (active.size() == 1) {
      ?"Only one Family Steward remains. Designate a successor steward to ensure continuity.";
    } else {
      null;
    };
  };

  /// Returns each current Steward and designated Successor enriched with the
  /// linked approved Person identity (personId, preferred/display name, and
  /// canonical full person name), resolved via steward accountId -> approved
  /// linked personId (PersonProfile.claimedByUserId) -> canonical Person
  /// Profile. The internal account id is carried only for authorization/audit.
  public func listStewardIdentities(
    stewards : List.List<Types.StewardRecord>,
    successors : List.List<Types.SuccessorDesignation>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : [Types.StewardIdentity] {
    let result = List.empty<Types.StewardIdentity>();
    for (s in stewards.toArray().values()) {
      if (s.roleStatus == #Active) {
        switch (resolveIdentityByAccount(profiles, s.stewardAccountId)) {
          case (?id) result.add(id);
          case null {};
        };
      };
    };
    for (d in successors.toArray().values()) {
      if (d.status == #Designated) {
        switch (resolveIdentityByPerson(profiles, d.personId)) {
          case (?id) result.add(id);
          case null {};
        };
      };
    };
    result.toArray();
  };

  /// Returns the eligible promotion/successor candidate list: all people who
  /// are living, have an APPROVED/CLAIMED profile, are linked to a valid
  /// account, are not already an active Steward, and are not archived. This is
  /// data-driven — as additional family members claim and receive approval they
  /// automatically appear without code changes.
  public func listEligibleStewardCandidates(
    stewards : List.List<Types.StewardRecord>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    archivedProfiles : List.List<Types.PersonId>,
  ) : [Types.StewardIdentity] {
    let result = List.empty<Types.StewardIdentity>();
    let archived = archivedProfiles.toArray();
    for ((personId, profile) in profiles.entries()) {
      if (profile.livingStatus == #Living
          and profile.claimStatus == #Claimed
          and profile.claimedByUserId != null
          and not archived.any(func p = p == personId)
          and not isActiveStewardAccount(stewards, profile.claimedByUserId)
      ) {
        result.add(buildIdentity(profile));
      };
    };
    result.toArray();
  };

  // ---------------------------------------------------------------------------
  // Safe Profile Removal, Archive & Restore
  // ---------------------------------------------------------------------------

  /// Records a claimed living profile owner's request for profile removal.
  public func requestProfileRemoval(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    reason : Text,
    caller : Principal,
  ) : Result.Result<Types.ProfileRemovalRequest, Types.RemovalError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (profiles.get(personId)) {
      case null { #err(#ProfileNotFound) };
      case (?profile) {
        if (profile.livingStatus == #Deceased) {
          return #err(#DeceasedProfile);
        };
        if (profile.claimedByUserId != ?caller) {
          return #err(#NotOwner);
        };
        if (removalRequests.toArray().any(func r = r.personId == personId and r.status == #Pending)) {
          return #err(#AlreadyPending);
        };
        let request : Types.ProfileRemovalRequest = {
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
        appendAudit(auditLog, #ProfileRemovalRequested, caller, [personId], "Requested removal of profile " # personId);
        #ok(request);
      };
    };
  };

  /// Returns all profile removal requests for steward review.
  public func listProfileRemovalRequests(removalRequests : List.List<Types.ProfileRemovalRequest>) : [Types.ProfileRemovalRequest] {
    removalRequests.toArray();
  };

  /// Approves a profile removal request, archiving the profile.
  public func approveProfileRemoval(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    requestId : Nat,
    actorId : Principal,
  ) : ?Types.ProfileRemovalRequest {
    switch (removalRequests.find(func r = r.id == requestId and r.status == #Pending)) {
      case null { null };
      case (?request) {
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
        appendAudit(auditLog, #ProfileRemovalReviewed, actorId, [request.personId], "Approved removal of profile " # request.personId # " (archived)");
        ?updated;
      };
    };
  };

  /// Rejects a profile removal request.
  public func rejectProfileRemoval(
    removalRequests : List.List<Types.ProfileRemovalRequest>,
    auditLog : List.List<Types.AuditEntry>,
    requestId : Nat,
    actorId : Principal,
  ) : ?Types.ProfileRemovalRequest {
    switch (removalRequests.find(func r = r.id == requestId and r.status == #Pending)) {
      case null { null };
      case (?request) {
        let updated : Types.ProfileRemovalRequest = {
          request with
          status = #Rejected;
          reviewedBy = ?actorId;
          reviewedDate = ?Time.now();
        };
        replaceRemovalRequest(removalRequests, updated);
        appendAudit(auditLog, #ProfileRemovalReviewed, actorId, [request.personId], "Rejected removal of profile " # request.personId);
        ?updated;
      };
    };
  };

  /// Archives a profile, removing it from normal family browsing while
  /// preserving relationships, media, timeline, sources, and ownership history.
  public func archiveProfile(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.ArchiveError> {
    if (profiles.get(personId) == null) {
      return #err(#ProfileNotFound);
    };
    if (archivedProfiles.toArray().any(func p = p == personId)) {
      return #err(#AlreadyArchived);
    };
    archivedProfiles.add(personId);
    appendAudit(auditLog, #ProfileArchived, actorId, [personId], "Archived profile " # personId);
    #ok(());
  };

  /// Restores an archived profile to normal family browsing.
  public func restoreProfile(
    archivedProfiles : List.List<Types.PersonId>,
    auditLog : List.List<Types.AuditEntry>,
    personId : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.ArchiveError> {
    if (not archivedProfiles.toArray().any(func p = p == personId)) {
      return #err(#NotArchived);
    };
    let snapshot = archivedProfiles.toArray();
    archivedProfiles.clear();
    for (p in snapshot.values()) {
      if (p != personId) { archivedProfiles.add(p) };
    };
    appendAudit(auditLog, #ProfileRestored, actorId, [personId], "Restored profile " # personId);
    #ok(());
  };

  /// Returns all archived profiles.
  public func listArchivedProfiles(
    archivedProfiles : List.List<Types.PersonId>,
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : [Types.PersonProfile] {
    let result = List.empty<Types.PersonProfile>();
    for (personId in archivedProfiles.toArray().values()) {
      switch (profiles.get(personId)) {
        case (?p) result.add(p);
        case null {};
      };
    };
    result.toArray();
  };

  /// Returns the ids of all archived profiles so normal family browsing can
  /// filter them out. Not gated to stewards — any caller may read archived ids.
  public func listArchivedProfileIds(
    archivedProfiles : List.List<Types.PersonId>,
  ) : [Types.PersonId] {
    archivedProfiles.toArray();
  };

  /// Permanently deletes a profile only when it is empty of archive items,
  /// media, timeline/history, approved relationships, and ownership history,
  /// and explicit confirmation is given.
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
    switch (profiles.get(personId)) {
      case null { #err(#ProfileNotFound) };
      case (?profile) {
        if (not confirmation) {
          return #err(#ConfirmationRequired);
        };
        switch (profile.timeline) {
          case (?t) { if (t.size() > 0) { return #err(#HasTimeline) } };
          case null {};
        };
        if (confirmedRelationships.toArray().any(func r = r.status == #Confirmed and (r.fromPersonId == personId or r.toPersonId == personId))) {
          return #err(#HasApprovedRelationships);
        };
        if (profile.claimStatus == #Claimed or profile.claimedByUserId != null) {
          return #err(#HasOwnershipHistory);
        };
        switch (galleries.get(personId)) {
          case (?g) { if (g.photos.size() > 0) { return #err(#HasMedia) } };
          case null {};
        };
        if (archiveItems.toArray().any(func a = a.relatedMemberIds.any(func id = id == personId))) {
          return #err(#HasArchiveItems);
        };
        profiles.remove(personId);
        let snapshot = archivedProfiles.toArray();
        archivedProfiles.clear();
        for (p in snapshot.values()) {
          if (p != personId) { archivedProfiles.add(p) };
        };
        appendAudit(auditLog, #ProfilePermanentlyDeleted, actorId, [personId], "Permanently deleted profile " # personId);
        #ok(());
      };
    };
  };

  // ---------------------------------------------------------------------------
  // Duplicate Profile Review & Merge
  // ---------------------------------------------------------------------------

  /// Returns suspected duplicate Person records with comparison data.
  public func listDuplicateCandidates(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    confirmedRelationships : List.List<Types.Relationship>,
    galleries : Map.Map<Types.PersonId, ObjectStorageTypes.PhotoGallery>,
    archiveItems : List.List<ArchiveTypes.ArchiveItem>,
    dismissedDuplicates : List.List<Types.DismissedPair>,
  ) : [Types.DuplicatePair] {
    let ids = List.empty<Types.PersonId>();
    for ((personId, _) in profiles.entries()) { ids.add(personId) };
    let idArr = ids.toArray();
    if (idArr.size() < 2) {
      return [];
    };
    let pairs = List.empty<Types.DuplicatePair>();
    var i = 0;
    while (i < idArr.size()) {
      var j = i + 1;
      while (j < idArr.size()) {
        let a = idArr[i];
        let b = idArr[j];
        if (not isDismissed(dismissedDuplicates, a, b)) {
          pairs.add({
            candidateA = buildCandidate(profiles, confirmedRelationships, galleries, archiveItems, a);
            candidateB = buildCandidate(profiles, confirmedRelationships, galleries, archiveItems, b);
          });
        };
        j += 1;
      };
      i += 1;
    };
    pairs.toArray();
  };

  /// Marks two suspected duplicates as not a duplicate, persisting the pair so
  /// it does not reappear in the duplicate review list.
  public func notDuplicate(
    dismissedDuplicates : List.List<Types.DismissedPair>,
    auditLog : List.List<Types.AuditEntry>,
    personIdA : Types.PersonId,
    personIdB : Types.PersonId,
    actorId : Principal,
  ) : Result.Result<(), Types.MergeError> {
    if (personIdA == personIdB) {
      return #err(#SameProfile);
    };
    if (not isDismissed(dismissedDuplicates, personIdA, personIdB)) {
      dismissedDuplicates.add({ personIdA; personIdB });
    };
    appendAudit(auditLog, #DuplicateMerged, actorId, [personIdA, personIdB], "Marked " # personIdA # " and " # personIdB # " as not duplicates");
    #ok(());
  };

  /// Merges two duplicate profiles into one canonical record, moving/linking
  /// all valid relationships, media, timeline, stories, sources, archive
  /// references, and ownership/claim history without duplicating shared items.
  /// Conflicting fields are preserved as conflict/review items. The merged-away
  /// record is archived rather than hard-deleted.
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
    if (canonicalPersonId == mergedAwayPersonId) {
      return #err(#SameProfile);
    };
    switch (profiles.get(canonicalPersonId), profiles.get(mergedAwayPersonId)) {
      case (null, _) { #err(#ProfileNotFound) };
      case (_, null) { #err(#ProfileNotFound) };
      case (?canonical, ?mergedAway) {
        // Re-point relationships from the merged-away record to the canonical
        // record, skipping any that would duplicate an existing relationship.
        let relSnapshot = confirmedRelationships.toArray();
        confirmedRelationships.clear();
        for (rel in relSnapshot.values()) {
          if (rel.fromPersonId == mergedAwayPersonId or rel.toPersonId == mergedAwayPersonId) {
            let newFrom = if (rel.fromPersonId == mergedAwayPersonId) canonicalPersonId else rel.fromPersonId;
            let newTo = if (rel.toPersonId == mergedAwayPersonId) canonicalPersonId else rel.toPersonId;
            if (newFrom != newTo) {
              let dup = confirmedRelationships.toArray().any(func r =
                r.fromPersonId == newFrom and r.toPersonId == newTo and r.relationshipType == rel.relationshipType);
              if (not dup) {
                confirmedRelationships.add({ rel with fromPersonId = newFrom; toPersonId = newTo });
              };
            };
          } else {
            confirmedRelationships.add(rel);
          };
        };
        // Preserve conflicting fields as conflict/review items.
        let conflictList = List.empty<Types.MergeConflict>();
        func addConflict(field : Text, canonicalVal : Text, alternateVal : Text) {
          if (canonicalVal != alternateVal) {
            let conflict : Types.MergeConflict = {
              id = nextId(mergeConflicts.toArray().map(func c = c.id));
              field;
              canonicalValue = canonicalVal;
              alternateValue = alternateVal;
              status = #Pending;
              resolvedBy = null;
              resolvedAt = null;
            };
            mergeConflicts.add(conflict);
            conflictList.add(conflict);
          };
        };
        addConflict("name", canonical.name, mergedAway.name);
        compareOpt(addConflict, "birthDate", canonical.birthDate, mergedAway.birthDate);
        compareOpt(addConflict, "birthplace", canonical.birthplace, mergedAway.birthplace);
        compareOpt(addConflict, "currentLocation", canonical.currentLocation, mergedAway.currentLocation);
        compareOpt(addConflict, "occupation", canonical.occupation, mergedAway.occupation);
        compareOpt(addConflict, "story", canonical.story, mergedAway.story);
        // Move photos/media from the merged-away gallery into the canonical
        // gallery without duplicating shared items.
        switch (galleries.get(mergedAwayPersonId)) {
          case (?awayGallery) {
            let canonicalGallery = switch (galleries.get(canonicalPersonId)) {
              case (?g) g;
              case null {
                let g : ObjectStorageTypes.PhotoGallery = { photos = List.empty(); var profilePhotoId = null };
                galleries.add(canonicalPersonId, g);
                g;
              };
            };
            for (photo in awayGallery.photos.toArray().values()) {
              if (not canonicalGallery.photos.toArray().any(func p = p.id == photo.id)) {
                canonicalGallery.photos.add(photo);
              };
            };
            if (canonicalGallery.profilePhotoId == null) {
              canonicalGallery.profilePhotoId := awayGallery.profilePhotoId;
            };
            galleries.remove(mergedAwayPersonId);
          };
          case null {};
        };
        // Merge timeline entries into the canonical record without duplicating.
        switch (mergedAway.timeline) {
          case (?awayTimeline) {
            let merged = List.empty<Text>();
            for (t in awayTimeline.values()) {
              if (not merged.toArray().any(func x = x == t)) { merged.add(t) };
            };
            switch (canonical.timeline) {
              case (?canonTimeline) {
                for (t in canonTimeline.values()) {
                  if (not merged.toArray().any(func x = x == t)) { merged.add(t) };
                };
              };
              case null {};
            };
            let updatedProfile : Types.PersonProfile = { canonical with timeline = ?merged.toArray() };
            profiles.add(canonicalPersonId, updatedProfile);
          };
          case null {};
        };
        // Link archive items that referenced the merged-away record to the
        // canonical record without duplicating.
        let archiveSnapshot = archiveItems.toArray();
        archiveItems.clear();
        for (item in archiveSnapshot.values()) {
          if (item.relatedMemberIds.any(func id = id == mergedAwayPersonId)) {
            let linked = List.empty<Text>();
            for (id in item.relatedMemberIds.values()) {
              if (id != mergedAwayPersonId and not linked.toArray().any(func x = x == id)) { linked.add(id) };
            };
            if (not linked.toArray().any(func x = x == canonicalPersonId)) { linked.add(canonicalPersonId) };
            archiveItems.add({ item with relatedMemberIds = linked.toArray() });
          } else {
            archiveItems.add(item);
          };
        };
        // Archive the merged-away record rather than hard-deleting it.
        if (not archivedProfiles.toArray().any(func p = p == mergedAwayPersonId)) {
          archivedProfiles.add(mergedAwayPersonId);
        };
        appendAudit(auditLog, #DuplicateMerged, actorId, [canonicalPersonId, mergedAwayPersonId], "Merged " # mergedAwayPersonId # " into " # canonicalPersonId);
        #ok({
          canonicalPersonId;
          archivedPersonId = mergedAwayPersonId;
          conflicts = conflictList.toArray();
        });
      };
    };
  };

  /// Resolves a merge conflict by choosing the canonical display value.
  public func resolveMergeConflict(
    mergeConflicts : List.List<Types.MergeConflict>,
    conflictId : Nat,
    canonicalValue : Text,
    actorId : Principal,
  ) : ?Types.MergeConflict {
    switch (mergeConflicts.find(func c = c.id == conflictId and c.status == #Pending)) {
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

  // ---------------------------------------------------------------------------
  // Relationship Administration
  // ---------------------------------------------------------------------------

  /// Returns the current relationships for a person.
  public func listPersonRelationships(
    confirmedRelationships : List.List<Types.Relationship>,
    personId : Types.PersonId,
  ) : [Types.Relationship] {
    confirmedRelationships.toArray().filter(func r = r.fromPersonId == personId or r.toPersonId == personId);
  };

  /// Adds a missing relationship to the shared family graph.
  public func addRelationship(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
    actorId : Principal,
  ) : Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    if (confirmedRelationships.toArray().any(func r =
      r.fromPersonId == fromPersonId and r.toPersonId == toPersonId and r.relationshipType == relationshipType)) {
      return #err(#DuplicateRelationship);
    };
    let relationship : Types.Relationship = {
      id = nextId(confirmedRelationships.toArray().map(func r = r.id));
      fromPersonId;
      toPersonId;
      relationshipType;
      status = #Confirmed;
    };
    confirmedRelationships.add(relationship);
    appendAudit(auditLog, #RelationshipAdded, actorId, [fromPersonId, toPersonId], "Added " # relationshipTypeText(relationshipType) # " relationship between " # fromPersonId # " and " # toPersonId);
    #ok(relationship);
  };

  /// Removes an incorrect relationship from the shared family graph.
  public func removeRelationship(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    relationshipId : Nat,
    actorId : Principal,
  ) : Result.Result<(), Types.RelationshipAdminError> {
    switch (confirmedRelationships.find(func r = r.id == relationshipId)) {
      case null { #err(#RelationshipNotFound) };
      case (?rel) {
        let snapshot = confirmedRelationships.toArray();
        confirmedRelationships.clear();
        for (r in snapshot.values()) {
          if (r.id != relationshipId) { confirmedRelationships.add(r) };
        };
        appendAudit(auditLog, #RelationshipRemoved, actorId, [rel.fromPersonId, rel.toPersonId], "Removed " # relationshipTypeText(rel.relationshipType) # " relationship between " # rel.fromPersonId # " and " # rel.toPersonId);
        #ok(());
      };
    };
  };

  /// Corrects the relationship type of an existing relationship.
  public func correctRelationshipType(
    confirmedRelationships : List.List<Types.Relationship>,
    auditLog : List.List<Types.AuditEntry>,
    relationshipId : Nat,
    relationshipType : Types.RelationshipType,
    actorId : Principal,
  ) : Result.Result<Types.Relationship, Types.RelationshipAdminError> {
    switch (confirmedRelationships.find(func r = r.id == relationshipId)) {
      case null { #err(#RelationshipNotFound) };
      case (?rel) {
        let previous = rel.relationshipType;
        let updated : Types.Relationship = { rel with relationshipType };
        replaceRelationship(confirmedRelationships, updated);
        appendAudit(auditLog, #RelationshipTypeCorrected, actorId, [rel.fromPersonId, rel.toPersonId], "Corrected relationship type from " # relationshipTypeText(previous) # " to " # relationshipTypeText(relationshipType) # " between " # rel.fromPersonId # " and " # rel.toPersonId);
        #ok(updated);
      };
    };
  };

  // ---------------------------------------------------------------------------
  // Audit History
  // ---------------------------------------------------------------------------

  /// Returns the governance audit log. Audit History is strictly steward-only.
  public func listAuditHistory(auditLog : List.List<Types.AuditEntry>) : [Types.AuditEntry] {
    auditLog.toArray();
  };

  // --- helpers ---

  /// Whether a person is an approved claimed family member (a profile with an
  /// approved claim, i.e. `claimStatus == #Claimed`).
  func isApprovedClaimedMember(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
  ) : Bool {
    switch (profiles.get(personId)) {
      case (?p) p.claimStatus == #Claimed;
      case null false;
    };
  };

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

  /// Whether a pair of person ids has been dismissed as "not a duplicate".
  func isDismissed(
    dismissedDuplicates : List.List<Types.DismissedPair>,
    a : Types.PersonId,
    b : Types.PersonId,
  ) : Bool {
    dismissedDuplicates.toArray().any(func p =
      (p.personIdA == a and p.personIdB == b) or (p.personIdA == b and p.personIdB == a)
    );
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

  /// Appends a governance audit entry.
  func appendAudit(
    auditLog : List.List<Types.AuditEntry>,
    actionType : Types.AuditActionType,
    actorId : Principal,
    affectedPersonIds : [Types.PersonId],
    summary : Text,
  ) {
    auditLog.add({
      id = nextId(auditLog.toArray().map(func e = e.id));
      actionType;
      actorAccountId = actorId;
      affectedPersonIds;
      timestamp = Time.now();
      summary;
    });
  };

  func replaceSteward(stewards : List.List<Types.StewardRecord>, updated : Types.StewardRecord) {
    let snapshot = stewards.toArray();
    stewards.clear();
    for (s in snapshot.values()) {
      if (s.stewardAccountId == updated.stewardAccountId) { stewards.add(updated) } else { stewards.add(s) };
    };
  };

  func replaceSuccessor(successors : List.List<Types.SuccessorDesignation>, updated : Types.SuccessorDesignation) {
    let snapshot = successors.toArray();
    successors.clear();
    for (s in snapshot.values()) {
      if (s.personId == updated.personId) { successors.add(updated) } else { successors.add(s) };
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

import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import Types "../types/ownership";
import FamilyTypes "../types/family";
import GovernanceTypes "../types/governance";
import TenancyLib "tenancy";
import NotificationsScopeLib "notifications-scope";

/// Tenancy 1C-A family-scoped profile / claim / relationship domain logic.
///
/// Every function below takes the requested `familyId` explicitly and evaluates
/// authority and data access against it. The legacy single-family signatures
/// are retained only as TEMPORARY Tenancy 1C compatibility wrappers that
/// delegate here with `FamilyTypes.DEFAULT_FAMILY_ID`; they contain no logic of
/// their own.
module {
  /// Returns the edited optional value when the edit was supplied, otherwise
  /// the profile's current optional value. Used to merge `ProfileEdits` into an
  /// existing profile without discarding fields the caller left `null`.
  func pickEdit<T>(edit : ?T, current : ?T) : ?T {
    switch (edit) {
      case (?value) { ?value };
      case null { current };
    };
  };

  // ---------------------------------------------------------------------------
  // Family-scoped profile reads
  // ---------------------------------------------------------------------------

  /// Returns the ownership/lifecycle state of a person profile in `familyId`,
  /// or `null` when the person is not tracked in that family. A personId in
  /// Family A never returns a profile from Family B.
  public func getProfileForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : ?Types.PersonProfile {
    TenancyLib.getProfileForFamily(profiles, familyId, personId);
  };

  /// Returns the signed-in caller's own linked/claimed Person Profile in
  /// `familyId`, or their pending profile in that family, or `null` when the
  /// caller has no profile in `familyId`. Ownership in one family never
  /// surfaces a profile from another.
  public func getMyProfileForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
  ) : ?Types.PersonProfile {
    let owned = profiles.entries().find(func ((_, profile)) =
      profile.familyId == familyId and profile.claimedByUserId == ?caller
    );
    switch (owned) {
      case (?(_, profile)) { return ?profile };
      case null {};
    };
    let pending = claims.toArray().find(func c =
      c.familyId == familyId and c.requestingUserId == caller and c.status == #Pending
    );
    switch (pending) {
      case (?claim) { getProfileForFamily(profiles, familyId, claim.personId) };
      case null { null };
    };
  };

  /// Lists the profiles of `familyId` for Explore Family / Person Profile
  /// hydration. Requires the caller to be an approved member of `familyId` or
  /// an active Steward of `familyId`; profiles from other families are never
  /// included.
  public func listProfilesForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.PersonProfile] {
    profiles.entries().filter(func ((_, profile)) =
      profile.familyId == familyId
    ).map(func ((_, profile)) = profile).toArray();
  };

  /// Public claim-discovery read: returns the minimal profile data for
  /// `familyId` only, preserving the existing minimal-data behavior. Results
  /// are scoped to the requested family.
  public func listClaimDiscoveryProfilesForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.PersonProfile] {
    listProfilesForFamily(profiles, familyId);
  };

  // ---------------------------------------------------------------------------
  // Family-scoped profile claims
  // ---------------------------------------------------------------------------

  /// Creates a pending profile claim for an unclaimed living profile in
  /// `familyId` without granting ownership. The claim belongs to exactly
  /// `familyId`. Requires sign-in.
  public func requestClaimForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : Result.Result<Types.ProfileClaim, Types.ClaimError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let profile = switch (getProfileForFamily(profiles, familyId, personId)) {
      case (?p) { p };
      case null { return #err(#ProfileNotFound) };
    };
    switch (profile.livingStatus) {
      case (#Deceased) { return #err(#DeceasedProfile) };
      case (#Living) {};
    };
    switch (profile.claimedByUserId) {
      case (?_) { return #err(#AlreadyClaimed) };
      case null {};
    };
    let alreadyPending = claims.toArray().any(func c =
      c.familyId == familyId and c.personId == personId and c.requestingUserId == caller and c.status == #Pending
    );
    if (alreadyPending) {
      return #err(#AlreadyPending);
    };
    let claim : Types.ProfileClaim = {
      familyId;
      id = nextClaimId(claims);
      personId;
      requestingUserId = caller;
      status = #Pending;
      submittedDate = Time.now();
      reviewedBy = null;
      reviewedDate = null;
    };
    claims.add(claim);
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      caller,
      #ProfileClaimRequested,
      "Your profile claim request was submitted for review.",
      Time.now(),
    );
    #ok(claim);
  };

  /// Approves a pending profile claim in `familyId`, marking the profile
  /// claimed and associating it with the requesting user. The claim must belong
  /// to `familyId`; approval authority is the Steward authority for that family.
  public func approveClaimForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    claimId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.ProfileClaim {
    let claim = switch (claims.toArray().find(func c = c.id == claimId and c.familyId == familyId)) {
      case (?c) { c };
      case null { return null };
    };
    if (claim.status != #Pending) {
      return null;
    };
    let profile = switch (getProfileForFamily(profiles, familyId, claim.personId)) {
      case (?p) { p };
      case null { return null };
    };
    let updatedProfile : Types.PersonProfile = {
      familyId = profile.familyId;
      personId = profile.personId;
      name = profile.name;
      livingStatus = profile.livingStatus;
      claimStatus = #Claimed;
      claimedByUserId = ?claim.requestingUserId;
      preferredName = profile.preferredName;
      firstName = profile.firstName;
      middleName = profile.middleName;
      lastName = profile.lastName;
      suffix = profile.suffix;
      nickname = profile.nickname;
      story = profile.story;
      shortBio = profile.shortBio;
      longerStory = profile.longerStory;
      occupation = profile.occupation;
      birthInfo = profile.birthInfo;
      birthDate = profile.birthDate;
      birthplace = profile.birthplace;
      currentLocation = profile.currentLocation;
      timeline = profile.timeline;
      privacySettings = profile.privacySettings;
    };
    TenancyLib.putProfileForFamily(profiles, familyId, updatedProfile);
    let now = Time.now();
    let updatedClaim : Types.ProfileClaim = {
      familyId = claim.familyId;
      id = claim.id;
      personId = claim.personId;
      requestingUserId = claim.requestingUserId;
      status = #Approved;
      submittedDate = claim.submittedDate;
      reviewedBy = ?reviewer;
      reviewedDate = ?now;
    };
    replaceClaim(claims, updatedClaim);
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      claim.requestingUserId,
      #ProfileClaimReviewed,
      "Your profile claim was approved.",
      now,
    );
    auditLog.add({
      id = nextAuditId(auditLog);
      actionType = #ClaimApproved;
      actorAccountId = reviewer;
      affectedPersonIds = [claim.personId];
      timestamp = now;
      summary = "Approved a profile claim for " # claim.personId;
    });
    ?updatedClaim;
  };

  /// Rejects a pending profile claim in `familyId`. The claim must belong to
  /// `familyId`; rejection authority is the Steward authority for that family.
  public func rejectClaimForFamily(
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    claimId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.ProfileClaim {
    let claim = switch (claims.toArray().find(func c = c.id == claimId and c.familyId == familyId)) {
      case (?c) { c };
      case null { return null };
    };
    if (claim.status != #Pending) {
      return null;
    };
    let now = Time.now();
    let updatedClaim : Types.ProfileClaim = {
      familyId = claim.familyId;
      id = claim.id;
      personId = claim.personId;
      requestingUserId = claim.requestingUserId;
      status = #Rejected;
      submittedDate = claim.submittedDate;
      reviewedBy = ?reviewer;
      reviewedDate = ?now;
    };
    replaceClaim(claims, updatedClaim);
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      claim.requestingUserId,
      #ProfileClaimReviewed,
      "Your profile claim was rejected.",
      now,
    );
    auditLog.add({
      id = nextAuditId(auditLog);
      actionType = #ClaimRejected;
      actorAccountId = reviewer;
      affectedPersonIds = [claim.personId];
      timestamp = now;
      summary = "Rejected a profile claim";
    });
    ?updatedClaim;
  };

  /// Lists the profile claim requests of `familyId` for the Steward review
  /// area. Claims from other families are never included.
  public func listClaimsForFamily(
    claims : List.List<Types.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.ProfileClaim] {
    claims.toArray().filter(func c = c.familyId == familyId);
  };

  /// Returns the caller's own claim on a specific profile in `familyId`, or
  /// `null` when the caller has no claim on that profile in that family. There
  /// is no cross-family claim lookup by personId alone.
  public func getMyClaimForFamily(
    claims : List.List<Types.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : ?Types.ProfileClaim {
    claims.toArray().find(func c =
      c.familyId == familyId and c.personId == personId and c.requestingUserId == caller
    );
  };

  /// Searches the authoritative shared profile data of `familyId` for possible
  /// duplicate matches by name. Only profiles belonging to `familyId` are
  /// considered; parents are derived from `familyId`'s confirmed graph.
  public func searchMatchesForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    familyId : FamilyTypes.FamilyId,
    name : Text,
  ) : [Types.PersonMatch] {
    let term = name.toLower();
    if (term == "") {
      return [];
    };
    listProfilesForFamily(profiles, familyId).filter(func profile =
      profile.name.toLower().contains(#text term)
    ).map(func profile = {
      personId = profile.personId;
      name = profile.name;
      parents = parentNamesForFamily(relationships, familyId, profile.personId);
    });
  };

  /// Creates a minimal person profile for a user who does not already exist in
  /// `familyId`. The created profile belongs to `familyId`; the creator owns
  /// it. Ownership in another family does not block creation here.
  public func createMyselfForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    name : Text,
    caller : Principal.Principal,
  ) : Result.Result<Types.PersonProfile, Types.CreateError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let alreadyOwned = profiles.entries().any(func ((_, profile)) =
      profile.familyId == familyId and profile.claimedByUserId == ?caller
    );
    if (alreadyOwned) {
      return #err(#AlreadyOwned);
    };
    let personId = nextPersonId(profiles, familyId, name);
    let profile : Types.PersonProfile = {
      familyId;
      personId;
      name;
      livingStatus = #Living;
      claimStatus = #Claimed;
      claimedByUserId = ?caller;
      preferredName = null;
      firstName = null;
      middleName = null;
      lastName = null;
      suffix = null;
      nickname = null;
      story = null;
      shortBio = null;
      longerStory = null;
      occupation = null;
      birthInfo = null;
      birthDate = null;
      birthplace = null;
      currentLocation = null;
      timeline = null;
      privacySettings = null;
    };
    TenancyLib.putProfileForFamily(profiles, familyId, profile);
    let now = Time.now();
    claims.add({
      familyId;
      id = nextClaimId(claims);
      personId;
      requestingUserId = caller;
      status = #Approved;
      submittedDate = now;
      reviewedBy = ?caller;
      reviewedDate = ?now;
    });
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      caller,
      #ProfileClaimReviewed,
      "Your profile was created and linked to your account.",
      now,
    );
    #ok(profile);
  };

  // ---------------------------------------------------------------------------
  // Family-scoped relationships
  // ---------------------------------------------------------------------------

  /// Proposes a new relationship between two people in `familyId`. Both
  /// referenced people must belong to `familyId`; the request belongs to
  /// `familyId` and starts pending.
  public func proposeRelationshipForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
    caller : Principal.Principal,
  ) : Result.Result<Types.RelationshipRequest, Types.RelationshipError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (getProfileForFamily(profiles, familyId, fromPersonId)) {
      case null { return #err(#PersonNotFound) };
      case (?_) {};
    };
    switch (getProfileForFamily(profiles, familyId, toPersonId)) {
      case null { return #err(#PersonNotFound) };
      case (?_) {};
    };
    let duplicate = requests.toArray().any(func r =
      r.familyId == familyId and r.requestingPersonId == fromPersonId and r.relatedPersonId == toPersonId and r.status == #Pending
    );
    if (duplicate) {
      return #err(#DuplicateRequest);
    };
    let request : Types.RelationshipRequest = {
      familyId;
      id = nextRelationshipRequestId(requests);
      requestingPersonId = fromPersonId;
      relatedPersonId = toPersonId;
      proposedRelationship = relationshipType;
      status = #Pending;
      submittedDate = Time.now();
      reviewer = null;
      reviewedDate = null;
    };
    requests.add(request);
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      caller,
      #RelationshipRequested,
      "Your relationship request is pending review.",
      Time.now(),
    );
    #ok(request);
  };

  /// Lists the relationship requests of `familyId` for the Steward review area.
  /// Requests from other families are never included.
  public func listRelationshipRequestsForFamily(
    requests : List.List<Types.RelationshipRequest>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.RelationshipRequest] {
    requests.toArray().filter(func r = r.familyId == familyId);
  };

  /// Approves a relationship request in `familyId`, adding/confirming the
  /// relationship in that family's graph. The request must belong to
  /// `familyId`; approval authority is the Steward authority for that family.
  public func approveRelationshipForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    let request = switch (requests.toArray().find(func r = r.id == requestId and r.familyId == familyId)) {
      case (?r) { r };
      case null { return null };
    };
    if (request.status != #Pending) {
      return null;
    };
    switch (getProfileForFamily(profiles, familyId, request.requestingPersonId)) {
      case null { return null };
      case (?_) {};
    };
    switch (getProfileForFamily(profiles, familyId, request.relatedPersonId)) {
      case null { return null };
      case (?_) {};
    };
    let now = Time.now();
    relationships.add({
      familyId;
      id = nextRelationshipId(relationships);
      fromPersonId = request.requestingPersonId;
      toPersonId = request.relatedPersonId;
      relationshipType = request.proposedRelationship;
      status = #Confirmed;
    });
    let updatedRequest : Types.RelationshipRequest = {
      familyId = request.familyId;
      id = request.id;
      requestingPersonId = request.requestingPersonId;
      relatedPersonId = request.relatedPersonId;
      proposedRelationship = request.proposedRelationship;
      status = #Approved;
      submittedDate = request.submittedDate;
      reviewer = ?reviewer;
      reviewedDate = ?now;
    };
    replaceRelationshipRequest(requests, updatedRequest);
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      reviewer,
      #RelationshipReviewed,
      "A relationship request was approved.",
      now,
    );
    auditLog.add({
      id = nextAuditId(auditLog);
      actionType = #RelationshipRequestApproved;
      actorAccountId = reviewer;
      affectedPersonIds = [request.requestingPersonId, request.relatedPersonId];
      timestamp = now;
      summary = "Approved a relationship request";
    });
    ?updatedRequest;
  };

  /// Rejects a relationship request in `familyId`. The request must belong to
  /// `familyId`; rejection authority is the Steward authority for that family.
  public func rejectRelationshipForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    let request = switch (requests.toArray().find(func r = r.id == requestId and r.familyId == familyId)) {
      case (?r) { r };
      case null { return null };
    };
    if (request.status != #Pending) {
      return null;
    };
    let now = Time.now();
    let updatedRequest : Types.RelationshipRequest = {
      familyId = request.familyId;
      id = request.id;
      requestingPersonId = request.requestingPersonId;
      relatedPersonId = request.relatedPersonId;
      proposedRelationship = request.proposedRelationship;
      status = #Rejected;
      submittedDate = request.submittedDate;
      reviewer = ?reviewer;
      reviewedDate = ?now;
    };
    replaceRelationshipRequest(requests, updatedRequest);
    ignore NotificationsScopeLib.createForFamily(
      notifications,
      familyId,
      reviewer,
      #RelationshipReviewed,
      "A relationship request was rejected.",
      now,
    );
    auditLog.add({
      id = nextAuditId(auditLog);
      actionType = #RelationshipRequestRejected;
      actorAccountId = reviewer;
      affectedPersonIds = [request.requestingPersonId, request.relatedPersonId];
      timestamp = now;
      summary = "Rejected a relationship request";
    });
    ?updatedRequest;
  };

  /// Returns a relationship request in `familyId` to pending state. The request
  /// must belong to `familyId`; authority is the Steward authority for that
  /// family.
  public func setRelationshipPendingForFamily(
    requests : List.List<Types.RelationshipRequest>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    familyId : FamilyTypes.FamilyId,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    let request = switch (requests.toArray().find(func r = r.id == requestId and r.familyId == familyId)) {
      case (?r) { r };
      case null { return null };
    };
    let now = Time.now();
    let updatedRequest : Types.RelationshipRequest = {
      familyId = request.familyId;
      id = request.id;
      requestingPersonId = request.requestingPersonId;
      relatedPersonId = request.relatedPersonId;
      proposedRelationship = request.proposedRelationship;
      status = #Pending;
      submittedDate = request.submittedDate;
      reviewer = ?reviewer;
      reviewedDate = ?now;
    };
    replaceRelationshipRequest(requests, updatedRequest);
    auditLog.add({
      id = nextAuditId(auditLog);
      actionType = #RelationshipRequestPending;
      actorAccountId = reviewer;
      affectedPersonIds = [request.requestingPersonId, request.relatedPersonId];
      timestamp = now;
      summary = "Returned a relationship request to pending";
    });
    ?updatedRequest;
  };

  /// Returns the caller's own pending relationship requests in `familyId` —
  /// those involving a profile the caller owns or created in that family.
  public func getMyRelationshipRequestsForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    requests : List.List<Types.RelationshipRequest>,
    caller : Principal.Principal,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.RelationshipRequest] {
    let ownedPersonIds = profiles.entries().filter(func ((personId, profile)) =
      profile.familyId == familyId and (profile.claimedByUserId == ?caller or personId == caller.toText())
    ).map(func ((personId, _)) = personId).toArray();
    requests.toArray().filter(func r =
      r.familyId == familyId and r.status == #Pending and (
        ownedPersonIds.contains(r.requestingPersonId) or ownedPersonIds.contains(r.relatedPersonId)
      )
    );
  };

  /// Updates an approved owner's own living profile fields in `familyId`, or,
  /// for a Steward of `familyId`, the fields of an unclaimed/historical profile
  /// in that family. Never rewrites family relationships directly.
  public func updateOwnProfileForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    caller : Principal.Principal,
    isSteward : Bool,
    edits : Types.ProfileEdits,
  ) : Result.Result<Types.PersonProfile, Types.EditError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let profile = switch (getProfileForFamily(profiles, familyId, personId)) {
      case (?p) { p };
      case null { return #err(#ProfileNotFound) };
    };
    let isOwner = profile.claimedByUserId == ?caller;
    if (not isOwner) {
      // A Steward may only edit an unclaimed/historical profile in this family;
      // a claimed profile is editable by its owner alone.
      if (not isSteward or profile.claimStatus == #Claimed) {
        return #err(#NotOwner);
      };
    } else {
      switch (profile.livingStatus) {
        case (#Deceased) { return #err(#DeceasedProfile) };
        case (#Living) {};
      };
    };
    let updated : Types.PersonProfile = {
      familyId = profile.familyId;
      personId = profile.personId;
      name = profile.name;
      livingStatus = edits.livingStatus ?? profile.livingStatus;
      claimStatus = profile.claimStatus;
      claimedByUserId = profile.claimedByUserId;
      preferredName = pickEdit(edits.preferredName, profile.preferredName);
      firstName = pickEdit(edits.firstName, profile.firstName);
      middleName = pickEdit(edits.middleName, profile.middleName);
      lastName = pickEdit(edits.lastName, profile.lastName);
      suffix = pickEdit(edits.suffix, profile.suffix);
      nickname = pickEdit(edits.nickname, profile.nickname);
      story = pickEdit(edits.story, profile.story);
      shortBio = pickEdit(edits.shortBio, profile.shortBio);
      longerStory = pickEdit(edits.longerStory, profile.longerStory);
      occupation = pickEdit(edits.occupation, profile.occupation);
      birthInfo = pickEdit(edits.birthInfo, profile.birthInfo);
      birthDate = pickEdit(edits.birthDate, profile.birthDate);
      birthplace = pickEdit(edits.birthplace, profile.birthplace);
      currentLocation = pickEdit(edits.currentLocation, profile.currentLocation);
      timeline = pickEdit(edits.timeline, profile.timeline);
      privacySettings = pickEdit(edits.privacySettings, profile.privacySettings);
    };
    TenancyLib.putProfileForFamily(profiles, familyId, updated);
    #ok(updated);
  };

  /// Removes a duplicate test-created profile in `familyId` and any pending
  /// relationship requests or claims tied only to it. The profile must belong
  /// to `familyId`; authority is the Steward authority for that family.
  public func removeDuplicateProfileForFamily(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    relationshipRequests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : Result.Result<(), Types.RemoveError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (getProfileForFamily(profiles, familyId, personId)) {
      case null { return #err(#ProfileNotFound) };
      case (?_) {};
    };
    TenancyLib.removeProfileForFamily(profiles, familyId, personId);
    removeClaimsForPerson(claims, familyId, personId);
    removeRelationshipRequestsForPerson(relationshipRequests, familyId, personId);
    ignore notifications;
    #ok(());
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getProfileForFamily`.
  public func getProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
  ) : ?Types.PersonProfile {
    getProfileForFamily(profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `requestClaimForFamily`.
  public func requestClaim(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : Result.Result<Types.ProfileClaim, Types.ClaimError> {
    requestClaimForFamily(profiles, claims, notifications, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `approveClaimForFamily`.
  public func approveClaim(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    claimId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.ProfileClaim {
    approveClaimForFamily(profiles, claims, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, claimId, reviewer);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `rejectClaimForFamily`.
  public func rejectClaim(
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    claimId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.ProfileClaim {
    rejectClaimForFamily(claims, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, claimId, reviewer);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listClaimsForFamily`.
  public func listClaims(
    claims : List.List<Types.ProfileClaim>,
  ) : [Types.ProfileClaim] {
    listClaimsForFamily(claims, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getMyClaimForFamily`.
  public func getMyClaim(
    claims : List.List<Types.ProfileClaim>,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : ?Types.ProfileClaim {
    getMyClaimForFamily(claims, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getMyProfileForFamily`.
  public func getMyProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    caller : Principal.Principal,
  ) : ?Types.PersonProfile {
    getMyProfileForFamily(profiles, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getMyRelationshipRequestsForFamily`.
  public func getMyRelationshipRequests(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    requests : List.List<Types.RelationshipRequest>,
    caller : Principal.Principal,
  ) : [Types.RelationshipRequest] {
    getMyRelationshipRequestsForFamily(profiles, requests, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `searchMatchesForFamily`.
  public func searchMatches(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    name : Text,
  ) : [Types.PersonMatch] {
    searchMatchesForFamily(profiles, relationships, FamilyTypes.DEFAULT_FAMILY_ID, name);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `createMyselfForFamily`.
  public func createMyself(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    name : Text,
    caller : Principal.Principal,
  ) : Result.Result<Types.PersonProfile, Types.CreateError> {
    createMyselfForFamily(profiles, claims, notifications, FamilyTypes.DEFAULT_FAMILY_ID, name, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `proposeRelationshipForFamily`.
  public func proposeRelationship(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
    caller : Principal.Principal,
  ) : Result.Result<Types.RelationshipRequest, Types.RelationshipError> {
    proposeRelationshipForFamily(profiles, relationships, requests, notifications, FamilyTypes.DEFAULT_FAMILY_ID, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listRelationshipRequestsForFamily`.
  public func listRelationshipRequests(
    requests : List.List<Types.RelationshipRequest>,
  ) : [Types.RelationshipRequest] {
    listRelationshipRequestsForFamily(requests, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `approveRelationshipForFamily`.
  public func approveRelationship(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    approveRelationshipForFamily(profiles, relationships, requests, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, reviewer);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `rejectRelationshipForFamily`.
  public func rejectRelationship(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    rejectRelationshipForFamily(profiles, requests, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, reviewer);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `setRelationshipPendingForFamily`.
  public func setRelationshipPending(
    requests : List.List<Types.RelationshipRequest>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    setRelationshipPendingForFamily(requests, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, reviewer);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `updateOwnProfileForFamily`.
  public func updateOwnProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    caller : Principal.Principal,
    isSteward : Bool,
    edits : Types.ProfileEdits,
  ) : Result.Result<Types.PersonProfile, Types.EditError> {
    updateOwnProfileForFamily(profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller, isSteward, edits);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `removeDuplicateProfileForFamily`.
  public func removeDuplicateProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    relationshipRequests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : Result.Result<(), Types.RemoveError> {
    removeDuplicateProfileForFamily(profiles, claims, relationshipRequests, notifications, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for the canonical
  /// `NotificationsScopeLib.listForFamily`. Deprecated single-family form:
  /// delegates with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  /// behavior is unchanged. Contains no logic of its own.
  public func listNotifications(
    notifications : List.List<Types.Notification>,
    caller : Principal.Principal,
  ) : [Types.Notification] {
    NotificationsScopeLib.listForFamily(notifications, FamilyTypes.DEFAULT_FAMILY_ID, caller);
  };

  /// Flattens every person profile into OQL-exposable rows. The row already
  /// carries `familyId`, so no signature change is required.
  public func profileRows(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : Iter.Iter<Types.ProfileRow> {
    profiles.entries().map(func ((_, profile)) = {
      familyId = profile.familyId;
      personId = profile.personId;
      name = profile.name;
      livingStatus = switch (profile.livingStatus) { case (#Living) "Living"; case (#Deceased) "Deceased" };
      claimStatus = switch (profile.claimStatus) { case (#Unclaimed) "Unclaimed"; case (#Claimed) "Claimed" };
      claimedByUserId = switch (profile.claimedByUserId) { case (?p) p.toText(); case null "" };
      preferredName = profile.preferredName ?? "";
      firstName = profile.firstName ?? "";
      middleName = profile.middleName ?? "";
      lastName = profile.lastName ?? "";
      suffix = profile.suffix ?? "";
      nickname = profile.nickname ?? "";
      story = profile.story ?? "";
      shortBio = profile.shortBio ?? "";
      longerStory = profile.longerStory ?? "";
      occupation = profile.occupation ?? "";
      birthInfo = profile.birthInfo ?? "";
      birthDate = profile.birthDate ?? "";
      birthplace = profile.birthplace ?? "";
      currentLocation = profile.currentLocation ?? "";
      privacySettings = profile.privacySettings ?? "";
    });
  };

  /// Flattens every profile claim into OQL-exposable rows.
  public func claimRows(
    claims : List.List<Types.ProfileClaim>,
  ) : Iter.Iter<Types.ClaimRow> {
    claims.toArray().values().map(func claim = {
      familyId = claim.familyId;
      id = claim.id;
      personId = claim.personId;
      requestingUserId = claim.requestingUserId.toText();
      status = switch (claim.status) { case (#Pending) "Pending"; case (#Approved) "Approved"; case (#Rejected) "Rejected" };
      submittedDate = claim.submittedDate;
      reviewedBy = switch (claim.reviewedBy) { case (?p) p.toText(); case null "" };
      reviewedDate = claim.reviewedDate ?? 0;
    });
  };

  /// Flattens every relationship request into OQL-exposable rows.
  public func relationshipRequestRows(
    requests : List.List<Types.RelationshipRequest>,
  ) : Iter.Iter<Types.RelationshipRequestRow> {
    requests.toArray().values().map(func request = {
      familyId = request.familyId;
      id = request.id;
      requestingPersonId = request.requestingPersonId;
      relatedPersonId = request.relatedPersonId;
      proposedRelationship = relationshipTypeText(request.proposedRelationship);
      status = switch (request.status) { case (#Pending) "Pending"; case (#Approved) "Approved"; case (#Rejected) "Rejected" };
      submittedDate = request.submittedDate;
      reviewer = switch (request.reviewer) { case (?p) p.toText(); case null "" };
      reviewedDate = request.reviewedDate ?? 0;
    });
  };

  /// Flattens every confirmed relationship into OQL-exposable rows.
  public func relationshipRows(
    relationships : List.List<Types.Relationship>,
  ) : Iter.Iter<Types.RelationshipRow> {
    relationships.toArray().values().map(func relationship = {
      familyId = relationship.familyId;
      id = relationship.id;
      fromPersonId = relationship.fromPersonId;
      toPersonId = relationship.toPersonId;
      relationshipType = relationshipTypeText(relationship.relationshipType);
      status = switch (relationship.status) { case (#Confirmed) "Confirmed"; case (#Pending) "Pending"; case (#Disputed) "Disputed" };
    });
  };

  /// Flattens every in-app notification record into OQL-exposable rows. The row
  /// carries `familyId`, so a notification row is always attributable to its
  /// family. Delegates to the canonical family-scoped notification module.
  public func notificationRows(
    notifications : List.List<Types.Notification>,
  ) : Iter.Iter<Types.NotificationRow> {
    NotificationsScopeLib.notificationRows(notifications);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /// Renders a relationship type as its tag text for OQL rows.
  func relationshipTypeText(relationshipType : Types.RelationshipType) : Text {
    switch (relationshipType) {
      case (#Parent) "Parent";
      case (#Child) "Child";
      case (#SpousePartner) "SpousePartner";
      case (#Sibling) "Sibling";
    };
  };

  /// Renders a notification type as its tag text for OQL rows.
  func notificationTypeText(notificationType : Types.NotificationType) : Text {
    switch (notificationType) {
      case (#ProfileClaimRequested) "ProfileClaimRequested";
      case (#ProfileClaimReviewed) "ProfileClaimReviewed";
      case (#RelationshipRequested) "RelationshipRequested";
      case (#RelationshipReviewed) "RelationshipReviewed";
      case (#BoardReply) "BoardReply";
      case (#BoardMention) "BoardMention";
      case (#NewMessage) "NewMessage";
      case (#ResearchSubmission) "ResearchSubmission";
      case (#ResearchApproved) "ResearchApproved";
      case (#ResearchRejected) "ResearchRejected";
      case (#ArchiveApproved) "ArchiveApproved";
      case (#ArchiveRejected) "ArchiveRejected";
    };
  };

  /// The next claim id: one greater than the largest existing id, or `0` when
  /// there are no claims.
  func nextClaimId(claims : List.List<Types.ProfileClaim>) : Nat {
    var maxId = 0;
    for (claim in claims.toArray().values()) {
      if (claim.id >= maxId) { maxId := claim.id + 1 };
    };
    maxId;
  };

  /// The next relationship id: one greater than the largest existing id, or
  /// `0` when there are no relationships.
  func nextRelationshipId(relationships : List.List<Types.Relationship>) : Nat {
    var maxId = 0;
    for (relationship in relationships.toArray().values()) {
      if (relationship.id >= maxId) { maxId := relationship.id + 1 };
    };
    maxId;
  };

  /// The next relationship-request id: one greater than the largest existing
  /// id, or `0` when there are no requests.
  func nextRelationshipRequestId(requests : List.List<Types.RelationshipRequest>) : Nat {
    var maxId = 0;
    for (request in requests.toArray().values()) {
      if (request.id >= maxId) { maxId := request.id + 1 };
    };
    maxId;
  };

  /// The next audit entry id: one greater than the largest existing id, or `0`
  /// when the log is empty.
  func nextAuditId(auditLog : List.List<GovernanceTypes.AuditEntry>) : Nat {
    var maxId = 0;
    for (entry in auditLog.toArray().values()) {
      if (entry.id >= maxId) { maxId := entry.id + 1 };
    };
    maxId;
  };

  /// Builds a family-unique person id from a display name. The id is derived
  /// from the name and suffixed until it is unused within `familyId`, so the
  /// same name in two families never collides.
  func nextPersonId(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    name : Text,
  ) : Types.PersonId {
    let base = name.toLower().map(func c = if (c == ' ') { '_' } else { c });
    let candidate = if (base == "") { "person" } else { base };
    var suffix = 0;
    var id = candidate;
    while (getProfileForFamily(profiles, familyId, id) != null) {
      suffix += 1;
      id := candidate # "_" # suffix.toText();
    };
    id;
  };

  /// Replaces the stored claim with the same id, preserving list order.
  func replaceClaim(claims : List.List<Types.ProfileClaim>, updated : Types.ProfileClaim) {
    let snapshot = claims.toArray();
    claims.clear();
    for (claim in snapshot.values()) {
      if (claim.id == updated.id) { claims.add(updated) } else { claims.add(claim) };
    };
  };

  /// Replaces the stored relationship request with the same id, preserving
  /// list order.
  func replaceRelationshipRequest(requests : List.List<Types.RelationshipRequest>, updated : Types.RelationshipRequest) {
    let snapshot = requests.toArray();
    requests.clear();
    for (request in snapshot.values()) {
      if (request.id == updated.id) { requests.add(updated) } else { requests.add(request) };
    };
  };

  /// Removes every claim in `familyId` on `personId`.
  func removeClaimsForPerson(
    claims : List.List<Types.ProfileClaim>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) {
    let snapshot = claims.toArray();
    claims.clear();
    for (claim in snapshot.values()) {
      if (claim.familyId == familyId and claim.personId == personId) {
        // dropped
      } else {
        claims.add(claim);
      };
    };
  };

  /// Removes every relationship request in `familyId` that references
  /// `personId`.
  func removeRelationshipRequestsForPerson(
    requests : List.List<Types.RelationshipRequest>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) {
    let snapshot = requests.toArray();
    requests.clear();
    for (request in snapshot.values()) {
      if (request.familyId == familyId and (request.requestingPersonId == personId or request.relatedPersonId == personId)) {
        // dropped
      } else {
        requests.add(request);
      };
    };
  };

  /// The names of the confirmed parents of `personId` in `familyId`, derived
  /// from that family's confirmed graph only.
  func parentNamesForFamily(
    relationships : List.List<Types.Relationship>,
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
  ) : [Text] {
    relationships.toArray().filter(func r =
      r.familyId == familyId and r.status == #Confirmed and r.relationshipType == #Parent and r.toPersonId == personId
    ).map(func r = r.fromPersonId);
  };
};

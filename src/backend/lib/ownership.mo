import Char "mo:core/Char";
import Iter "mo:core/Iter";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Text "mo:core/Text";
import Time "mo:core/Time";
import Types "../types/ownership";
import GovernanceTypes "../types/governance";

module {
  /// Returns the ownership/lifecycle state of a person profile, or `null` when
  /// the person is not tracked.
  public func getProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
  ) : ?Types.PersonProfile {
    profiles.get(personId);
  };

  /// Creates a pending profile claim for an unclaimed living profile without
  /// granting ownership. Requires sign-in.
  public func requestClaim(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : Result.Result<Types.ProfileClaim, Types.ClaimError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (profiles.get(personId)) {
      case null { #err(#ProfileNotFound) };
      case (?profile) {
        if (profile.livingStatus == #Deceased) {
          return #err(#DeceasedProfile);
        };
        if (profile.claimStatus == #Claimed) {
          return #err(#AlreadyClaimed);
        };
        if (claims.toArray().any(func c = c.personId == personId and c.status == #Pending)) {
          return #err(#AlreadyPending);
        };
        let claim : Types.ProfileClaim = {
          id = nextId(claims.toArray().map(func c = c.id));
          personId;
          requestingUserId = caller;
          status = #Pending;
          submittedDate = Time.now();
          reviewedBy = null;
          reviewedDate = null;
        };
        claims.add(claim);
        notifications.add({
          id = nextId(notifications.toArray().map(func n = n.id));
          recipient = caller;
          notificationType = #ProfileClaimRequested;
          message = "Your profile claim for " # profile.name # " is pending review.";
          createdAt = Time.now();
          read = false;
        });
        #ok(claim);
      };
    };
  };

  /// Approves a pending profile claim, marking the profile claimed and
  /// associating it with the requesting user. Family Steward only.
  public func approveClaim(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    claimId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.ProfileClaim {
    switch (claims.find(func c = c.id == claimId and c.status == #Pending)) {
      case null { null };
      case (?claim) {
        let updated : Types.ProfileClaim = {
          claim with
          status = #Approved;
          reviewedBy = ?reviewer;
          reviewedDate = ?Time.now();
        };
        replaceClaim(claims, updated);
        switch (profiles.get(claim.personId)) {
          case (?profile) {
            let claimedProfile : Types.PersonProfile = {
              profile with
              claimStatus = #Claimed;
              claimedByUserId = ?claim.requestingUserId;
            };
            profiles.add(claim.personId, claimedProfile);
          };
          case null {};
        };
        notifications.add({
          id = nextId(notifications.toArray().map(func n = n.id));
          recipient = claim.requestingUserId;
          notificationType = #ProfileClaimReviewed;
          message = "Your profile claim was approved.";
          createdAt = Time.now();
          read = false;
        });
        appendAudit(auditLog, #ClaimApproved, reviewer, [claim.personId], "Approved profile claim for " # claim.personId);
        ?updated;
      };
    };
  };

  /// Rejects a pending profile claim. Family Steward only.
  public func rejectClaim(
    claims : List.List<Types.ProfileClaim>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    claimId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.ProfileClaim {
    switch (claims.find(func c = c.id == claimId and c.status == #Pending)) {
      case null { null };
      case (?claim) {
        let updated : Types.ProfileClaim = {
          claim with
          status = #Rejected;
          reviewedBy = ?reviewer;
          reviewedDate = ?Time.now();
        };
        replaceClaim(claims, updated);
        notifications.add({
          id = nextId(notifications.toArray().map(func n = n.id));
          recipient = claim.requestingUserId;
          notificationType = #ProfileClaimReviewed;
          message = "Your profile claim was not approved.";
          createdAt = Time.now();
          read = false;
        });
        appendAudit(auditLog, #ClaimRejected, reviewer, [claim.personId], "Rejected profile claim for " # claim.personId);
        ?updated;
      };
    };
  };

  /// Lists all profile claim requests for the Family Steward review area.
  public func listClaims(
    claims : List.List<Types.ProfileClaim>,
  ) : [Types.ProfileClaim] {
    claims.toArray();
  };

  /// Returns the current caller's own claim on a specific profile, or `null`
  /// when the caller has no claim on that profile. Not gated to admin — any
  /// signed-in caller may query their own claim.
  public func getMyClaim(
    claims : List.List<Types.ProfileClaim>,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : ?Types.ProfileClaim {
    claims.find(func c = c.personId == personId and c.requestingUserId == caller);
  };

  /// Returns the signed-in caller's own linked/claimed Person Profile, or, when
  /// none is linked, the caller's pending profile (a profile created via
  /// `createMyself` keyed by the caller's principal, or a profile with a pending
  /// claim by the caller). Returns `null` when the caller has no profile. Not
  /// gated to admin — any signed-in caller may query their own profile.
  public func getMyProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    caller : Principal.Principal,
  ) : ?Types.PersonProfile {
    // 1. Linked/claimed profile owned by the caller.
    for ((_, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?caller) {
        return ?profile;
      };
    };
    // 2. Pending profile created via createMyself (keyed by the caller's
    //    principal).
    switch (profiles.get(caller.toText())) {
      case (?p) { return ?p };
      case null {};
    };
    // 3. Profile with a pending claim by the caller.
    for (claim in claims.toArray().values()) {
      if (claim.requestingUserId == caller and claim.status == #Pending) {
        switch (profiles.get(claim.personId)) {
          case (?p) { return ?p };
          case null {};
        };
      };
    };
    null;
  };

  /// Returns the signed-in caller's own pending relationship requests — those
  /// involving a profile the caller owns or created. Not gated to admin — any
  /// signed-in caller may query their own pending relationship state.
  public func getMyRelationshipRequests(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    requests : List.List<Types.RelationshipRequest>,
    caller : Principal.Principal,
  ) : [Types.RelationshipRequest] {
    let ownIds = List.empty<Types.PersonId>();
    for ((personId, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?caller or personId == caller.toText()) {
        ownIds.add(personId);
      };
    };
    let own = ownIds.toArray();
    requests.toArray().filter(func r =
      r.status == #Pending and
      (own.any(func id = id == r.requestingPersonId) or own.any(func id = id == r.relatedPersonId))
    );
  };

  /// Searches the authoritative shared profile data for possible duplicate
  /// matches by name. Names are normalized before matching (case-insensitive,
  /// punctuation ignored, periods normalized, extra spaces collapsed, suffix
  /// variants Jr/Jr./Sr/Sr./II/III/IV recognized, partial/fuzzy allowed). Each
  /// match carries the person's name and their parents when known, derived from
  /// the confirmed relationship graph.
  public func searchMatches(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    name : Text,
  ) : [Types.PersonMatch] {
    let normalized = normalizeName(name);
    if (normalized.size() == 0) {
      return [];
    };
    let matches = List.empty<Types.PersonMatch>();
    for ((personId, profile) in profiles.entries()) {
      let candidate = normalizeName(profile.name);
      if (candidate.size() > 0 and isMatch(normalized, candidate)) {
        matches.add({
          personId;
          name = profile.name;
          parents = parentsOf(profiles, relationships, personId);
        });
      };
    };
    matches.toArray();
  };

  /// Normalizes a person name for duplicate matching: lower-cases, strips
  /// punctuation, normalizes periods and whitespace, and canonicalizes common
  /// suffix variants (Jr/Jr., Sr/Sr., II/III/IV).
  public func normalizeName(name : Text) : Text {
    let words = List.empty<Text>();
    for (word in name.toLower().tokens(#predicate (func ch = ch.isWhitespace()))) {
      var clean = "";
      for (ch in word.chars()) {
        if (ch.isAlphabetic() or ch.isDigit()) {
          clean := clean # ch.toText();
        };
      };
      if (clean.size() > 0) {
        words.add(clean);
      };
    };
    words.toArray().values().join(" ");
  };

  /// Creates a minimal person profile for a user who does not already exist in
  /// the family. The user must then connect to an existing family member via a
  /// relationship request. The creator owns the new profile.
  public func createMyself(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    notifications : List.List<Types.Notification>,
    name : Text,
    caller : Principal.Principal,
  ) : Result.Result<Types.PersonProfile, Types.CreateError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let personId = caller.toText();
    let profile : Types.PersonProfile = {
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
    profiles.add(personId, profile);
    #ok(profile);
  };

  /// Proposes a new relationship between two people. The request starts pending
  /// and is never treated as confirmed until a Family Steward approves it.
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
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (profiles.get(fromPersonId) == null or profiles.get(toPersonId) == null) {
      return #err(#PersonNotFound);
    };
    if (requests.toArray().any(func r = r.status == #Pending and r.requestingPersonId == fromPersonId and r.relatedPersonId == toPersonId)) {
      return #err(#DuplicateRequest);
    };
    let request : Types.RelationshipRequest = {
      id = nextId(requests.toArray().map(func r = r.id));
      requestingPersonId = fromPersonId;
      relatedPersonId = toPersonId;
      proposedRelationship = relationshipType;
      status = #Pending;
      submittedDate = Time.now();
      reviewer = null;
      reviewedDate = null;
    };
    requests.add(request);
    notifications.add({
      id = nextId(notifications.toArray().map(func n = n.id));
      recipient = caller;
      notificationType = #RelationshipRequested;
      message = "Your relationship request is pending review.";
      createdAt = Time.now();
      read = false;
    });
    #ok(request);
  };

  /// Lists all relationship requests for the Family Steward review area.
  public func listRelationshipRequests(
    requests : List.List<Types.RelationshipRequest>,
  ) : [Types.RelationshipRequest] {
    requests.toArray();
  };

  /// Approves a relationship request, adding/confirming the relationship in the
  /// shared family graph. Family Steward only.
  public func approveRelationship(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    switch (requests.find(func r = r.id == requestId and r.status == #Pending)) {
      case null { null };
      case (?request) {
        let updated : Types.RelationshipRequest = {
          request with
          status = #Approved;
          reviewer = ?reviewer;
          reviewedDate = ?Time.now();
        };
        replaceRelationshipRequest(requests, updated);
        relationships.add({
          id = nextId(relationships.toArray().map(func r = r.id));
          fromPersonId = request.requestingPersonId;
          toPersonId = request.relatedPersonId;
          relationshipType = request.proposedRelationship;
          status = #Confirmed;
        });
        notifications.add({
          id = nextId(notifications.toArray().map(func n = n.id));
          recipient = reviewer;
          notificationType = #RelationshipReviewed;
          message = "A relationship request was approved.";
          createdAt = Time.now();
          read = false;
        });
        appendAudit(auditLog, #RelationshipRequestApproved, reviewer, [request.requestingPersonId, request.relatedPersonId], "Approved relationship request between " # request.requestingPersonId # " and " # request.relatedPersonId);
        ?updated;
      };
    };
  };

  /// Rejects a relationship request. Family Steward only.
  public func rejectRelationship(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    requests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    switch (requests.find(func r = r.id == requestId and r.status == #Pending)) {
      case null { null };
      case (?request) {
        let updated : Types.RelationshipRequest = {
          request with
          status = #Rejected;
          reviewer = ?reviewer;
          reviewedDate = ?Time.now();
        };
        replaceRelationshipRequest(requests, updated);
        notifications.add({
          id = nextId(notifications.toArray().map(func n = n.id));
          recipient = reviewer;
          notificationType = #RelationshipReviewed;
          message = "A relationship request was rejected.";
          createdAt = Time.now();
          read = false;
        });
        appendAudit(auditLog, #RelationshipRequestRejected, reviewer, [request.requestingPersonId, request.relatedPersonId], "Rejected relationship request between " # request.requestingPersonId # " and " # request.relatedPersonId);
        ?updated;
      };
    };
  };

  /// Returns a relationship request to pending state. Family Steward only.
  public func setRelationshipPending(
    requests : List.List<Types.RelationshipRequest>,
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    requestId : Nat,
    reviewer : Principal.Principal,
  ) : ?Types.RelationshipRequest {
    switch (requests.find(func r = r.id == requestId)) {
      case null { null };
      case (?request) {
        let updated : Types.RelationshipRequest = {
          request with
          status = #Pending;
          reviewer = ?reviewer;
          reviewedDate = ?Time.now();
        };
        replaceRelationshipRequest(requests, updated);
        appendAudit(auditLog, #RelationshipRequestPending, reviewer, [request.requestingPersonId, request.relatedPersonId], "Returned relationship request between " # request.requestingPersonId # " and " # request.relatedPersonId # " to pending");
        ?updated;
      };
    };
  };

  /// Updates an approved owner's own living profile fields. Never rewrites
  /// family relationships directly.
  func pick<T>(edit : ?T, existing : ?T) : ?T {
    switch (edit) {
      case (?v) ?v;
      case null existing;
    };
  };

  public func updateOwnProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    personId : Types.PersonId,
    caller : Principal.Principal,
    edits : Types.ProfileEdits,
  ) : Result.Result<Types.PersonProfile, Types.EditError> {
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
        let updated : Types.PersonProfile = {
          profile with
          livingStatus = switch (edits.livingStatus) {
            case (?v) v;
            case null profile.livingStatus;
          };
          preferredName = pick(edits.preferredName, profile.preferredName);
          firstName = pick(edits.firstName, profile.firstName);
          middleName = pick(edits.middleName, profile.middleName);
          lastName = pick(edits.lastName, profile.lastName);
          suffix = pick(edits.suffix, profile.suffix);
          nickname = pick(edits.nickname, profile.nickname);
          story = pick(edits.story, profile.story);
          shortBio = pick(edits.shortBio, profile.shortBio);
          longerStory = pick(edits.longerStory, profile.longerStory);
          occupation = pick(edits.occupation, profile.occupation);
          birthInfo = pick(edits.birthInfo, profile.birthInfo);
          birthDate = pick(edits.birthDate, profile.birthDate);
          birthplace = pick(edits.birthplace, profile.birthplace);
          currentLocation = pick(edits.currentLocation, profile.currentLocation);
          timeline = pick(edits.timeline, profile.timeline);
          privacySettings = pick(edits.privacySettings, profile.privacySettings);
        };
        profiles.add(personId, updated);
        #ok(updated);
      };
    };
  };

  /// Lists in-app notification records for the signed-in caller.
  public func listNotifications(
    notifications : List.List<Types.Notification>,
    caller : Principal.Principal,
  ) : [Types.Notification] {
    notifications.toArray().filter(func n = n.recipient == caller);
  };

  /// Removes a duplicate test-created profile and any pending relationship
  /// requests or claims tied only to it, preserving the original profile, the
  /// confirmed family graph, and the signed-in account. Family Steward only.
  public func removeDuplicateProfile(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    claims : List.List<Types.ProfileClaim>,
    relationshipRequests : List.List<Types.RelationshipRequest>,
    notifications : List.List<Types.Notification>,
    personId : Types.PersonId,
    caller : Principal.Principal,
  ) : Result.Result<(), Types.RemoveError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    switch (profiles.get(personId)) {
      case null { #err(#ProfileNotFound) };
      case (?_) {
        profiles.remove(personId);
        // Cancel any pending relationship request tied only to this profile.
        let reqSnapshot = relationshipRequests.toArray();
        relationshipRequests.clear();
        for (req in reqSnapshot.values()) {
          if (req.status == #Pending and (req.requestingPersonId == personId or req.relatedPersonId == personId)) {
            // dropped
          } else {
            relationshipRequests.add(req);
          };
        };
        // Cancel any pending claim tied only to this profile.
        let claimSnapshot = claims.toArray();
        claims.clear();
        for (c in claimSnapshot.values()) {
          if (c.status == #Pending and c.personId == personId) {
            // dropped
          } else {
            claims.add(c);
          };
        };
        #ok(());
      };
    };
  };

  /// Flattens every person profile into OQL-exposable rows. Enumerated variants
  /// are rendered as their tag text; optional fields render as empty text when
  /// absent. The array-valued `timeline` is not exposed (OQL has no array value
  /// type).
  public func profileRows(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  ) : Iter.Iter<Types.ProfileRow> {
    let rows = List.empty<Types.ProfileRow>();
    for ((personId, profile) in profiles.entries()) {
      rows.add({
        personId;
        name = profile.name;
        livingStatus = livingStatusText(profile.livingStatus);
        claimStatus = claimStatusText(profile.claimStatus);
        claimedByUserId = switch (profile.claimedByUserId) {
          case (?p) p.toText();
          case null "";
        };
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
    rows.toArray().values();
  };

  /// Flattens every profile claim into OQL-exposable rows.
  public func claimRows(
    claims : List.List<Types.ProfileClaim>,
  ) : Iter.Iter<Types.ClaimRow> {
    let rows = List.empty<Types.ClaimRow>();
    for (claim in claims.toArray().values()) {
      rows.add({
        id = claim.id;
        personId = claim.personId;
        requestingUserId = claim.requestingUserId.toText();
        status = profileClaimStatusText(claim.status);
        submittedDate = claim.submittedDate;
        reviewedBy = switch (claim.reviewedBy) {
          case (?p) p.toText();
          case null "";
        };
        reviewedDate = switch (claim.reviewedDate) {
          case (?d) d;
          case null 0;
        };
      });
    };
    rows.toArray().values();
  };

  /// Flattens every relationship request into OQL-exposable rows.
  public func relationshipRequestRows(
    requests : List.List<Types.RelationshipRequest>,
  ) : Iter.Iter<Types.RelationshipRequestRow> {
    let rows = List.empty<Types.RelationshipRequestRow>();
    for (request in requests.toArray().values()) {
      rows.add({
        id = request.id;
        requestingPersonId = request.requestingPersonId;
        relatedPersonId = request.relatedPersonId;
        proposedRelationship = relationshipTypeText(request.proposedRelationship);
        status = relationshipRequestStatusText(request.status);
        submittedDate = request.submittedDate;
        reviewer = switch (request.reviewer) {
          case (?p) p.toText();
          case null "";
        };
        reviewedDate = switch (request.reviewedDate) {
          case (?d) d;
          case null 0;
        };
      });
    };
    rows.toArray().values();
  };

  /// Flattens every confirmed relationship in the shared family graph into
  /// OQL-exposable rows.
  public func relationshipRows(
    relationships : List.List<Types.Relationship>,
  ) : Iter.Iter<Types.RelationshipRow> {
    let rows = List.empty<Types.RelationshipRow>();
    for (rel in relationships.toArray().values()) {
      rows.add({
        id = rel.id;
        fromPersonId = rel.fromPersonId;
        toPersonId = rel.toPersonId;
        relationshipType = relationshipTypeText(rel.relationshipType);
        status = relationshipStatusText(rel.status);
      });
    };
    rows.toArray().values();
  };

  /// Flattens every in-app notification record into OQL-exposable rows.
  public func notificationRows(
    notifications : List.List<Types.Notification>,
  ) : Iter.Iter<Types.NotificationRow> {
    let rows = List.empty<Types.NotificationRow>();
    for (n in notifications.toArray().values()) {
      rows.add({
        id = n.id;
        recipient = n.recipient.toText();
        notificationType = notificationTypeText(n.notificationType);
        message = n.message;
        createdAt = n.createdAt;
        read = n.read;
      });
    };
    rows.toArray().values();
  };

  // --- helpers ---

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
    auditLog : List.List<GovernanceTypes.AuditEntry>,
    actionType : GovernanceTypes.AuditActionType,
    actorId : Principal.Principal,
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

  func replaceClaim(claims : List.List<Types.ProfileClaim>, updated : Types.ProfileClaim) {
    let snapshot = claims.toArray();
    claims.clear();
    for (c in snapshot.values()) {
      if (c.id == updated.id) { claims.add(updated) } else { claims.add(c) };
    };
  };

  func replaceRelationshipRequest(requests : List.List<Types.RelationshipRequest>, updated : Types.RelationshipRequest) {
    let snapshot = requests.toArray();
    requests.clear();
    for (r in snapshot.values()) {
      if (r.id == updated.id) { requests.add(updated) } else { requests.add(r) };
    };
  };

  /// Whether a normalized query matches a normalized candidate. Exact match,
  /// substring containment, or full token overlap all count as a match.
  func isMatch(q : Text, candidate : Text) : Bool {
    if (q == candidate) {
      return true;
    };
    if (candidate.contains(#text q) or q.contains(#text candidate)) {
      return true;
    };
    let qTokens = q.split(#predicate (func ch = ch == ' ')).toArray();
    let cTokens = candidate.split(#predicate (func ch = ch == ' ')).toArray();
    var matched = 0;
    for (qt in qTokens.values()) {
      if (cTokens.any(func ct = ct == qt)) { matched += 1 };
    };
    matched == qTokens.size();
  };

  /// Resolves the confirmed parents of a person to their display names, falling
  /// back to the parent's person id when the parent profile is not tracked.
  func parentsOf(
    profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
    relationships : List.List<Types.Relationship>,
    personId : Types.PersonId,
  ) : [Text] {
    let parents = List.empty<Text>();
    for (rel in relationships.toArray().values()) {
      if (rel.status == #Confirmed and rel.relationshipType == #Parent and rel.toPersonId == personId) {
        switch (profiles.get(rel.fromPersonId)) {
          case (?p) parents.add(p.name);
          case null parents.add(rel.fromPersonId);
        };
      };
    };
    parents.toArray();
  };

  func livingStatusText(status : Types.LivingStatus) : Text {
    switch (status) {
      case (#Living) "Living";
      case (#Deceased) "Deceased";
    };
  };

  func claimStatusText(status : Types.ClaimStatus) : Text {
    switch (status) {
      case (#Unclaimed) "Unclaimed";
      case (#Claimed) "Claimed";
    };
  };

  func profileClaimStatusText(status : Types.ProfileClaimStatus) : Text {
    switch (status) {
      case (#Pending) "Pending";
      case (#Approved) "Approved";
      case (#Rejected) "Rejected";
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

  func relationshipStatusText(status : Types.RelationshipStatus) : Text {
    switch (status) {
      case (#Confirmed) "Confirmed";
      case (#Pending) "Pending";
      case (#Disputed) "Disputed";
    };
  };

  func relationshipRequestStatusText(status : Types.RelationshipRequestStatus) : Text {
    switch (status) {
      case (#Pending) "Pending";
      case (#Approved) "Approved";
      case (#Rejected) "Rejected";
    };
  };

  func notificationTypeText(status : Types.NotificationType) : Text {
    switch (status) {
      case (#ProfileClaimRequested) "ProfileClaimRequested";
      case (#ProfileClaimReviewed) "ProfileClaimReviewed";
      case (#RelationshipRequested) "RelationshipRequested";
      case (#RelationshipReviewed) "RelationshipReviewed";
      case (#BoardReply) "BoardReply";
      case (#BoardMention) "BoardMention";
      case (#NewMessage) "NewMessage";
    };
  };
};

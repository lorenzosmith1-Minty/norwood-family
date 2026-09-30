import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import CreationTypes "../types/family-creation";
import FamilyLib "family";
import TenancyLib "tenancy";
import FamilyMembershipLib "family-membership";

/// Onboarding Phase 1B-1: the canonical zero-to-family creation transaction.
///
/// `createFamilyWithFounder` creates exactly three linked records in one
/// atomic step:
///
///   1. the new `Family` record,
///   2. the founder's first `PersonProfile` inside that family,
///   3. an `#Active` `FamilyMembership` linking the authenticated caller to
///      that founder profile.
///
/// It deliberately does NOT create a `StewardRecord`: Steward selection is a
/// later onboarding phase. It never touches the default Norwood family, its
/// memberships, profiles, claims, or stewards — it only adds new records.
///
/// All inputs are validated before any stable collection is mutated, so a
/// rejected request leaves no orphan family, orphan profile, or incomplete
/// membership.
module {
  /// Internal outcome of one create-family attempt. `created` is `true` only
  /// when this call actually wrote a new family/profile/membership; it is
  /// `false` for an idempotent replay, so the caller can advance the
  /// family-creation nonce only on a genuinely new creation.
  public type CreationOutcome = {
    result : Result.Result<CreationTypes.FamilyCreationResult, CreationTypes.FamilyCreationError>;
    created : Bool;
  };

  /// Creates a brand-new family with the authenticated caller as founder.
  ///
  /// `caller` is always the authenticated account; there is no account
  /// parameter, so a caller can never name another account as founder.
  ///
  /// `idempotencyKey` is a REQUIRED client-supplied key for retry/double-submit
  /// safety. A blank or whitespace-only key is rejected with `#InvalidInput`
  /// before anything is mutated, so the canonical creation path can never create
  /// a family without retry protection. When the key was already recorded for
  /// this caller, the previously created family/profile/membership are returned
  /// instead of creating new records.
  ///
  /// `nextFamilyNonce` is the monotonically increasing family-creation counter
  /// used to derive a unique family id; it is advanced only on a successful
  /// creation.
  public func createFamilyWithFounder(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    idempotency : Map.Map<Text, Text>,
    caller : Principal.Principal,
    displayName : Text,
    input : CreationTypes.FounderProfileInput,
    idempotencyKey : Text,
    nextFamilyNonce : Nat,
  ) : CreationOutcome {
    // --- Validation: nothing is mutated before every check passes. ----------
    if (caller.isAnonymous()) {
      return { result = #err(#NotSignedIn); created = false };
    };
    let trimmedDisplayName = displayName.trim(#predicate (func ch = ch.isWhitespace()));
    if (trimmedDisplayName == "") {
      return { result = #err(#InvalidInput); created = false };
    };
    let firstName = input.firstName.trim(#predicate (func ch = ch.isWhitespace()));
    let lastName = input.lastName.trim(#predicate (func ch = ch.isWhitespace()));
    if (firstName == "" or lastName == "") {
      return { result = #err(#InvalidInput); created = false };
    };
    // Retry protection is mandatory: a blank or whitespace-only key is rejected
    // before any mutation, so no family is ever created without a replay key.
    let key = idempotencyKey.trim(#predicate (func ch = ch.isWhitespace()));
    if (key == "") {
      return { result = #err(#InvalidInput); created = false };
    };

    // --- Retry safety: a repeat of the same onboarding attempt returns the
    //     records created by the first attempt. ------------------------------
    switch (idempotency.get(idempotencyKeyKey(caller, key))) {
      case (?familyId) {
        switch (replayResult(families, profiles, memberships, familyId, caller)) {
          case (?result) { return { result = #ok(result); created = false } };
          case null {};
        };
      };
      case null {};
    };

    // --- Atomic creation. ---------------------------------------------------
    let now = Time.now();
    let familyId = FamilyLib.generateFamilyId(families, trimmedDisplayName, caller, nextFamilyNonce);
    let family : FamilyTypes.Family = {
      id = familyId;
      displayName = trimmedDisplayName;
      createdAt = now;
      createdBy = caller;
      status = #active;
    };
    let personId = nextPersonId(profiles, familyId, firstName, lastName);
    let profile : OwnershipTypes.PersonProfile = {
      familyId;
      personId;
      name = firstName # " " # lastName;
      livingStatus = #Living;
      claimStatus = #Claimed;
      claimedByUserId = ?caller;
      preferredName = input.preferredName;
      firstName = ?firstName;
      middleName = input.middleName;
      lastName = ?lastName;
      suffix = input.suffix;
      nickname = null;
      story = null;
      shortBio = null;
      longerStory = null;
      occupation = null;
      birthInfo = input.birthYear;
      birthDate = input.birthDate;
      birthplace = input.birthplace;
      currentLocation = input.currentLocation;
      timeline = null;
      privacySettings = null;
    };
    let membership : MembershipTypes.FamilyMembership = {
      id = nextMembershipId(memberships);
      familyId;
      accountId = caller;
      personId;
      status = #Active;
      joinedAt = ?now;
      approvedBy = ?caller;
      approvedAt = ?now;
      createdAt = now;
      updatedAt = now;
    };

    families.add(familyId, family);
    TenancyLib.putProfileForFamily(profiles, familyId, profile);
    memberships.add(membership);
    idempotency.add(idempotencyKeyKey(caller, key), familyId);
    { result = #ok({ family; founderProfile = profile; membership }); created = true };
  };

  /// The idempotency-store key for one caller and client-supplied key. The
  /// caller principal is part of the key, so one account's key never collides
  /// with another account's key.
  func idempotencyKeyKey(caller : Principal.Principal, key : Text) : Text {
    caller.toText() # "::" # key;
  };

  /// Rebuilds the result of a previously completed creation from the stored
  /// `familyId`. Returns `null` when the family, its founder profile, or the
  /// caller's active membership can no longer be resolved, in which case the
  /// caller falls through to a fresh creation.
  func replayResult(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : FamilyTypes.FamilyId,
    caller : Principal.Principal,
  ) : ?CreationTypes.FamilyCreationResult {
    let family = switch (families.get(familyId)) {
      case (?f) f;
      case null { return null };
    };
    let membership = switch (FamilyMembershipLib.getMembershipForFamily(memberships, familyId, caller)) {
      case (?m) m;
      case null { return null };
    };
    let profile = switch (TenancyLib.getProfileForFamily(profiles, familyId, membership.personId)) {
      case (?p) p;
      case null { return null };
    };
    ?{ family; founderProfile = profile; membership };
  };

  /// Builds a family-unique person id from the founder's names. The id is
  /// derived from the names and suffixed until it is unused within `familyId`,
  /// so the same name in two families never collides.
  func nextPersonId(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : FamilyTypes.FamilyId,
    firstName : Text,
    lastName : Text,
  ) : OwnershipTypes.PersonId {
    let base = (firstName # "_" # lastName).toLower().map(func c = if (c == ' ') { '_' } else { c });
    let candidate = if (base == "") { "founder" } else { base };
    var suffix = 0;
    var id = candidate;
    while (TenancyLib.getProfileForFamily(profiles, familyId, id) != null) {
      suffix += 1;
      id := candidate # "_" # suffix.toText();
    };
    id;
  };

  /// Computes the next membership id: one greater than the largest existing id,
  /// or `0` when there are no memberships. Matches the existing
  /// `FamilyMembershipLib` id convention.
  func nextMembershipId(memberships : List.List<MembershipTypes.FamilyMembership>) : Nat {
    var maxId = 0;
    for (m in memberships.toArray().values()) {
      if (m.id >= maxId) { maxId := m.id + 1 };
    };
    maxId;
  };
};

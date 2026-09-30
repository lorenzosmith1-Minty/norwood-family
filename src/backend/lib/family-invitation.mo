import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Result "mo:core/Result";
import Time "mo:core/Time";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import GovernanceTypes "../types/governance";
import FoundingTypes "../types/founding-steward";
import InvitationTypes "../types/family-invitation";
import FamilyAuthorizationLib "family-authorization";
import FamilyMembershipLib "family-membership";
import StewardAuthorityLib "steward-authority";
import TenancyLib "tenancy";
import RandomLib "random";

/// Onboarding Phase 1C-1: FamilyInvitation domain logic.
///
/// This module owns the secure onboarding TRANSPORT records. It never becomes a
/// second authorization system: `StewardRecord` remains the single source of
/// Steward authority, and `FoundingStewardNomination` remains the single source
/// of founding-Steward progress. An invitation acceptance only establishes the
/// connection to onboarding (at most a `#Pending` `FamilyMembership`).
///
/// Every function takes the persisted collections as parameters, matching the
/// existing lib style, and never consults `AccessControl.isAdmin`.
///
/// Invariants enforced here:
/// - An invitation belongs to exactly one family and its `personId` must belong
///   to that family.
/// - Only the token hash is persisted; the raw token is returned once and never
///   stored or logged.
/// - At most one active `#Pending` invitation exists per `familyId` + `personId`
///   + `invitationType`; a repeat create reuses it rather than duplicating.
/// - An invitation whose `expiresAt <= now` is never treated as an active
///   `#Pending` invitation. Expired records are preserved for history.
/// - An accepted, declined, cancelled, or expired invitation can never be
///   accepted.
module {
  /// The default invitation lifetime: 30 days, in nanoseconds.
  public let DEFAULT_INVITATION_TTL_NS : Int = 2_592_000_000_000_000;

  /// INTERNAL (library-only, never a public endpoint). Returns the invitation
  /// with `invitationId` only when it belongs to `familyId`; an invitation id
  /// from another family never resolves here.
  public func getInvitationForFamily(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    familyId : InvitationTypes.FamilyId,
    invitationId : Nat,
  ) : ?InvitationTypes.FamilyInvitation {
    invitations.find(func i = i.familyId == familyId and i.id == invitationId);
  };

  /// INTERNAL (library-only, never a public endpoint). Resolves an invitation by
  /// the hash of its raw token. A wrong token never resolves an invitation.
  public func getInvitationByTokenHash(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    tokenHash : Text,
  ) : ?InvitationTypes.FamilyInvitation {
    invitations.find(func i = i.tokenHash == tokenHash);
  };

  /// INTERNAL (library-only, never a public endpoint). The active `#Pending`
  /// invitation for `familyId` + `personId` + `invitationType`, or `null` when
  /// none exists. Used to prevent duplicate pending invitations.
  ///
  /// An invitation whose `expiresAt <= now` is NOT an active pending invitation:
  /// it is ignored here so an expired record can never be reused as if it were
  /// still live. The expired record itself is preserved for history.
  public func getPendingInvitationForTarget(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
    invitationType : InvitationTypes.InvitationType,
  ) : ?InvitationTypes.FamilyInvitation {
    let now = Time.now();
    invitations.find(func i =
      i.familyId == familyId and i.personId == personId and
      i.invitationType == invitationType and i.status == #Pending and
      i.expiresAt > now
    );
  };

  /// Whether `personId` already has an `#Active` membership owner in `familyId`
  /// (a claimed profile / existing member). When true, no normal join invitation
  /// is created.
  public func hasActiveMembershipOwnerForPerson(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
  ) : Bool {
    FamilyMembershipLib.hasActiveOwnerForPersonInFamily(memberships, familyId, personId);
  };

  /// Creates a `#Pending` family-member invitation for `personId` in `familyId`.
  ///
  /// The caller must be an approved member or active Steward of `familyId`, and
  /// the target profile must belong to `familyId` and be unclaimed with no
  /// active membership owner. A target that already has an active membership
  /// returns `#AlreadyMember` / `#RelationshipNotificationRequired` and creates
  /// nothing. A repeat create for the same `familyId` + `personId` +
  /// `invitationType` reuses the existing `#Pending` invitation (returning its
  /// metadata with `created = false`) rather than creating a duplicate.
  ///
  /// The raw token is generated here, returned once in the result, and only its
  /// hash is persisted. No membership is created.
  public func createFamilyInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
    invitedEmail : ?Text,
    invitationType : InvitationTypes.InvitationType,
    nextInvitationId : Nat,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreateOutcome, InvitationTypes.FamilyInvitationError> {
    await createInvitation(
      invitations,
      families,
      profiles,
      claims,
      memberships,
      stewards,
      caller,
      familyId,
      personId,
      invitedEmail,
      invitationType,
      nextInvitationId,
    );
  };

  /// Creates a `#FoundingSteward` invitation linked to the existing Phase 1B-2
  /// nomination for `familyId` + `personId`. The nomination must exist and be
  /// `#Pending`; the invitation carries no Steward authority and does not
  /// duplicate nomination state. The nominee still becomes Steward only through
  /// the existing authenticated founding-Steward acceptance rule.
  public func createFoundingStewardInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
    nomineeEmail : ?Text,
    nextInvitationId : Nat,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreateOutcome, InvitationTypes.FamilyInvitationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    // The invitation must reference the existing Phase 1B-2 nomination for this
    // family and nominee. Nomination state is never duplicated inside the
    // invitation.
    let nomination = switch (findPendingNomination(nominations, familyId, personId)) {
      case (?n) n;
      case null { return #err(#NominationNotFound) };
    };
    if (nomination.nomineePersonId != personId) {
      return #err(#NomineeMismatch);
    };
    // Only the founder or an active Steward of this family may create the
    // linked invitation.
    if (
      not (
        isFounderOfFamily(families, caller, familyId) or
        StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)
      )
    ) {
      return #err(#NotAuthorized);
    };
    await createInvitation(
      invitations,
      families,
      profiles,
      claims,
      memberships,
      stewards,
      caller,
      familyId,
      personId,
      nomineeEmail,
      #FoundingSteward,
      nextInvitationId,
    );
  };

  /// Validates a raw invite token and returns only the minimal, relationship-safe
  /// preview context needed for later onboarding. A wrong, unknown, cancelled,
  /// declined, accepted, or expired token returns `#InvalidToken` / `#Expired`.
  /// Never exposes private family tree, Archive, other member identities,
  /// sensitive relationship context, or Steward-only data.
  public func validateFamilyInvitationToken(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    rawToken : Text,
  ) : Result.Result<InvitationTypes.FamilyInvitationPreview, InvitationTypes.FamilyInvitationError> {
    let invitation = switch (resolveToken(invitations, rawToken)) {
      case (?i) i;
      case null { return #err(#InvalidToken) };
    };
    if (isExpired(invitation)) {
      return #err(#Expired);
    };
    if (invitation.status != #Pending) {
      return #err(#InvalidToken);
    };
    let familyDisplayName = switch (families.get(invitation.familyId)) {
      case (?family) family.displayName;
      case null { return #err(#FamilyNotFound) };
    };
    // Public-safe identity preview only: the target profile's display name.
    // Never a relationship label (adoptive/foster/step/biological/guardian) and
    // never any other member's identity.
    let targetDisplayName = switch (TenancyLib.getProfileForFamily(profiles, invitation.familyId, invitation.personId)) {
      case (?profile) profile.name;
      case null { "" };
    };
    #ok({
      invitationId = invitation.id;
      familyId = invitation.familyId;
      familyDisplayName;
      targetPersonId = invitation.personId;
      targetDisplayName;
      invitationType = invitation.invitationType;
      status = invitation.status;
      expiresAt = invitation.expiresAt;
    });
  };

  /// Resolves a raw invite token to a safe, discriminated redemption state for
  /// the frontend. This is a read-only projection of the invitation lifecycle:
  /// it never mutates state, never creates a membership, and never reveals
  /// whether unrelated accounts or families exist.
  ///
  /// A token that does not resolve (unknown, empty, or wrong) returns
  /// `#InvalidToken`. A resolved invitation is reported by its lifecycle:
  /// `#Expired` when `expiresAt <= now`, otherwise `#Cancelled`, `#Declined`,
  /// `#AlreadyAccepted`, or `#Valid(preview)` for a `#Pending` invitation. The
  /// `#Valid` preview is the same minimal, relationship-safe context returned by
  /// `validateFamilyInvitationToken`; it carries no `tokenHash` and no member
  /// identity beyond the target profile's display name.
  public func getInvitationRedemptionState(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    rawToken : Text,
  ) : Result.Result<InvitationTypes.InvitationRedemptionState, InvitationTypes.FamilyInvitationError> {
    let invitation = switch (resolveToken(invitations, rawToken)) {
      case (?i) i;
      case null { return #ok(#InvalidToken) };
    };
    if (isExpired(invitation)) {
      return #ok(#Expired);
    };
    switch (invitation.status) {
      case (#Pending) {
        let familyDisplayName = switch (families.get(invitation.familyId)) {
          case (?family) family.displayName;
          case null { return #err(#FamilyNotFound) };
        };
        let targetDisplayName = switch (TenancyLib.getProfileForFamily(profiles, invitation.familyId, invitation.personId)) {
          case (?profile) profile.name;
          case null { "" };
        };
        #ok(#Valid({
          invitationId = invitation.id;
          familyId = invitation.familyId;
          familyDisplayName;
          targetPersonId = invitation.personId;
          targetDisplayName;
          invitationType = invitation.invitationType;
          status = invitation.status;
          expiresAt = invitation.expiresAt;
        }));
      };
      case (#Accepted) #ok(#AlreadyAccepted);
      case (#Declined) #ok(#Declined);
      case (#Cancelled) #ok(#Cancelled);
      case (#Expired) #ok(#Expired);
    };
  };

  /// Accepts a raw invite token for the authenticated caller.
  ///
  /// The token must be valid, `#Pending`, and unexpired, and the target profile
  /// must still be unclaimed. For `#FamilyMember` this creates or reuses a
  /// `#Pending` `FamilyMembership` linking the caller, `familyId`, and
  /// `personId`; it never auto-activates. For `#FoundingSteward` the membership
  /// follows the existing membership/founding-Steward rule without bypassing
  /// nominee acceptance. The invitation is marked `#Accepted` only when
  /// acceptance succeeds.
  ///
  /// Membership matching: when the caller already holds a membership in the
  /// invitation's family, it is reused ONLY when it is `#Pending` and its
  /// `personId` equals the invitation's `personId`. Any other existing
  /// membership — a different `personId`, or an `#Active`, `#Suspended`, or
  /// `#Left` status — rejects acceptance with `#AlreadyMember` and the
  /// invitation stays `#Pending`.
  public func acceptFamilyInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    caller : Principal.Principal,
    rawToken : Text,
  ) : Result.Result<InvitationTypes.FamilyInvitation, InvitationTypes.FamilyInvitationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let invitation = switch (resolveToken(invitations, rawToken)) {
      case (?i) i;
      case null { return #err(#InvalidToken) };
    };
    if (isExpired(invitation)) {
      return #err(#Expired);
    };
    if (invitation.status != #Pending) {
      return #err(#InvalidTransition);
    };
    if (families.get(invitation.familyId) == null) {
      return #err(#FamilyNotFound);
    };
    // The target profile must still be unclaimed: no active membership owner.
    if (hasActiveMembershipOwnerForPerson(memberships, invitation.familyId, invitation.personId)) {
      return #err(#AlreadyMember);
    };
    // Legacy claim compatibility: a profile already owned through the legacy
    // ProfileClaim / PersonProfile.claimedByUserId path is treated as claimed,
    // so a join invitation is never accepted for it.
    if (isProfileClaimedForFamily(profiles, claims, invitation.familyId, invitation.personId)) {
      return #err(#AlreadyMember);
    };
    // Membership matching: reuse the caller's existing membership in this family
    // only when it is `#Pending` for the same person. Any other existing
    // membership rejects acceptance and leaves the invitation `#Pending`.
    switch (FamilyMembershipLib.getMembershipForFamily(memberships, invitation.familyId, caller)) {
      case (?existing) {
        if (existing.status != #Pending or existing.personId != invitation.personId) {
          return #err(#AlreadyMember);
        };
      };
      case null {};
    };
    // Establish the connection to onboarding. For a normal family-member
    // invitation this is a `#Pending` membership; it is never auto-activated.
    // For a founding-Steward invitation the membership follows the existing
    // membership rule and the nominee still becomes Steward only through the
    // existing authenticated founding-Steward acceptance rule.
    let membershipResult = ensurePendingMembership(
      memberships,
      profiles,
      claims,
      invitation.familyId,
      caller,
      invitation.personId,
    );
    switch (membershipResult) {
      case (#err(e)) { return #err(membershipErrorToInvitationError(e)) };
      case (#ok(_)) {};
    };
    let now = Time.now();
    let accepted : InvitationTypes.FamilyInvitation = {
      id = invitation.id;
      familyId = invitation.familyId;
      personId = invitation.personId;
      invitedEmail = invitation.invitedEmail;
      invitedByAccountId = invitation.invitedByAccountId;
      invitedByPersonId = invitation.invitedByPersonId;
      invitationType = invitation.invitationType;
      tokenHash = invitation.tokenHash;
      status = #Accepted;
      createdAt = invitation.createdAt;
      expiresAt = invitation.expiresAt;
      acceptedAt = ?now;
      acceptedByAccountId = ?caller;
      cancelledAt = invitation.cancelledAt;
    };
    replaceInvitation(invitations, accepted);
    #ok(accepted);
  };

  /// The invited user declines a raw invite token. The invitation becomes
  /// `#Declined` and can never be accepted afterwards.
  public func declineFamilyInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    caller : Principal.Principal,
    rawToken : Text,
  ) : Result.Result<InvitationTypes.FamilyInvitation, InvitationTypes.FamilyInvitationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let invitation = switch (resolveToken(invitations, rawToken)) {
      case (?i) i;
      case null { return #err(#InvalidToken) };
    };
    if (isExpired(invitation)) {
      return #err(#Expired);
    };
    if (invitation.status != #Pending) {
      return #err(#InvalidTransition);
    };
    let declined : InvitationTypes.FamilyInvitation = {
      id = invitation.id;
      familyId = invitation.familyId;
      personId = invitation.personId;
      invitedEmail = invitation.invitedEmail;
      invitedByAccountId = invitation.invitedByAccountId;
      invitedByPersonId = invitation.invitedByPersonId;
      invitationType = invitation.invitationType;
      tokenHash = invitation.tokenHash;
      status = #Declined;
      createdAt = invitation.createdAt;
      expiresAt = invitation.expiresAt;
      acceptedAt = invitation.acceptedAt;
      acceptedByAccountId = invitation.acceptedByAccountId;
      cancelledAt = invitation.cancelledAt;
    };
    replaceInvitation(invitations, declined);
    #ok(declined);
  };

  /// The inviter or an active Steward of `familyId` cancels a `#Pending`
  /// invitation. The invitation becomes `#Cancelled` and can never be accepted
  /// afterwards.
  public func cancelFamilyInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
    invitationId : Nat,
  ) : Result.Result<InvitationTypes.FamilyInvitation, InvitationTypes.FamilyInvitationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    let invitation = switch (getInvitationForFamily(invitations, familyId, invitationId)) {
      case (?i) i;
      case null { return #err(#InvitationNotFound) };
    };
    if (invitation.status != #Pending) {
      return #err(#InvalidTransition);
    };
    // The inviter or an active Steward of that family may cancel.
    if (
      invitation.invitedByAccountId != caller and
      not StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)
    ) {
      return #err(#NotAuthorized);
    };
    let cancelled : InvitationTypes.FamilyInvitation = {
      id = invitation.id;
      familyId = invitation.familyId;
      personId = invitation.personId;
      invitedEmail = invitation.invitedEmail;
      invitedByAccountId = invitation.invitedByAccountId;
      invitedByPersonId = invitation.invitedByPersonId;
      invitationType = invitation.invitationType;
      tokenHash = invitation.tokenHash;
      status = #Cancelled;
      createdAt = invitation.createdAt;
      expiresAt = invitation.expiresAt;
      acceptedAt = invitation.acceptedAt;
      acceptedByAccountId = invitation.acceptedByAccountId;
      cancelledAt = ?Time.now();
    };
    replaceInvitation(invitations, cancelled);
    #ok(cancelled);
  };

  /// Rotates the token of an existing `#Pending` invitation for `familyId` +
  /// `personId` + `invitationType`, returning the new raw token once. The old
  /// token stops resolving. Used by the explicit resend operation so a resend
  /// never silently creates a duplicate invitation.
  ///
  /// A resend always issues a token with a fresh future expiry: `expiresAt` is
  /// set to `now + DEFAULT_INVITATION_TTL_NS`, so a resend can never hand out a
  /// token that is already expired.
  ///
  /// Deterministic rule for an already-expired invitation: an invitation whose
  /// `expiresAt <= now` is not an active `#Pending` invitation, so it is not
  /// resent. It is transitioned to `#Expired` (preserved for history) and the
  /// call returns `#err(#Expired)`; the caller must use
  /// `createFamilyInvitation` to issue a fresh invitation.
  public func resendFamilyInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
    invitationType : InvitationTypes.InvitationType,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreated, InvitationTypes.FamilyInvitationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    if (not isInviterAuthorized(stewards, claims, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    let existing = switch (getPendingInvitationForTarget(invitations, familyId, personId, invitationType)) {
      case (?i) i;
      case null {
        // No active pending invitation. If an expired `#Pending` record exists
        // for this target, transition it to `#Expired` and require a fresh
        // create; otherwise the target simply has no invitation.
        if (expireStaleInvitations(invitations, familyId, personId, invitationType)) {
          return #err(#Expired);
        };
        return #err(#InvitationNotFound);
      };
    };
    // Rotate the token: the old token stops resolving because only the new
    // digest is stored. The invitation identity, family, and target are kept,
    // and the expiry is refreshed to a full TTL from now so a resend never
    // issues an already-expired token.
    let now = Time.now();
    let rawToken = await RandomLib.generateToken();
    let rotated : InvitationTypes.FamilyInvitation = {
      id = existing.id;
      familyId = existing.familyId;
      personId = existing.personId;
      invitedEmail = existing.invitedEmail;
      invitedByAccountId = existing.invitedByAccountId;
      invitedByPersonId = existing.invitedByPersonId;
      invitationType = existing.invitationType;
      tokenHash = RandomLib.digestToken(rawToken);
      status = #Pending;
      createdAt = existing.createdAt;
      expiresAt = now + DEFAULT_INVITATION_TTL_NS;
      acceptedAt = existing.acceptedAt;
      acceptedByAccountId = existing.acceptedByAccountId;
      cancelledAt = existing.cancelledAt;
    };
    replaceInvitation(invitations, rotated);
    #ok({ invitation = rotated; rawToken; created = false });
  };

  /// Builds the OQL-exposable rows for every invitation. The `tokenHash` is
  /// never included.
  public func invitationRows(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
  ) : [InvitationTypes.FamilyInvitationRow] {
    invitations.toArray().map(func i = {
      familyId = i.familyId;
      id = i.id;
      personId = i.personId;
      invitedEmail = i.invitedEmail ?? "";
      invitedByAccountId = i.invitedByAccountId.toText();
      invitedByPersonId = i.invitedByPersonId ?? "";
      invitationType = invitationTypeText(i.invitationType);
      status = invitationStatusText(i.status);
      createdAt = i.createdAt;
      expiresAt = i.expiresAt;
      acceptedAt = i.acceptedAt ?? 0;
      acceptedByAccountId = switch (i.acceptedByAccountId) { case (?p) p.toText(); case null "" };
      cancelledAt = i.cancelledAt ?? 0;
    });
  };

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /// Shared create path for both invitation types. Validates the family, the
  /// caller's authority, the target profile's family membership, and the
  /// claimed-profile rule, then either reuses an existing `#Pending` invitation
  /// or stores a new one with only the token digest persisted.
  func createInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    memberships : List.List<MembershipTypes.FamilyMembership>,
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
    invitedEmail : ?Text,
    invitationType : InvitationTypes.InvitationType,
    nextInvitationId : Nat,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreateOutcome, InvitationTypes.FamilyInvitationError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    if (personId.trim(#predicate (func ch = ch.isWhitespace())) == "") {
      return #err(#InvalidInput);
    };
    // The caller must be an approved member or active Steward of this family.
    if (not isInviterAuthorized(stewards, claims, caller, familyId)) {
      return #err(#NotAuthorized);
    };
    // The target profile must belong to THIS family.
    if (not FamilyAuthorizationLib.isPersonInFamily(profiles, claims, personId, familyId)) {
      return #err(#PersonNotInFamily);
    };
    // Claimed-profile rule: an existing active member never receives a duplicate
    // join invitation.
    if (hasActiveMembershipOwnerForPerson(memberships, familyId, personId)) {
      return #ok(#AlreadyMember);
    };
    // Legacy claim compatibility: a profile already owned through the legacy
    // ProfileClaim / PersonProfile.claimedByUserId path is treated as claimed,
    // so no join invitation is created for it.
    if (isProfileClaimedForFamily(profiles, claims, familyId, personId)) {
      return #ok(#AlreadyMember);
    };
    // Duplicate-pending safety: reuse an existing active `#Pending` invitation
    // for the same family + person + type rather than creating another. The
    // existing raw token is not recoverable (only its digest is stored), so the
    // reused result carries an empty raw token and `created = false`; callers
    // that need a fresh deliverable token use the explicit resend operation.
    switch (getPendingInvitationForTarget(invitations, familyId, personId, invitationType)) {
      case (?existing) {
        return #ok(#Created({ invitation = existing; rawToken = ""; created = false }));
      };
      case null {};
    };
    // No active pending invitation exists. Any prior `#Pending` record for this
    // target is expired (or there is none): transition expired records to
    // `#Expired` so they are preserved for history but never behave as active,
    // then create a fresh invitation with a new token and a fresh expiry.
    ignore expireStaleInvitations(invitations, familyId, personId, invitationType);
    let now = Time.now();
    let rawToken = await RandomLib.generateToken();
    let invitation : InvitationTypes.FamilyInvitation = {
      id = nextInvitationId;
      familyId;
      personId;
      invitedEmail = normalizeEmail(invitedEmail);
      invitedByAccountId = caller;
      invitedByPersonId = inviterPersonId(profiles, familyId, caller);
      invitationType;
      tokenHash = RandomLib.digestToken(rawToken);
      status = #Pending;
      createdAt = now;
      expiresAt = now + DEFAULT_INVITATION_TTL_NS;
      acceptedAt = null;
      acceptedByAccountId = null;
      cancelledAt = null;
    };
    invitations.add(invitation);
    #ok(#Created({ invitation; rawToken; created = true }));
  };

  /// Whether the caller may create/cancel invitations for `familyId`: an
  /// approved family member or an active Steward of that family.
  func isInviterAuthorized(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
  ) : Bool {
    FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Whether `caller` is the founder (creator) of `familyId`.
  func isFounderOfFamily(
    families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
    caller : Principal.Principal,
    familyId : InvitationTypes.FamilyId,
  ) : Bool {
    switch (families.get(familyId)) {
      case (?family) family.createdBy == caller;
      case null false;
    };
  };

  /// The pending Phase 1B-2 nomination of `familyId` for `personId`, or `null`.
  func findPendingNomination(
    nominations : List.List<FoundingTypes.FoundingStewardNomination>,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
  ) : ?FoundingTypes.FoundingStewardNomination {
    nominations.find(func n =
      n.familyId == familyId and n.nomineePersonId == personId and n.status == #Pending
    );
  };

  /// The inviter's own person profile in `familyId`, when one is known. The
  /// profile is resolved by the caller's claimed ownership; an unclaimed or
  /// unknown profile yields `null`.
  func inviterPersonId(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    familyId : InvitationTypes.FamilyId,
    caller : Principal.Principal,
  ) : ?InvitationTypes.PersonId {
    var found : ?InvitationTypes.PersonId = null;
    for ((_key, profile) in profiles.entries()) {
      if (found == null and profile.familyId == familyId and profile.claimedByUserId == ?caller) {
        found := ?profile.personId;
      };
    };
    found;
  };

  /// Resolves a raw token to its invitation by hash. A wrong or unknown token
  /// never resolves.
  func resolveToken(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    rawToken : Text,
  ) : ?InvitationTypes.FamilyInvitation {
    if (rawToken.size() == 0) {
      return null;
    };
    getInvitationByTokenHash(invitations, RandomLib.digestToken(rawToken));
  };

  /// Whether the invitation has passed its expiry. Expired invitations fail
  /// validation and acceptance and create no membership; they are preserved for
  /// audit/history and never automatically deleted.
  func isExpired(invitation : InvitationTypes.FamilyInvitation) : Bool {
    Time.now() >= invitation.expiresAt;
  };

  /// Creates a `#Pending` membership for the caller when none exists, or reuses
  /// the caller's existing membership in the family. A membership that is not
  /// `#Pending` (already active, suspended, or left) is returned as-is so an
  /// existing member is never downgraded.
  func ensurePendingMembership(
    memberships : List.List<MembershipTypes.FamilyMembership>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : InvitationTypes.FamilyId,
    caller : Principal.Principal,
    personId : InvitationTypes.PersonId,
  ) : Result.Result<MembershipTypes.FamilyMembership, MembershipTypes.MembershipError> {
    switch (FamilyMembershipLib.getMembershipForFamily(memberships, familyId, caller)) {
      case (?existing) { return #ok(existing) };
      case null {};
    };
    FamilyMembershipLib.createPendingMembershipForFamily(
      memberships,
      profiles,
      claims,
      familyId,
      caller,
      personId,
    );
  };

  /// Maps a membership error onto the invitation error surface.
  func membershipErrorToInvitationError(
    error : MembershipTypes.MembershipError,
  ) : InvitationTypes.FamilyInvitationError {
    switch (error) {
      case (#NotSignedIn) #NotSignedIn;
      case (#FamilyNotFound) #FamilyNotFound;
      case (#PersonNotInFamily) #PersonNotInFamily;
      case (#AlreadyMember) #AlreadyMember;
      case (#MembershipNotFound) #InvitationNotFound;
      case (#NotAuthorized) #NotAuthorized;
      case (#ProfileAlreadyOwned) #AlreadyMember;
      case (#InvalidTransition) #InvalidTransition;
    };
  };

  /// Replaces the stored invitation with the same id, preserving list order.
  func replaceInvitation(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    updated : InvitationTypes.FamilyInvitation,
  ) {
    let snapshot = invitations.toArray();
    invitations.clear();
    for (i in snapshot.values()) {
      if (i.id == updated.id and i.familyId == updated.familyId) {
        invitations.add(updated);
      } else {
        invitations.add(i);
      };
    };
  };

  /// Normalizes an optional invitee email: trims surrounding whitespace and
  /// lowercases it. A blank value normalizes to `null`.
  func normalizeEmail(email : ?Text) : ?Text {
    switch (email) {
      case (?value) {
        let trimmed = value.trim(#predicate (func ch = ch.isWhitespace())).toLower();
        if (trimmed.size() == 0) { null } else { ?trimmed };
      };
      case null null;
    };
  };

  /// Transitions every expired `#Pending` invitation for `familyId` + `personId`
  /// + `invitationType` to `#Expired`, preserving the record for history. The
  /// record is never deleted. Returns `true` when at least one record was
  /// transitioned.
  func expireStaleInvitations(
    invitations : List.List<InvitationTypes.FamilyInvitation>,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
    invitationType : InvitationTypes.InvitationType,
  ) : Bool {
    let now = Time.now();
    var expiredAny = false;
    let snapshot = invitations.toArray();
    for (i in snapshot.values()) {
      if (
        i.familyId == familyId and i.personId == personId and
        i.invitationType == invitationType and i.status == #Pending and
        i.expiresAt <= now
      ) {
        let expired : InvitationTypes.FamilyInvitation = {
          id = i.id;
          familyId = i.familyId;
          personId = i.personId;
          invitedEmail = i.invitedEmail;
          invitedByAccountId = i.invitedByAccountId;
          invitedByPersonId = i.invitedByPersonId;
          invitationType = i.invitationType;
          tokenHash = i.tokenHash;
          status = #Expired;
          createdAt = i.createdAt;
          expiresAt = i.expiresAt;
          acceptedAt = i.acceptedAt;
          acceptedByAccountId = i.acceptedByAccountId;
          cancelledAt = i.cancelledAt;
        };
        replaceInvitation(invitations, expired);
        expiredAny := true;
      };
    };
    expiredAny;
  };

  /// Whether the target profile is already claimed through the legacy
  /// claim/ownership compatibility path: `PersonProfile.claimedByUserId` is set,
  /// or an `#Approved` `ProfileClaim` exists for the person in `familyId`. This
  /// reuses the family-scoped ownership predicate so the legacy path is not
  /// duplicated. A profile owned this way must not receive a new join
  /// invitation.
  func isProfileClaimedForFamily(
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    familyId : InvitationTypes.FamilyId,
    personId : InvitationTypes.PersonId,
  ) : Bool {
    switch (TenancyLib.getProfileForFamily(profiles, familyId, personId)) {
      case (?profile) {
        if (profile.claimedByUserId != null) {
          return true;
        };
      };
      case null {};
    };
    claims.toArray().any(func c =
      c.personId == personId and c.status == #Approved and
      (c.familyId == familyId or (familyId == FamilyTypes.DEFAULT_FAMILY_ID and c.familyId == ""))
    );
  };

  /// Renders an invitation type variant as its tag text for OQL rows.
  func invitationTypeText(invitationType : InvitationTypes.InvitationType) : Text {
    switch (invitationType) {
      case (#FamilyMember) "FamilyMember";
      case (#FoundingSteward) "FoundingSteward";
    };
  };

  /// Renders an invitation status variant as its tag text for OQL rows.
  func invitationStatusText(status : InvitationTypes.InvitationStatus) : Text {
    switch (status) {
      case (#Pending) "Pending";
      case (#Accepted) "Accepted";
      case (#Declined) "Declined";
      case (#Cancelled) "Cancelled";
      case (#Expired) "Expired";
    };
  };
};

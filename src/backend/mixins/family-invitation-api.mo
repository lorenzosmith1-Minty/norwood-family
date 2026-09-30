import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import GovernanceTypes "../types/governance";
import FoundingTypes "../types/founding-steward";
import InvitationTypes "../types/family-invitation";
import FamilyInvitationLib "../lib/family-invitation";

/// Public API for the Phase 1C-1 FamilyInvitation foundation.
///
/// A `FamilyInvitation` is a secure onboarding TRANSPORT record. It is separate
/// from `PersonProfile`, `ProfileClaim`, `FamilyMembership`, `StewardRecord`,
/// and `FoundingStewardNomination`. Invitation acceptance establishes the
/// connection to onboarding; it does not by itself grant unrestricted family
/// access.
///
/// The raw invite token is returned exactly once from the create/resend API for
/// later email/UI delivery. Only its hash is persisted, and the raw token is
/// never logged.
mixin (
  invitations : List.List<InvitationTypes.FamilyInvitation>,
  invitationState : { var nextInvitationId : Nat },
  families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  memberships : List.List<MembershipTypes.FamilyMembership>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  foundingStewardNominations : List.List<FoundingTypes.FoundingStewardNomination>,
) {
  /// Creates a `#Pending` family-member invitation for an unclaimed profile in
  /// `familyId`. Callable by an approved member or active Steward of `familyId`.
  /// The target profile must belong to `familyId` and be unclaimed with no
  /// active membership owner; a target that is already an active member returns
  /// `#AlreadyMember` / `#RelationshipNotificationRequired` and creates nothing.
  /// A repeat create for the same `familyId` + `personId` + `invitationType`
  /// reuses the existing `#Pending` invitation rather than duplicating it. The
  /// raw token is returned once; only its hash is persisted. No membership is
  /// created.
  public shared ({ caller }) func createFamilyInvitation(
    familyId : Text,
    personId : Text,
    invitedEmail : ?Text,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreateOutcome, InvitationTypes.FamilyInvitationError> {
    let result = await FamilyInvitationLib.createFamilyInvitation(
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
      #FamilyMember,
      invitationState.nextInvitationId,
    );
    // Advance the invitation-id counter only when a new invitation was actually
    // stored, so a rejected or reused call never consumes an id.
    switch (result) {
      case (#ok(#Created(created))) {
        if (created.created) { invitationState.nextInvitationId += 1 };
      };
      case _ {};
    };
    result;
  };

  /// Creates a `#Pending` `#FoundingSteward` invitation linked to the existing
  /// Phase 1B-2 nomination for `familyId` + `personId`. The nomination must
  /// exist and be `#Pending`; the invitation carries no Steward authority and
  /// does not duplicate nomination state. The nominee still becomes Steward only
  /// through the existing authenticated founding-Steward acceptance rule.
  public shared ({ caller }) func createFoundingStewardInvitation(
    familyId : Text,
    personId : Text,
    nomineeEmail : ?Text,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreateOutcome, InvitationTypes.FamilyInvitationError> {
    let result = await FamilyInvitationLib.createFoundingStewardInvitation(
      invitations,
      families,
      profiles,
      claims,
      memberships,
      stewards,
      foundingStewardNominations,
      caller,
      familyId,
      personId,
      nomineeEmail,
      invitationState.nextInvitationId,
    );
    switch (result) {
      case (#ok(#Created(created))) {
        if (created.created) { invitationState.nextInvitationId += 1 };
      };
      case _ {};
    };
    result;
  };

  /// Validates a raw invite token and returns only the minimal,
  /// relationship-safe preview context needed for later onboarding: invitation
  /// id, family display name, target profile safe identity preview, invitation
  /// type, status, and expiry. Never exposes the private family tree, Archive,
  /// other member identities, sensitive relationship context, or Steward-only
  /// data. A wrong, unknown, cancelled, declined, accepted, or expired token
  /// returns `#InvalidToken` / `#Expired`.
  public query func validateFamilyInvitationToken(
    rawToken : Text,
  ) : async Result.Result<InvitationTypes.FamilyInvitationPreview, InvitationTypes.FamilyInvitationError> {
    FamilyInvitationLib.validateFamilyInvitationToken(invitations, families, profiles, rawToken);
  };

  /// Resolves a raw invite token to a safe, discriminated redemption state for
  /// the invitation landing/terminal UI. Read-only: it never mutates state and
  /// never creates a membership. Returns `#Valid(preview)` for a `#Pending`,
  /// unexpired invitation, and `#Expired` / `#Cancelled` / `#Declined` /
  /// `#AlreadyAccepted` / `#InvalidToken` otherwise. It never reveals whether
  /// unrelated accounts or families exist and never includes `tokenHash` or any
  /// member identity beyond the existing preview fields.
  public query func getInvitationRedemptionState(
    rawToken : Text,
  ) : async Result.Result<InvitationTypes.InvitationRedemptionState, InvitationTypes.FamilyInvitationError> {
    FamilyInvitationLib.getInvitationRedemptionState(invitations, families, profiles, rawToken);
  };

  /// Accepts a raw invite token for the authenticated caller. The token must be
  /// valid, `#Pending`, and unexpired, and the target profile must still be
  /// unclaimed. For `#FamilyMember` this creates or reuses a `#Pending`
  /// `FamilyMembership` linking the caller, `familyId`, and `personId`; it never
  /// auto-activates. For `#FoundingSteward` the membership follows the existing
  /// membership/founding-Steward rule without bypassing nominee acceptance. The
  /// invitation is marked `#Accepted` only when acceptance succeeds.
  public shared ({ caller }) func acceptFamilyInvitation(
    rawToken : Text,
  ) : async Result.Result<InvitationTypes.FamilyInvitation, InvitationTypes.FamilyInvitationError> {
    FamilyInvitationLib.acceptFamilyInvitation(
      invitations,
      families,
      profiles,
      claims,
      memberships,
      caller,
      rawToken,
    );
  };

  /// The invited user declines a raw invite token. The invitation becomes
  /// `#Declined` and can never be accepted afterwards.
  public shared ({ caller }) func declineFamilyInvitation(
    rawToken : Text,
  ) : async Result.Result<InvitationTypes.FamilyInvitation, InvitationTypes.FamilyInvitationError> {
    FamilyInvitationLib.declineFamilyInvitation(invitations, caller, rawToken);
  };

  /// The inviter or an active Steward of `familyId` cancels a `#Pending`
  /// invitation. The invitation becomes `#Cancelled` and can never be accepted
  /// afterwards.
  public shared ({ caller }) func cancelFamilyInvitation(
    familyId : Text,
    invitationId : Nat,
  ) : async Result.Result<InvitationTypes.FamilyInvitation, InvitationTypes.FamilyInvitationError> {
    FamilyInvitationLib.cancelFamilyInvitation(invitations, stewards, caller, familyId, invitationId);
  };

  /// Rotates the token of an existing `#Pending` invitation for `familyId` +
  /// `personId` + `invitationType`, returning the new raw token once. The old
  /// token stops resolving. This is the explicit resend operation, so a resend
  /// never silently creates a duplicate invitation.
  public shared ({ caller }) func resendFamilyInvitation(
    familyId : Text,
    personId : Text,
    invitationType : InvitationTypes.InvitationType,
  ) : async Result.Result<InvitationTypes.FamilyInvitationCreated, InvitationTypes.FamilyInvitationError> {
    await FamilyInvitationLib.resendFamilyInvitation(
      invitations,
      families,
      profiles,
      claims,
      memberships,
      stewards,
      caller,
      familyId,
      personId,
      invitationType,
    );
  };
};

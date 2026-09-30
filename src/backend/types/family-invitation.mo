import Principal "mo:core/Principal";

/// Onboarding Phase 1C-1: FamilyInvitation domain types.
///
/// A `FamilyInvitation` is a secure onboarding TRANSPORT record: it carries a
/// one-time invite token (stored only as a hash) that lets an invited person
/// reach the onboarding flow for one family and one target person profile.
///
/// It is deliberately separate from every other onboarding/identity record:
///
/// - `PersonProfile` is the family-tree person record and its ownership state.
/// - `ProfileClaim` is the legacy claim workflow retained for compatibility.
/// - `FamilyMembership` is the canonical account-to-family membership state.
/// - `StewardRecord` is the single source of Steward authority.
/// - `FoundingStewardNomination` is the Phase 1B-2 founding-Steward progress
///   record.
///
/// An invitation never grants family access by itself. Accepting one only
/// establishes the connection to onboarding (at most a `#Pending`
/// `FamilyMembership`); it never creates Steward authority and never bypasses
/// the existing founding-Steward acceptance rule.
module {
  /// Identifier of a family in the multi-family tenancy model.
  public type FamilyId = Text;

  /// Identifier of a person in the family tree (e.g. "julia", "clayton").
  public type PersonId = Text;

  /// Stable internal account identifier (an ICP Principal).
  public type AccountId = Principal;

  /// What the invitation is for.
  ///
  /// - `#FamilyMember` — a normal join invitation for an unclaimed profile.
  /// - `#FoundingSteward` — an invitation linked to an existing Phase 1B-2
  ///   founding-Steward nomination; it carries no Steward authority and the
  ///   nominee still becomes Steward only through the existing authenticated
  ///   founding-Steward acceptance rule.
  public type InvitationType = {
    #FamilyMember;
    #FoundingSteward;
  };

  /// Lifecycle of one invitation.
  ///
  /// - `#Pending` — created and awaiting acceptance; the only state that can be
  ///   accepted.
  /// - `#Accepted` — the invitee accepted; the invitation can never be reused.
  /// - `#Declined` — the invitee declined; the invitation can never be accepted.
  /// - `#Cancelled` — the inviter or a Steward of the family cancelled it; the
  ///   invitation can never be accepted.
  /// - `#Expired` — the invitation passed its `expiresAt`; it fails validation
  ///   and acceptance and creates no membership. Expired records are preserved
  ///   for audit/history and are never automatically deleted.
  public type InvitationStatus = {
    #Pending;
    #Accepted;
    #Declined;
    #Cancelled;
    #Expired;
  };

  /// A persistent family invitation.
  ///
  /// `familyId` is the tenant boundary: an invitation belongs to exactly one
  /// family, and its `personId` must belong to that same family. `tokenHash` is
  /// the ONLY persisted form of the invite token — the raw token is returned
  /// exactly once from the create API and is never stored or logged.
  ///
  /// `invitedByPersonId` is the inviter's own person profile in the family when
  /// one is known; `invitedEmail` is the optional normalized invitee email.
  /// `acceptedAt`/`acceptedByAccountId` are set only on acceptance;
  /// `cancelledAt` is set only on cancellation. `createdAt`/`expiresAt` are
  /// nanosecond timestamps.
  public type FamilyInvitation = {
    id : Nat;
    familyId : FamilyId;
    personId : PersonId;
    invitedEmail : ?Text;
    invitedByAccountId : AccountId;
    invitedByPersonId : ?PersonId;
    invitationType : InvitationType;
    tokenHash : Text;
    status : InvitationStatus;
    createdAt : Int;
    expiresAt : Int;
    acceptedAt : ?Int;
    acceptedByAccountId : ?AccountId;
    cancelledAt : ?Int;
  };

  /// Minimal, relationship-safe invitation context returned by token
  /// validation. It deliberately carries no private family tree, no Archive
  /// data, no other member identities, no sensitive relationship context, and
  /// no Steward-only data.
  ///
  /// `targetDisplayName` is the target profile's public-safe display identity
  /// only (its name), never a relationship label such as adoptive/foster/step/
  /// biological/guardian.
  public type FamilyInvitationPreview = {
    invitationId : Nat;
    familyId : FamilyId;
    familyDisplayName : Text;
    targetPersonId : PersonId;
    targetDisplayName : Text;
    invitationType : InvitationType;
    status : InvitationStatus;
    expiresAt : Int;
  };

  /// The result of creating an invitation. `rawToken` is returned exactly once,
  /// here, for later email/UI delivery; it is never persisted and never logged.
  /// `created` is `false` when an existing active `#Pending` invitation for the
  /// same `familyId` + `personId` + `invitationType` was reused instead of
  /// creating a duplicate.
  public type FamilyInvitationCreated = {
    invitation : FamilyInvitation;
    rawToken : Text;
    created : Bool;
  };

  /// The outcome of a create attempt when the target profile is already an
  /// active member of the family. No join invitation is created; the later UI
  /// can convert this into a normal relationship notification.
  public type FamilyInvitationCreateOutcome = {
    #Created : FamilyInvitationCreated;
    #AlreadyMember;
    #RelationshipNotificationRequired;
  };

  /// Safe, discriminated redemption state for an invite token, used by the
  /// frontend to render the invitation landing/terminal states without ever
  /// learning whether unrelated accounts or families exist.
  ///
  /// - `#Valid(preview)` — the token resolves to a `#Pending`, unexpired
  ///   invitation; `preview` is the same minimal, relationship-safe context
  ///   returned by token validation.
  /// - `#Expired` — the invitation passed its `expiresAt`.
  /// - `#Cancelled` — the inviter or a Steward cancelled it.
  /// - `#Declined` — the invitee declined it.
  /// - `#AlreadyAccepted` — the invitation was already accepted and can never
  ///   be reused.
  /// - `#InvalidToken` — the token is unknown, empty, or otherwise does not
  ///   resolve to an invitation.
  ///
  /// The state never carries `tokenHash`, any member identity beyond the
  /// existing preview fields, or any signal about other accounts/families.
  public type InvitationRedemptionState = {
    #Valid : FamilyInvitationPreview;
    #Expired;
    #Cancelled;
    #Declined;
    #AlreadyAccepted;
    #InvalidToken;
  };

  /// Errors for the family-invitation operations.
  public type FamilyInvitationError = {
    #NotSignedIn;
    #FamilyNotFound;
    #PersonNotInFamily;
    #NotAuthorized;
    #AlreadyMember;
    #RelationshipNotificationRequired;
    #InvitationNotFound;
    #InvalidToken;
    #Expired;
    #InvalidTransition;
    #NominationNotFound;
    #NomineeMismatch;
    #InvalidInput;
  };

  /// Flattened, OQL-exposable view of a family invitation. Enumerated variants
  /// are rendered as their tag text; optional fields render as empty text / `0`
  /// when absent. The `tokenHash` is intentionally NOT exposed.
  public type FamilyInvitationRow = {
    familyId : Text;
    id : Nat;
    personId : Text;
    invitedEmail : Text;
    invitedByAccountId : Text;
    invitedByPersonId : Text;
    invitationType : Text;
    status : Text;
    createdAt : Int;
    expiresAt : Int;
    acceptedAt : Int;
    acceptedByAccountId : Text;
    cancelledAt : Int;
  };
};

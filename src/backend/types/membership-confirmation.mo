import Principal "mo:core/Principal";
import MembershipTypes "family-membership";

/// MembershipConfirmation domain types (Onboarding Phase 1D).
///
/// A `MembershipConfirmation` is a trusted-relative decision about a `#Pending`
/// `FamilyMembership`. It is deliberately separate from `FamilyMembership`,
/// `ProfileClaim`, `StewardRecord`, and `FamilyInvitation`:
///
/// - `FamilyMembership` is the account-to-family membership state.
/// - `ProfileClaim` is the legacy profile-ownership workflow.
/// - `StewardRecord` is family governance authority.
/// - `FamilyInvitation` is the secure onboarding transport record.
///
/// A confirmation records only the SIMPLE relationship type used to qualify the
/// confirmer (Parent/Child, Sibling, SpousePartner). It never stores or surfaces
/// sensitive relationship context (Biological/Adoptive/Foster/Step/Guardian).
///
/// Confirmation state tracks resolution WITHOUT duplicating
/// `FamilyMembership.status`: the membership remains the single source of truth
/// for whether an account is `#Pending`/`#Active`/`#Suspended`/`#Left`.
module {
  /// Identifier of a family in the multi-family tenancy model.
  public type FamilyId = Text;

  /// Identifier of a person in the family tree (e.g. "julia", "clayton").
  public type PersonId = Text;

  /// Stable internal account identifier (an ICP Principal).
  public type AccountId = Principal;

  /// A trusted relative's decision about a pending membership.
  ///
  /// - `#Confirmed` — the relative vouches for the pending person.
  /// - `#Disputed` — the relative disputes the pending person.
  public type ConfirmationDecision = {
    #Confirmed;
    #Disputed;
  };

  /// Lightweight resolution state of a pending membership's confirmation case.
  /// This is NOT a duplicate of `FamilyMembership.status`: it tracks only how
  /// the confirmation case is being resolved.
  ///
  /// Semantic mapping to the membership-confirmation outcomes:
  ///
  /// - `#AwaitingConfirmation` — Pending: no decision recorded yet; the
  ///   membership awaits trusted-relative confirmation/review.
  /// - `#ApprovedByRelative` — Confirmed: at least one valid `#Confirmed` and
  ///   no `#Disputed`; the membership was activated through the existing
  ///   activation path.
  /// - `#RejectedByRelative` — Rejected/Disputed: a standalone trusted-relative
  ///   `#Disputed` with no `#Confirmed`; the membership is NOT activated and
  ///   stays pending/reviewable. This is an explicit persisted representation
  ///   distinct from `#ResolvedBySteward`.
  /// - `#StewardReviewRequired` — NeedsStewardReview: conflicting evidence
  ///   (`#Confirmed` + `#Disputed`) requires a Steward decision; the membership
  ///   is not auto-activated.
  /// - `#ResolvedBySteward` — a later Steward outcome (approve or reject); it is
  ///   NOT equivalent to `#RejectedByRelative`.
  public type MembershipConfirmationState = {
    #AwaitingConfirmation;
    #ApprovedByRelative;
    #RejectedByRelative;
    #StewardReviewRequired;
    #ResolvedBySteward;
  };

  /// A Family Steward's resolution of an escalated confirmation case.
  ///
  /// - `#Approve` — activate the pending membership.
  /// - `#Reject` — leave the membership `#Pending` and record a resolved
  ///   rejection in the confirmation state (there is no `#Rejected` membership
  ///   status in the current model).
  /// - `#NeedsMoreInformation` — keep the membership `#Pending` and the case
  ///   open.
  public type MembershipConfirmationResolution = {
    #Approve;
    #Reject;
    #NeedsMoreInformation;
  };

  /// A persisted Family Steward resolution of an escalated confirmation case.
  ///
  /// This is the record that makes `#ResolvedBySteward` reachable: a Steward
  /// `#Approve` or `#Reject` writes one of these, and
  /// `confirmationStateForMembership` consults it. `#NeedsMoreInformation` does
  /// NOT write a record, so the case stays open at `#StewardReviewRequired`.
  ///
  /// It is family-scoped and keyed by `membershipId`; it carries no sensitive
  /// relationship context. `resolvedAt` is a nanosecond timestamp.
  public type MembershipConfirmationResolutionRecord = {
    familyId : FamilyId;
    membershipId : Nat;
    resolution : MembershipConfirmationResolution;
    resolvedByAccountId : AccountId;
    resolvedAt : Int;
  };

  /// A persistent trusted-relative confirmation record.
  ///
  /// Every confirmation belongs to exactly one family: `membershipId` must
  /// belong to `familyId` and `pendingPersonId` must match the membership's
  /// `personId`. `relationshipId` is the optional id of the confirmed
  /// relationship that qualified the confirmer; it is an internal reference and
  /// is never surfaced as sensitive relationship context.
  /// `createdAt`/`updatedAt` are nanosecond timestamps.
  ///
  /// `rejectedByAccountId`/`rejectedAt` are the explicit persisted
  /// representation of a standalone trusted-relative rejection/dispute: they
  /// are set when this confirmer's `decision` is `#Disputed` and are cleared
  /// when the decision is `#Confirmed`. They are distinct from the Steward
  /// resolution record (`MembershipConfirmationResolutionRecord`), so a
  /// relative rejection is never conflated with a Steward outcome.
  public type MembershipConfirmation = {
    id : Nat;
    familyId : FamilyId;
    membershipId : Nat;
    pendingPersonId : PersonId;
    confirmerAccountId : AccountId;
    confirmerPersonId : PersonId;
    decision : ConfirmationDecision;
    relationshipId : ?Nat;
    rejectedByAccountId : ?AccountId;
    rejectedAt : ?Int;
    createdAt : Int;
    updatedAt : Int;
  };

  /// Errors for submitting and resolving membership confirmations.
  public type MembershipConfirmationError = {
    #NotSignedIn;
    #FamilyNotFound;
    #MembershipNotFound;
    #NotAuthorized;
    #MembershipNotPending;
    #NoActiveMembership;
    #NoQualifyingRelationship;
    #SelfConfirmation;
    #AlreadyDecided;
    #NotSteward;
    /// A `#Confirmed` decision would have activated the membership, but the
    /// secure `FamilyMembership` activation path failed. The confirmation is
    /// NOT reported as `#ApprovedByRelative`; the membership and confirmation
    /// state are left internally consistent.
    #ActivationFailed;
  };

  /// The SIMPLE relationship type used to qualify a confirmer. This is the only
  /// relationship value ever surfaced on a confirmation surface. Sensitive
  /// relationship context (Biological/Adoptive/Foster/Step/Guardian) is never
  /// represented here and is never exposed.
  public type SimpleRelationshipType = {
    #Parent;
    #Child;
    #Sibling;
    #SpousePartner;
  };

  /// Redacted, applicant-safe view of a confirmation case for the pending
  /// membership's own account. It carries only the derived case state, the
  /// caller's own decision (when the caller has decided), the simple
  /// relationship label that qualified the caller, and timestamps. It never
  /// carries a confirmer account principal, sensitive relationship context,
  /// private notes, or unrelated profile information.
  public type MembershipConfirmationApplicantView = {
    state : MembershipConfirmationState;
    myDecision : ?ConfirmationDecision;
    myRelationship : ?SimpleRelationshipType;
    myDecidedAt : ?Int;
    createdAt : ?Int;
    updatedAt : ?Int;
  };

  /// Privacy-safe, UI-facing view of a confirmation request the authenticated
  /// caller is currently eligible to act on (Onboarding Phase 1D-UI-AH).
  ///
  /// It is derived entirely server-side from the caller's own `#Active`
  /// `FamilyMembership` in `familyId`, the caller's `personId`, the confirmed
  /// relationships in `familyId`, and the target membership's state. It carries
  /// only what the confirmation card needs to render:
  ///
  /// - `familyId` — the family the request belongs to.
  /// - `membershipId` — the target membership the caller may act on.
  /// - `pendingPersonId` — the person the membership is for.
  /// - `displayName` — the pending person's family-safe display name.
  /// - `profilePhoto` — the pending person's profile photo reference, when set.
  /// - `birthYear` — the pending person's birth year, when known.
  /// - `simpleRelationship` — the SIMPLE relationship label that qualifies the
  ///   caller (Parent/Child, Sibling, SpousePartner).
  /// - `confirmationState` — the derived case state.
  ///
  /// It NEVER carries an applicant or confirmer account principal, raw
  /// relationship context, sensitive relationship metadata
  /// (Biological/Adoptive/Foster/Step/Guardian), private profile notes, or
  /// unrelated family data.
  public type EligibleMembershipConfirmationView = {
    familyId : FamilyId;
    membershipId : Nat;
    pendingPersonId : PersonId;
    displayName : Text;
    profilePhoto : ?Blob;
    birthYear : ?Nat;
    simpleRelationship : SimpleRelationshipType;
    confirmationState : MembershipConfirmationState;
  };

  /// One entry in a Steward-facing review case's confirmation/dispute history.
  ///
  /// It carries only the SIMPLE relationship label that qualified the confirmer
  /// and a server-resolved confirmer display name. It NEVER carries a confirmer
  /// account principal, a confirmer person id, a relationship id, or any
  /// sensitive relationship context (Biological/Adoptive/Foster/Step/Guardian).
  /// `decidedAt` is a nanosecond timestamp.
  public type MembershipConfirmationReviewHistoryEntry = {
    simpleRelationship : SimpleRelationshipType;
    confirmerDisplayName : Text;
    decision : ConfirmationDecision;
    decidedAt : Int;
  };

  /// Privacy-safe, Steward-facing view of an unresolved membership confirmation
  /// case that requires Steward review (Onboarding Phase 1D-UI-B1).
  ///
  /// It is derived entirely server-side from the requested family's memberships,
  /// the recorded confirmation decisions, the persisted Steward resolutions, the
  /// confirmed relationships in that family, and the family's person profiles.
  /// It carries only what a Steward review surface needs to render:
  ///
  /// - `familyId` — the family the case belongs to.
  /// - `membershipId` — the membership under review.
  /// - `pendingPersonId` — the person the membership is for.
  /// - `applicantDisplayName` — the pending person's family-safe display name.
  /// - `simpleRelationship` — the SIMPLE relationship label that qualifies the
  ///   most recent confirmer (Parent/Child, Sibling, SpousePartner).
  /// - `membershipStatus` — the membership's own lifecycle status.
  /// - `confirmationHistory` — the recorded decisions, each with a simple
  ///   relationship label, a server-resolved confirmer display name, the
  ///   decision, and the decision timestamp.
  /// - `confirmedCount` / `disputedCount` — the decision tallies.
  /// - `confirmationState` — the derived case state (`#StewardReviewRequired`
  ///   for a conflicting case, or `#RejectedByRelative` for a standalone
  ///   trusted-relative rejection/dispute).
  ///
  /// It NEVER carries an applicant or confirmer account principal, a confirmer
  /// person id, a relationship id, raw relationship context, sensitive
  /// relationship metadata (Biological/Adoptive/Foster/Step/Guardian), private
  /// profile notes, or unrelated family data.
  public type MembershipConfirmationReviewView = {
    familyId : FamilyId;
    membershipId : Nat;
    pendingPersonId : PersonId;
    applicantDisplayName : Text;
    simpleRelationship : SimpleRelationshipType;
    membershipStatus : MembershipTypes.MembershipStatus;
    confirmationHistory : [MembershipConfirmationReviewHistoryEntry];
    confirmedCount : Nat;
    disputedCount : Nat;
    confirmationState : MembershipConfirmationState;
  };

  /// Flattened, OQL-exposable view of a membership confirmation. Enumerated
  /// variants are rendered as their tag text; the optional `relationshipId`
  /// renders as `0` when absent. `rejectedByAccountId` renders as `""` and
  /// `rejectedAt` as `0` when the decision is not a standalone rejection. No
  /// sensitive relationship context is exposed.
  public type MembershipConfirmationRow = {
    familyId : Text;
    id : Nat;
    membershipId : Nat;
    pendingPersonId : Text;
    confirmerAccountId : Text;
    confirmerPersonId : Text;
    decision : Text;
    relationshipId : Nat;
    rejectedByAccountId : Text;
    rejectedAt : Int;
    createdAt : Int;
    updatedAt : Int;
  };
};

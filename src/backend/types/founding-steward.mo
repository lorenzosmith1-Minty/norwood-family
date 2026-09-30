import Principal "mo:core/Principal";
import OwnershipTypes "ownership";

/// Onboarding Phase 1B-2: Founding Steward decision types.
///
/// These types describe the family-scoped onboarding decision "Every family
/// needs a Steward. Would you like to start as the Family Steward?".
///
/// `FoundingStewardState` tracks onboarding PROGRESS ONLY. It is never a second
/// authorization system: `StewardRecord` (in `types/governance.mo`) remains the
/// single source of actual Steward authority. A family's onboarding state can
/// say `#NominationPending` while the founder already holds a temporary
/// `StewardRecord`, and it can say `#Transferred` while the founder is still an
/// active Steward — the state records where the onboarding conversation is, not
/// who may govern.
module {
  /// Identifier of a family in the multi-family tenancy model.
  public type FamilyId = Text;

  /// Identifier of a person in the family tree.
  public type PersonId = OwnershipTypes.PersonId;

  /// Family-scoped onboarding progress for the founding-Steward decision.
  ///
  /// - `#Undecided` — the family was just created and the founder has not yet
  ///   chosen to accept Stewardship or nominate someone else.
  /// - `#FounderAccepted` — the founder accepted founding Stewardship and an
  ///   active `StewardRecord` exists for them.
  /// - `#NominationPending` — the founder asked another family member to become
  ///   Steward; the founder holds a temporary founding `StewardRecord` while the
  ///   nomination is pending.
  /// - `#Transferred` — the nominee accepted and now holds an active
  ///   `StewardRecord`. The founder is NOT automatically removed; the final
  ///   transfer/co-Steward decision is a later explicit action.
  public type FoundingStewardState = {
    #Undecided;
    #FounderAccepted;
    #NominationPending;
    #Transferred;
  };

  /// Lifecycle of one founding-Steward nomination.
  ///
  /// - `#Pending` — awaiting the nominee's authenticated acceptance.
  /// - `#Accepted` — the nominee accepted and became an active Steward.
  /// - `#Declined` — the nominee declined; the founder remains Steward.
  /// - `#Cancelled` — the founder withdrew the nomination; the founder remains
  ///   Steward.
  public type FoundingStewardNominationStatus = {
    #Pending;
    #Accepted;
    #Declined;
    #Cancelled;
  };

  /// A persisted founding-Steward nomination. `familyId` is the tenant boundary:
  /// a nomination id alone never resolves across families, and a nomination in
  /// one family can never create or affect a StewardRecord in another.
  ///
  /// `nomineeAccountId` is present when the nominee profile is already claimed
  /// by an account; `nomineeEmail` is present when the founder supplied an email
  /// for an unclaimed nominee. Neither is used to send mail in this phase.
  public type FoundingStewardNomination = {
    id : Nat;
    familyId : FamilyId;
    founderAccountId : Principal;
    nomineePersonId : PersonId;
    nomineeAccountId : ?Principal;
    nomineeEmail : ?Text;
    status : FoundingStewardNominationStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  /// Read view of a family's founding-Steward onboarding progress: the current
  /// state plus the active (pending) nomination, when one exists.
  public type FoundingStewardStatus = {
    familyId : FamilyId;
    state : FoundingStewardState;
    activeNomination : ?FoundingStewardNomination;
  };

  /// Errors for the founding-Steward onboarding operations.
  public type FoundingStewardError = {
    #NotSignedIn;
    #FamilyNotFound;
    #NotAuthorized;
    #NotFounder;
    #AlreadySteward;
    #NominationNotFound;
    #InvalidTransition;
    #NomineeNotInFamily;
    #NomineeNotActiveMember;
    #InvalidInput;
  };
};

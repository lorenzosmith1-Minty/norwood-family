import Principal "mo:core/Principal";
import FamilyTypes "family";
import OwnershipTypes "ownership";
import MembershipTypes "family-membership";

/// Onboarding Phase 1B-1: zero-to-family creation types.
///
/// These types describe the canonical "start a brand-new family" transaction.
/// They reuse the existing `Family`, `PersonProfile`, and `FamilyMembership`
/// models rather than introducing a parallel family type, and they carry no
/// Stewardship concept: Steward selection is a later onboarding phase.
module {
  /// Minimal founder-profile input for the create-family transaction. Only
  /// fields the existing `PersonProfile` model already supports are accepted;
  /// `firstName` and `lastName` are required, every other field is optional.
  ///
  /// Parents, siblings, partner, and children are deliberately absent: those
  /// belong to later "Add Family Member" steps, not to family creation.
  public type FounderProfileInput = {
    firstName : Text;
    lastName : Text;
    middleName : ?Text;
    suffix : ?Text;
    preferredName : ?Text;
    birthDate : ?Text;
    birthYear : ?Text;
    birthplace : ?Text;
    currentLocation : ?Text;
  };

  /// The three linked records created by one successful create-family
  /// transaction, returned together so a later onboarding UI can continue.
  public type FamilyCreationResult = {
    family : FamilyTypes.Family;
    founderProfile : OwnershipTypes.PersonProfile;
    membership : MembershipTypes.FamilyMembership;
  };

  /// Errors for the create-family transaction. `#NotSignedIn` and `#InvalidInput`
  /// are raised before any stable collection is mutated; `#AlreadyMember` and
  /// `#ProfileAlreadyOwned` are the membership-model conflicts that can still
  /// arise during the atomic creation step.
  public type FamilyCreationError = {
    #NotSignedIn;
    #InvalidInput;
    #AlreadyMember;
    #ProfileAlreadyOwned;
  };
};

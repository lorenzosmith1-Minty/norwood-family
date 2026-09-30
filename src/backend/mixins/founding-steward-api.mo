import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import MembershipTypes "../types/family-membership";
import GovernanceTypes "../types/governance";
import FoundingTypes "../types/founding-steward";
import FoundingStewardLib "../lib/founding-steward";

/// Public API for the founding-Steward onboarding decision.
///
/// The onboarding model is: a family creator first creates the Family + founder
/// profile + Active FamilyMembership (`createFamilyWithFounder`), then chooses
/// whether to accept Stewardship or nominate another member. While a nomination
/// is pending the founder holds a temporary founding StewardRecord and retains
/// full governance authority. The nominee becomes Steward only after an
/// authenticated acceptance, and the founder is not automatically removed.
///
/// `StewardRecord` remains the single source of Steward authority; the
/// onboarding state tracked here is progress only.
mixin (
  families : Map.Map<FamilyTypes.FamilyId, FamilyTypes.Family>,
  foundingStewardStates : Map.Map<Text, FoundingTypes.FoundingStewardState>,
  foundingStewardNominations : List.List<FoundingTypes.FoundingStewardNomination>,
  foundingStewardState : { var nextNominationId : Nat },
  stewards : List.List<GovernanceTypes.StewardRecord>,
  memberships : List.List<MembershipTypes.FamilyMembership>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
) {
  /// Reads the founding-Steward onboarding status of `familyId`: the current
  /// state plus the active pending nomination, when one exists.
  public query ({ caller }) func getFoundingStewardStatusForFamily(familyId : Text) : async Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    if (caller.isAnonymous()) {
      return #err(#NotSignedIn);
    };
    if (families.get(familyId) == null) {
      return #err(#FamilyNotFound);
    };
    // Only the family founder or an active Steward of that family may read the
    // onboarding status.
    let isFounder = FoundingStewardLib.isFounderOfFamily(families, caller, familyId);
    let isSteward = FoundingStewardLib.isActiveStewardForFamily(stewards, caller, familyId);
    if (not (isFounder or isSteward)) {
      return #err(#NotAuthorized);
    };
    FoundingStewardLib.getStatusForFamily(families, foundingStewardStates, foundingStewardNominations, familyId);
  };

  /// The family founder accepts founding Stewardship for their own family.
  public shared ({ caller }) func acceptFoundingStewardship(familyId : Text) : async Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    FoundingStewardLib.acceptFoundingStewardship(
      families,
      foundingStewardStates,
      stewards,
      memberships,
      caller,
      familyId,
    );
  };

  /// The family founder nominates another member of their own family as
  /// founding Steward, optionally supplying an email for an unclaimed nominee.
  public shared ({ caller }) func nominateFoundingSteward(familyId : Text, nomineePersonId : Text, nomineeEmail : ?Text) : async Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    let result = FoundingStewardLib.nominateFoundingSteward(
      families,
      foundingStewardStates,
      foundingStewardNominations,
      stewards,
      memberships,
      profiles,
      claims,
      caller,
      familyId,
      nomineePersonId,
      nomineeEmail,
      foundingStewardState.nextNominationId,
    );
    // Advance the nomination-id counter only when a nomination was actually
    // stored, so a rejected call never consumes an id.
    switch (result) {
      case (#ok(_)) { foundingStewardState.nextNominationId += 1 };
      case (#err(_)) {};
    };
    result;
  };

  /// The authenticated nominee accepts a pending founding-Steward nomination.
  public shared ({ caller }) func acceptFoundingStewardNomination(familyId : Text, nominationId : Nat) : async Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    FoundingStewardLib.acceptFoundingStewardNomination(
      families,
      foundingStewardStates,
      foundingStewardNominations,
      stewards,
      memberships,
      profiles,
      caller,
      familyId,
      nominationId,
    );
  };

  /// The nominee declines a pending founding-Steward nomination.
  public shared ({ caller }) func declineFoundingStewardNomination(familyId : Text, nominationId : Nat) : async Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    FoundingStewardLib.declineFoundingStewardNomination(
      families,
      foundingStewardStates,
      foundingStewardNominations,
      memberships,
      profiles,
      caller,
      familyId,
      nominationId,
    );
  };

  /// The founder cancels a pending founding-Steward nomination.
  public shared ({ caller }) func cancelFoundingStewardNomination(familyId : Text, nominationId : Nat) : async Result.Result<FoundingTypes.FoundingStewardStatus, FoundingTypes.FoundingStewardError> {
    FoundingStewardLib.cancelFoundingStewardNomination(
      families,
      foundingStewardStates,
      foundingStewardNominations,
      caller,
      familyId,
      nominationId,
    );
  };
};

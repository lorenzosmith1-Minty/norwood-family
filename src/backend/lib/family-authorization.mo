import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import StewardAuthorityLib "steward-authority";

/// Shared approved-family authorization for family-content contribution
/// endpoints. A caller is an approved family member when they are a Family
/// Steward, or when they hold at least one `#Approved` profile claim.
module {
  /// The stable, non-technical message returned when a signed-in caller is not
  /// an approved Norwood family member. The frontend matches this exact text to
  /// show a definitive "family membership required" message (with the Add
  /// Myself / claim-profile action) instead of a generic retry message. It
  /// deliberately carries no principal, account, or other technical detail.
  public let FAMILY_MEMBERSHIP_REQUIRED_MESSAGE : Text =
    "Family membership required. Claim your family profile and wait for Family Steward approval before contributing family content.";

  /// The stable, non-technical message returned when the caller is not signed
  /// in at all. Kept distinct from the membership-required message so the
  /// frontend can prompt sign-in rather than profile claiming.
  public let SIGN_IN_REQUIRED_MESSAGE : Text = "Unauthorized: You must be signed in";

  /// Whether a denial message is the family-membership-required outcome, so a
  /// caller can distinguish it from an anonymous sign-in denial or an unrelated
  /// failure without parsing technical detail.
  public func isFamilyMembershipDenial(message : Text) : Bool {
    message == FAMILY_MEMBERSHIP_REQUIRED_MESSAGE;
  };

  /// Whether the caller is a Family Steward. Delegates to the canonical
  /// active-Steward check over the persisted `stewards` list; the platform
  /// admin role is never consulted.
  public func isSteward(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal,
  ) : Bool {
    StewardAuthorityLib.isActiveSteward(stewards, caller);
  };

  /// Whether the caller is an approved family member: they are a Family
  /// Steward, or they hold at least one approved profile claim. The platform
  /// admin role is never consulted.
  public func isApprovedFamilyMember(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) : Bool {
    if (isSteward(stewards, caller)) {
      return true;
    };
    claims.toArray().any(func c = c.requestingUserId == caller and c.status == #Approved);
  };

  /// Traps unless the caller is an approved family member. Anonymous callers
  /// and signed-in but unapproved callers are both denied. A signed-in but
  /// unapproved caller is denied with the stable, non-technical
  /// `FAMILY_MEMBERSHIP_REQUIRED_MESSAGE` so the frontend can present a
  /// definitive family-membership-required outcome rather than a generic retry.
  public func requireApprovedFamilyMember(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap(SIGN_IN_REQUIRED_MESSAGE);
    };
    if (not isApprovedFamilyMember(stewards, claims, caller)) {
      Runtime.trap(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE);
    };
  };

  /// Whether the caller may modify the photo gallery of `personId`. Allowed
  /// only for the approved owner of that claimed profile, or for a Family
  /// Steward acting on an unclaimed/historical profile. An approved family
  /// member who does not own the profile is denied, and a Family Steward may
  /// NOT modify a profile claimed by another user.
  public func canManagePersonPhotos(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    personId : OwnershipTypes.PersonId,
  ) : Bool {
    let isClaimedByOther = switch (profiles.get(personId)) {
      case (?profile) {
        switch (profile.claimedByUserId) {
          case (?owner) { owner != caller };
          case null { false };
        };
      };
      case null { false };
    };
    if (isClaimedByOther) {
      return false;
    };
    if (isSteward(stewards, caller)) {
      return true;
    };
    if (not isApprovedFamilyMember(stewards, claims, caller)) {
      return false;
    };
    switch (profiles.get(personId)) {
      case (?profile) {
        switch (profile.claimedByUserId) {
          case (?owner) { owner == caller };
          case null { false };
        };
      };
      case null { false };
    };
  };

  /// Traps unless the caller may modify the photo gallery of `personId`.
  /// Anonymous callers are denied first, then non-owners and non-stewards.
  public func requirePhotoMutationAuthority(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    personId : OwnershipTypes.PersonId,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not canManagePersonPhotos(stewards, profiles, claims, caller, personId)) {
      Runtime.trap("Unauthorized: Only the profile owner or a Family Steward can manage this profile's photos");
    };
  };

  /// Whether the caller may read the full photo gallery of `personId`: any
  /// approved family member or Family Steward.
  public func canViewPersonGallery(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) : Bool {
    isApprovedFamilyMember(stewards, claims, caller);
  };

  /// Traps unless the caller may read the full photo gallery of `personId`.
  public func requireGalleryReadAuthority(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not canViewPersonGallery(stewards, claims, caller)) {
      Runtime.trap("Unauthorized: Only approved family members can view a photo gallery");
    };
  };
};

import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import FamilyTypes "../types/family";
import StewardAuthorityLib "steward-authority";

/// Shared approved-family authorization for family-content contribution
/// endpoints. A caller is an approved family member when they are a Family
/// Steward of the family, or when they hold at least one `#Approved` profile
/// claim in that family.
///
/// Tenancy 1B: the family-scoped helpers below are the canonical source of
/// truth. The legacy single-family helpers are temporary compatibility
/// wrappers that delegate to them with `FamilyTypes.DEFAULT_FAMILY_ID`.
module {
  /// The stable, non-technical message returned when a signed-in caller is not
  /// an approved family member. The frontend matches this exact text to show a
  /// definitive "family membership required" message (with the Add Myself /
  /// claim-profile action) instead of a generic retry message. It deliberately
  /// carries no family id, principal, account, or other technical detail.
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

  /// Whether the caller is an active Steward of `familyId`. Delegates to the
  /// canonical family-scoped active-Steward check over the persisted
  /// `stewards` list; the platform admin role is never consulted.
  public func isStewardForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Whether the caller is an approved member of `familyId`: they are an
  /// active Steward of that family, or they hold at least one `#Approved`
  /// profile claim whose `requestingUserId` is the caller and whose `familyId`
  /// equals `familyId`. An approved claim in one family never grants
  /// membership in another. The platform admin role is never consulted.
  public func isApprovedFamilyMemberForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    if (isStewardForFamily(stewards, caller, familyId)) {
      return true;
    };
    claims.toArray().any(func c =
      c.requestingUserId == caller and c.status == #Approved and c.familyId == familyId
    );
  };

  /// Traps unless the caller is an approved member of `familyId`. Anonymous
  /// callers and signed-in but unapproved callers are both denied. A signed-in
  /// but unapproved caller is denied with the stable, non-technical
  /// `FAMILY_MEMBERSHIP_REQUIRED_MESSAGE` so the frontend can present a
  /// definitive family-membership-required outcome rather than a generic retry.
  public func requireApprovedFamilyMemberForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap(SIGN_IN_REQUIRED_MESSAGE);
    };
    if (not isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      Runtime.trap(FAMILY_MEMBERSHIP_REQUIRED_MESSAGE);
    };
  };

  /// Traps unless the caller is an active Steward of `familyId`, using the
  /// existing Steward-access denial behavior. The platform admin role is never
  /// consulted.
  public func requireActiveStewardForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap(SIGN_IN_REQUIRED_MESSAGE);
    };
    if (not isStewardForFamily(stewards, caller, familyId)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
  };

  /// Whether the caller may modify the photo gallery of `personId` in
  /// `familyId`. Allowed only when the target profile belongs to `familyId`,
  /// any ownership claim on it belongs to `familyId`, and the caller is the
  /// approved owner of that claimed profile or an active Steward of
  /// `familyId` acting on an unclaimed/historical profile. A Steward in one
  /// family cannot manage a profile in another, and a profile owner in one
  /// family gains no access to an identically keyed profile in another.
  public func canManagePersonPhotosForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    personId : OwnershipTypes.PersonId,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    let profile = switch (profiles.get(personId)) {
      case (?p) {
        if (p.familyId != familyId) {
          return false;
        };
        p;
      };
      case null { return false };
    };
    let isClaimedByOther = switch (profile.claimedByUserId) {
      case (?owner) { owner != caller };
      case null { false };
    };
    if (isClaimedByOther) {
      return false;
    };
    if (isStewardForFamily(stewards, caller, familyId)) {
      return true;
    };
    if (not isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      return false;
    };
    switch (profile.claimedByUserId) {
      case (?owner) { owner == caller };
      case null { false };
    };
  };

  /// Traps unless the caller may modify the photo gallery of `personId` in
  /// `familyId`. Anonymous callers are denied first, then non-owners and
  /// non-stewards.
  public func requirePhotoMutationAuthorityForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    personId : OwnershipTypes.PersonId,
    familyId : FamilyTypes.FamilyId,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap(SIGN_IN_REQUIRED_MESSAGE);
    };
    if (not canManagePersonPhotosForFamily(stewards, profiles, claims, caller, personId, familyId)) {
      Runtime.trap("Unauthorized: Only the profile owner or a Family Steward can manage this profile's photos");
    };
  };

  /// Whether the caller may read the full photo gallery of `personId` in
  /// `familyId`: any approved member or active Steward of that family.
  public func canViewPersonGalleryForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) : Bool {
    isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Traps unless the caller may read the full photo gallery of `personId` in
  /// `familyId`.
  public func requireGalleryReadAuthorityForFamily(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    familyId : FamilyTypes.FamilyId,
  ) {
    if (caller.isAnonymous()) {
      Runtime.trap(SIGN_IN_REQUIRED_MESSAGE);
    };
    if (not canViewPersonGalleryForFamily(stewards, claims, caller, familyId)) {
      Runtime.trap("Unauthorized: Only approved family members can view a photo gallery");
    };
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1B compatibility wrappers.
  //
  // Deprecated single-family forms: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. Tenancy 1C will migrate the
  // remaining application endpoints to the family-scoped helpers above.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1B compatibility wrapper for `isStewardForFamily`.
  public func isSteward(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    caller : Principal,
  ) : Bool {
    isStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper for
  /// `isApprovedFamilyMemberForFamily`.
  public func isApprovedFamilyMember(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) : Bool {
    isApprovedFamilyMemberForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper for
  /// `requireApprovedFamilyMemberForFamily`.
  public func requireApprovedFamilyMember(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) {
    requireApprovedFamilyMemberForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper for
  /// `canManagePersonPhotosForFamily`.
  public func canManagePersonPhotos(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    personId : OwnershipTypes.PersonId,
  ) : Bool {
    canManagePersonPhotosForFamily(stewards, profiles, claims, caller, personId, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper for
  /// `requirePhotoMutationAuthorityForFamily`.
  public func requirePhotoMutationAuthority(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
    personId : OwnershipTypes.PersonId,
  ) {
    requirePhotoMutationAuthorityForFamily(stewards, profiles, claims, caller, personId, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper for
  /// `canViewPersonGalleryForFamily`.
  public func canViewPersonGallery(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) : Bool {
    canViewPersonGalleryForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1B compatibility wrapper for
  /// `requireGalleryReadAuthorityForFamily`.
  public func requireGalleryReadAuthority(
    stewards : List.List<GovernanceTypes.StewardRecord>,
    claims : List.List<OwnershipTypes.ProfileClaim>,
    caller : Principal,
  ) {
    requireGalleryReadAuthorityForFamily(stewards, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };
};

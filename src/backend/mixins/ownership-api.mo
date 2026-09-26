import AccessControl "mo:caffeineai-authorization/access-control";
import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import Types "../types/ownership";
import FamilyTypes "../types/family";
import GovernanceTypes "../types/governance";
import OwnershipLib "../lib/ownership";
import FamilyAuthorizationLib "../lib/family-authorization";

/// Tenancy 1C-A family-scoped profile / claim / relationship public API.
///
/// Every endpoint takes the requested `familyId` explicitly and evaluates
/// authority and data access against it. Approved-member access uses
/// `isApprovedFamilyMemberForFamily`; Steward access uses
/// `isActiveStewardForFamily` / `requireActiveStewardForFamily`.
///
/// The legacy single-family endpoints are retained only as TEMPORARY Tenancy 1C
/// compatibility wrappers that delegate to the family-scoped implementation
/// with `FamilyTypes.DEFAULT_FAMILY_ID`; they contain no logic of their own.
mixin (
  accessControlState : AccessControl.AccessControlState,
  profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  claims : List.List<Types.ProfileClaim>,
  relationships : List.List<Types.Relationship>,
  relationshipRequests : List.List<Types.RelationshipRequest>,
  notifications : List.List<Types.Notification>,
  auditLog : List.List<GovernanceTypes.AuditEntry>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  // ---------------------------------------------------------------------------
  // Family-scoped profile reads
  // ---------------------------------------------------------------------------

  /// Returns the ownership/lifecycle state of a person profile in `familyId`,
  /// or `null` when the person is not tracked in that family. A personId in
  /// Family A never returns a profile from Family B.
  public query func getPersonProfileForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : async ?Types.PersonProfile {
    OwnershipLib.getProfileForFamily(profiles, familyId, personId);
  };

  /// Returns the signed-in caller's own linked/claimed Person Profile in
  /// `familyId`, or their pending profile in that family, or `null` when the
  /// caller has no profile in `familyId`.
  public query ({ caller }) func getMyProfileForFamily(familyId : FamilyTypes.FamilyId) : async ?Types.PersonProfile {
    OwnershipLib.getMyProfileForFamily(profiles, claims, caller, familyId);
  };

  /// Lists the profiles of `familyId` for Explore Family / Person Profile
  /// hydration. Requires an approved member or active Steward of `familyId`.
  public query ({ caller }) func listProfilesForFamily(familyId : FamilyTypes.FamilyId) : async [Types.PersonProfile] {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    OwnershipLib.listProfilesForFamily(profiles, familyId);
  };

  /// Public claim-discovery read: minimal profile data for `familyId` only,
  /// preserving the existing minimal-data behavior.
  public query func listClaimDiscoveryProfilesForFamily(familyId : FamilyTypes.FamilyId) : async [Types.PersonProfile] {
    OwnershipLib.listClaimDiscoveryProfilesForFamily(profiles, familyId);
  };

  // ---------------------------------------------------------------------------
  // Family-scoped profile claims
  // ---------------------------------------------------------------------------

  /// "This is Me": creates a pending profile claim for an unclaimed living
  /// profile in `familyId`. Requires sign-in; does not grant ownership until
  /// approved. The claim belongs to exactly `familyId`.
  public shared ({ caller }) func requestProfileClaimForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : async Result.Result<Types.ProfileClaim, Types.ClaimError> {
    OwnershipLib.requestClaimForFamily(profiles, claims, notifications, familyId, personId, caller);
  };

  /// Lists the profile claim requests of `familyId` for the Steward review
  /// area. Steward of `familyId` only.
  public query ({ caller }) func listProfileClaimsForFamily(familyId : FamilyTypes.FamilyId) : async [Types.ProfileClaim] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.listClaimsForFamily(claims, familyId);
  };

  /// Returns the caller's own claim on a specific profile in `familyId`, or
  /// `null` when the caller has no claim on that profile in that family. No
  /// cross-family claim lookup by personId alone.
  public query ({ caller }) func getMyProfileClaimForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : async ?Types.ProfileClaim {
    OwnershipLib.getMyClaimForFamily(claims, familyId, personId, caller);
  };

  /// Approves a pending profile claim in `familyId`. Steward of `familyId`
  /// only.
  public shared ({ caller }) func approveProfileClaimForFamily(familyId : FamilyTypes.FamilyId, claimId : Nat) : async ?Types.ProfileClaim {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.approveClaimForFamily(profiles, claims, notifications, auditLog, familyId, claimId, caller);
  };

  /// Rejects a pending profile claim in `familyId`. Steward of `familyId` only.
  public shared ({ caller }) func rejectProfileClaimForFamily(familyId : FamilyTypes.FamilyId, claimId : Nat) : async ?Types.ProfileClaim {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.rejectClaimForFamily(claims, notifications, auditLog, familyId, claimId, caller);
  };

  /// Searches the authoritative shared profile data of `familyId` for possible
  /// duplicate matches by name. Only profiles belonging to `familyId` are
  /// considered.
  public query func searchPossibleMatchesForFamily(familyId : FamilyTypes.FamilyId, name : Text) : async [Types.PersonMatch] {
    OwnershipLib.searchMatchesForFamily(profiles, relationships, familyId, name);
  };

  /// "Add Myself to This Family": creates a minimal person profile in
  /// `familyId` for a user who does not already exist there.
  public shared ({ caller }) func createMyselfForFamily(familyId : FamilyTypes.FamilyId, name : Text) : async Result.Result<Types.PersonProfile, Types.CreateError> {
    OwnershipLib.createMyselfForFamily(profiles, claims, notifications, familyId, name, caller);
  };

  // ---------------------------------------------------------------------------
  // Family-scoped relationships
  // ---------------------------------------------------------------------------

  /// Proposes a new relationship between two people in `familyId`. Both
  /// referenced people must belong to `familyId`.
  public shared ({ caller }) func proposeRelationshipForFamily(
    familyId : FamilyTypes.FamilyId,
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
  ) : async Result.Result<Types.RelationshipRequest, Types.RelationshipError> {
    OwnershipLib.proposeRelationshipForFamily(profiles, relationships, relationshipRequests, notifications, familyId, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// Lists the relationship requests of `familyId` for the Steward review area.
  /// Steward of `familyId` only.
  public query ({ caller }) func listRelationshipRequestsForFamily(familyId : FamilyTypes.FamilyId) : async [Types.RelationshipRequest] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.listRelationshipRequestsForFamily(relationshipRequests, familyId);
  };

  /// Returns the signed-in caller's own pending relationship requests in
  /// `familyId` — those involving a profile the caller owns or created in that
  /// family.
  public query ({ caller }) func getMyRelationshipRequestsForFamily(familyId : FamilyTypes.FamilyId) : async [Types.RelationshipRequest] {
    OwnershipLib.getMyRelationshipRequestsForFamily(profiles, relationshipRequests, caller, familyId);
  };

  /// Approves a relationship request in `familyId`. Steward of `familyId` only.
  public shared ({ caller }) func approveRelationshipRequestForFamily(familyId : FamilyTypes.FamilyId, requestId : Nat) : async ?Types.RelationshipRequest {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.approveRelationshipForFamily(profiles, relationships, relationshipRequests, notifications, auditLog, familyId, requestId, caller);
  };

  /// Rejects a relationship request in `familyId`. Steward of `familyId` only.
  public shared ({ caller }) func rejectRelationshipRequestForFamily(familyId : FamilyTypes.FamilyId, requestId : Nat) : async ?Types.RelationshipRequest {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.rejectRelationshipForFamily(profiles, relationshipRequests, notifications, auditLog, familyId, requestId, caller);
  };

  /// Returns a relationship request in `familyId` to pending state. Steward of
  /// `familyId` only.
  public shared ({ caller }) func setRelationshipRequestPendingForFamily(familyId : FamilyTypes.FamilyId, requestId : Nat) : async ?Types.RelationshipRequest {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.setRelationshipPendingForFamily(relationshipRequests, auditLog, familyId, requestId, caller);
  };

  /// Updates an approved owner's own living profile fields in `familyId`, or,
  /// for a Steward of `familyId`, the fields of an unclaimed/historical profile
  /// in that family.
  public shared ({ caller }) func updateOwnProfileForFamily(
    familyId : FamilyTypes.FamilyId,
    personId : Types.PersonId,
    edits : Types.ProfileEdits,
  ) : async Result.Result<Types.PersonProfile, Types.EditError> {
    let isSteward = FamilyAuthorizationLib.isStewardForFamily(stewards, caller, familyId);
    OwnershipLib.updateOwnProfileForFamily(profiles, familyId, personId, caller, isSteward, edits);
  };

  /// Removes a duplicate test-created profile in `familyId`. Steward of
  /// `familyId` only.
  public shared ({ caller }) func removeDuplicateProfileForFamily(familyId : FamilyTypes.FamilyId, personId : Types.PersonId) : async Result.Result<(), Types.RemoveError> {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
    OwnershipLib.removeDuplicateProfileForFamily(profiles, claims, relationshipRequests, notifications, familyId, personId, caller);
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no logic of
  // their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getPersonProfileForFamily`.
  public query func getPersonProfile(personId : Types.PersonId) : async ?Types.PersonProfile {
    OwnershipLib.getProfileForFamily(profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getMyProfileForFamily`.
  public query ({ caller }) func getMyProfile() : async ?Types.PersonProfile {
    OwnershipLib.getMyProfileForFamily(profiles, claims, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `requestProfileClaimForFamily`.
  public shared ({ caller }) func requestProfileClaim(personId : Types.PersonId) : async Result.Result<Types.ProfileClaim, Types.ClaimError> {
    OwnershipLib.requestClaimForFamily(profiles, claims, notifications, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listProfileClaimsForFamily`.
  public query ({ caller }) func listProfileClaims() : async [Types.ProfileClaim] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.listClaimsForFamily(claims, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getMyProfileClaimForFamily`.
  public query ({ caller }) func getMyProfileClaim(personId : Types.PersonId) : async ?Types.ProfileClaim {
    OwnershipLib.getMyClaimForFamily(claims, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `approveProfileClaimForFamily`.
  public shared ({ caller }) func approveProfileClaim(claimId : Nat) : async ?Types.ProfileClaim {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.approveClaimForFamily(profiles, claims, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, claimId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `rejectProfileClaimForFamily`.
  public shared ({ caller }) func rejectProfileClaim(claimId : Nat) : async ?Types.ProfileClaim {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.rejectClaimForFamily(claims, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, claimId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `searchPossibleMatchesForFamily`.
  public query func searchPossibleMatches(name : Text) : async [Types.PersonMatch] {
    OwnershipLib.searchMatchesForFamily(profiles, relationships, FamilyTypes.DEFAULT_FAMILY_ID, name);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `createMyselfForFamily`.
  public shared ({ caller }) func createMyself(name : Text) : async Result.Result<Types.PersonProfile, Types.CreateError> {
    OwnershipLib.createMyselfForFamily(profiles, claims, notifications, FamilyTypes.DEFAULT_FAMILY_ID, name, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `proposeRelationshipForFamily`.
  public shared ({ caller }) func proposeRelationship(
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
  ) : async Result.Result<Types.RelationshipRequest, Types.RelationshipError> {
    OwnershipLib.proposeRelationshipForFamily(profiles, relationships, relationshipRequests, notifications, FamilyTypes.DEFAULT_FAMILY_ID, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listRelationshipRequestsForFamily`.
  public query ({ caller }) func listRelationshipRequests() : async [Types.RelationshipRequest] {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.listRelationshipRequestsForFamily(relationshipRequests, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `getMyRelationshipRequestsForFamily`.
  public query ({ caller }) func getMyRelationshipRequests() : async [Types.RelationshipRequest] {
    OwnershipLib.getMyRelationshipRequestsForFamily(profiles, relationshipRequests, caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `approveRelationshipRequestForFamily`.
  public shared ({ caller }) func approveRelationshipRequest(requestId : Nat) : async ?Types.RelationshipRequest {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.approveRelationshipForFamily(profiles, relationships, relationshipRequests, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `rejectRelationshipRequestForFamily`.
  public shared ({ caller }) func rejectRelationshipRequest(requestId : Nat) : async ?Types.RelationshipRequest {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.rejectRelationshipForFamily(profiles, relationshipRequests, notifications, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `setRelationshipRequestPendingForFamily`.
  public shared ({ caller }) func setRelationshipRequestPending(requestId : Nat) : async ?Types.RelationshipRequest {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.setRelationshipPendingForFamily(relationshipRequests, auditLog, FamilyTypes.DEFAULT_FAMILY_ID, requestId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `updateOwnProfileForFamily`.
  public shared ({ caller }) func updateOwnProfile(
    personId : Types.PersonId,
    edits : Types.ProfileEdits,
  ) : async Result.Result<Types.PersonProfile, Types.EditError> {
    let isSteward = FamilyAuthorizationLib.isStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.updateOwnProfileForFamily(profiles, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller, isSteward, edits);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `removeDuplicateProfileForFamily`.
  public shared ({ caller }) func removeDuplicateProfile(personId : Types.PersonId) : async Result.Result<(), Types.RemoveError> {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, FamilyTypes.DEFAULT_FAMILY_ID);
    OwnershipLib.removeDuplicateProfileForFamily(profiles, claims, relationshipRequests, notifications, FamilyTypes.DEFAULT_FAMILY_ID, personId, caller);
  };

  // The TEMPORARY Tenancy 1C `listNotifications` compatibility wrapper lives in
  // `mixins/notifications-scope-api.mo`, the canonical owner of the
  // family-scoped Notification API. It is not declared here, so exactly one
  // implementation of the endpoint exists.
};

import AccessControl "mo:caffeineai-authorization/access-control";
import List "mo:core/List";
import Map "mo:core/Map";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Types "../types/ownership";
import GovernanceTypes "../types/governance";
import OwnershipLib "../lib/ownership";

mixin (
  accessControlState : AccessControl.AccessControlState,
  profiles : Map.Map<Types.PersonId, Types.PersonProfile>,
  claims : List.List<Types.ProfileClaim>,
  relationships : List.List<Types.Relationship>,
  relationshipRequests : List.List<Types.RelationshipRequest>,
  notifications : List.List<Types.Notification>,
  auditLog : List.List<GovernanceTypes.AuditEntry>,
) {
  /// Returns the ownership/lifecycle state of a person profile, or `null` when
  /// the person is not tracked.
  public query func getPersonProfile(personId : Types.PersonId) : async ?Types.PersonProfile {
    OwnershipLib.getProfile(profiles, personId);
  };

  /// "This is Me": creates a pending profile claim for an unclaimed living
  /// profile. Requires sign-in; does not grant ownership until approved.
  public shared ({ caller }) func requestProfileClaim(personId : Types.PersonId) : async Result.Result<Types.ProfileClaim, Types.ClaimError> {
    OwnershipLib.requestClaim(profiles, claims, notifications, personId, caller);
  };

  /// Lists all profile claim requests for the Family Steward review area.
  public query ({ caller }) func listProfileClaims() : async [Types.ProfileClaim] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list profile claims");
    };
    OwnershipLib.listClaims(claims);
  };

  /// Returns the current caller's own claim on a specific profile, or `null`
  /// when the caller has no claim on that profile. Not gated to admin — any
  /// signed-in caller may query their own claim.
  public query ({ caller }) func getMyProfileClaim(personId : Types.PersonId) : async ?Types.ProfileClaim {
    OwnershipLib.getMyClaim(claims, personId, caller);
  };

  /// Returns the signed-in caller's own linked/claimed Person Profile, or, when
  /// none is linked, the caller's pending profile (created via `createMyself` or
  /// with a pending claim by the caller). Returns `null` when the caller has no
  /// profile. Not gated to admin — any signed-in caller may query their own
  /// profile.
  public query ({ caller }) func getMyProfile() : async ?Types.PersonProfile {
    OwnershipLib.getMyProfile(profiles, claims, caller);
  };

  /// Returns the signed-in caller's own pending relationship requests (requests
  /// involving a profile the caller owns or created). Not gated to admin — any
  /// signed-in caller may query their own pending relationship state.
  public query ({ caller }) func getMyRelationshipRequests() : async [Types.RelationshipRequest] {
    OwnershipLib.getMyRelationshipRequests(profiles, relationshipRequests, caller);
  };

  /// Approves a pending profile claim, marking the profile claimed and
  /// associating it with the requesting user. Family Steward only.
  public shared ({ caller }) func approveProfileClaim(claimId : Nat) : async ?Types.ProfileClaim {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve profile claims");
    };
    OwnershipLib.approveClaim(profiles, claims, notifications, auditLog, claimId, caller);
  };

  /// Rejects a pending profile claim. Family Steward only.
  public shared ({ caller }) func rejectProfileClaim(claimId : Nat) : async ?Types.ProfileClaim {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject profile claims");
    };
    OwnershipLib.rejectClaim(claims, notifications, auditLog, claimId, caller);
  };

  /// Searches the authoritative shared profile data for possible duplicate
  /// matches by name, returning name plus parents when known. Names are
  /// normalized before matching (case-insensitive, punctuation ignored, periods
  /// normalized, extra spaces collapsed, suffix variants recognized, partial/
  /// fuzzy allowed).
  public query func searchPossibleMatches(name : Text) : async [Types.PersonMatch] {
    OwnershipLib.searchMatches(profiles, relationships, name);
  };

  /// "Add Myself to This Family": creates a minimal person profile for a user
  /// who does not already exist. The user must then connect to an existing
  /// family member via a relationship request.
  public shared ({ caller }) func createMyself(name : Text) : async Result.Result<Types.PersonProfile, Types.CreateError> {
    OwnershipLib.createMyself(profiles, notifications, name, caller);
  };

  /// Proposes a new relationship between two people. The request starts pending
  /// and is never treated as confirmed until a Family Steward approves it.
  public shared ({ caller }) func proposeRelationship(
    fromPersonId : Types.PersonId,
    toPersonId : Types.PersonId,
    relationshipType : Types.RelationshipType,
  ) : async Result.Result<Types.RelationshipRequest, Types.RelationshipError> {
    OwnershipLib.proposeRelationship(profiles, relationships, relationshipRequests, notifications, fromPersonId, toPersonId, relationshipType, caller);
  };

  /// Lists all relationship requests for the Family Steward review area.
  public query ({ caller }) func listRelationshipRequests() : async [Types.RelationshipRequest] {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can list relationship requests");
    };
    OwnershipLib.listRelationshipRequests(relationshipRequests);
  };

  /// Approves a relationship request, adding/confirming the relationship in the
  /// shared family graph. Family Steward only.
  public shared ({ caller }) func approveRelationshipRequest(requestId : Nat) : async ?Types.RelationshipRequest {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can approve relationship requests");
    };
    OwnershipLib.approveRelationship(profiles, relationships, relationshipRequests, notifications, auditLog, requestId, caller);
  };

  /// Rejects a relationship request. Family Steward only.
  public shared ({ caller }) func rejectRelationshipRequest(requestId : Nat) : async ?Types.RelationshipRequest {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can reject relationship requests");
    };
    OwnershipLib.rejectRelationship(profiles, relationshipRequests, notifications, auditLog, requestId, caller);
  };

  /// Returns a relationship request to pending state. Family Steward only.
  public shared ({ caller }) func setRelationshipRequestPending(requestId : Nat) : async ?Types.RelationshipRequest {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can set relationship requests pending");
    };
    OwnershipLib.setRelationshipPending(relationshipRequests, auditLog, requestId, caller);
  };

  /// Updates an approved owner's own living profile fields. Never rewrites
  /// family relationships directly.
  public shared ({ caller }) func updateOwnProfile(
    personId : Types.PersonId,
    edits : Types.ProfileEdits,
  ) : async Result.Result<Types.PersonProfile, Types.EditError> {
    OwnershipLib.updateOwnProfile(profiles, personId, caller, edits);
  };

  /// Lists in-app notification records for the signed-in caller.
  public query ({ caller }) func listNotifications() : async [Types.Notification] {
    OwnershipLib.listNotifications(notifications, caller);
  };

  /// Removes a duplicate test-created profile and any pending relationship
  /// requests or claims tied only to it, preserving the original profile, the
  /// confirmed family graph, and the signed-in account. Family Steward only.
  public shared ({ caller }) func removeDuplicateProfile(personId : Types.PersonId) : async Result.Result<(), Types.RemoveError> {
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can remove duplicate profiles");
    };
    OwnershipLib.removeDuplicateProfile(profiles, claims, relationshipRequests, notifications, personId, caller);
  };
};

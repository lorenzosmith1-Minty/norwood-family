import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1C-1: FamilyInvitation foundation.
  //
  // Introduces the persisted invitation list and the invitation-id counter.
  // A `FamilyInvitation` is a secure onboarding TRANSPORT record: it carries a
  // one-time invite token (stored only as a hash) that lets an invited person
  // reach the onboarding flow for one family and one target person profile.
  //
  // It is separate from PersonProfile, ProfileClaim, FamilyMembership,
  // StewardRecord, and FoundingStewardNomination. An invitation never grants
  // family access by itself; acceptance only establishes the connection to
  // onboarding (at most a `#Pending` FamilyMembership).
  //
  // The new collections start empty. This migration is a no-op for existing
  // data: the default Norwood family is never initialized into invitation
  // state, and its existing StewardRecords, memberships, profiles, claims, and
  // nominations are not read, reseeded, migrated, reset, or renamed. Every
  // pre-existing stable collection carries through unchanged.
  // ---------------------------------------------------------------------------

  // Subset form: only the new stable fields are declared; every other
  // pre-existing stable collection carries through unchanged. `OldActor` is the
  // `NewActor` of the preceding migration (20261004_000000.mo), which is `{}`
  // in subset form because that migration declared only its own new fields.
  type OldActor = {};

  type InvitationType = {
    #FamilyMember;
    #FoundingSteward;
  };

  type InvitationStatus = {
    #Pending;
    #Accepted;
    #Declined;
    #Cancelled;
    #Expired;
  };

  type FamilyInvitation = {
    id : Nat;
    familyId : Text;
    personId : Text;
    invitedEmail : ?Text;
    invitedByAccountId : Principal;
    invitedByPersonId : ?Text;
    invitationType : InvitationType;
    tokenHash : Text;
    status : InvitationStatus;
    createdAt : Int;
    expiresAt : Int;
    acceptedAt : ?Int;
    acceptedByAccountId : ?Principal;
    cancelledAt : ?Int;
  };

  type NewActor = {
    invitations : List.List<FamilyInvitation>;
    invitationState : { var nextInvitationId : Nat };
  };

  public func migration(_old : OldActor) : NewActor {
    {
      invitations = List.empty();
      invitationState = { var nextInvitationId = 0 };
    };
  };
};

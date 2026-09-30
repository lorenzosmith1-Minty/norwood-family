import List "mo:core/List";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1D: trusted-relative MembershipConfirmation foundation.
  //
  // Introduces the persisted confirmation list and the persisted Steward
  // resolution list. A `MembershipConfirmation` is a trusted relative's decision
  // about a `#Pending` FamilyMembership. A
  // `MembershipConfirmationResolutionRecord` is a Family Steward's resolution of
  // an escalated case; it makes `MembershipConfirmationState.#ResolvedBySteward`
  // reachable. Both are separate from FamilyMembership, ProfileClaim,
  // StewardRecord, and FamilyInvitation, and neither stores sensitive
  // relationship context.
  //
  // The new collections start empty. This migration is a no-op for existing
  // data: the default Norwood family is never initialized into confirmation
  // state, and its existing StewardRecords, memberships, profiles, claims,
  // invitations, and nominations are not read, reseeded, migrated, reset, or
  // renamed. Every pre-existing stable collection carries through unchanged.
  // ---------------------------------------------------------------------------

  // Subset form: only the new stable fields are declared; every other
  // pre-existing stable collection carries through unchanged. `OldActor` is the
  // `NewActor` of the preceding migration (20261005_000000.mo), which is `{}`
  // in subset form because that migration declared only its own new fields.
  type OldActor = {};

  type ConfirmationDecision = {
    #Confirmed;
    #Disputed;
  };

  type MembershipConfirmation = {
    id : Nat;
    familyId : Text;
    membershipId : Nat;
    pendingPersonId : Text;
    confirmerAccountId : Principal;
    confirmerPersonId : Text;
    decision : ConfirmationDecision;
    relationshipId : ?Nat;
    createdAt : Int;
    updatedAt : Int;
  };

  type MembershipConfirmationResolution = {
    #Approve;
    #Reject;
    #NeedsMoreInformation;
  };

  type MembershipConfirmationResolutionRecord = {
    familyId : Text;
    membershipId : Nat;
    resolution : MembershipConfirmationResolution;
    resolvedByAccountId : Principal;
    resolvedAt : Int;
  };

  type NewActor = {
    confirmations : List.List<MembershipConfirmation>;
    stewardResolutions : List.List<MembershipConfirmationResolutionRecord>;
  };

  public func migration(_old : OldActor) : NewActor {
    {
      confirmations = List.empty();
      stewardResolutions = List.empty();
    };
  };
};

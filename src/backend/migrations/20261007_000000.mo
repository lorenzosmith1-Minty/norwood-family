import List "mo:core/List";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1D-A: explicit standalone trusted-relative rejection.
  //
  // Adds two additive fields to every persisted `MembershipConfirmation`:
  //
  //   rejectedByAccountId : ?Principal
  //   rejectedAt          : ?Int
  //
  // They are the explicit persisted representation of a standalone
  // trusted-relative rejection/dispute, distinct from the Steward resolution
  // record. Existing confirmations are carried through unchanged: a `#Disputed`
  // record is backfilled with its own confirmer account and `updatedAt` as the
  // rejection time; a `#Confirmed` record is backfilled with `null`/`null`.
  //
  // This migration is additive only. No existing family, member, profile,
  // relationship, invitation, notification, confirmation, or Steward resolution
  // data is read, reseeded, migrated, reset, or renamed. The `stewardResolutions`
  // collection is untouched and carries through unchanged (subset form).
  // ---------------------------------------------------------------------------

  // Subset form: only the changed stable field is declared; every other
  // pre-existing stable collection carries through unchanged. `OldActor` is the
  // `NewActor` of the preceding migration (20261006_000000.mo), which declared
  // `confirmations` and `stewardResolutions`; only `confirmations` changes here.
  type OldConfirmationDecision = {
    #Confirmed;
    #Disputed;
  };

  type OldMembershipConfirmation = {
    id : Nat;
    familyId : Text;
    membershipId : Nat;
    pendingPersonId : Text;
    confirmerAccountId : Principal;
    confirmerPersonId : Text;
    decision : OldConfirmationDecision;
    relationshipId : ?Nat;
    createdAt : Int;
    updatedAt : Int;
  };

  type NewMembershipConfirmation = {
    id : Nat;
    familyId : Text;
    membershipId : Nat;
    pendingPersonId : Text;
    confirmerAccountId : Principal;
    confirmerPersonId : Text;
    decision : OldConfirmationDecision;
    relationshipId : ?Nat;
    rejectedByAccountId : ?Principal;
    rejectedAt : ?Int;
    createdAt : Int;
    updatedAt : Int;
  };

  type OldActor = {
    confirmations : List.List<OldMembershipConfirmation>;
  };

  type NewActor = {
    confirmations : List.List<NewMembershipConfirmation>;
  };

  public func migration(old : OldActor) : NewActor {
    let confirmations = old.confirmations.map<OldMembershipConfirmation, NewMembershipConfirmation>(
      func(c) {
        {
          id = c.id;
          familyId = c.familyId;
          membershipId = c.membershipId;
          pendingPersonId = c.pendingPersonId;
          confirmerAccountId = c.confirmerAccountId;
          confirmerPersonId = c.confirmerPersonId;
          decision = c.decision;
          relationshipId = c.relationshipId;
          rejectedByAccountId = switch (c.decision) { case (#Disputed) ?c.confirmerAccountId; case (#Confirmed) null };
          rejectedAt = switch (c.decision) { case (#Disputed) ?c.updatedAt; case (#Confirmed) null };
          createdAt = c.createdAt;
          updatedAt = c.updatedAt;
        };
      },
    );
    { confirmations };
  };
};

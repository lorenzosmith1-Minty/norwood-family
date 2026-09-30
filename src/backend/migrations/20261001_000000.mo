import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1A: FamilyMembership foundation.
  //
  // Introduces the `memberships` stable list — the canonical account-to-family
  // membership layer — and backfills one `#Active` membership for every
  // `#Approved` ProfileClaim in the default family ("norwood"). The backfill is
  // idempotent: it runs once per upgrade, and a repeated upgrade starts from an
  // empty `memberships` list, so no duplicate membership is ever created.
  //
  // ProfileClaim records, Steward records, profile ids, relationships, and every
  // other stable collection are preserved unchanged — `claims` is read only and
  // carried through untouched.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type ProfileClaimStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type OldProfileClaim = {
    familyId : Text;
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    status : ProfileClaimStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type MembershipStatus = {
    #Pending;
    #Active;
    #Suspended;
    #Left;
  };

  type NewFamilyMembership = {
    id : Nat;
    familyId : FamilyId;
    accountId : Principal;
    personId : Text;
    status : MembershipStatus;
    joinedAt : ?Int;
    approvedBy : ?Principal;
    approvedAt : ?Int;
    createdAt : Int;
    updatedAt : Int;
  };

  // Subset form: `claims` is read to backfill memberships and is passed through
  // unchanged; `memberships` is the new stable collection. Every other
  // pre-existing stable collection carries through unchanged.
  type OldActor = {
    claims : List.List<OldProfileClaim>;
  };

  type NewActor = {
    claims : List.List<OldProfileClaim>;
    memberships : List.List<NewFamilyMembership>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let memberships = List.empty<NewFamilyMembership>();
    var nextId = 0;
    for (claim in old.claims.toArray().values()) {
      // Only approved claims in the default family become active memberships.
      // The default family is the legacy family: a claim approved before
      // tenancy may carry an empty `familyId` rather than "norwood", so both
      // forms are accepted here, matching the existing approved-membership
      // predicate.
      let inDefaultFamily = claim.familyId == defaultFamilyId or claim.familyId == "";
      if (claim.status == #Approved and inDefaultFamily) {
        memberships.add({
          id = nextId;
          familyId = defaultFamilyId;
          accountId = claim.requestingUserId;
          personId = claim.personId;
          status = #Active;
          joinedAt = ?claim.submittedDate;
          approvedBy = claim.reviewedBy;
          approvedAt = claim.reviewedDate;
          createdAt = claim.submittedDate;
          updatedAt = claim.reviewedDate ?? claim.submittedDate;
        });
        nextId += 1;
      };
    };
    { claims = old.claims; memberships };
  };
};

import List "mo:core/List";
import Principal "mo:core/Principal";
import Set "mo:core/Set";

module {
  // ---------------------------------------------------------------------------
  // Onboarding Phase 1A-H: FamilyMembership invariant hardening.
  //
  // The Phase 1A migration (20261001_000000.mo) backfilled one `#Active`
  // membership per approved default-family ProfileClaim without enforcing the
  // membership uniqueness invariants. Historical ProfileClaim data is not
  // assumed to be perfect: two approved claims can share the same account, and
  // two approved claims can share the same person. This migration enforces:
  //
  //   A. at most one `#Active` membership per (familyId, accountId)
  //   B. at most one `#Active` membership per (familyId, personId)
  //
  // DETERMINISTIC CONFLICT RULE
  // ---------------------------
  // The migration is a single pass over the existing `memberships` list in its
  // stored order, which is ascending membership `id` (the Phase 1A backfill
  // assigned ids sequentially in ascending claim-id order). Two seen-sets track
  // the account and person slots already claimed by an admitted `#Active`
  // membership:
  //
  //   - the FIRST `#Active` membership for a given (familyId, accountId) wins
  //     the account slot;
  //   - the FIRST `#Active` membership for a given (familyId, personId) wins
  //     the person slot;
  //   - a later `#Active` membership that collides on EITHER key is dropped
  //     (no record is emitted for it).
  //
  // A membership is admitted only when BOTH its accountId and personId are
  // unseen for its familyId. Non-`#Active` memberships (`#Pending`,
  // `#Suspended`, `#Left`) are never deduped and are always preserved, since
  // the invariants constrain only Active memberships.
  //
  // PRESERVATION
  // ------------
  // Every admitted membership keeps its original `id` and every field
  // unchanged. ProfileClaims, Steward records, profiles, relationships, ids,
  // and media are not touched: `claims` is read only and carried through
  // untouched, and every other stable collection carries through unchanged.
  //
  // IDEMPOTENCE
  // -----------
  // The migration starts from an empty output list on each upgrade and derives
  // the deduped list solely from the input, so a repeated upgrade produces the
  // same single membership per key and never duplicates a record.
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

  type FamilyMembership = {
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

  // Subset form: `memberships` is read and deduped; `claims` is read only and
  // passed through unchanged. Every other pre-existing stable collection
  // carries through unchanged.
  type OldActor = {
    claims : List.List<OldProfileClaim>;
    memberships : List.List<FamilyMembership>;
  };

  type NewActor = {
    claims : List.List<OldProfileClaim>;
    memberships : List.List<FamilyMembership>;
  };

  /// Family-qualified key for the account slot: familyId + "::" + accountId.
  func accountKey(familyId : FamilyId, accountId : Principal) : Text {
    familyId # "::" # accountId.toText();
  };

  /// Family-qualified key for the person slot: familyId + "::" + personId.
  func personKey(familyId : FamilyId, personId : Text) : Text {
    familyId # "::" # personId;
  };

  public func migration(old : OldActor) : NewActor {
    let memberships = List.empty<FamilyMembership>();
    let seenAccounts = Set.empty<Text>();
    let seenPersons = Set.empty<Text>();
    for (membership in old.memberships.toArray().values()) {
      switch (membership.status) {
        case (#Active) {
          let aKey = accountKey(membership.familyId, membership.accountId);
          let pKey = personKey(membership.familyId, membership.personId);
          // Admit only when BOTH slots are still free; otherwise this Active
          // membership is a duplicate and is dropped.
          if (not seenAccounts.contains(aKey) and not seenPersons.contains(pKey)) {
            seenAccounts.add(aKey);
            seenPersons.add(pKey);
            memberships.add(membership);
          };
        };
        case (_) {
          // Non-Active memberships are never deduped and are always preserved.
          memberships.add(membership);
        };
      };
    };
    { claims = old.claims; memberships };
  };
};

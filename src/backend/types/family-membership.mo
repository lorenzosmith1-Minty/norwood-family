import Principal "mo:core/Principal";

/// FamilyMembership domain types.
///
/// A `FamilyMembership` is the canonical account-to-family membership state: it
/// links an account (`accountId`) to a person profile (`personId`) inside one
/// family (`familyId`). It is deliberately separate from `Account`,
/// `PersonProfile`, `ProfileClaim`, and `StewardRecord`:
///
/// - `Account` is the stable internal identity (an ICP Principal) plus its
///   authentication methods.
/// - `PersonProfile` is the family-tree person record and its ownership state.
/// - `ProfileClaim` is the legacy claim workflow retained for compatibility.
/// - `StewardRecord` is family governance authority, not membership.
///
/// Membership is never inferred from `StewardRecord`, and an account may hold
/// independent memberships in multiple families, each mapping to a different
/// `personId`.
module {
  /// Identifier of a family in the multi-family tenancy model.
  public type FamilyId = Text;

  /// Identifier of a person in the family tree (e.g. "julia", "clayton").
  public type PersonId = Text;

  /// Stable internal account identifier (an ICP Principal).
  public type AccountId = Principal;

  /// Lifecycle of an account's membership in one family.
  ///
  /// - `#Pending` — requested, not yet approved; grants no normal family access.
  /// - `#Active` — the recognized member attached to the linked person profile.
  /// - `#Suspended` — temporarily revoked; grants no active-family access.
  /// - `#Left` — the account left the family; grants no active-family access.
  public type MembershipStatus = {
    #Pending;
    #Active;
    #Suspended;
    #Left;
  };

  /// A persistent account-to-family membership record.
  ///
  /// `familyId` is mandatory and `personId` must belong to `familyId`. At most
  /// one `#Active` membership may own a given person profile within a family.
  /// `joinedAt` is set when the membership becomes `#Active`; `approvedBy` and
  /// `approvedAt` record the authorized approval path that activated it.
  /// `createdAt`/`updatedAt` are nanosecond timestamps.
  public type FamilyMembership = {
    id : Nat;
    familyId : FamilyId;
    accountId : AccountId;
    personId : PersonId;
    status : MembershipStatus;
    joinedAt : ?Int;
    approvedBy : ?Principal;
    approvedAt : ?Int;
    createdAt : Int;
    updatedAt : Int;
  };

  /// Errors for membership creation and lifecycle transitions.
  public type MembershipError = {
    #NotSignedIn;
    #FamilyNotFound;
    #PersonNotInFamily;
    #AlreadyMember;
    #MembershipNotFound;
    #NotAuthorized;
    #ProfileAlreadyOwned;
    #InvalidTransition;
  };

  /// Flattened, OQL-exposable view of a family membership. Enumerated variants
  /// are rendered as their tag text; optional fields render as empty text / `0`
  /// when absent.
  public type MembershipRow = {
    familyId : Text;
    id : Nat;
    accountId : Text;
    personId : Text;
    status : Text;
    joinedAt : Int;
    approvedBy : Text;
    approvedAt : Int;
    createdAt : Int;
    updatedAt : Int;
  };
};

import Principal "mo:core/Principal";

module {
  /// Stable internal account/user ID. This is the ICP Principal of the signed-in
  /// account. It is separate from the Person Profile and from any person in the
  /// family graph. Google and Apple accounts are authentication methods for this
  /// account, never the family member's identity.
  public type AccountId = Principal;

  /// An authentication method bound to an account. A user's Google account and
  /// Apple account are both methods for the SAME account, so the same person
  /// profile stays intact if the provider changes.
  public type AuthMethod = {
    #Google;
    #Apple;
  };

  /// A signed-in account. The account is the stable identity; its auth methods
  /// are the external providers used to sign in. The account is never a person
  /// in the family graph.
  public type Account = {
    id : AccountId;
    authMethods : [AuthMethod];
    createdAt : Int;
  };

  /// The set of authentication methods currently bound to an account.
  public type AuthMethods = {
    google : Bool;
    apple : Bool;
  };

  /// Errors for account identity operations.
  public type AccountError = {
    #NotSignedIn;
    #AccountNotFound;
  };

  /// Flattened, OQL-exposable view of an account. The account id is rendered as
  /// principal text; the bound authentication methods are exposed as booleans.
  public type AccountRow = {
    id : Text;
    google : Bool;
    apple : Bool;
    createdAt : Int;
  };
};

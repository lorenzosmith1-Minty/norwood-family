import Principal "mo:core/Principal";

module {
  /// Errors for the one-time Family Steward claim (bootstrap).
  public type StewardClaimError = {
    /// The caller is anonymous; a signed-in account is required.
    #NotSignedIn;
    /// An active Family Steward already exists, so the one-time claim is
    /// permanently closed.
    #StewardAlreadyExists;
    /// The caller already holds an active Family Steward record.
    #AlreadySteward;
  };

  /// The outcome of a successful one-time Family Steward claim.
  public type StewardClaimResult = {
    /// The account that claimed the Family Steward role.
    stewardAccountId : Principal;
    /// The account that performed the claim (same as `stewardAccountId`).
    claimedBy : Principal;
    /// Nanosecond timestamp (`Time.now()`) at which the claim was recorded.
    claimedAt : Int;
  };
};

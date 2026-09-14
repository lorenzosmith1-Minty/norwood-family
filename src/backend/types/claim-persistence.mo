module {
  /// Error variants for claim persistence operations. These encode the
  /// authoritative-ownership and no-duplicate-claims rules enforced when a user
  /// attempts to claim a profile.
  public type ClaimPersistenceError = {
    #NotSignedIn;
    #ProfileNotFound;
    #AlreadyOwned;
    #AlreadyPending;
    #ApprovedOwnerExists;
  };

  /// Result of checking whether a caller may claim a profile. `eligible` is
  /// `true` when the caller may proceed; otherwise `reason` carries the
  /// blocking error.
  public type ClaimEligibility = {
    eligible : Bool;
    reason : ?ClaimPersistenceError;
  };
};

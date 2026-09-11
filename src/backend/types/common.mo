import Principal "mo:core/Principal";

module {
  /// Stable ICP account identifier. Never exposed raw to the UI; the frontend
  /// renders canonical Person Profile identity instead.
  public type AccountId = Principal;

  /// Canonical person slug (e.g. "julia"). Distinct from `AccountId`: a person
  /// is identified by `PersonId`, and an account is identified by `AccountId`.
  public type PersonId = Text;

  /// Nanosecond timestamp (`Time.now()`).
  public type Timestamp = Int;
};

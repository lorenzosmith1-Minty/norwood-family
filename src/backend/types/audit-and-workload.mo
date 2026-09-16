import Principal "mo:core/Principal";

module {
  /// The kind of a single entry in the merged Family Steward Audit History.
  /// `#Governance` entries come from the governance audit log (AuditEntry);
  /// `#ConflictResolution` entries come from the research audit log's
  /// `ConflictResolved` actions, enriched with the linked Conflict Review item.
  public type StewardAuditKind = {
    #Governance;
    #ConflictResolution;
  };

  /// A single entry in the merged Family Steward Audit History. Governance
  /// entries populate `actionType`, `actorAccountId`, `affectedPersonIds`,
  /// `timestamp`, and `summary`. Conflict-resolution entries additionally
  /// populate the conflict-specific fields (`personId`, `field`,
  /// `existingValue`, `proposedValue`, `resolution`, `stewardNotes`,
  /// `existingSourceId`, `proposedSourceId`) from the linked Conflict Review
  /// item. Fields not applicable to a given `kind` are `null`/empty.
  public type StewardAuditEntry = {
    id : Nat;
    kind : StewardAuditKind;
    actionType : Text;
    actorAccountId : Principal;
    timestamp : Int;
    summary : Text;
    affectedPersonIds : [Text];
    personId : ?Text;
    field : ?Text;
    existingValue : ?Text;
    proposedValue : ?Text;
    resolution : ?Text;
    stewardNotes : ?Text;
    existingSourceId : ?Nat;
    proposedSourceId : ?Nat;
  };
};

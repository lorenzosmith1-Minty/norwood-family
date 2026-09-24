import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-B2-B5: family-scope the Research audit log.
  //
  // Adds a `familyId` field to every `ResearchAuditEntry`. Every pre-existing
  // audit record migrates to familyId = "norwood", matching the default family
  // that owns all pre-tenancy data. Existing ids, actions, finding/source
  // references, actors, timestamps, and summaries are preserved as-is. No reset,
  // no reseed, and no duplicate entries: the list is rebuilt exactly once from
  // the old list, so a repeated upgrade is idempotent. No other stable
  // collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldResearchAuditEntry = {
    id : Nat;
    action : Text;
    findingId : ?Nat;
    sourceId : ?Nat;
    actorId : Principal;
    timestamp : Int;
    summary : Text;
  };

  type NewResearchAuditEntry = {
    familyId : FamilyId;
    id : Nat;
    action : Text;
    findingId : ?Nat;
    sourceId : ?Nat;
    actorId : Principal;
    timestamp : Int;
    summary : Text;
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    researchAuditLog : List.List<OldResearchAuditEntry>;
  };

  type NewActor = {
    researchAuditLog : List.List<NewResearchAuditEntry>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let researchAuditLog = List.empty<NewResearchAuditEntry>();
    for (e in old.researchAuditLog.toArray().values()) {
      researchAuditLog.add({
        familyId = defaultFamilyId;
        id = e.id;
        action = e.action;
        findingId = e.findingId;
        sourceId = e.sourceId;
        actorId = e.actorId;
        timestamp = e.timestamp;
        summary = e.summary;
      });
    };
    { researchAuditLog };
  };
};

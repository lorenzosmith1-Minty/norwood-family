import List "mo:core/List";

module {
  // ---------------------------------------------------------------------------
  // Phase 5A: Data Export / Portability Foundation.
  //
  // Introduces one new stable collection that backs the export audit history:
  //
  //   exportAudit : List.List<ExportAuditEntry>
  //
  // This migration is additive only. No existing family, member, profile,
  // relationship, invitation, notification, confirmation, Steward resolution,
  // archive, board, messaging, research, or recovery data is read, reseeded,
  // migrated, reset, or renamed. The new collection starts empty; every other
  // pre-existing stable collection carries through unchanged (subset form).
  //
  // `OldActor` is the `NewActor` of the preceding migration
  // (20261009_000000.mo), which widened the nested `NotificationType`; none of
  // the existing fields change here, so only the new field is declared.
  // ---------------------------------------------------------------------------

  type ExportScope = {
    #MyData;
    #FamilyArchive;
  };

  type ExportAuditStatus = {
    #Succeeded;
    #Failed;
  };

  type ExportAuditEntry = {
    familyId : Text;
    id : Nat;
    scope : ExportScope;
    requesterAccountId : Principal;
    timestamp : Int;
    status : ExportAuditStatus;
  };

  type OldActor = {};

  type NewActor = {
    exportAudit : List.List<ExportAuditEntry>;
  };

  public func migration(old : OldActor) : NewActor {
    ignore old;
    {
      exportAudit = List.empty();
    };
  };
};

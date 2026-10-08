import List "mo:core/List";

module {
  // ---------------------------------------------------------------------------
  // Phase 5C-H1: Export-bound media retrieval.
  //
  // Introduces two new stable collections that bind a generated FamilyArchive
  // media manifest to later media retrieval:
  //
  //   exportInstances      : List.List<ExportInstance>
  //   exportMediaBindings  : List.List<ExportMediaBinding>
  //
  // This migration is additive only. No existing family, member, profile,
  // relationship, invitation, notification, confirmation, Steward resolution,
  // archive, board, messaging, research, recovery, or export-audit data is
  // read, reseeded, migrated, reset, or renamed. Both new collections start
  // empty; every other pre-existing stable collection carries through unchanged
  // (subset form).
  //
  // `OldActor` is the `NewActor` of the preceding migration
  // (20261010_000000.mo), which introduced `exportAudit`; none of the existing
  // fields change here, so only the new fields are declared.
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

  type ExportInstance = {
    ref : Text;
    familyId : Text;
    createdAt : Int;
    expiresAt : Int;
  };

  type ExportMediaKind = {
    #ProfilePhoto;
    #ArchiveItem;
  };

  type ExportMediaSourceKind = {
    #ArchiveItem;
    #ProfilePhoto;
  };

  type ExportMediaBinding = {
    exportInstanceRef : Text;
    familyId : Text;
    mediaRef : Text;
    mediaKind : ExportMediaKind;
    sourceKind : ExportMediaSourceKind;
    sourceKey : Text;
  };

  type OldActor = {
    exportAudit : List.List<ExportAuditEntry>;
  };

  type NewActor = {
    exportAudit : List.List<ExportAuditEntry>;
    exportInstances : List.List<ExportInstance>;
    exportMediaBindings : List.List<ExportMediaBinding>;
  };

  public func migration(old : OldActor) : NewActor {
    {
      exportAudit = old.exportAudit;
      exportInstances = List.empty();
      exportMediaBindings = List.empty();
    };
  };
};

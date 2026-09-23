import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-B2: family-scope Research Sources.
  //
  // Adds a `familyId` field to every `SourceRecord`. Every pre-existing source
  // migrates to familyId = "norwood", matching the default family that owns all
  // pre-tenancy data. Existing ids, titles, source types, descriptions, linked
  // Archive item ids, contributors, statuses, and timestamps are preserved
  // as-is. No other stable collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type SourceId = Nat;

  type SourceType = {
    #CensusCitation;
    #DeedPropertyReference;
    #EmailThread;
    #ResearchNotes;
    #CertificateHeadstoneReference;
    #UploadedDocumentImage;
  };

  type ReviewStatus = {
    #Pending;
    #Approved;
    #Rejected;
    #Conflicting;
    #NeedsResearch;
  };

  type OldSourceRecord = {
    id : SourceId;
    title : Text;
    sourceType : SourceType;
    description : Text;
    archiveItemId : ?Nat;
    contributor : Principal;
    status : ReviewStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  type NewSourceRecord = {
    familyId : FamilyId;
    id : SourceId;
    title : Text;
    sourceType : SourceType;
    description : Text;
    archiveItemId : ?Nat;
    contributor : Principal;
    status : ReviewStatus;
    createdAt : Int;
    updatedAt : Int;
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    researchSources : List.List<OldSourceRecord>;
  };

  type NewActor = {
    researchSources : List.List<NewSourceRecord>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let researchSources = List.empty<NewSourceRecord>();
    for (s in old.researchSources.toArray().values()) {
      researchSources.add({
        familyId = defaultFamilyId;
        id = s.id;
        title = s.title;
        sourceType = s.sourceType;
        description = s.description;
        archiveItemId = s.archiveItemId;
        contributor = s.contributor;
        status = s.status;
        createdAt = s.createdAt;
        updatedAt = s.updatedAt;
      });
    };
    { researchSources };
  };
};

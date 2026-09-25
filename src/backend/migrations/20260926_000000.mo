import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-D3-A: family-scope Family Stories.
  //
  // Adds a `familyId` field to every `Story`. Every pre-existing story migrates
  // to familyId = "norwood", matching the default family that owns all
  // pre-tenancy data. Existing story ids, title, story text, related-member
  // references, era/year/location, contributor, evidence status, linked archive
  // item references, timestamps, and status are preserved as-is. No reset, no
  // reseed, and no duplicate entries: the list is rebuilt exactly once from the
  // old list, so a repeated upgrade is idempotent. No other stable collection
  // changes shape — mysteries and mystery contributions carry through unchanged.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldStory = {
    id : Nat;
    title : Text;
    storyText : Text;
    relatedMemberIds : [Text];
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    contributor : Principal;
    evidenceStatus : { #Documented; #FamilyHistory; #PersonalMemory; #Unresolved };
    relatedArchiveItemIds : [Nat];
    createdAt : Int;
    updatedAt : Int;
    status : { #Pending; #Approved; #Rejected };
  };

  type NewStory = {
    familyId : FamilyId;
    id : Nat;
    title : Text;
    storyText : Text;
    relatedMemberIds : [Text];
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    contributor : Principal;
    evidenceStatus : { #Documented; #FamilyHistory; #PersonalMemory; #Unresolved };
    relatedArchiveItemIds : [Nat];
    createdAt : Int;
    updatedAt : Int;
    status : { #Pending; #Approved; #Rejected };
  };

  // Subset form: only the collection whose element type changed is listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    stories : List.List<OldStory>;
  };

  type NewActor = {
    stories : List.List<NewStory>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let stories = List.empty<NewStory>();
    for (s in old.stories.toArray().values()) {
      stories.add({
        familyId = defaultFamilyId;
        id = s.id;
        title = s.title;
        storyText = s.storyText;
        relatedMemberIds = s.relatedMemberIds;
        era = s.era;
        year = s.year;
        location = s.location;
        contributor = s.contributor;
        evidenceStatus = s.evidenceStatus;
        relatedArchiveItemIds = s.relatedArchiveItemIds;
        createdAt = s.createdAt;
        updatedAt = s.updatedAt;
        status = s.status;
      });
    };

    { stories };
  };
};

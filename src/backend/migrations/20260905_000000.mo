import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Text "mo:core/Text";

module {
  type UserRole = {
    #admin;
    #user;
    #guest;
  };

  type Photo = {
    id : Nat;
    blob : Blob;
    filename : Text;
    mimeType : Text;
    uploadedAt : Int;
    uploadedBy : Principal;
  };

  type PhotoGallery = {
    photos : List.List<Photo>;
    var profilePhotoId : ?Nat;
  };

  type ArchiveItemType = {
    #Photo;
    #Document;
    #Audio;
    #Video;
    #WrittenStoryNote;
    #Research;
    #WorkBusiness;
    #Other;
  };

  type SourceStatus = {
    #Original;
    #Copy;
    #Transcribed;
    #Unverified;
  };

  type PrivacyLevel = {
    #Public;
    #FamilyOnly;
    #Private;
  };

  type ArchiveItemStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type ArchiveItem = {
    id : Nat;
    title : Text;
    description : Text;
    itemType : ArchiveItemType;
    blob : Blob;
    era : Text;
    year : ?Nat;
    tags : [Text];
    contributor : Principal;
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    sourceStatus : SourceStatus;
    privacyLevel : PrivacyLevel;
    status : ArchiveItemStatus;
    createdAt : Int;
  };

  type LivingStatus = {
    #Living;
    #Deceased;
  };

  type ClaimStatus = {
    #Unclaimed;
    #Claimed;
  };

  type ProfileClaimStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type RelationshipType = {
    #Parent;
    #Child;
    #SpousePartner;
    #Sibling;
  };

  type RelationshipStatus = {
    #Confirmed;
    #Pending;
    #Disputed;
  };

  type RelationshipRequestStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  type PersonProfile = {
    personId : Text;
    name : Text;
    livingStatus : LivingStatus;
    claimStatus : ClaimStatus;
    claimedByUserId : ?Principal;
    preferredName : ?Text;
    story : ?Text;
    occupation : ?Text;
    birthInfo : ?Text;
    timeline : ?[Text];
    privacySettings : ?Text;
  };

  type ProfileClaim = {
    id : Nat;
    personId : Text;
    requestingUserId : Principal;
    status : ProfileClaimStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  type Relationship = {
    id : Nat;
    fromPersonId : Text;
    toPersonId : Text;
    relationshipType : RelationshipType;
    status : RelationshipStatus;
  };

  type RelationshipRequest = {
    id : Nat;
    requestingPersonId : Text;
    relatedPersonId : Text;
    proposedRelationship : RelationshipType;
    status : RelationshipRequestStatus;
    submittedDate : Int;
    reviewer : ?Principal;
    reviewedDate : ?Int;
  };

  type NotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
  };

  type Notification = {
    id : Nat;
    recipient : Principal;
    notificationType : NotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type OldActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<ArchiveItem>;
  };

  type NewActor = {
    accessControlState : {
      var adminAssigned : Bool;
      userRoles : Map.Map<Principal, UserRole>;
    };
    galleries : Map.Map<Text, PhotoGallery>;
    archiveItems : List.List<ArchiveItem>;
    profiles : Map.Map<Text, PersonProfile>;
    claims : List.List<ProfileClaim>;
    relationshipRequests : List.List<RelationshipRequest>;
    confirmedRelationships : List.List<Relationship>;
    notifications : List.List<Notification>;
  };

  /// Builds an unclaimed person profile for a seeded family member. The
  /// authoritative display content and relationship graph live in the frontend;
  /// the backend tracks ownership/lifecycle state only, so the editable fields
  /// start empty.
  func seed(personId : Text, name : Text, livingStatus : LivingStatus) : PersonProfile {
    {
      personId;
      name;
      livingStatus;
      claimStatus = #Unclaimed;
      claimedByUserId = null;
      preferredName = null;
      story = null;
      occupation = null;
      birthInfo = null;
      timeline = null;
      privacySettings = null;
    };
  };

  public func migration(old : OldActor) : NewActor {
    {
      accessControlState = old.accessControlState;
      galleries = old.galleries;
      archiveItems = old.archiveItems;
      profiles = Map.fromArray([
        ("julia", seed("julia", "Julia \"Julie\" Norwood", #Deceased)),
        ("isaiah", seed("isaiah", "Isaiah Norwood", #Deceased)),
        ("clayton", seed("clayton", "Clayton Norwood", #Living)),
        ("erma", seed("erma", "Erma T. Williams", #Deceased)),
        ("hudson", seed("hudson", "Ms. Hudson", #Living)),
        ("elbert", seed("elbert", "Elbert Norwood", #Living)),
        ("wellman", seed("wellman", "Wellman Norwood", #Living)),
        ("wetherby", seed("wetherby", "Wetherby Norwood", #Living)),
        ("columbus", seed("columbus", "Columbus Norwood", #Living)),
        ("thomas-clayton", seed("thomas-clayton", "Thomas Clayton \"Tip / TC\" Norwood", #Living)),
        ("alton", seed("alton", "Alton Norwood", #Living)),
        ("robert-davis", seed("robert-davis", "Robert Davis \"RD\" Norwood", #Deceased)),
        ("ardeanus", seed("ardeanus", "Ardeanus Norwood", #Living)),
        ("willie-b", seed("willie-b", "Willie B. Norwood", #Deceased)),
        ("james", seed("james", "James Norwood", #Living)),
        ("freddie", seed("freddie", "Freddie Norwood", #Deceased)),
        ("zelia-mae", seed("zelia-mae", "Zelia Mae Norwood", #Living)),
        ("lula-mae", seed("lula-mae", "Lula Mae Norwood", #Living)),
        ("versie-smith", seed("versie-smith", "Versie Smith", #Deceased)),
        ("gertrude-adams-hill", seed("gertrude-adams-hill", "Gertrude Adams-Hill", #Living)),
        ("harvey-adams-sr", seed("harvey-adams-sr", "Harvey Adams Sr.", #Living)),
        ("mary-louise-sims", seed("mary-louise-sims", "Mary Louise Sims", #Living)),
        ("mary-jane-johnson", seed("mary-jane-johnson", "Mary Jane Johnson", #Living)),
        ("mildred-adams", seed("mildred-adams", "Mildred Adams", #Living)),
        ("christine-adams", seed("christine-adams", "Christine Adams", #Living)),
        ("tammy", seed("tammy", "Tammy", #Living)),
        ("punchy", seed("punchy", "Punchy", #Living)),
        ("patricia-rollins", seed("patricia-rollins", "Patricia Rollins", #Living)),
        ("john-adams", seed("john-adams", "John Adams", #Living)),
        ("louis-adams-sr", seed("louis-adams-sr", "Louis Adams Sr.", #Living)),
        ("albert-adams", seed("albert-adams", "Albert Adams", #Living)),
        ("charles-adams", seed("charles-adams", "Charles Adams", #Living)),
        ("homer-adams", seed("homer-adams", "Homer Adams", #Living)),
        ("versie-adams-sr", seed("versie-adams-sr", "Versie Adams Sr.", #Living)),
        ("judge-granberry-adams", seed("judge-granberry-adams", "Judge Granberry Adams", #Living)),
        ("fannie-adams", seed("fannie-adams", "Fannie Adams", #Living)),
        ("harvey-adams-jr", seed("harvey-adams-jr", "Harvey Adams Jr.", #Living)),
        ("christine-adams-tucker", seed("christine-adams-tucker", "Christine Adams Tucker", #Living)),
        ("robert-adams-sr", seed("robert-adams-sr", "Robert Adams Sr.", #Living)),
        ("ella-mae-adams", seed("ella-mae-adams", "Ella Mae Adams", #Living)),
        ("eula-lee-adams", seed("eula-lee-adams", "Eula Lee Adams", #Living)),
        ("lorenzoSmithSr", seed("lorenzoSmithSr", "Lorenzo Smith Sr.", #Living)),
        ("versieSmithJr", seed("versieSmithJr", "Versie Smith Jr.", #Living)),
        ("herbertSmith", seed("herbertSmith", "Herbert Smith", #Living)),
        ("alonzoSmith", seed("alonzoSmith", "Alonzo Smith", #Living)),
        ("sherriSmith", seed("sherriSmith", "Sherri Smith", #Living)),
        ("beatriceSmith", seed("beatriceSmith", "Beatrice Smith", #Living)),
        ("edSmith", seed("edSmith", "Ed Smith", #Living)),
      ]);
      claims = List.empty();
      relationshipRequests = List.empty();
      confirmedRelationships = List.empty();
      notifications = List.empty();
    };
  };
};

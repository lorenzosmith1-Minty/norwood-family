import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // Old NotificationType: no archive review variants.
  type OldNotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
    #BoardReply;
    #BoardMention;
    #NewMessage;
    #ResearchSubmission;
    #ResearchApproved;
    #ResearchRejected;
  };

  // New NotificationType: adds the archive approval/rejection variants.
  type NewNotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
    #BoardReply;
    #BoardMention;
    #NewMessage;
    #ResearchSubmission;
    #ResearchApproved;
    #ResearchRejected;
    #ArchiveApproved;
    #ArchiveRejected;
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

  type ArchiveItemClassification = {
    #Standard;
    #OralHistory;
  };

  type OralHistorySpeaker = {
    personId : ?Text;
    name : Text;
  };

  type ChapterMarker = {
    title : Text;
    timestamp : Nat;
  };

  // Old ArchiveItem: no persisted upload metadata.
  type OldArchiveItem = {
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
    classification : ArchiveItemClassification;
    primarySpeaker : ?OralHistorySpeaker;
    transcript : ?Text;
    searchableTranscript : ?Text;
    chapterMarkers : ?[ChapterMarker];
    aiSummary : ?Text;
    extractedNames : ?[Text];
  };

  // New ArchiveItem: adds the persisted validated MIME type and sanitized
  // filename. Both are optional so existing records carry through as null.
  type NewArchiveItem = {
    id : Nat;
    title : Text;
    description : Text;
    itemType : ArchiveItemType;
    blob : Blob;
    mimeType : ?Text;
    filename : ?Text;
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
    classification : ArchiveItemClassification;
    primarySpeaker : ?OralHistorySpeaker;
    transcript : ?Text;
    searchableTranscript : ?Text;
    chapterMarkers : ?[ChapterMarker];
    aiSummary : ?Text;
    extractedNames : ?[Text];
  };

  type OldNotification = {
    id : Nat;
    recipient : Principal;
    notificationType : OldNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  type NewNotification = {
    id : Nat;
    recipient : Principal;
    notificationType : NewNotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  // Subset form: only the collections whose element types changed are listed.
  // All other pre-existing stable collections carry through unchanged. Existing
  // ArchiveItem records keep their data and gain null upload metadata.
  type OldActor = {
    archiveItems : List.List<OldArchiveItem>;
    notifications : List.List<OldNotification>;
  };

  type NewActor = {
    archiveItems : List.List<NewArchiveItem>;
    notifications : List.List<NewNotification>;
  };

  public func migration(old : OldActor) : NewActor {
    let archiveItems = List.empty<NewArchiveItem>();
    for (it in old.archiveItems.toArray().values()) {
      archiveItems.add({
        id = it.id;
        title = it.title;
        description = it.description;
        itemType = it.itemType;
        blob = it.blob;
        mimeType = null;
        filename = null;
        era = it.era;
        year = it.year;
        tags = it.tags;
        contributor = it.contributor;
        relatedMemberIds = it.relatedMemberIds;
        relatedBranchId = it.relatedBranchId;
        sourceStatus = it.sourceStatus;
        privacyLevel = it.privacyLevel;
        status = it.status;
        createdAt = it.createdAt;
        classification = it.classification;
        primarySpeaker = it.primarySpeaker;
        transcript = it.transcript;
        searchableTranscript = it.searchableTranscript;
        chapterMarkers = it.chapterMarkers;
        aiSummary = it.aiSummary;
        extractedNames = it.extractedNames;
      });
    };

    let notifications = List.empty<NewNotification>();
    for (n in old.notifications.toArray().values()) {
      notifications.add({
        id = n.id;
        recipient = n.recipient;
        notificationType = n.notificationType : NewNotificationType;
        message = n.message;
        createdAt = n.createdAt;
        read = n.read;
      });
    };

    { archiveItems; notifications };
  };
};

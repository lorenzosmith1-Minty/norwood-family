import Principal "mo:core/Principal";

module {
  /// Identifier of a single family story.
  public type StoryId = Nat;

  /// Identifier of a single family mystery.
  public type MysteryId = Nat;

  /// Identifier of a single mystery contribution.
  public type MysteryContributionId = Nat;

  /// How well a story or timeline event is backed by evidence. Family History
  /// and Personal Memory are never presented as documented fact.
  public type EvidenceStatus = {
    #Documented;
    #FamilyHistory;
    #PersonalMemory;
    #Unresolved;
  };

  /// Lifecycle of a contributed story: it is submitted pending, then a Family
  /// Steward either approves it (making it visible) or rejects it.
  public type StoryStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  /// A narrative family-history entry connected to one or more existing family
  /// members. Stories reference existing person ids and archive item ids; they
  /// never create duplicate Person records.
  public type Story = {
    id : StoryId;
    title : Text;
    storyText : Text;
    relatedMemberIds : [Text];
    /// Approximate date / era as free text (e.g. "early 1900s"), plus an
    /// optional year.
    era : ?Text;
    year : ?Nat;
    location : ?Text;
    contributor : Principal;
    evidenceStatus : EvidenceStatus;
    relatedArchiveItemIds : [Nat];
    createdAt : Int;
    updatedAt : Int;
    status : StoryStatus;
  };

  /// Flattened, OQL-exposable view of a story. Enumerated variants render as
  /// their tag text; optional fields render as empty text when absent; array
  /// fields render as counts (OQL has no array value type).
  public type StoryRow = {
    id : StoryId;
    title : Text;
    storyText : Text;
    relatedMemberCount : Nat;
    era : Text;
    year : ?Nat;
    location : Text;
    contributor : Text;
    evidenceStatus : Text;
    relatedArchiveItemCount : Nat;
    createdAt : Int;
    updatedAt : Int;
    status : Text;
  };

  /// Lifecycle of a family mystery.
  public type MysteryStatus = {
    #Open;
    #Researching;
    #PartiallyResolved;
    #Resolved;
  };

  /// The kind of contribution a family member can make to a mystery.
  public type MysteryContributionType = {
    #Note;
    #Memory;
    #Lead;
    #Source;
  };

  /// Lifecycle of a mystery contribution: it passes through steward review
  /// before altering the canonical mystery record.
  public type MysteryContributionStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  /// Resolution record for a resolved mystery. Preserves the research trail:
  /// prior theories/history are never deleted, and the resolution records a
  /// summary plus supporting evidence.
  public type Resolution = {
    summary : Text;
    supportingEvidence : [Text];
    resolvedAt : Int;
    resolvedBy : Principal;
  };

  /// An unresolved family-history question. Known facts, competing theories /
  /// possibilities, and sources are kept separate so a theory never silently
  /// becomes a confirmed fact.
  public type Mystery = {
    id : MysteryId;
    title : Text;
    description : Text;
    relatedMemberIds : [Text];
    relatedBranchId : ?Text;
    knownFacts : [Text];
    possibilities : [Text];
    relatedSourceIds : [Nat];
    relatedArchiveItemIds : [Nat];
    status : MysteryStatus;
    contributor : Principal;
    createdAt : Int;
    updatedAt : Int;
    resolution : ?Resolution;
  };

  /// A member contribution to a mystery (a note, memory, possible lead, or
  /// source/document reference). Passes through steward review before it alters
  /// the canonical mystery record.
  public type MysteryContribution = {
    id : MysteryContributionId;
    mysteryId : MysteryId;
    contributionType : MysteryContributionType;
    text : Text;
    contributor : Principal;
    status : MysteryContributionStatus;
    createdAt : Int;
    reviewedBy : ?Principal;
    reviewedAt : ?Int;
  };

  /// Flattened, OQL-exposable view of a mystery. Enumerated variants render as
  /// their tag text; optional fields render as empty text when absent; array
  /// fields render as counts.
  public type MysteryRow = {
    id : MysteryId;
    title : Text;
    description : Text;
    relatedMemberCount : Nat;
    relatedBranchId : Text;
    knownFactCount : Nat;
    possibilityCount : Nat;
    relatedSourceCount : Nat;
    relatedArchiveItemCount : Nat;
    status : Text;
    contributor : Text;
    createdAt : Int;
    updatedAt : Int;
    resolved : Bool;
  };

  /// The kind of event surfaced in the Travel Through Time timeline.
  public type TimelineEventType = {
    #Birth;
    #Death;
    #Marriage;
    #FamilyEvent;
    #Migration;
    #MilitaryService;
    #CensusDocument;
    #Story;
    #PhotoDocument;
    #Location;
    #Mystery;
  };

  /// Where a timeline event links to, depending on its source content.
  public type TimelineLinkTarget = {
    #Person : Text;
    #Story : StoryId;
    #ArchiveItem : Nat;
    #Mystery : MysteryId;
  };

  /// A single timeline event aggregated from existing canonical data
  /// (PersonProfile.timeline, ArchiveItem year/era, Story era/date, Mystery).
  /// Carries an evidence badge and a link target.
  public type TimelineEvent = {
    id : Text;
    eventType : TimelineEventType;
    title : Text;
    description : Text;
    era : ?Text;
    year : ?Nat;
    evidenceStatus : EvidenceStatus;
    linkTarget : TimelineLinkTarget;
  };
};

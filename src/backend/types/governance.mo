import Principal "mo:core/Principal";
import Ownership "ownership";

module {
  /// Re-exported from the canonical ownership types so there is exactly ONE
  /// definition of each shared family type.
  public type PersonId = Ownership.PersonId;
  public type RelationshipType = Ownership.RelationshipType;
  public type RelationshipStatus = Ownership.RelationshipStatus;
  public type Relationship = Ownership.Relationship;
  public type PersonProfile = Ownership.PersonProfile;

  /// Lifecycle of a Family Steward role. A steward is an account that holds the
  /// #admin role; this record tracks the governance metadata around that role.
  public type StewardRoleStatus = {
    #Active;
    #Removed;
  };

  /// Governance record for a Family Steward account. `successorPriority` is the
  /// priority/order of the steward's own designated successor, if any.
  public type StewardRecord = {
    stewardAccountId : Principal;
    roleStatus : StewardRoleStatus;
    successorPriority : ?Nat;
    assignedBy : Principal;
    assignedAt : Int;
  };

  /// Lifecycle of a successor designation. A successor is a designation only —
  /// not an active steward until a current steward explicitly activates them.
  public type SuccessorStatus = {
    #Designated;
    #Activated;
    #Removed;
  };

  /// Enriched family-facing identity of a current Steward or designated
  /// Successor, resolved from the steward account to the linked approved Person
  /// profile. `displayName` is the family-facing identity (preferred/display
  /// name, falling back to the canonical full person name); `canonicalName` is
  /// the canonical full person name. The internal `accountId` is carried only
  /// for authorization and audit — it is never the primary displayed identity.
  public type StewardIdentity = {
    personId : PersonId;
    displayName : Text;
    canonicalName : Text;
    accountId : Principal;
  };

  /// A designated successor steward. `priority` is the order in which the
  /// successor should be considered for activation.
  public type SuccessorDesignation = {
    personId : PersonId;
    priority : Nat;
    assignedBy : Principal;
    assignedAt : Int;
    status : SuccessorStatus;
  };

  /// Lifecycle of a safe profile removal request.
  public type ProfileRemovalStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  /// A request by a claimed living profile owner to have their profile removed.
  /// A Family Steward reviews the request; removal is never automatic.
  public type ProfileRemovalRequest = {
    id : Nat;
    personId : PersonId;
    requestingUserId : Principal;
    reason : Text;
    status : ProfileRemovalStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  /// The kind of governance action recorded in the audit log.
  public type AuditActionType = {
    #ClaimApproved;
    #ClaimRejected;
    #RelationshipRequestApproved;
    #RelationshipRequestRejected;
    #RelationshipRequestPending;
    #StewardPromoted;
    #StewardRemoved;
    #SuccessorDesignated;
    #SuccessorActivated;
    #ProfileArchived;
    #ProfileRestored;
    #ProfilePermanentlyDeleted;
    #ProfileRemovalRequested;
    #ProfileRemovalReviewed;
    #DuplicateMerged;
    #RelationshipAdded;
    #RelationshipRemoved;
    #RelationshipTypeCorrected;
  };

  /// A single governance audit log entry. Audit History is strictly
  /// steward-only.
  public type AuditEntry = {
    id : Nat;
    actionType : AuditActionType;
    actorAccountId : Principal;
    affectedPersonIds : [PersonId];
    timestamp : Int;
    summary : Text;
  };

  /// Lifecycle of a merge conflict review item.
  public type MergeConflictStatus = {
    #Pending;
    #Resolved;
  };

  /// A conflicting field value discovered during a duplicate-profile merge.
  /// Both values are preserved; a steward chooses the canonical display value.
  public type MergeConflict = {
    id : Nat;
    field : Text;
    canonicalValue : Text;
    alternateValue : Text;
    status : MergeConflictStatus;
    resolvedBy : ?Principal;
    resolvedAt : ?Int;
  };

  /// Comparison data for one candidate in a duplicate-profile review.
  public type DuplicateCandidate = {
    personId : PersonId;
    name : Text;
    birthDate : ?Text;
    deathDate : ?Text;
    parents : [Text];
    spouses : [Text];
    children : [Text];
    claimStatus : Text;
    ownerAccount : ?Principal;
    photoCount : Nat;
    timelineCount : Nat;
    sourceCount : Nat;
    archiveLinks : [Text];
  };

  /// Two suspected duplicate Person records shown side by side for review.
  public type DuplicatePair = {
    candidateA : DuplicateCandidate;
    candidateB : DuplicateCandidate;
  };

  /// A pair of Person records dismissed as "Not a duplicate" by a steward, so
  /// the pair does not reappear in the duplicate review list.
  public type DismissedPair = {
    personIdA : PersonId;
    personIdB : PersonId;
  };

  /// The outcome of a successful duplicate-profile merge.
  public type MergeResult = {
    canonicalPersonId : PersonId;
    archivedPersonId : PersonId;
    conflicts : [MergeConflict];
  };

  /// Errors for steward management and succession operations.
  public type StewardError = {
    #NotSignedIn;
    #NotSteward;
    #NotApprovedClaimedMember;
    #LastSteward;
    #AlreadySteward;
    #NotDesignated;
  };

  /// Errors for safe profile removal requests.
  public type RemovalError = {
    #NotSignedIn;
    #ProfileNotFound;
    #NotOwner;
    #DeceasedProfile;
    #AlreadyPending;
  };

  /// Errors for archive/restore operations.
  public type ArchiveError = {
    #NotSignedIn;
    #ProfileNotFound;
    #AlreadyArchived;
    #NotArchived;
  };

  /// Errors for permanent profile deletion. Deletion is allowed only when the
  /// profile is empty of archive items, media, timeline/history, approved
  /// relationships, and ownership history, and explicit confirmation is given.
  public type DeleteError = {
    #NotSignedIn;
    #ProfileNotFound;
    #HasArchiveItems;
    #HasMedia;
    #HasTimeline;
    #HasApprovedRelationships;
    #HasOwnershipHistory;
    #ConfirmationRequired;
  };

  /// Errors for duplicate-profile review and merge operations.
  public type MergeError = {
    #NotSignedIn;
    #ProfileNotFound;
    #SameProfile;
    #NotDuplicate;
  };

  /// Errors for steward relationship administration.
  public type RelationshipAdminError = {
    #NotSignedIn;
    #PersonNotFound;
    #RelationshipNotFound;
    #DuplicateRelationship;
  };
};

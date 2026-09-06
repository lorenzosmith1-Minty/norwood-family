import Principal "mo:core/Principal";

module {
  /// Identifier of a person in the family tree (e.g. "julia", "clayton").
  public type PersonId = Text;

  /// Whether a person is living or deceased. Deceased profiles can never be
  /// claimed by a user.
  public type LivingStatus = {
    #Living;
    #Deceased;
  };

  /// Whether a person profile has been claimed by a user. A claimed profile is
  /// owned by exactly one user.
  public type ClaimStatus = {
    #Unclaimed;
    #Claimed;
  };

  /// Lifecycle of a profile claim request.
  public type ProfileClaimStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  /// The kind of family relationship between two people. Relationships remain
  /// graph relationships, not ordinary editable profile fields.
  public type RelationshipType = {
    #Parent;
    #Child;
    #SpousePartner;
    #Sibling;
  };

  /// Verification status of a relationship in the shared family graph.
  public type RelationshipStatus = {
    #Confirmed;
    #Pending;
    #Disputed;
  };

  /// Lifecycle of a relationship request.
  public type RelationshipRequestStatus = {
    #Pending;
    #Approved;
    #Rejected;
  };

  /// A person profile's ownership/lifecycle state plus the editable personal
  /// fields an approved owner may update. The authoritative relationship graph
  /// and most display content live in the frontend's shared person/family
  /// graph; the backend tracks ownership state and the owner-editable fields.
  public type PersonProfile = {
    personId : PersonId;
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

  /// A request by a user to claim an unclaimed living person profile. Selecting
  /// "This is Me" creates a pending claim without granting ownership.
  public type ProfileClaim = {
    id : Nat;
    personId : PersonId;
    requestingUserId : Principal;
    status : ProfileClaimStatus;
    submittedDate : Int;
    reviewedBy : ?Principal;
    reviewedDate : ?Int;
  };

  /// A relationship between two people in the shared family graph, with its
  /// verification status.
  public type Relationship = {
    id : Nat;
    fromPersonId : PersonId;
    toPersonId : PersonId;
    relationshipType : RelationshipType;
    status : RelationshipStatus;
  };

  /// A proposal to add or change a relationship. Pending requests are never
  /// treated as confirmed until a Family Steward approves them.
  public type RelationshipRequest = {
    id : Nat;
    requestingPersonId : PersonId;
    relatedPersonId : PersonId;
    proposedRelationship : RelationshipType;
    status : RelationshipRequestStatus;
    submittedDate : Int;
    reviewer : ?Principal;
    reviewedDate : ?Int;
  };

  /// The kind of in-app notification record.
  public type NotificationType = {
    #ProfileClaimRequested;
    #ProfileClaimReviewed;
    #RelationshipRequested;
    #RelationshipReviewed;
  };

  /// An in-app notification record addressed to one user. Email is never used
  /// for relationship proof; notifications are purely in-app.
  public type Notification = {
    id : Nat;
    recipient : Principal;
    notificationType : NotificationType;
    message : Text;
    createdAt : Int;
    read : Bool;
  };

  /// A possible duplicate match shown during the "Add Myself" search, using
  /// name plus parents when known.
  public type PersonMatch = {
    personId : PersonId;
    name : Text;
    parents : [Text];
  };

  /// Editable personal-profile fields an approved owner may update. Ordinary
  /// profile editing never directly rewrites family relationships.
  public type ProfileEdits = {
    preferredName : ?Text;
    story : ?Text;
    occupation : ?Text;
    birthInfo : ?Text;
    timeline : ?[Text];
    privacySettings : ?Text;
  };

  /// Errors for profile claim requests.
  public type ClaimError = {
    #NotSignedIn;
    #ProfileNotFound;
    #DeceasedProfile;
    #AlreadyClaimed;
    #AlreadyPending;
  };

  /// Errors for creating a new person profile.
  public type CreateError = {
    #NotSignedIn;
  };

  /// Errors for relationship requests.
  public type RelationshipError = {
    #NotSignedIn;
    #PersonNotFound;
    #DuplicateRequest;
  };

  /// Errors for editing an owned profile.
  public type EditError = {
    #NotSignedIn;
    #ProfileNotFound;
    #NotOwner;
    #DeceasedProfile;
  };

  /// Errors for removing a duplicate test-created profile. The operation is
  /// Family Steward only; it removes the profile and any pending relationship
  /// requests / claims tied only to it, preserving the original profile and the
  /// signed-in account.
  public type RemoveError = {
    #NotSignedIn;
    #ProfileNotFound;
  };

  /// Flattened, OQL-exposable view of a person profile. Enumerated variants are
  /// rendered as their tag text; optional fields render as empty text when
  /// absent. The array-valued `timeline` is not exposed (OQL has no array value
  /// type).
  public type ProfileRow = {
    personId : PersonId;
    name : Text;
    livingStatus : Text;
    claimStatus : Text;
    claimedByUserId : Text;
    preferredName : Text;
    story : Text;
    occupation : Text;
    birthInfo : Text;
    privacySettings : Text;
  };

  /// Flattened, OQL-exposable view of a profile claim.
  public type ClaimRow = {
    id : Nat;
    personId : PersonId;
    requestingUserId : Text;
    status : Text;
    submittedDate : Int;
    reviewedBy : Text;
    reviewedDate : Int;
  };

  /// Flattened, OQL-exposable view of a relationship request.
  public type RelationshipRequestRow = {
    id : Nat;
    requestingPersonId : PersonId;
    relatedPersonId : PersonId;
    proposedRelationship : Text;
    status : Text;
    submittedDate : Int;
    reviewer : Text;
    reviewedDate : Int;
  };

  /// Flattened, OQL-exposable view of a confirmed relationship in the shared
  /// family graph.
  public type RelationshipRow = {
    id : Nat;
    fromPersonId : PersonId;
    toPersonId : PersonId;
    relationshipType : Text;
    status : Text;
  };

  /// Flattened, OQL-exposable view of an in-app notification record.
  public type NotificationRow = {
    id : Nat;
    recipient : Text;
    notificationType : Text;
    message : Text;
    createdAt : Int;
    read : Bool;
  };
};

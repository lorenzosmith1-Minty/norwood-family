import Common "../types/common";

module {
  /// Identifier of a single message board post.
  public type PostId = Nat;

  /// Identifier of a single one-level reply.
  public type ReplyId = Nat;

  /// The kind of board post.
  public type PostType = {
    #General;
    #Announcement;
    #FamilyQuestion;
    #ResearchHistory;
    #PhotoIdentification;
    #Recipe;
    #ReunionEvent;
    #Memorial;
    #Other;
  };

  /// Lifecycle of a board post. Archived posts are hidden from normal browsing
  /// but retained for restoration.
  public type PostStatus = {
    #Active;
    #Archived;
  };

  /// Privacy scope of a board post. The board is family-wide; every post is
  /// Family Only for MVP.
  public type PrivacyScope = {
    #FamilyOnly;
  };

  /// A single family message board post. Author identity is stored as both the
  /// stable account id (for authorization) and the canonical person id (for
  /// rendering the canonical Person Profile identity). Raw account ids are never
  /// exposed to the UI.
  public type Post = {
    postId : PostId;
    authorAccountId : Common.AccountId;
    authorPersonId : Common.PersonId;
    title : ?Text;
    body : Text;
    postType : PostType;
    relatedPersonIds : [Common.PersonId];
    linkedMediaIds : [Nat];
    createdAt : Common.Timestamp;
    updatedAt : Common.Timestamp;
    status : PostStatus;
    privacyScope : PrivacyScope;
  };

  /// A one-level reply to a board post. Replies are shown chronologically under
  /// each post.
  public type Reply = {
    replyId : ReplyId;
    postId : PostId;
    authorAccountId : Common.AccountId;
    authorPersonId : Common.PersonId;
    body : Text;
    createdAt : Common.Timestamp;
  };

  /// Errors for board post operations.
  public type BoardError = {
    #NotSignedIn;
    #NotApprovedMember;
    #PostNotFound;
    #NotAuthor;
    #NotSteward;
  };
};

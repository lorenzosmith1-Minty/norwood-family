import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  // ---------------------------------------------------------------------------
  // Tenancy 1C-C1: family-scope the Message Board.
  //
  // Adds a `familyId` field to every `Post` and every `Reply`. Every
  // pre-existing board record migrates to familyId = "norwood", matching the
  // default family that owns all pre-tenancy data. Existing ids, authors,
  // content, media references, tags, timestamps, status, and privacy scope are
  // preserved as-is. No reset, no reseed, and no duplicate entries: each list is
  // rebuilt exactly once from the old list, so a repeated upgrade is idempotent.
  // No other stable collection changes shape.
  // ---------------------------------------------------------------------------

  type FamilyId = Text;

  type OldPost = {
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    title : ?Text;
    body : Text;
    postType : {
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
    relatedPersonIds : [Text];
    linkedMediaIds : [Nat];
    tags : [Text];
    createdAt : Int;
    updatedAt : Int;
    status : { #Active; #Archived };
    privacyScope : { #FamilyOnly };
  };

  type NewPost = {
    familyId : FamilyId;
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    title : ?Text;
    body : Text;
    postType : {
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
    relatedPersonIds : [Text];
    linkedMediaIds : [Nat];
    tags : [Text];
    createdAt : Int;
    updatedAt : Int;
    status : { #Active; #Archived };
    privacyScope : { #FamilyOnly };
  };

  type OldReply = {
    replyId : Nat;
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    body : Text;
    createdAt : Int;
  };

  type NewReply = {
    familyId : FamilyId;
    replyId : Nat;
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    body : Text;
    createdAt : Int;
  };

  // Subset form: only the collections whose element type changed are listed. All
  // other pre-existing stable collections carry through unchanged.
  type OldActor = {
    posts : List.List<OldPost>;
    replies : List.List<OldReply>;
  };

  type NewActor = {
    posts : List.List<NewPost>;
    replies : List.List<NewReply>;
  };

  /// The single default family that owns all pre-tenancy data.
  let defaultFamilyId : FamilyId = "norwood";

  public func migration(old : OldActor) : NewActor {
    let posts = List.empty<NewPost>();
    for (p in old.posts.toArray().values()) {
      posts.add({
        familyId = defaultFamilyId;
        postId = p.postId;
        authorAccountId = p.authorAccountId;
        authorPersonId = p.authorPersonId;
        title = p.title;
        body = p.body;
        postType = p.postType;
        relatedPersonIds = p.relatedPersonIds;
        linkedMediaIds = p.linkedMediaIds;
        tags = p.tags;
        createdAt = p.createdAt;
        updatedAt = p.updatedAt;
        status = p.status;
        privacyScope = p.privacyScope;
      });
    };

    let replies = List.empty<NewReply>();
    for (r in old.replies.toArray().values()) {
      replies.add({
        familyId = defaultFamilyId;
        replyId = r.replyId;
        postId = r.postId;
        authorAccountId = r.authorAccountId;
        authorPersonId = r.authorPersonId;
        body = r.body;
        createdAt = r.createdAt;
      });
    };

    { posts; replies };
  };
};

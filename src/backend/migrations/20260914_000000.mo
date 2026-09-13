import List "mo:core/List";
import Principal "mo:core/Principal";

module {
  type PostType = {
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

  type PostStatus = {
    #Active;
    #Archived;
  };

  type PrivacyScope = {
    #FamilyOnly;
  };

  // Old board Post shape: no `tags` field.
  type OldPost = {
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    title : ?Text;
    body : Text;
    postType : PostType;
    relatedPersonIds : [Text];
    linkedMediaIds : [Nat];
    createdAt : Int;
    updatedAt : Int;
    status : PostStatus;
    privacyScope : PrivacyScope;
  };

  // New board Post shape: adds the free-form `tags` field.
  type NewPost = {
    postId : Nat;
    authorAccountId : Principal;
    authorPersonId : Text;
    title : ?Text;
    body : Text;
    postType : PostType;
    relatedPersonIds : [Text];
    linkedMediaIds : [Nat];
    tags : [Text];
    createdAt : Int;
    updatedAt : Int;
    status : PostStatus;
    privacyScope : PrivacyScope;
  };

  // Subset form: only the board posts collection is transformed. All other
  // pre-existing stable collections carry through unchanged. This migration
  // introduces the `tags` field on every board Post, migrating existing posts
  // with an empty tags list, without touching Archive tags or media records.
  type OldActor = {
    posts : List.List<OldPost>;
  };

  type NewActor = {
    posts : List.List<NewPost>;
  };

  public func migration(old : OldActor) : NewActor {
    let posts = List.empty<NewPost>();
    for (p in old.posts.toArray().values()) {
      posts.add({ p with tags = [] });
    };
    { posts };
  };
};

import List "mo:core/List";
import Types "../types/board";

module {
  /// Lists board posts, newest first, optionally filtered by post type. Only
  /// active posts are returned.
  public func listPosts(posts : List.List<Types.Post>, filter : ?Types.PostType) : [Types.Post] {
    let active = posts.toArray().filter(func p = p.status == #Active);
    let filtered = switch (filter) {
      case (?t) active.filter(func p = p.postType == t);
      case null active;
    };
    filtered.sort(func(a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Returns a single active board post by id, or `null` when it does not exist
  /// or is archived.
  public func getPost(posts : List.List<Types.Post>, postId : Types.PostId) : ?Types.Post {
    posts.find(func p = p.postId == postId and p.status == #Active);
  };

  /// Appends a new board post.
  public func createPost(posts : List.List<Types.Post>, post : Types.Post) : Types.Post {
    posts.add(post);
    post;
  };

  /// Updates an existing board post's editable fields. Returns the updated post,
  /// or `null` when it does not exist.
  public func updatePost(
    posts : List.List<Types.Post>,
    postId : Types.PostId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
  ) : ?Types.Post {
    switch (posts.find(func p = p.postId == postId)) {
      case null { null };
      case (?post) {
        let updated : Types.Post = {
          post with
          postType;
          title;
          body;
          relatedPersonIds;
          linkedMediaIds;
          updatedAt = post.updatedAt + 1;
        };
        replacePost(posts, updated);
        ?updated;
      };
    };
  };

  /// Archives (hides) a board post. Returns the updated post, or `null` when it
  /// does not exist.
  public func archivePost(posts : List.List<Types.Post>, postId : Types.PostId) : ?Types.Post {
    switch (posts.find(func p = p.postId == postId)) {
      case null { null };
      case (?post) {
        let updated : Types.Post = { post with status = #Archived };
        replacePost(posts, updated);
        ?updated;
      };
    };
  };

  /// Restores an archived board post. Returns the updated post, or `null` when
  /// it does not exist.
  public func restorePost(posts : List.List<Types.Post>, postId : Types.PostId) : ?Types.Post {
    switch (posts.find(func p = p.postId == postId)) {
      case null { null };
      case (?post) {
        let updated : Types.Post = { post with status = #Active };
        replacePost(posts, updated);
        ?updated;
      };
    };
  };

  /// Lists the replies to a board post, chronologically.
  public func listReplies(replies : List.List<Types.Reply>, postId : Types.PostId) : [Types.Reply] {
    replies.toArray().filter(func r = r.postId == postId).sort(func(a, b) = Int.compare(a.createdAt, b.createdAt));
  };

  /// Appends a new reply to a board post.
  public func addReply(replies : List.List<Types.Reply>, reply : Types.Reply) : Types.Reply {
    replies.add(reply);
    reply;
  };

  /// Removes a reply. Returns the removed reply, or `null` when it does not
  /// exist.
  public func removeReply(replies : List.List<Types.Reply>, replyId : Types.ReplyId) : ?Types.Reply {
    switch (replies.find(func r = r.replyId == replyId)) {
      case null { null };
      case (?reply) {
        let snapshot = replies.toArray();
        replies.clear();
        for (r in snapshot.values()) {
          if (r.replyId != replyId) { replies.add(r) };
        };
        ?reply;
      };
    };
  };

  func replacePost(posts : List.List<Types.Post>, updated : Types.Post) {
    let snapshot = posts.toArray();
    posts.clear();
    for (p in snapshot.values()) {
      if (p.postId == updated.postId) { posts.add(updated) } else { posts.add(p) };
    };
  };
};

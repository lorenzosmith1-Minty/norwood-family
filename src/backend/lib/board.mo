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

  /// Lists active board posts that carry ANY of the given tags. A post matches
  /// when at least one of its tags equals at least one of the requested tags.
  /// Returns `[]` when no active post matches, or when `tags` is empty.
  public func listPostsByTags(posts : List.List<Types.Post>, tags : [Text]) : [Types.Post] {
    let active = posts.toArray().filter(func p = p.status == #Active);
    active.filter(func p = p.tags.any(func t = tags.any(func q = t == q)));
  };

  /// Lists all archived (hidden/moderated) board posts for the Steward-only
  /// Hidden/Moderated Posts view. Archived posts are preserved with their
  /// replies and attachments and are never permanently deleted.
  public func listHiddenPosts(posts : List.List<Types.Post>) : [Types.Post] {
    posts.toArray().filter(func p = p.status == #Archived);
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
    tags : [Text],
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
          tags;
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

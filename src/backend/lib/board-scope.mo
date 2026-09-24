import List "mo:core/List";
import Types "../types/board";
import FamilyTypes "../types/family";

/// Tenancy 1C-C1 canonical family-scoped Message Board domain logic.
///
/// Every function here takes an explicit `familyId` and only ever considers a
/// `Post` or `Reply` whose `familyId` equals it. A `postId` or `replyId` alone
/// is never a tenant boundary: a lookup that finds a record belonging to another
/// family behaves exactly like a lookup that found nothing. The API mixin owns
/// authorization and state wiring; this module is pure over the injected
/// collections.
module {
  /// Whether a board post belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped board read and action funnels through.
  public func belongsToFamily(post : Types.Post, familyId : FamilyTypes.FamilyId) : Bool {
    post.familyId == familyId;
  };

  /// Whether a board reply belongs to `familyId`. The single family-boundary
  /// predicate every family-scoped reply read and action funnels through.
  public func replyBelongsToFamily(reply : Types.Reply, familyId : FamilyTypes.FamilyId) : Bool {
    reply.familyId == familyId;
  };

  /// Lists active board posts in `familyId`, newest first, optionally filtered
  /// by post type. Only posts whose `familyId` equals `familyId` are considered,
  /// so Family A posts never appear in a Family B call. Preserves the legacy
  /// ordering and filter semantics.
  public func listPostsForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    filter : ?Types.PostType,
  ) : [Types.Post] {
    let active = posts.toArray().filter(func p = belongsToFamily(p, familyId) and p.status == #Active);
    let filtered = switch (filter) {
      case (?t) active.filter(func p = p.postType == t);
      case null active;
    };
    filtered.sort(func(a, b) = Int.compare(b.createdAt, a.createdAt));
  };

  /// Lists active board posts in `familyId` that carry ANY of the given tags. A
  /// post matches when at least one of its tags equals at least one of the
  /// requested tags. Only posts whose `familyId` equals `familyId` are
  /// considered. Returns `[]` when no active post matches, or when `tags` is
  /// empty. Preserves the legacy tag-search semantics.
  public func searchPostsByTagsForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    tags : [Text],
  ) : [Types.Post] {
    let active = posts.toArray().filter(func p = belongsToFamily(p, familyId) and p.status == #Active);
    active.filter(func p = p.tags.any(func t = tags.any(func q = t == q)));
  };

  /// Returns the active post with `postId` when it belongs to `familyId`, or
  /// `null` otherwise. A post that exists under another family is never
  /// returned, so a `postId` alone cannot cross the family boundary.
  public func getPostForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : ?Types.Post {
    posts.find(func p = p.postId == postId and belongsToFamily(p, familyId) and p.status == #Active);
  };

  /// Returns the post with `postId` when it belongs to `familyId`, regardless of
  /// its current status, or `null` otherwise. Used by the restore path, which
  /// must find an archived post; `getPostForFamily` intentionally filters to
  /// `#Active` and must not be used there. A post that exists under another
  /// family is never returned, so a `postId` alone cannot cross the family
  /// boundary.
  public func getPostForFamilyAnyStatus(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : ?Types.Post {
    posts.find(func p = p.postId == postId and belongsToFamily(p, familyId));
  };

  /// Lists all archived (hidden/moderated) board posts in `familyId` for the
  /// Steward-only Hidden/Moderated Posts view. Only posts whose `familyId`
  /// equals `familyId` are considered. Archived posts are preserved with their
  /// replies and attachments and are never permanently deleted.
  public func listHiddenPostsForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
  ) : [Types.Post] {
    posts.toArray().filter(func p = belongsToFamily(p, familyId) and p.status == #Archived);
  };

  /// Lists the replies to a board post in `familyId`, chronologically. The
  /// parent post must belong to `familyId` and every returned reply must carry
  /// `familyId` too, so a `postId` alone cannot cross the family boundary.
  /// Returns `[]` when the parent post does not belong to `familyId`.
  public func listRepliesForFamily(
    posts : List.List<Types.Post>,
    replies : List.List<Types.Reply>,
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : [Types.Reply] {
    if (posts.find(func p = p.postId == postId and belongsToFamily(p, familyId)) == null) {
      return [];
    };
    replies.toArray()
      .filter(func r = r.postId == postId and replyBelongsToFamily(r, familyId))
      .sort(func(a, b) = Int.compare(a.createdAt, b.createdAt));
  };

  /// Appends a new board post. The post's `familyId` is set by the caller; this
  /// module never rewrites it.
  public func createPostForFamily(
    posts : List.List<Types.Post>,
    post : Types.Post,
  ) : Types.Post {
    posts.add(post);
    post;
  };

  /// Updates an existing board post's editable fields when it belongs to
  /// `familyId`. Returns the updated post, or `null` when no post with that id
  /// belongs to `familyId`. A post in another family is never touched.
  public func updatePostForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
  ) : ?Types.Post {
    switch (posts.find(func p = p.postId == postId and belongsToFamily(p, familyId))) {
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

  /// Archives (hides) a board post when it belongs to `familyId`. Returns the
  /// updated post, or `null` when no post with that id belongs to `familyId`.
  public func archivePostForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : ?Types.Post {
    switch (posts.find(func p = p.postId == postId and belongsToFamily(p, familyId))) {
      case null { null };
      case (?post) {
        let updated : Types.Post = { post with status = #Archived };
        replacePost(posts, updated);
        ?updated;
      };
    };
  };

  /// Restores an archived board post when it belongs to `familyId`. Returns the
  /// updated post, or `null` when no post with that id belongs to `familyId`.
  public func restorePostForFamily(
    posts : List.List<Types.Post>,
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : ?Types.Post {
    switch (posts.find(func p = p.postId == postId and belongsToFamily(p, familyId))) {
      case null { null };
      case (?post) {
        let updated : Types.Post = { post with status = #Active };
        replacePost(posts, updated);
        ?updated;
      };
    };
  };

  /// Appends a new reply to a board post. The reply's `familyId` is set by the
  /// caller; this module never rewrites it.
  public func addReplyForFamily(
    replies : List.List<Types.Reply>,
    reply : Types.Reply,
  ) : Types.Reply {
    replies.add(reply);
    reply;
  };

  /// Removes a reply when it belongs to `familyId`. Returns the removed reply,
  /// or `null` when no reply with that id belongs to `familyId`. A reply in
  /// another family is never touched.
  public func removeReplyForFamily(
    replies : List.List<Types.Reply>,
    familyId : FamilyTypes.FamilyId,
    replyId : Types.ReplyId,
  ) : ?Types.Reply {
    switch (replies.find(func r = r.replyId == replyId and replyBelongsToFamily(r, familyId))) {
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

  /// Replaces the post with the same `postId` in place, preserving order.
  func replacePost(posts : List.List<Types.Post>, updated : Types.Post) {
    let snapshot = posts.toArray();
    posts.clear();
    for (p in snapshot.values()) {
      if (p.postId == updated.postId) { posts.add(updated) } else { posts.add(p) };
    };
  };
};

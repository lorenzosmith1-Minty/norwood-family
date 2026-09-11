import List "mo:core/List";
import Map "mo:core/Map";
import Nat "mo:core/Nat";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import AccessControl "mo:caffeineai-authorization/access-control";
import Types "../types/board";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import BoardLib "../lib/board";

mixin (
  accessControlState : AccessControl.AccessControlState,
  posts : List.List<Types.Post>,
  replies : List.List<Types.Reply>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  notifications : List.List<OwnershipTypes.Notification>,
  auditLog : List.List<GovernanceTypes.AuditEntry>,
) {
  /// Lists active board posts, newest first, optionally filtered by post type.
  /// Approved family members only.
  public query ({ caller }) func listBoardPosts(filter : ?Types.PostType) : async [Types.Post] {
    requireBoardMember(caller);
    BoardLib.listPosts(posts, filter);
  };

  /// Returns a single active board post by id. Approved family members only.
  public query ({ caller }) func getBoardPost(postId : Types.PostId) : async ?Types.Post {
    requireBoardMember(caller);
    BoardLib.getPost(posts, postId);
  };

  /// Creates a board post with a type, optional title, body, related family
  /// members, and optional linked existing Archive/media ids. Approved family
  /// members only. Creates a mention notification for related members where
  /// appropriate.
  public shared ({ caller }) func createBoardPost(
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
  ) : async Types.Post {
    requireBoardMember(caller);
    let authorPersonId = boardCallerPersonId(caller);
    let post : Types.Post = {
      postId = boardNextId(posts.toArray().map(func p = p.postId));
      authorAccountId = caller;
      authorPersonId;
      title;
      body;
      postType;
      relatedPersonIds;
      linkedMediaIds;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Active;
      privacyScope = #FamilyOnly;
    };
    ignore (BoardLib.createPost(posts, post));
    notifyBoardMentions(post);
    post;
  };

  /// Updates the caller's own board post. Approved family members only; the
  /// caller must be the post author.
  public shared ({ caller }) func updateBoardPost(
    postId : Types.PostId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
  ) : async ?Types.Post {
    requireBoardMember(caller);
    switch (posts.find(func p = p.postId == postId)) {
      case null { null };
      case (?post) {
        if (post.authorAccountId != caller) {
          Runtime.trap("Unauthorized: Only the post author can edit this post");
        };
        BoardLib.updatePost(posts, postId, postType, title, body, relatedPersonIds, linkedMediaIds);
      };
    };
  };

  /// Archives (hides) a board post. The author or a Family Steward may archive.
  /// Governance actions create audit entries.
  public shared ({ caller }) func archiveBoardPost(postId : Types.PostId) : async ?Types.Post {
    requireBoardMember(caller);
    switch (posts.find(func p = p.postId == postId)) {
      case null { null };
      case (?post) {
        if (post.authorAccountId != caller and not AccessControl.isAdmin(accessControlState, caller)) {
          Runtime.trap("Unauthorized: Only the post author or a Family Steward can archive this post");
        };
        let updated = BoardLib.archivePost(posts, postId);
        appendBoardAudit(#BoardPostArchived, caller, [post.authorPersonId], "Archived board post " # boardPostIdText(postId));
        updated;
      };
    };
  };

  /// Restores an archived board post. Family Steward only. Governance actions
  /// create audit entries.
  public shared ({ caller }) func restoreBoardPost(postId : Types.PostId) : async ?Types.Post {
    requireBoardSteward(caller);
    switch (posts.find(func p = p.postId == postId)) {
      case null { null };
      case (?post) {
        let updated = BoardLib.restorePost(posts, postId);
        appendBoardAudit(#BoardPostRestored, caller, [post.authorPersonId], "Restored board post " # boardPostIdText(postId));
        updated;
      };
    };
  };

  /// Lists the replies to a board post, chronologically. Approved family members
  /// only.
  public query ({ caller }) func listBoardReplies(postId : Types.PostId) : async [Types.Reply] {
    requireBoardMember(caller);
    BoardLib.listReplies(replies, postId);
  };

  /// Adds a one-level reply to a board post. Approved family members only.
  /// Creates a reply notification for the post author.
  public shared ({ caller }) func addBoardReply(postId : Types.PostId, body : Text) : async Types.Reply {
    requireBoardMember(caller);
    switch (posts.find(func p = p.postId == postId and p.status == #Active)) {
      case null { Runtime.trap("Post not found") };
      case (?post) {
        let reply : Types.Reply = {
          replyId = boardNextId(replies.toArray().map(func r = r.replyId));
          postId;
          authorAccountId = caller;
          authorPersonId = boardCallerPersonId(caller);
          body;
          createdAt = Time.now();
        };
        ignore (BoardLib.addReply(replies, reply));
        // Notify the post author (unless they replied to their own post).
        if (post.authorAccountId != caller) {
          addBoardNotification(post.authorAccountId, #BoardReply, "Someone replied to your board post");
        };
        reply;
      };
    };
  };

  /// Removes a reply. Family Steward only. Governance actions create audit
  /// entries.
  public shared ({ caller }) func removeBoardReply(replyId : Types.ReplyId) : async ?Types.Reply {
    requireBoardSteward(caller);
    switch (replies.find(func r = r.replyId == replyId)) {
      case null { null };
      case (?reply) {
        let removed = BoardLib.removeReply(replies, replyId);
        appendBoardAudit(#BoardReplyRemoved, caller, [reply.authorPersonId], "Removed board reply " # boardReplyIdText(replyId));
        removed;
      };
    };
  };

  // --- helpers ---

  func requireBoardMember(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.hasPermission(accessControlState, caller, #user)) {
      Runtime.trap("Unauthorized: Only approved family members can access the message board");
    };
  };

  func requireBoardSteward(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not AccessControl.isAdmin(accessControlState, caller)) {
      Runtime.trap("Unauthorized: Only Family Stewards can perform this action");
    };
  };

  /// Resolves the caller's canonical person id from their claimed profile.
  func boardCallerPersonId(caller : Principal) : Text {
    for ((personId, profile) in profiles.entries()) {
      if (profile.claimedByUserId == ?caller) {
        return personId;
      };
    };
    caller.toText();
  };

  /// Creates a mention notification for each related member who has a linked
  /// account, avoiding duplicates.
  func notifyBoardMentions(post : Types.Post) {
    for (personId in post.relatedPersonIds.values()) {
      switch (profiles.get(personId)) {
        case (?profile) {
          switch (profile.claimedByUserId) {
            case (?accountId) {
              if (accountId != post.authorAccountId) {
                addBoardNotification(accountId, #BoardMention, "You were mentioned in a board post");
              };
            };
            case null {};
          };
        };
        case null {};
      };
    };
  };

  func addBoardNotification(recipient : Principal, notificationType : OwnershipTypes.NotificationType, message : Text) {
    notifications.add({
      id = boardNextId(notifications.toArray().map(func n = n.id));
      recipient;
      notificationType;
      message;
      createdAt = Time.now();
      read = false;
    });
  };

  func appendBoardAudit(actionType : GovernanceTypes.AuditActionType, actorId : Principal, affectedPersonIds : [Text], summary : Text) {
    auditLog.add({
      id = boardNextId(auditLog.toArray().map(func e = e.id));
      actionType;
      actorAccountId = actorId;
      affectedPersonIds;
      timestamp = Time.now();
      summary;
    });
  };

  func boardNextId(ids : [Nat]) : Nat {
    var maxId = 0;
    for (id in ids.values()) {
      if (id >= maxId) { maxId := id + 1 };
    };
    maxId;
  };

  func boardPostIdText(id : Types.PostId) : Text {
    id.toText();
  };

  func boardReplyIdText(id : Types.ReplyId) : Text {
    id.toText();
  };
};

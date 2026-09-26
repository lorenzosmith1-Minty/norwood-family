import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Types "../types/board";
import ArchiveTypes "../types/archive";
import FamilyTypes "../types/family";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import BoardScopeLib "../lib/board-scope";
import ArchiveLib "../lib/archive";
import FamilyAuthorizationLib "../lib/family-authorization";
import NotificationsScopeLib "../lib/notifications-scope";
import InputValidation "../lib/input-validation";

/// Tenancy 1C-C1 canonical family-scoped Message Board public API.
///
/// Every canonical endpoint takes the requested `familyId` explicitly. Reads
/// gate on `FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily`;
/// Steward moderation (archive/restore/remove reply) gates on
/// `requireActiveStewardForFamily`; author-only edit/delete additionally checks
/// the caller is the record's author. Every returned or mutated post/reply must
/// carry `familyId == familyId`, and every related person and linked media id
/// must belong to the same family, so a `postId` or `replyId` alone never
/// crosses a family boundary.
///
/// The legacy single-family endpoints remain as TEMPORARY Tenancy 1C
/// compatibility wrappers delegating with `FamilyTypes.DEFAULT_FAMILY_ID`.
mixin (
  posts : List.List<Types.Post>,
  replies : List.List<Types.Reply>,
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  notifications : List.List<OwnershipTypes.Notification>,
  auditLog : List.List<GovernanceTypes.AuditEntry>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
) {
  // ---------------------------------------------------------------------------
  // Canonical family-scoped endpoints.
  // ---------------------------------------------------------------------------

  /// Lists active board posts in `familyId`, newest first, optionally filtered
  /// by post type. Approved members of `familyId` only. A post whose `familyId`
  /// differs is never returned, so Family A posts never appear in a Family B
  /// call.
  public query ({ caller }) func listBoardPostsForFamily(
    familyId : FamilyTypes.FamilyId,
    filter : ?Types.PostType,
  ) : async [Types.Post] {
    requireBoardMemberForFamily(caller, familyId);
    BoardScopeLib.listPostsForFamily(posts, familyId, filter);
  };

  /// Lists active board posts in `familyId` that carry ANY of the given tags.
  /// Approved members of `familyId` only. Only posts whose `familyId` equals
  /// `familyId` are considered.
  public query ({ caller }) func searchBoardPostsByTagsForFamily(
    familyId : FamilyTypes.FamilyId,
    tags : [Text],
  ) : async [Types.Post] {
    requireBoardMemberForFamily(caller, familyId);
    BoardScopeLib.searchPostsByTagsForFamily(posts, familyId, tags);
  };

  /// Returns a single active board post by id when it belongs to `familyId`.
  /// Approved members of `familyId` only. A post that exists under another
  /// family is never returned, so a `postId` alone cannot cross the family
  /// boundary.
  public query ({ caller }) func getBoardPostForFamily(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : async ?Types.Post {
    requireBoardMemberForFamily(caller, familyId);
    BoardScopeLib.getPostForFamily(posts, familyId, postId);
  };

  /// Lists all hidden (moderated) board posts in `familyId` for the Steward-only
  /// Hidden/Moderated Posts view. Active Steward of `familyId` only. A post
  /// whose `familyId` differs is never returned.
  public query ({ caller }) func listHiddenBoardPostsForFamily(
    familyId : FamilyTypes.FamilyId,
  ) : async [Types.Post] {
    requireBoardStewardForFamily(caller, familyId);
    BoardScopeLib.listHiddenPostsForFamily(posts, familyId);
  };

  /// Lists the replies to a board post in `familyId`, chronologically. Approved
  /// members of `familyId` only. The parent post must belong to `familyId` and
  /// every returned reply must carry `familyId` too, so a `postId` alone cannot
  /// cross the family boundary.
  public query ({ caller }) func listBoardRepliesForFamily(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : async [Types.Reply] {
    requireBoardMemberForFamily(caller, familyId);
    BoardScopeLib.listRepliesForFamily(posts, replies, familyId, postId);
  };

  /// Creates a board post in `familyId` with a type, optional title, body,
  /// related family members, optional linked existing Archive/media ids, and
  /// free-form tags. Approved members or Stewards of `familyId` only. The new
  /// post's `familyId` is the requested `familyId`; every related person and
  /// every linked media id must belong to `familyId`. Creates a mention
  /// notification for related members where appropriate.
  public shared ({ caller }) func createBoardPostForFamily(
    familyId : FamilyTypes.FamilyId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
  ) : async Types.Post {
    createBoardPostForFamilyInternal(familyId, postType, title, body, relatedPersonIds, linkedMediaIds, tags, caller);
  };

  /// Internal implementation of `createBoardPostForFamily` that takes the caller
  /// explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createBoardPostForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
    caller : Principal,
  ) : Types.Post {
    requireBoardMemberForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireOptionalText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanBody = InputValidation.requireText("body", body, InputValidation.MAX_BOARD_POST_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedPersonIds);
    let cleanTags = InputValidation.requireTags(tags);
    InputValidation.requireArraySize("linkedMediaIds", linkedMediaIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    // Every related person must belong to the requested family: Family A may
    // never reference Family B people.
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    // Every linked media id must resolve to an Archive item in the same family.
    requireLinkedMediaInFamily(linkedMediaIds, familyId);
    let authorPersonId = boardCallerPersonId(caller);
    let post : Types.Post = {
      familyId;
      postId = boardNextId(posts.toArray().map(func p = p.postId));
      authorAccountId = caller;
      authorPersonId;
      title = cleanTitle;
      body = cleanBody;
      postType;
      relatedPersonIds = cleanRelated;
      linkedMediaIds;
      tags = cleanTags;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Active;
      privacyScope = #FamilyOnly;
    };
    ignore (BoardScopeLib.createPostForFamily(posts, post));
    notifyBoardMentions(post);
    post;
  };

  /// Updates the caller's own board post in `familyId`. Approved members of
  /// `familyId` only; the caller must be the post author. A post in another
  /// family is never touched, so a `postId` alone cannot cross the family
  /// boundary.
  public shared ({ caller }) func updateBoardPostForFamily(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
  ) : async ?Types.Post {
    updateBoardPostForFamilyInternal(familyId, postId, postType, title, body, relatedPersonIds, linkedMediaIds, tags, caller);
  };

  /// Internal implementation of `updateBoardPostForFamily` that takes the caller
  /// explicitly, so the author check always evaluates the real caller.
  func updateBoardPostForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
    caller : Principal,
  ) : ?Types.Post {
    requireBoardMemberForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireOptionalText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanBody = InputValidation.requireText("body", body, InputValidation.MAX_BOARD_POST_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedPersonIds);
    let cleanTags = InputValidation.requireTags(tags);
    InputValidation.requireArraySize("linkedMediaIds", linkedMediaIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, cleanRelated, familyId);
    requireLinkedMediaInFamily(linkedMediaIds, familyId);
    switch (BoardScopeLib.getPostForFamily(posts, familyId, postId)) {
      case null { null };
      case (?post) {
        if (post.authorAccountId != caller) {
          Runtime.trap("Unauthorized: Only the post author can edit this post");
        };
        BoardScopeLib.updatePostForFamily(posts, familyId, postId, postType, cleanTitle, cleanBody, cleanRelated, linkedMediaIds, cleanTags);
      };
    };
  };

  /// Archives (hides) a board post in `familyId`. The author or an active
  /// Steward of `familyId` may archive. A post in another family is never
  /// touched. Governance actions create audit entries.
  public shared ({ caller }) func archiveBoardPostForFamily(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : async ?Types.Post {
    archiveBoardPostForFamilyInternal(familyId, postId, caller);
  };

  /// Internal implementation of `archiveBoardPostForFamily` that takes the
  /// caller explicitly, so the author/Steward check always evaluates the real
  /// caller.
  func archiveBoardPostForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    caller : Principal,
  ) : ?Types.Post {
    requireBoardMemberForFamily(caller, familyId);
    switch (BoardScopeLib.getPostForFamily(posts, familyId, postId)) {
      case null { null };
      case (?post) {
        if (post.authorAccountId != caller and not FamilyAuthorizationLib.isStewardForFamily(stewards, caller, familyId)) {
          Runtime.trap("Unauthorized: Only the post author or a Family Steward can archive this post");
        };
        let updated = BoardScopeLib.archivePostForFamily(posts, familyId, postId);
        appendBoardAudit(#BoardPostArchived, caller, [post.authorPersonId], "Archived board post " # boardPostIdText(postId));
        updated;
      };
    };
  };

  /// Restores an archived board post in `familyId`. Active Steward of `familyId`
  /// only. A post in another family is never touched. Governance actions create
  /// audit entries.
  public shared ({ caller }) func restoreBoardPostForFamily(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
  ) : async ?Types.Post {
    restoreBoardPostForFamilyInternal(familyId, postId, caller);
  };

  /// Internal implementation of `restoreBoardPostForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  func restoreBoardPostForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    caller : Principal,
  ) : ?Types.Post {
    requireBoardStewardForFamily(caller, familyId);
    // Restore must find an archived post, so look it up regardless of status;
    // `getPostForFamily` filters to `#Active` and would never find it.
    switch (BoardScopeLib.getPostForFamilyAnyStatus(posts, familyId, postId)) {
      case null { null };
      case (?post) {
        let updated = BoardScopeLib.restorePostForFamily(posts, familyId, postId);
        appendBoardAudit(#BoardPostRestored, caller, [post.authorPersonId], "Restored board post " # boardPostIdText(postId));
        updated;
      };
    };
  };

  /// Adds a one-level reply to a board post in `familyId`. Approved members of
  /// `familyId` only. The parent post must belong to `familyId` and the new
  /// reply's `familyId` is the requested `familyId`, so a Family B post can
  /// never be replied to through a Family A context. Creates a reply
  /// notification for the post author.
  public shared ({ caller }) func addBoardReplyForFamily(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    body : Text,
  ) : async Types.Reply {
    addBoardReplyForFamilyInternal(familyId, postId, body, caller);
  };

  /// Internal implementation of `addBoardReplyForFamily` that takes the caller
  /// explicitly, so the membership gate always evaluates the real caller.
  func addBoardReplyForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    postId : Types.PostId,
    body : Text,
    caller : Principal,
  ) : Types.Reply {
    requireBoardMemberForFamily(caller, familyId);
    let cleanBody = InputValidation.requireText("reply", body, InputValidation.MAX_BOARD_REPLY_CHARS);
    switch (posts.find(func p = p.postId == postId and BoardScopeLib.belongsToFamily(p, familyId) and p.status == #Active)) {
      case null { Runtime.trap("Post not found") };
      case (?post) {
        let reply : Types.Reply = {
          familyId;
          replyId = boardNextId(replies.toArray().map(func r = r.replyId));
          postId;
          authorAccountId = caller;
          authorPersonId = boardCallerPersonId(caller);
          body = cleanBody;
          createdAt = Time.now();
        };
        ignore (BoardScopeLib.addReplyForFamily(replies, reply));
        // Notify the post author (unless they replied to their own post).
        if (post.authorAccountId != caller) {
          addBoardNotification(familyId, post.authorAccountId, #BoardReply, "Someone replied to your board post");
        };
        reply;
      };
    };
  };

  /// Removes a reply in `familyId`. Active Steward of `familyId` only. A reply
  /// in another family is never touched, so a `replyId` alone cannot cross the
  /// family boundary. Governance actions create audit entries.
  public shared ({ caller }) func removeBoardReplyForFamily(
    familyId : FamilyTypes.FamilyId,
    replyId : Types.ReplyId,
  ) : async ?Types.Reply {
    removeBoardReplyForFamilyInternal(familyId, replyId, caller);
  };

  /// Internal implementation of `removeBoardReplyForFamily` that takes the
  /// caller explicitly, so the Steward gate always evaluates the real caller.
  func removeBoardReplyForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    replyId : Types.ReplyId,
    caller : Principal,
  ) : ?Types.Reply {
    requireBoardStewardForFamily(caller, familyId);
    switch (replies.find(func r = r.replyId == replyId and BoardScopeLib.replyBelongsToFamily(r, familyId))) {
      case null { null };
      case (?reply) {
        let removed = BoardScopeLib.removeReplyForFamily(replies, familyId, replyId);
        appendBoardAudit(#BoardReplyRemoved, caller, [reply.authorPersonId], "Removed board reply " # boardReplyIdText(replyId));
        removed;
      };
    };
  };

  // ---------------------------------------------------------------------------
  // TEMPORARY Tenancy 1C compatibility wrappers.
  //
  // Deprecated single-family endpoints: each delegates to its family-scoped
  // counterpart with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  // behavior for familyId "norwood" is unchanged. They contain no business
  // logic of their own and will be removed once the frontend passes an explicit
  // familyId everywhere.
  // ---------------------------------------------------------------------------

  /// TEMPORARY Tenancy 1C compatibility wrapper for `listBoardPostsForFamily`.
  public query ({ caller }) func listBoardPosts(filter : ?Types.PostType) : async [Types.Post] {
    requireBoardMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    BoardScopeLib.listPostsForFamily(posts, FamilyTypes.DEFAULT_FAMILY_ID, filter);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `searchBoardPostsByTagsForFamily`.
  public query ({ caller }) func searchBoardPostsByTags(tags : [Text]) : async [Types.Post] {
    requireBoardMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    BoardScopeLib.searchPostsByTagsForFamily(posts, FamilyTypes.DEFAULT_FAMILY_ID, tags);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `getBoardPostForFamily`.
  public query ({ caller }) func getBoardPost(postId : Types.PostId) : async ?Types.Post {
    requireBoardMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    BoardScopeLib.getPostForFamily(posts, FamilyTypes.DEFAULT_FAMILY_ID, postId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listHiddenBoardPostsForFamily`.
  public query ({ caller }) func listHiddenBoardPosts() : async [Types.Post] {
    requireBoardStewardForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    BoardScopeLib.listHiddenPostsForFamily(posts, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `listBoardRepliesForFamily`.
  public query ({ caller }) func listBoardReplies(postId : Types.PostId) : async [Types.Reply] {
    requireBoardMemberForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
    BoardScopeLib.listRepliesForFamily(posts, replies, FamilyTypes.DEFAULT_FAMILY_ID, postId);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `createBoardPostForFamily`.
  public shared ({ caller }) func createBoardPost(
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
  ) : async Types.Post {
    createBoardPostForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, postType, title, body, relatedPersonIds, linkedMediaIds, tags, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `updateBoardPostForFamily`.
  public shared ({ caller }) func updateBoardPost(
    postId : Types.PostId,
    postType : Types.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    linkedMediaIds : [Nat],
    tags : [Text],
  ) : async ?Types.Post {
    updateBoardPostForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, postId, postType, title, body, relatedPersonIds, linkedMediaIds, tags, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `archiveBoardPostForFamily`.
  public shared ({ caller }) func archiveBoardPost(postId : Types.PostId) : async ?Types.Post {
    archiveBoardPostForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, postId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `restoreBoardPostForFamily`.
  public shared ({ caller }) func restoreBoardPost(postId : Types.PostId) : async ?Types.Post {
    restoreBoardPostForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, postId, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for `addBoardReplyForFamily`.
  public shared ({ caller }) func addBoardReply(postId : Types.PostId, body : Text) : async Types.Reply {
    addBoardReplyForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, postId, body, caller);
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `removeBoardReplyForFamily`.
  public shared ({ caller }) func removeBoardReply(replyId : Types.ReplyId) : async ?Types.Reply {
    removeBoardReplyForFamilyInternal(FamilyTypes.DEFAULT_FAMILY_ID, replyId, caller);
  };

  // ---------------------------------------------------------------------------
  // Internal helpers.
  // ---------------------------------------------------------------------------

  /// Traps unless the caller is a signed-in approved member or Steward of
  /// `familyId`, using the canonical family-scoped membership helper. Anonymous
  /// callers and signed-in but unapproved callers are both denied with the
  /// stable, non-technical family-membership message.
  func requireBoardMemberForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
  };

  /// Traps unless the caller is a signed-in active Steward of `familyId`, using
  /// the canonical family-scoped Steward helper. A Steward of one family can
  /// never moderate another family's board.
  func requireBoardStewardForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requireActiveStewardForFamily(stewards, caller, familyId);
  };

  /// Traps unless every linked media id resolves to an Archive item in
  /// `familyId`. A media id from another family is never attached, so a
  /// `linkedMediaId` alone cannot cross the family boundary. The denial message
  /// carries no family id or principal.
  func requireLinkedMediaInFamily(mediaIds : [Nat], familyId : FamilyTypes.FamilyId) {
    for (mediaId in mediaIds.values()) {
      if (archiveItems.find(func it = it.id == mediaId and ArchiveLib.belongsToFamily(it, familyId)) == null) {
        Runtime.trap("Unauthorized: Linked media must belong to the same family");
      };
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
  /// account, avoiding duplicates. The notification is stored in the post's own
  /// `familyId`, so a Family A mention never appears in a Family B read.
  func notifyBoardMentions(post : Types.Post) {
    for (personId in post.relatedPersonIds.values()) {
      switch (profiles.get(personId)) {
        case (?profile) {
          switch (profile.claimedByUserId) {
            case (?accountId) {
              if (accountId != post.authorAccountId) {
                addBoardNotification(post.familyId, accountId, #BoardMention, "You were mentioned in a board post");
              };
            };
            case null {};
          };
        };
        case null {};
      };
    };
  };

  /// Appends a board notification for the given recipient in `familyId`.
  /// Delegates to the canonical family-scoped notification helper, so the
  /// stored `familyId` is always the action's family.
  func addBoardNotification(
    familyId : FamilyTypes.FamilyId,
    recipient : Principal,
    notificationType : OwnershipTypes.NotificationType,
    message : Text,
  ) {
    ignore NotificationsScopeLib.createForFamily(notifications, familyId, recipient, notificationType, message, Time.now());
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

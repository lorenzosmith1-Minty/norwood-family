import Result "mo:core/Result";
import List "mo:core/List";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Storage "mo:caffeineai-object-storage/Storage";
import ArchiveTypes "../types/archive";
import ResearchIntakeTypes "../types/research-intake";
import BoardTypes "../types/board";
import OwnershipTypes "../types/ownership";
import GovernanceTypes "../types/governance";
import Types "../types/archive-research-board-notifications";
import Lib "../lib/archive-research-board-notifications";
import FamilyAuthorizationLib "../lib/family-authorization";
import StewardAuthorityLib "../lib/steward-authority";
import InputValidation "../lib/input-validation";
import InputValidationTypes "../types/input-validation";

/// Public API for the cross-cutting archive / research-intake / board /
/// notifications features: archive tag search, research source upload that
/// creates a canonical Archive item, board posts with media attachments, and
/// stale claim notification reconciliation.
mixin (
  archiveItems : List.List<ArchiveTypes.ArchiveItem>,
  researchSources : List.List<ResearchIntakeTypes.SourceRecord>,
  researchState : { var nextSourceId : Nat },
  posts : List.List<BoardTypes.Post>,
  notifications : List.List<OwnershipTypes.Notification>,
  claims : List.List<OwnershipTypes.ProfileClaim>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Traps unless the caller is a signed-in approved family member.
  func requireBoardMemberForMedia(caller : Principal) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller)) {
      Runtime.trap("Unauthorized: Only approved family members can access the message board");
    };
  };

  /// Maps an archive item type to the upload surface whose MIME allowlist and
  /// byte ceiling apply. The itemType is not trusted on its own: the caller's
  /// MIME type must be allowed for the surface the itemType selects.
  func mediaArchiveSurfaceFor(itemType : ArchiveTypes.ArchiveItemType) : InputValidationTypes.UploadSurface {
    switch (itemType) {
      case (#Photo) #ArchiveImage;
      case (#Document) #ArchiveDocument;
      case (#Audio) #ArchiveAudio;
      case (#Video) #ArchiveVideo;
      case (#WrittenStoryNote) #ArchiveDocument;
      case (#Research) #ArchiveDocument;
      case (#WorkBusiness) #ArchiveDocument;
      case (#Other) #ArchiveDocument;
    };
  };

  /// Computes the next board post id: one greater than the largest existing id,
  /// or `0` when there are no posts.
  func nextPostId() : Nat {
    var maxId = 0;
    for (p in posts.toArray().values()) {
      if (p.postId >= maxId) { maxId := p.postId + 1 };
    };
    maxId;
  };

  /// Computes the next notification id: one greater than the largest existing
  /// id, or `0` when there are no notifications.
  func nextNotificationId() : Nat {
    var maxId = 0;
    for (n in notifications.toArray().values()) {
      if (n.id >= maxId) { maxId := n.id + 1 };
    };
    maxId;
  };

  /// Searches/filters approved archive items by title query, tags, item type,
  /// related family member, and era. Returns only `#Approved` items visible to
  /// the caller under the archive privacy rules.
  public query ({ caller }) func searchArchiveItems(filter : Types.ArchiveSearchFilter) : async [ArchiveTypes.ArchiveItem] {
    let isAdmin = StewardAuthorityLib.isActiveSteward(stewards, caller);
    let isApprovedFamilyMember = isAdmin or claims.toArray().any(func c = c.requestingUserId == caller and c.status == #Approved);
    Lib.searchArchiveItems(archiveItems, filter, caller, isAdmin, isApprovedFamilyMember);
  };

  /// Uploads a research source file: creates one canonical Archive item
  /// (pending) and links a new Research Source record to it, so no manually
  /// typed Archive Item ID is required. Requires an approved family member; the
  /// caller is recorded as the contributor of both records.
  public shared ({ caller }) func createSourceWithUpload(
    title : Text,
    sourceType : ResearchIntakeTypes.SourceType,
    description : Text,
    mimeType : Text,
    blob : Storage.ExternalBlob,
    tags : [Text],
    era : Text,
    year : ?Nat,
    relatedMemberIds : [Text],
    privacyLevel : ArchiveTypes.PrivacyLevel,
    classification : ArchiveTypes.ArchiveItemClassification,
    primarySpeaker : ?ArchiveTypes.OralHistorySpeaker,
    filename : Text,
  ) : async Result.Result<Types.SourceUploadResult, ResearchIntakeTypes.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMember(stewards, claims, caller)) {
      return #err(#notAuthorized);
    };
    if (classification == #OralHistory and primarySpeaker == null) {
      return #err(#invalidState("A primary speaker is required for Oral History items"));
    };
    if (classification == #Standard and primarySpeaker != null) {
      return #err(#invalidState("A primary speaker is only allowed on Oral History items"));
    };
    // Feature/content-type consistency: a research source upload is a document
    // or research note, so it validates against the archive document surface.
    // The MIME type is not trusted on its own.
    InputValidation.requireUpload(#ArchiveDocument, mimeType, blob);
    let cleanTitle = InputValidation.requireText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanDescription = InputValidation.requireText("description", description, InputValidation.MAX_DESCRIPTION_CHARS);
    // Era is an optional field in the UI: an empty/whitespace-only value is
    // allowed and stored as "", a non-empty value is trimmed and bounded, and an
    // overlong value is rejected rather than silently truncated.
    let cleanEra = InputValidation.requireOptionalOrEmptyText("era", era, InputValidation.MAX_LOCATION_CHARS);
    let cleanTags = InputValidation.requireTags(tags);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedMemberIds);
    let cleanFilename = InputValidation.requireFilename(filename);
    let result = Lib.createSourceWithUpload(
      archiveItems,
      researchSources,
      researchState,
      cleanTitle,
      sourceType,
      cleanDescription,
      blob,
      cleanTags,
      cleanEra,
      year,
      cleanRelated,
      privacyLevel,
      classification,
      primarySpeaker,
      InputValidation.normalizeMimeType(mimeType),
      cleanFilename,
      caller,
      Time.now(),
    );
    // Notify the contributor that the research submission awaits steward review.
    let exists = notifications.toArray().any(func n = n.recipient == caller and n.notificationType == #ResearchSubmission and n.message == "Your research submission is awaiting Family Steward review.");
    if (not exists) {
      notifications.add({
        id = nextNotificationId();
        recipient = caller;
        notificationType = #ResearchSubmission;
        message = "Your research submission is awaiting Family Steward review.";
        createdAt = Time.now();
        read = false;
      });
    };
    #ok(result);
  };

  /// Creates a board post that attaches existing Archive items (by id) and/or
  /// new uploads. Each new upload creates one canonical Archive item (pending)
  /// linked to the post; the underlying file is never duplicated. Approved
  /// family members only.
  public shared ({ caller }) func createBoardPostWithMedia(
    postType : BoardTypes.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    existingArchiveItemIds : [Nat],
    newUploads : [Types.BoardMediaUpload],
    tags : [Text],
  ) : async BoardTypes.Post {
    requireBoardMemberForMedia(caller);
    let cleanTitle = InputValidation.requireOptionalText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanBody = InputValidation.requireText("body", body, InputValidation.MAX_BOARD_POST_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedPersonIds);
    let cleanTags = InputValidation.requireTags(tags);
    InputValidation.requireArraySize("newUploads", newUploads.size(), InputValidation.MAX_BOARD_ATTACHMENTS);
    InputValidation.requireArraySize("existingArchiveItemIds", existingArchiveItemIds.size(), InputValidation.MAX_MEDIA_ITEMS_PER_CALL);
    // Validate every new upload before any of them is stored. The itemType is
    // not trusted on its own: the declared MIME type must be allowed both for
    // the board attachment surface and for the surface the itemType selects, so
    // an #Audio itemType carrying an image MIME is rejected. The sanitized
    // filename and normalized MIME type are captured here and persisted on the
    // canonical Archive item, mirroring submitArchiveItem and
    // createSourceWithUpload; the raw caller-supplied values are never stored.
    let cleanUploads = List.empty<Types.BoardMediaUpload>();
    for (upload in newUploads.values()) {
      InputValidation.requireUpload(#BoardAttachment, upload.mimeType, upload.blob);
      InputValidation.requireMimeType(mediaArchiveSurfaceFor(upload.itemType), upload.mimeType);
      let cleanUploadTitle = InputValidation.requireText("upload title", upload.title, InputValidation.MAX_TITLE_CHARS);
      let cleanUploadDescription = InputValidation.requireText("upload description", upload.description, InputValidation.MAX_DESCRIPTION_CHARS);
      // Era is optional on a board media upload too: empty is allowed and
      // normalized to "", a non-empty value is trimmed and bounded.
      let cleanUploadEra = InputValidation.requireOptionalOrEmptyText("upload era", upload.era, InputValidation.MAX_LOCATION_CHARS);
      let cleanUploadTags = InputValidation.requireTags(upload.tags);
      let cleanUploadRelated = InputValidation.requireRelatedPersonIds(upload.relatedMemberIds);
      let cleanUploadFilename = InputValidation.requireFilename(upload.filename);
      cleanUploads.add({
        upload with
        title = cleanUploadTitle;
        description = cleanUploadDescription;
        mimeType = InputValidation.normalizeMimeType(upload.mimeType);
        filename = cleanUploadFilename;
        era = cleanUploadEra;
        tags = cleanUploadTags;
        relatedMemberIds = cleanUploadRelated;
      });
    };
    let post : BoardTypes.Post = {
      postId = nextPostId();
      authorAccountId = caller;
      authorPersonId = caller.toText();
      title = cleanTitle;
      body = cleanBody;
      postType;
      relatedPersonIds = cleanRelated;
      linkedMediaIds = [];
      tags = cleanTags;
      createdAt = Time.now();
      updatedAt = Time.now();
      status = #Active;
      privacyScope = #FamilyOnly;
    };
    Lib.createBoardPostWithMedia(posts, archiveItems, post, existingArchiveItemIds, cleanUploads.toArray());
  };

  /// Reconciles stale claim notifications for a claim: when the claim is
  /// `#Approved`, marks the pending `#ProfileClaimRequested` notification for
  /// the claimant as read/resolved. The profile status stays `#Claimed` and no
  /// new claim is created. Returns the number of notifications reconciled.
  public shared ({ caller }) func reconcileClaimNotifications(claimId : Nat) : async Nat {
    FamilyAuthorizationLib.requireApprovedFamilyMember(stewards, claims, caller);
    switch (claims.find(func c = c.id == claimId)) {
      case null { 0 };
      case (?claim) {
        if (claim.status != #Approved) {
          0;
        } else {
          Lib.reconcileClaimNotifications(notifications, claim);
        };
      };
    };
  };
};

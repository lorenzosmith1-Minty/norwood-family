import Result "mo:core/Result";
import List "mo:core/List";
import Map "mo:core/Map";
import Principal "mo:core/Principal";
import Runtime "mo:core/Runtime";
import Time "mo:core/Time";
import Storage "mo:caffeineai-object-storage/Storage";
import ArchiveTypes "../types/archive";
import FamilyTypes "../types/family";
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
  profiles : Map.Map<OwnershipTypes.PersonId, OwnershipTypes.PersonProfile>,
  stewards : List.List<GovernanceTypes.StewardRecord>,
) {
  /// Traps unless the caller is a signed-in approved member or Steward of
  /// `familyId`. Anonymous callers and signed-in but unapproved callers are
  /// both denied with the stable, non-technical family-membership message.
  func requireBoardMemberForMediaForFamily(caller : Principal, familyId : FamilyTypes.FamilyId) {
    if (caller.isAnonymous()) {
      Runtime.trap("Unauthorized: You must be signed in");
    };
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
      Runtime.trap("Unauthorized: Only approved family members can access the message board");
    };
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `requireBoardMemberForMediaForFamily`. Deprecated single-family form:
  /// delegates to the canonical family-scoped check with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior is unchanged.
  func requireBoardMemberForMedia(caller : Principal) {
    requireBoardMemberForMediaForFamily(caller, FamilyTypes.DEFAULT_FAMILY_ID);
  };

  /// Traps unless every person id in `personIds` belongs to `familyId`, using
  /// the canonical `FamilyAuthorizationLib.requirePeopleInFamily` predicate. A
  /// person tracked in `familyId` (including a seeded Norwood profile with no
  /// claim) or one with an approved claim in `familyId` is accepted; a person
  /// that exists only in another family is rejected, so Family A may never
  /// reference Family B people. The denial message carries no family id or
  /// principal.
  func requireRelatedPeopleInFamily(personIds : [Text], familyId : FamilyTypes.FamilyId) {
    FamilyAuthorizationLib.requirePeopleInFamily(profiles, claims, personIds, familyId);
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for the canonical
  /// `searchArchiveItemsForFamily` endpoint (owned by the Archive API). This
  /// deprecated single-family form delegates to the canonical family-scoped
  /// implementation with `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood
  /// behavior is unchanged.
  public query ({ caller }) func searchArchiveItems(filter : Types.ArchiveSearchFilter) : async [ArchiveTypes.ArchiveItem] {
    let familyId = FamilyTypes.DEFAULT_FAMILY_ID;
    let isAdmin = StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId);
    let isApprovedFamilyMember = FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId);
    Lib.searchArchiveItemsForFamily(archiveItems, familyId, filter, caller, isAdmin, isApprovedFamilyMember);
  };

  /// Uploads a research source file into `familyId`: creates one canonical
  /// Archive item (pending) in that family and links a new Research Source
  /// record to it, so no manually typed Archive Item ID is required. Requires
  /// an approved member or Steward of `familyId`; the caller is recorded as the
  /// contributor of both records. Every `relatedMemberIds` entry must belong to
  /// `familyId`.
  public shared ({ caller }) func createSourceWithUploadForFamily(
    familyId : FamilyTypes.FamilyId,
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
    createSourceWithUploadForFamilyInternal(
      familyId,
      title,
      sourceType,
      description,
      mimeType,
      blob,
      tags,
      era,
      year,
      relatedMemberIds,
      privacyLevel,
      classification,
      primarySpeaker,
      filename,
      caller,
    );
  };

  /// Internal implementation of `createSourceWithUploadForFamily` that takes the
  /// caller explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createSourceWithUploadForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
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
    caller : Principal,
  ) : Result.Result<Types.SourceUploadResult, ResearchIntakeTypes.ResearchError> {
    if (not FamilyAuthorizationLib.isApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)) {
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
    // Every related person must belong to the requested family: Family A may
    // never reference Family B people.
    requireRelatedPeopleInFamily(cleanRelated, familyId);
    let result = Lib.createSourceWithUploadForFamily(
      archiveItems,
      researchSources,
      researchState,
      familyId,
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

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `createSourceWithUploadForFamily`. Deprecated single-family form:
  /// delegates to the canonical family-scoped endpoint with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior is unchanged.
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
    createSourceWithUploadForFamilyInternal(
      FamilyTypes.DEFAULT_FAMILY_ID,
      title,
      sourceType,
      description,
      mimeType,
      blob,
      tags,
      era,
      year,
      relatedMemberIds,
      privacyLevel,
      classification,
      primarySpeaker,
      filename,
      caller,
    );
  };

  /// Creates a board post that attaches existing Archive items (by id) and/or
  /// new uploads, all scoped to `familyId`. Each new upload creates one
  /// canonical Archive item (pending) in `familyId` linked to the post; the
  /// underlying file is never duplicated. Existing Archive items are attached
  /// by id without re-uploading, and only when they belong to `familyId`.
  /// Approved members or Stewards of `familyId` only.
  public shared ({ caller }) func createBoardPostWithMediaForFamily(
    familyId : FamilyTypes.FamilyId,
    postType : BoardTypes.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    existingArchiveItemIds : [Nat],
    newUploads : [Types.BoardMediaUpload],
    tags : [Text],
  ) : async BoardTypes.Post {
    createBoardPostWithMediaForFamilyInternal(
      familyId,
      postType,
      title,
      body,
      relatedPersonIds,
      existingArchiveItemIds,
      newUploads,
      tags,
      caller,
    );
  };

  /// Internal implementation of `createBoardPostWithMediaForFamily` that takes
  /// the caller explicitly. The public family-scoped endpoint and the temporary
  /// single-family compatibility wrapper both delegate here, so the membership
  /// gate always evaluates the real caller rather than the canister principal a
  /// shared-to-shared call would otherwise present.
  func createBoardPostWithMediaForFamilyInternal(
    familyId : FamilyTypes.FamilyId,
    postType : BoardTypes.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    existingArchiveItemIds : [Nat],
    newUploads : [Types.BoardMediaUpload],
    tags : [Text],
    caller : Principal,
  ) : BoardTypes.Post {
    requireBoardMemberForMediaForFamily(caller, familyId);
    let cleanTitle = InputValidation.requireOptionalText("title", title, InputValidation.MAX_TITLE_CHARS);
    let cleanBody = InputValidation.requireText("body", body, InputValidation.MAX_BOARD_POST_CHARS);
    let cleanRelated = InputValidation.requireRelatedPersonIds(relatedPersonIds);
    let cleanTags = InputValidation.requireTags(tags);
    // Every related person must belong to the requested family: Family A may
    // never reference Family B people.
    requireRelatedPeopleInFamily(cleanRelated, familyId);
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
      // A new upload's related people must belong to the same family too.
      requireRelatedPeopleInFamily(cleanUploadRelated, familyId);
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
    Lib.createBoardPostWithMediaForFamily(posts, archiveItems, familyId, post, existingArchiveItemIds, cleanUploads.toArray());
  };

  /// TEMPORARY Tenancy 1C compatibility wrapper for
  /// `createBoardPostWithMediaForFamily`. Deprecated single-family form:
  /// delegates to the canonical family-scoped endpoint with
  /// `FamilyTypes.DEFAULT_FAMILY_ID`, so current Norwood behavior is unchanged.
  public shared ({ caller }) func createBoardPostWithMedia(
    postType : BoardTypes.PostType,
    title : ?Text,
    body : Text,
    relatedPersonIds : [Text],
    existingArchiveItemIds : [Nat],
    newUploads : [Types.BoardMediaUpload],
    tags : [Text],
  ) : async BoardTypes.Post {
    createBoardPostWithMediaForFamilyInternal(
      FamilyTypes.DEFAULT_FAMILY_ID,
      postType,
      title,
      body,
      relatedPersonIds,
      existingArchiveItemIds,
      newUploads,
      tags,
      caller,
    );
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

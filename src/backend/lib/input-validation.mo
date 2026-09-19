import Array "mo:core/Array";
import Char "mo:core/Char";
import Nat "mo:core/Nat";
import Nat32 "mo:core/Nat32";
import Result "mo:core/Result";
import Runtime "mo:core/Runtime";
import Text "mo:core/Text";
import Types "../types/input-validation";

/// Centralized backend input and upload validation for Norwood.
///
/// Every upload surface and every user-controlled text field validates through
/// this module so the rules live in exactly one place. Mixins call the
/// `require*` helpers (which trap with a clear message, matching the existing
/// codebase style) or the `validate*` helpers (which return a typed
/// `Result<_, ValidationError>` where the endpoint already returns a Result).
///
/// ## Backend size-guard limitation
///
/// `Storage.ExternalBlob` is an alias for `Blob`, so the canister CAN read the
/// uploaded byte length via `blob.size()` and DOES enforce the per-surface byte
/// ceiling here. What the canister cannot verify is the file's real content
/// type: the MIME string is supplied by the caller and is not derived from the
/// bytes. The MIME allowlist therefore rejects unsupported and forbidden types
/// but cannot detect a file whose declared type disagrees with its contents.
/// The frontend pre-read checks (file.size + file.type before `arrayBuffer()`)
/// remain the first line of defence; these backend checks are the authoritative
/// second line. The per-surface ceilings are exposed as public constants so the
/// frontend checks and the API documentation stay consistent with the backend.
module {
  // --- Byte-size ceilings (bytes) ---

  /// Profile / gallery image ceiling: 10 MB.
  public let MAX_PROFILE_IMAGE_BYTES : Nat = 10485760;
  /// Recipe image ceiling: 10 MB.
  public let MAX_RECIPE_IMAGE_BYTES : Nat = 10485760;
  /// Archive image ceiling: 15 MB.
  public let MAX_ARCHIVE_IMAGE_BYTES : Nat = 15728640;
  /// Archive PDF / document ceiling: 20 MB.
  public let MAX_ARCHIVE_DOCUMENT_BYTES : Nat = 20971520;
  /// Archive audio ceiling: 40 MB.
  public let MAX_ARCHIVE_AUDIO_BYTES : Nat = 41943040;
  /// Archive video ceiling: 75 MB.
  public let MAX_ARCHIVE_VIDEO_BYTES : Nat = 78643200;
  /// Message Board attachment ceiling: 20 MB per attachment.
  public let MAX_BOARD_ATTACHMENT_BYTES : Nat = 20971520;

  // --- Text-length limits (characters) ---

  /// Title ceiling: 150 characters.
  public let MAX_TITLE_CHARS : Nat = 150;
  /// Short description ceiling: 500 characters.
  public let MAX_SHORT_DESCRIPTION_CHARS : Nat = 500;
  /// General description / story / body ceiling: 10,000 characters.
  public let MAX_DESCRIPTION_CHARS : Nat = 10_000;
  /// Board post body ceiling: 5,000 characters.
  public let MAX_BOARD_POST_CHARS : Nat = 5_000;
  /// Board reply body ceiling: 2,000 characters.
  public let MAX_BOARD_REPLY_CHARS : Nat = 2_000;
  /// Location / era / family branch ceiling: 150 characters.
  public let MAX_LOCATION_CHARS : Nat = 150;
  /// Filename ceiling: 120 characters.
  public let MAX_FILENAME_CHARS : Nat = 120;
  /// Tag ceiling: 40 characters per tag.
  public let MAX_TAG_CHARS : Nat = 40;

  // --- Array-size limits ---

  /// Maximum tags per submission: 20.
  public let MAX_TAGS : Nat = 20;
  /// Maximum attachments per board post: 5.
  public let MAX_BOARD_ATTACHMENTS : Nat = 5;
  /// Maximum related-person ids per submission: 50.
  public let MAX_RELATED_PERSON_IDS : Nat = 50;
  /// Maximum media items processed in one backend call.
  public let MAX_MEDIA_ITEMS_PER_CALL : Nat = 5;

  // --- MIME allowlists ---

  /// Image MIME types accepted anywhere an image is allowed.
  public let IMAGE_MIME_TYPES : [Text] = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ];

  /// Document MIME types accepted for archive documents and board attachments.
  public let DOCUMENT_MIME_TYPES : [Text] = [
    "application/pdf",
    "text/plain",
  ];

  /// Audio MIME types accepted for archive audio.
  public let AUDIO_MIME_TYPES : [Text] = [
    "audio/mpeg",
    "audio/mp4",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
  ];

  /// Video MIME types accepted for archive video and board attachments.
  public let VIDEO_MIME_TYPES : [Text] = [
    "video/mp4",
    "video/webm",
    "video/quicktime",
  ];

  /// MIME types that are never accepted on any surface. Executable, script,
  /// archive, and scriptable-document formats — including SVG, which can carry
  /// script and is therefore never permitted.
  public let FORBIDDEN_MIME_TYPES : [Text] = [
    "text/html",
    "application/javascript",
    "text/javascript",
    "application/x-sh",
    "application/x-msdownload",
    "application/x-executable",
    "application/zip",
    "application/x-rar-compressed",
    "application/x-7z-compressed",
    "image/svg+xml",
  ];

  // --- MIME helpers ---

  /// Normalizes a caller-supplied MIME type: trims surrounding whitespace and
  /// lower-cases it, so `" Image/PNG "` matches `"image/png"`.
  public func normalizeMimeType(mimeType : Text) : Text {
    mimeType.trim(#predicate (func ch = ch.isWhitespace())).toLower();
  };

  /// Whether the MIME type is explicitly forbidden on every surface.
  public func isForbiddenMimeType(mimeType : Text) : Bool {
    let normalized = normalizeMimeType(mimeType);
    FORBIDDEN_MIME_TYPES.any(func allowed = allowed == normalized);
  };

  /// The MIME types allowed for a given upload surface.
  public func allowedMimeTypes(surface : Types.UploadSurface) : [Text] {
    switch (surface) {
      case (#ProfileImage) IMAGE_MIME_TYPES;
      case (#RecipeImage) IMAGE_MIME_TYPES;
      case (#ArchiveImage) IMAGE_MIME_TYPES;
      case (#ArchiveDocument) DOCUMENT_MIME_TYPES;
      case (#ArchiveAudio) AUDIO_MIME_TYPES;
      case (#ArchiveVideo) VIDEO_MIME_TYPES;
      case (#BoardAttachment) {
        IMAGE_MIME_TYPES.concat(VIDEO_MIME_TYPES).concat(DOCUMENT_MIME_TYPES);
      };
    };
  };

  /// The byte ceiling for a given upload surface.
  public func maxBytesForSurface(surface : Types.UploadSurface) : Nat {
    switch (surface) {
      case (#ProfileImage) MAX_PROFILE_IMAGE_BYTES;
      case (#RecipeImage) MAX_RECIPE_IMAGE_BYTES;
      case (#ArchiveImage) MAX_ARCHIVE_IMAGE_BYTES;
      case (#ArchiveDocument) MAX_ARCHIVE_DOCUMENT_BYTES;
      case (#ArchiveAudio) MAX_ARCHIVE_AUDIO_BYTES;
      case (#ArchiveVideo) MAX_ARCHIVE_VIDEO_BYTES;
      case (#BoardAttachment) MAX_BOARD_ATTACHMENT_BYTES;
    };
  };

  /// A human-readable label for a surface, used in error messages.
  public func surfaceLabel(surface : Types.UploadSurface) : Text {
    switch (surface) {
      case (#ProfileImage) "profile image";
      case (#RecipeImage) "recipe image";
      case (#ArchiveImage) "archive image";
      case (#ArchiveDocument) "archive document";
      case (#ArchiveAudio) "archive audio";
      case (#ArchiveVideo) "archive video";
      case (#BoardAttachment) "board attachment";
    };
  };

  /// Whether the MIME type is on the allowlist for the surface. A forbidden
  /// type is never allowed, even if it somehow appears on an allowlist.
  public func isMimeTypeAllowed(surface : Types.UploadSurface, mimeType : Text) : Bool {
    if (isForbiddenMimeType(mimeType)) {
      return false;
    };
    let normalized = normalizeMimeType(mimeType);
    allowedMimeTypes(surface).any(func allowed = allowed == normalized);
  };

  // --- Upload validation ---

  /// Validates an upload against a surface: the blob must be non-empty, within
  /// the surface's byte ceiling, and carry an allowed MIME type. Returns a typed
  /// error rather than trapping so endpoints that already return a `Result` can
  /// surface it directly.
  public func validateUpload(
    surface : Types.UploadSurface,
    mimeType : Text,
    blob : Blob,
  ) : Result.Result<(), Types.ValidationError> {
    if (isForbiddenMimeType(mimeType)) {
      return #err(#forbiddenMimeType({ mimeType = normalizeMimeType(mimeType) }));
    };
    if (not isMimeTypeAllowed(surface, mimeType)) {
      return #err(#unsupportedMimeType({
        surface = surfaceLabel(surface);
        mimeType = normalizeMimeType(mimeType);
      }));
    };
    let size = blob.size();
    if (size == 0) {
      return #err(#emptyFile({ surface = surfaceLabel(surface) }));
    };
    let maxBytes = maxBytesForSurface(surface);
    if (size > maxBytes) {
      return #err(#fileTooLarge({
        surface = surfaceLabel(surface);
        maxBytes;
        actualBytes = size;
      }));
    };
    #ok(());
  };

  /// Traps unless the upload is valid for the surface. Used by endpoints that
  /// trap on invalid input rather than returning a `Result`.
  public func requireUpload(
    surface : Types.UploadSurface,
    mimeType : Text,
    blob : Blob,
  ) {
    switch (validateUpload(surface, mimeType, blob)) {
      case (#ok _) {};
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  /// Validates that a MIME type is allowed for the surface, without a blob.
  /// Used where the file bytes are not available at the validation point.
  public func validateMimeType(
    surface : Types.UploadSurface,
    mimeType : Text,
  ) : Result.Result<(), Types.ValidationError> {
    if (isForbiddenMimeType(mimeType)) {
      return #err(#forbiddenMimeType({ mimeType = normalizeMimeType(mimeType) }));
    };
    if (not isMimeTypeAllowed(surface, mimeType)) {
      return #err(#unsupportedMimeType({
        surface = surfaceLabel(surface);
        mimeType = normalizeMimeType(mimeType);
      }));
    };
    #ok(());
  };

  /// Traps unless the MIME type is allowed for the surface.
  public func requireMimeType(surface : Types.UploadSurface, mimeType : Text) {
    switch (validateMimeType(surface, mimeType)) {
      case (#ok _) {};
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  // --- Filename sanitization ---

  /// Sanitizes a caller-supplied filename: removes path separators and control
  /// characters, strips leading/trailing whitespace, caps the result at
  /// `MAX_FILENAME_CHARS` while preserving a safe extension, and rejects an
  /// empty result. The original file bytes are never touched. The returned text
  /// is plain text and is never interpreted as HTML.
  public func sanitizeFilename(filename : Text) : Result.Result<Text, Types.ValidationError> {
    // Strip path separators and control characters, and collapse runs of
    // whitespace to a single space.
    var cleaned = "";
    var lastWasSpace = false;
    for (ch in filename.chars()) {
      if (isPathSeparator(ch) or isControlChar(ch)) {
        // Drop path separators and control characters entirely.
      } else if (ch.isWhitespace()) {
        if (not lastWasSpace) {
          cleaned := cleaned # " ";
          lastWasSpace := true;
        };
      } else {
        cleaned := cleaned # ch.toText();
        lastWasSpace := false;
      };
    };
    let trimmed = cleaned.trim(#predicate (func ch = ch.isWhitespace()));
    if (trimmed.size() == 0) {
      return #err(#invalidFilename({ reason = "Filename is empty after sanitization" }));
    };
    if (trimmed.size() <= MAX_FILENAME_CHARS) {
      return #ok(trimmed);
    };
    // Cap the length while preserving a safe extension when one is present.
    let capped = capFilenamePreservingExtension(trimmed);
    if (capped.size() == 0) {
      return #err(#invalidFilename({ reason = "Filename is empty after sanitization" }));
    };
    #ok(capped);
  };

  /// Traps unless the filename sanitizes to a non-empty value, returning the
  /// sanitized filename.
  public func requireFilename(filename : Text) : Text {
    switch (sanitizeFilename(filename)) {
      case (#ok clean) { clean };
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  /// Caps a filename at `MAX_FILENAME_CHARS`, preserving a trailing extension
  /// (up to 10 characters, e.g. `.jpeg`) when one is present so the stored name
  /// still communicates its format.
  func capFilenamePreservingExtension(filename : Text) : Text {
    let extension = safeExtension(filename);
    switch (extension) {
      case null {
        Text.fromIter(filename.toArray().sliceToArray(0, MAX_FILENAME_CHARS).values());
      };
      case (?ext) {
        let extLen = ext.size();
        if (extLen >= MAX_FILENAME_CHARS) {
          // The extension alone fills the budget; keep just the extension.
          ext;
        } else {
          // Count the stem budget down from the ceiling instead of subtracting,
          // so the compiler can prove the bound is non-negative.
          var stemBudget = 0;
          var remaining = MAX_FILENAME_CHARS;
          while (remaining > extLen) {
            stemBudget += 1;
            remaining -= 1;
          };
          let stem = Text.fromIter(filename.toArray().sliceToArray(0, stemBudget).values());
          stem # ext;
        };
      };
    };
  };

  /// Returns the trailing extension (including the dot) when the filename has a
  /// short, safe one, or `null` otherwise. A safe extension is 1–10 characters
  /// after the final dot and contains only alphanumeric characters.
  func safeExtension(filename : Text) : ?Text {
    let chars = filename.toArray();
    let len = chars.size();
    if (len == 0) {
      return null;
    };
    var dotIndex : ?Nat = null;
    var i = 0;
    while (i < len) {
      if (chars[i] == '.') {
        dotIndex := ?i;
      };
      i += 1;
    };
    switch (dotIndex) {
      case null { null };
      case (?dot) {
        // A leading dot (hidden file) or a trailing dot is not an extension.
        if (dot == 0 or dot + 1 >= len) {
          return null;
        };
        // Walk the extension once, counting its length and checking that every
        // character is alphanumeric. Counting avoids a Nat subtraction the
        // compiler cannot prove non-negative.
        var j = dot + 1;
        var extLen = 0;
        var safe = true;
        while (j < len) {
          let ch = chars[j];
          if (not (ch.isAlphabetic() or ch.isDigit())) {
            safe := false;
          };
          extLen += 1;
          j += 1;
        };
        if (safe and extLen <= 10) {
          ?Text.fromIter(chars.sliceToArray(dot, len).values());
        } else {
          null;
        };
      };
    };
  };

  /// Whether a character is a path separator (`/` or `\`).
  func isPathSeparator(ch : Char) : Bool {
    ch == '/' or ch == '\\';
  };

  /// Whether a character is an ASCII control character (code point < 0x20) or
  /// DEL (0x7F). Motoko's `Char` has no `isControl`, so the range is checked
  /// directly.
  func isControlChar(ch : Char) : Bool {
    let code = ch.toNat32();
    Nat32.less(code, 32) or code == 127;
  };

  // --- Text-length validation ---

  /// Validates that a text field is non-empty after trimming and within its
  /// character limit. Returns the trimmed value on success.
  public func validateText(
    field : Text,
    value : Text,
    maxChars : Nat,
  ) : Result.Result<Text, Types.ValidationError> {
    let trimmed = value.trim(#predicate (func ch = ch.isWhitespace()));
    if (trimmed.size() == 0) {
      return #err(#emptyText({ field }));
    };
    if (trimmed.size() > maxChars) {
      return #err(#textTooLong({ field; max = maxChars; actual = trimmed.size() }));
    };
    #ok(trimmed);
  };

  /// Traps unless the text field is non-empty and within its limit, returning
  /// the trimmed value.
  public func requireText(field : Text, value : Text, maxChars : Nat) : Text {
    switch (validateText(field, value, maxChars)) {
      case (#ok clean) { clean };
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  /// Validates an optional text field: `null` passes through unchanged; a
  /// present value must be non-empty after trimming and within its limit.
  public func validateOptionalText(
    field : Text,
    value : ?Text,
    maxChars : Nat,
  ) : Result.Result<?Text, Types.ValidationError> {
    switch (value) {
      case null { #ok(null) };
      case (?v) {
        switch (validateText(field, v, maxChars)) {
          case (#ok clean) { #ok(?clean) };
          case (#err e) { #err(e) };
        };
      };
    };
  };

  /// Traps unless the optional text field is valid, returning the trimmed value.
  public func requireOptionalText(field : Text, value : ?Text, maxChars : Nat) : ?Text {
    switch (validateOptionalText(field, value, maxChars)) {
      case (#ok clean) { clean };
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  // --- Array-size validation ---

  /// Validates that an array does not exceed its element limit.
  public func validateArraySize(
    field : Text,
    size : Nat,
    max : Nat,
  ) : Result.Result<(), Types.ValidationError> {
    if (size > max) {
      return #err(#tooManyItems({ field; max; actual = size }));
    };
    #ok(());
  };

  /// Traps unless the array is within its element limit.
  public func requireArraySize(field : Text, size : Nat, max : Nat) {
    switch (validateArraySize(field, size, max)) {
      case (#ok _) {};
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  // --- Tag validation ---

  /// Validates a tag list: at most `MAX_TAGS` tags, each non-empty and at most
  /// `MAX_TAG_CHARS` characters. Returns the trimmed tags on success.
  public func validateTags(tags : [Text]) : Result.Result<[Text], Types.ValidationError> {
    if (tags.size() > MAX_TAGS) {
      return #err(#tooManyItems({ field = "tags"; max = MAX_TAGS; actual = tags.size() }));
    };
    let cleaned = tags.map(func tag = tag.trim(#predicate (func ch = ch.isWhitespace())));
    for (tag in cleaned.values()) {
      if (tag.size() == 0) {
        return #err(#emptyText({ field = "tag" }));
      };
      if (tag.size() > MAX_TAG_CHARS) {
        return #err(#itemTooLong({ field = "tag"; max = MAX_TAG_CHARS; actual = tag.size() }));
      };
    };
    #ok(cleaned);
  };

  /// Traps unless the tag list is valid, returning the trimmed tags.
  public func requireTags(tags : [Text]) : [Text] {
    switch (validateTags(tags)) {
      case (#ok clean) { clean };
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  // --- Related-person id validation ---

  /// Validates a related-person id list: at most `MAX_RELATED_PERSON_IDS`
  /// entries, each non-empty and within the location/text ceiling.
  public func validateRelatedPersonIds(ids : [Text]) : Result.Result<[Text], Types.ValidationError> {
    if (ids.size() > MAX_RELATED_PERSON_IDS) {
      return #err(#tooManyItems({
        field = "relatedPersonIds";
        max = MAX_RELATED_PERSON_IDS;
        actual = ids.size();
      }));
    };
    let cleaned = ids.map(func id = id.trim(#predicate (func ch = ch.isWhitespace())));
    for (id in cleaned.values()) {
      if (id.size() == 0) {
        return #err(#emptyText({ field = "relatedPersonId" }));
      };
      if (id.size() > MAX_LOCATION_CHARS) {
        return #err(#itemTooLong({
          field = "relatedPersonId";
          max = MAX_LOCATION_CHARS;
          actual = id.size();
        }));
      };
    };
    #ok(cleaned);
  };

  /// Traps unless the related-person id list is valid, returning the trimmed ids.
  public func requireRelatedPersonIds(ids : [Text]) : [Text] {
    switch (validateRelatedPersonIds(ids)) {
      case (#ok clean) { clean };
      case (#err e) { Runtime.trap(describeError(e)) };
    };
  };

  // --- Error rendering ---

  /// Renders a validation error as a clear, specific, human-readable message.
  /// Never truncates the offending value silently — the message names the field
  /// and the limit that was exceeded.
  public func describeError(error : Types.ValidationError) : Text {
    switch (error) {
      case (#emptyText e) {
        "Validation error: " # e.field # " must not be empty";
      };
      case (#textTooLong e) {
        "Validation error: " # e.field # " must be at most " # e.max.toText()
        # " characters (received " # e.actual.toText() # ")";
      };
      case (#tooManyItems e) {
        "Validation error: " # e.field # " must contain at most " # e.max.toText()
        # " items (received " # e.actual.toText() # ")";
      };
      case (#itemTooLong e) {
        "Validation error: each " # e.field # " must be at most " # e.max.toText()
        # " characters (received " # e.actual.toText() # ")";
      };
      case (#unsupportedMimeType e) {
        "Validation error: unsupported file type '" # e.mimeType # "' for " # e.surface;
      };
      case (#forbiddenMimeType e) {
        "Validation error: file type '" # e.mimeType # "' is not permitted";
      };
      case (#fileTooLarge e) {
        "Validation error: " # e.surface # " must be at most " # e.maxBytes.toText()
        # " bytes (received " # e.actualBytes.toText() # " bytes)";
      };
      case (#emptyFile e) {
        "Validation error: " # e.surface # " file is empty";
      };
      case (#invalidFilename e) {
        "Validation error: invalid filename — " # e.reason;
      };
    };
  };
};

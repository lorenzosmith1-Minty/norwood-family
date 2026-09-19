module {
  /// The upload surface a file is being submitted to. Each surface has its own
  /// byte-size ceiling and its own allowed MIME set, so a file that is valid for
  /// one surface is not automatically valid for another.
  public type UploadSurface = {
    /// Profile / gallery photo. Images only, max 10 MB.
    #ProfileImage;
    /// Recipe media. Images only, max 10 MB.
    #RecipeImage;
    /// Family Archive image. Images only, max 15 MB.
    #ArchiveImage;
    /// Family Archive PDF / plain-text document. Max 20 MB.
    #ArchiveDocument;
    /// Family Archive audio. Max 40 MB.
    #ArchiveAudio;
    /// Family Archive video. Max 75 MB.
    #ArchiveVideo;
    /// Message Board attachment. Image, video, PDF, or plain text, max 20 MB.
    #BoardAttachment;
  };

  /// A single validation failure. Every variant carries the concrete value that
  /// failed so the caller can render a specific, actionable message. Validation
  /// never truncates silently.
  public type ValidationError = {
    /// A required text field was empty after trimming.
    #emptyText : { field : Text };
    /// A text field exceeded its character limit.
    #textTooLong : { field : Text; max : Nat; actual : Nat };
    /// A list exceeded its element limit.
    #tooManyItems : { field : Text; max : Nat; actual : Nat };
    /// A single list element exceeded its character limit.
    #itemTooLong : { field : Text; max : Nat; actual : Nat };
    /// A MIME type is not on the allowlist for the surface.
    #unsupportedMimeType : { surface : Text; mimeType : Text };
    /// A MIME type is explicitly forbidden (executable/script/archive/SVG).
    #forbiddenMimeType : { mimeType : Text };
    /// The uploaded bytes exceed the surface's byte ceiling.
    #fileTooLarge : { surface : Text; maxBytes : Nat; actualBytes : Nat };
    /// The uploaded blob was empty.
    #emptyFile : { surface : Text };
    /// A filename was empty after sanitization.
    #invalidFilename : { reason : Text };
  };
};

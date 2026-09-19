import { describe, expect, it } from "vitest";

import {
  AUDIO_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
  FORBIDDEN_MIME_TYPES,
  IMAGE_MIME_TYPES,
  MAX_ARCHIVE_AUDIO_BYTES,
  MAX_ARCHIVE_DOCUMENT_BYTES,
  MAX_ARCHIVE_IMAGE_BYTES,
  MAX_ARCHIVE_VIDEO_BYTES,
  MAX_BOARD_ATTACHMENT_BYTES,
  MAX_FILENAME_CHARS,
  MAX_PROFILE_IMAGE_BYTES,
  MAX_RECIPE_IMAGE_BYTES,
  SURFACE_MAX_BYTES,
  VIDEO_MIME_TYPES,
  allowedMimeTypes,
  formatBytes,
  isAudioFile,
  isDocumentFile,
  isFileValid,
  isForbiddenMimeType,
  isImageFile,
  isMimeTypeAllowed,
  isVideoFile,
  maxBytesForSurface,
  normalizeMimeType,
  sanitizeFilename,
  surfaceForArchiveItemType,
  validateArchiveFile,
  validateBoardAttachment,
  validateFile,
  validateProfilePhoto,
  validateRecipeMedia,
  validateVideoContribution,
} from "./fileValidation";

// ---------------------------------------------------------------------------
// Cover for the shared frontend pre-read upload validation contract.
//
// This is the single source of truth every upload surface consults BEFORE it
// reads a file's bytes. The accepted behavior this file asserts:
//
//   1. Forbidden types (HTML, script, executable, archive, SVG) are rejected on
//      every surface, even when a surface's allowlist would otherwise admit
//      them.
//   2. Each surface admits exactly its allowlisted MIME types and rejects the
//      rest with a clear, human-readable message.
//   3. Empty files and files over the surface ceiling are rejected; a file at
//      exactly the ceiling is accepted.
//   4. Filenames are sanitized (path separators, control characters, whitespace
//      runs, length cap preserving a safe extension) and an unusable name is
//      rejected.
//   5. The archive item-type -> surface mapping is the contract the archive
//      contribution and research intake pages rely on.
//
// These are pure functions over `File.size`/`File.type`, so they run in the
// jsdom lane without a backend. The backend remains the authoritative second
// line of defence; this file does not assert backend behavior.
// ---------------------------------------------------------------------------

/** Builds a File with a declared size without allocating that many bytes. */
function fileOfSize(name: string, type: string, size: number): File {
  const file = new File([new Uint8Array(0)], name, { type });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

describe("forbidden MIME types are rejected on every surface", () => {
  it("classifies every forbidden type as forbidden, case- and space-insensitively", () => {
    for (const forbidden of FORBIDDEN_MIME_TYPES) {
      expect(isForbiddenMimeType(forbidden)).toBe(true);
      expect(isForbiddenMimeType(`  ${forbidden.toUpperCase()}  `)).toBe(true);
    }
  });

  it("never admits a forbidden type even when it appears on a surface allowlist", () => {
    // SVG is an image MIME type but is scriptable, so it must never be admitted
    // by an image surface. The same holds for HTML on a document surface.
    expect(isMimeTypeAllowed("archiveImage", "image/svg+xml")).toBe(false);
    expect(isMimeTypeAllowed("archiveDocument", "text/html")).toBe(false);
    expect(isMimeTypeAllowed("boardAttachment", "image/svg+xml")).toBe(false);
    expect(isMimeTypeAllowed("boardAttachment", "text/html")).toBe(false);
  });

  it("rejects a scriptable SVG on the archive image surface with a clear message", () => {
    const result = validateFile(
      fileOfSize("logo.svg", "image/svg+xml", 128),
      "archiveImage",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });

  it("rejects an HTML document on the archive document surface", () => {
    const result = validateFile(
      fileOfSize("page.html", "text/html", 128),
      "archiveDocument",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });

  it("rejects an executable on the board attachment surface", () => {
    const result = validateBoardAttachment(
      fileOfSize("setup.exe", "application/x-msdownload", 128),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });

  it("rejects a zip archive on the profile image surface", () => {
    const result = validateProfilePhoto(
      fileOfSize("photos.zip", "application/zip", 128),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not permitted/i);
  });
});

describe("each surface admits exactly its allowlisted MIME types", () => {
  it("admits every allowlisted image type on the profile image surface", () => {
    for (const mime of IMAGE_MIME_TYPES) {
      expect(validateProfilePhoto(fileOfSize("photo", mime, 1024)).valid).toBe(
        true,
      );
    }
  });

  it("admits every allowlisted document type on the archive document surface", () => {
    for (const mime of DOCUMENT_MIME_TYPES) {
      expect(
        validateFile(fileOfSize("doc", mime, 1024), "archiveDocument").valid,
      ).toBe(true);
    }
  });

  it("admits every allowlisted audio type on the archive audio surface", () => {
    for (const mime of AUDIO_MIME_TYPES) {
      expect(
        validateFile(fileOfSize("clip", mime, 1024), "archiveAudio").valid,
      ).toBe(true);
    }
  });

  it("admits every allowlisted video type on the archive video surface", () => {
    for (const mime of VIDEO_MIME_TYPES) {
      expect(
        validateFile(fileOfSize("clip", mime, 1024), "archiveVideo").valid,
      ).toBe(true);
    }
  });

  it("rejects an audio file on the video-only contribution surface", () => {
    // The video contribution surface is video-only; an audio file is not on its
    // allowlist and must be rejected with a message naming the allowed types.
    const result = validateVideoContribution(
      fileOfSize("story.mp3", "audio/mpeg", 1024),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported file type/i);
    expect(result.error).toContain("video/mp4");
  });

  it("rejects a video file on the image-only recipe surface", () => {
    const result = validateRecipeMedia(
      fileOfSize("clip.mp4", "video/mp4", 1024),
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported file type/i);
  });

  it("rejects an image on the document-only archive document surface", () => {
    const result = validateFile(
      fileOfSize("photo.png", "image/png", 1024),
      "archiveDocument",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/unsupported file type/i);
  });

  it("admits image, video, and document types on the board attachment surface", () => {
    for (const mime of [
      ...IMAGE_MIME_TYPES,
      ...VIDEO_MIME_TYPES,
      ...DOCUMENT_MIME_TYPES,
    ]) {
      expect(
        validateBoardAttachment(fileOfSize("attach", mime, 1024)).valid,
      ).toBe(true);
    }
  });

  it("normalizes MIME type case and surrounding whitespace before matching", () => {
    expect(normalizeMimeType("  IMAGE/PNG  ")).toBe("image/png");
    expect(
      validateFile(fileOfSize("photo", "IMAGE/PNG", 1024), "archiveImage")
        .valid,
    ).toBe(true);
  });
});

describe("size ceilings are enforced per surface", () => {
  it("rejects an empty file with a clear message", () => {
    const result = validateFile(
      fileOfSize("empty.png", "image/png", 0),
      "archiveImage",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/empty/i);
  });

  it("accepts a file exactly at the surface ceiling", () => {
    expect(
      validateFile(
        fileOfSize("photo.png", "image/png", MAX_ARCHIVE_IMAGE_BYTES),
        "archiveImage",
      ).valid,
    ).toBe(true);
  });

  it("rejects a file one byte over the surface ceiling", () => {
    const result = validateFile(
      fileOfSize("photo.png", "image/png", MAX_ARCHIVE_IMAGE_BYTES + 1),
      "archiveImage",
    );
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at most/i);
  });

  it("enforces each surface's own ceiling", () => {
    const cases: Array<[Parameters<typeof validateFile>[1], number]> = [
      ["profileImage", MAX_PROFILE_IMAGE_BYTES],
      ["recipeImage", MAX_RECIPE_IMAGE_BYTES],
      ["archiveImage", MAX_ARCHIVE_IMAGE_BYTES],
      ["archiveDocument", MAX_ARCHIVE_DOCUMENT_BYTES],
      ["archiveAudio", MAX_ARCHIVE_AUDIO_BYTES],
      ["archiveVideo", MAX_ARCHIVE_VIDEO_BYTES],
      ["boardAttachment", MAX_BOARD_ATTACHMENT_BYTES],
    ];
    for (const [surface, ceiling] of cases) {
      expect(maxBytesForSurface(surface)).toBe(ceiling);
      expect(SURFACE_MAX_BYTES[surface]).toBe(ceiling);
      const mime = allowedMimeTypes(surface)[0];
      expect(validateFile(fileOfSize("f", mime, ceiling), surface).valid).toBe(
        true,
      );
      expect(
        validateFile(fileOfSize("f", mime, ceiling + 1), surface).valid,
      ).toBe(false);
    }
  });

  it("formats byte counts compactly for the error message", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10.0 MB");
  });
});

describe("filename sanitization mirrors the backend rules", () => {
  it("strips path separators so a traversal name cannot escape", () => {
    expect(sanitizeFilename("../../etc/passwd")).toBe("....etcpasswd");
    expect(sanitizeFilename("a\\b\\c.png")).toBe("abc.png");
  });

  it("removes control characters and collapses whitespace runs", () => {
    expect(sanitizeFilename("my\u0000file\u0007.png")).toBe("myfile.png");
    expect(sanitizeFilename("my   file.png")).toBe("my file.png");
  });

  it("trims surrounding whitespace", () => {
    expect(sanitizeFilename("  letter.pdf  ")).toBe("letter.pdf");
  });

  it("caps a long filename while preserving a safe extension", () => {
    const long = `${"a".repeat(300)}.pdf`;
    const sanitized = sanitizeFilename(long);
    expect(sanitized).not.toBeNull();
    expect(sanitized!.length).toBeLessThanOrEqual(MAX_FILENAME_CHARS);
    expect(sanitized!.endsWith(".pdf")).toBe(true);
  });

  it("returns null when nothing usable remains", () => {
    expect(sanitizeFilename("")).toBeNull();
    expect(sanitizeFilename("   ")).toBeNull();
    expect(sanitizeFilename("///")).toBeNull();
  });
});

describe("archive item type maps to the governing upload surface", () => {
  it("maps each file-bearing archive item type to its surface", () => {
    expect(surfaceForArchiveItemType("Photo")).toBe("archiveImage");
    expect(surfaceForArchiveItemType("Document")).toBe("archiveDocument");
    expect(surfaceForArchiveItemType("Audio")).toBe("archiveAudio");
    expect(surfaceForArchiveItemType("Video")).toBe("archiveVideo");
  });

  it("returns null for item types that carry no uploaded file", () => {
    for (const itemType of [
      "WrittenStoryNote",
      "Research",
      "WorkBusiness",
      "Other",
      "",
    ]) {
      expect(surfaceForArchiveItemType(itemType)).toBeNull();
    }
  });

  it("validates an archive file against the surface implied by its item type", () => {
    expect(
      validateArchiveFile(
        fileOfSize("letter.txt", "text/plain", 1024),
        "Document",
      ).valid,
    ).toBe(true);
    expect(
      validateArchiveFile(fileOfSize("clip.mp4", "video/mp4", 1024), "Document")
        .valid,
    ).toBe(false);
    expect(
      validateArchiveFile(
        fileOfSize("story.txt", "text/plain", 1024),
        "WrittenStoryNote",
      ).valid,
    ).toBe(false);
  });
});

describe("content-type predicates agree with the surface allowlists", () => {
  it("classifies files by their MIME category", () => {
    expect(isImageFile(fileOfSize("p.png", "image/png", 1))).toBe(true);
    expect(isVideoFile(fileOfSize("v.mp4", "video/mp4", 1))).toBe(true);
    expect(isAudioFile(fileOfSize("a.mp3", "audio/mpeg", 1))).toBe(true);
    expect(isDocumentFile(fileOfSize("d.pdf", "application/pdf", 1))).toBe(
      true,
    );

    expect(isImageFile(fileOfSize("v.mp4", "video/mp4", 1))).toBe(false);
    expect(isVideoFile(fileOfSize("a.mp3", "audio/mpeg", 1))).toBe(false);
    expect(isAudioFile(fileOfSize("p.png", "image/png", 1))).toBe(false);
    expect(isDocumentFile(fileOfSize("p.png", "image/png", 1))).toBe(false);
  });

  it("treats a forbidden type as not belonging to any category", () => {
    expect(isImageFile(fileOfSize("x.svg", "image/svg+xml", 1))).toBe(false);
    expect(isDocumentFile(fileOfSize("x.html", "text/html", 1))).toBe(false);
  });

  it("exposes a boolean convenience predicate matching validateFile", () => {
    expect(
      isFileValid(fileOfSize("p.png", "image/png", 1024), "archiveImage"),
    ).toBe(true);
    expect(
      isFileValid(fileOfSize("x.svg", "image/svg+xml", 1024), "archiveImage"),
    ).toBe(false);
  });
});

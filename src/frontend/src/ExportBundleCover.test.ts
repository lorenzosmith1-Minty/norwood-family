import "@testing-library/jest-dom/vitest";
import {
  type ExportEnvelope,
  ExportFormat,
  type ExportMetadata,
  ExportScope,
} from "@/backend";
import {
  type ArchiveMediaManifestEntry,
  type ArchiveMediaManifestSummary,
  BundleTooLargeError,
  type MediaRetrievalActor,
  assembleArchiveZip,
  assignMediaPaths,
  buildBundleFilename,
  buildReadme,
  fallbackMediaFilename,
  isAvailable,
  mapBundleError,
  parseMediaManifest,
  preflightBundle,
  resolveMediaBasename,
  resolveUniqueBasenames,
  retrieveBundleMedia,
  sanitizeMediaFilename,
} from "@/lib/archiveBundle";
import {
  BUNDLE_TOO_LARGE_MESSAGE,
  MAX_BUNDLE_ASSET_COUNT,
  MAX_BUNDLE_SINGLE_FILE_BYTES,
  MAX_BUNDLE_TOTAL_BYTES,
  MAX_BUNDLE_ZIP_BYTES,
} from "@/lib/archiveBundleLimits";
import { serializeExportEnvelope } from "@/lib/exportDownload";
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Phase 5D — Family Archive bundle engine (pure helpers).
//
// These tests exercise the framework-free bundle engine directly: read-only
// manifest parsing, the resource preflight, portable path sanitization and
// deterministic collision resolution, ZIP assembly (with the export envelope
// byte-identical to the JSON-only download), the export-instance + media-N
// retrieval flow, and neutral error mapping.
//
// They do NOT exercise the real canister: the actor is a typed local mock, so
// no backend runtime behavior is observed here. That limit is recorded in the
// episode's coverageLimits.
// ---------------------------------------------------------------------------

function makeEnvelope(payload: unknown): ExportEnvelope {
  const metadata: ExportMetadata = {
    generatedAt: 1_700_000_000_000_000_000n,
    scope: ExportScope.FamilyArchive,
    sourceAppName: "Norwood",
    schemaVersion: 1n,
    sourceAppVersion: "1.0.0",
    familyRef: "Norwood",
    format: ExportFormat.JSON,
  };
  return { metadata, payloadJson: JSON.stringify(payload) };
}

function makeEntry(
  overrides: Partial<ArchiveMediaManifestEntry> = {},
): ArchiveMediaManifestEntry {
  return {
    mediaRef: "media-1",
    mediaKind: "ArchiveItem",
    availability: "Available",
    byteSize: 100,
    filename: null,
    title: "",
    ...overrides,
  };
}

function makeSummary(
  overrides: Partial<ArchiveMediaManifestSummary> = {},
): ArchiveMediaManifestSummary {
  return {
    assetCount: 1,
    knownTotalBytes: 100,
    unavailableCount: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Manifest parsing (read-only)
// ---------------------------------------------------------------------------

describe("parseMediaManifest (read-only)", () => {
  it("parses entries and the resource summary from the payload", () => {
    const envelope = makeEnvelope({
      mediaManifest: [
        {
          ref: { portableId: "media-1" },
          mediaKind: "ProfilePhoto",
          availability: "Available",
          byteSize: 2048,
          filename: "portrait.jpg",
          title: "Portrait",
        },
        {
          ref: { portableId: "media-2" },
          mediaKind: "ArchiveItem",
          availability: "Unavailable",
          byteSize: null,
          filename: null,
          title: "Missing item",
        },
      ],
      mediaManifestSummary: {
        assetCount: 2,
        knownTotalBytes: 2048,
        unavailableCount: 1,
      },
    });

    const manifest = parseMediaManifest(envelope);

    expect(manifest.entries).toHaveLength(2);
    expect(manifest.entries[0]).toMatchObject({
      mediaRef: "media-1",
      mediaKind: "ProfilePhoto",
      availability: "Available",
      byteSize: 2048,
      filename: "portrait.jpg",
    });
    expect(manifest.entries[1]).toMatchObject({
      mediaRef: "media-2",
      availability: "Unavailable",
      byteSize: null,
    });
    expect(manifest.summary).toEqual({
      assetCount: 2,
      knownTotalBytes: 2048,
      unavailableCount: 1,
    });
  });

  it("returns an empty manifest for malformed payload JSON instead of throwing", () => {
    const envelope: ExportEnvelope = {
      metadata: makeEnvelope({}).metadata,
      payloadJson: "{not valid json",
    };

    const manifest = parseMediaManifest(envelope);

    expect(manifest.entries).toEqual([]);
    expect(manifest.summary).toEqual({
      assetCount: 0,
      knownTotalBytes: 0,
      unavailableCount: 0,
    });
  });

  it("returns an empty manifest when the manifest is absent", () => {
    const manifest = parseMediaManifest(makeEnvelope({ persons: [] }));

    expect(manifest.entries).toEqual([]);
    expect(manifest.summary.assetCount).toBe(0);
  });

  it("skips entries without a portable media ref", () => {
    const envelope = makeEnvelope({
      mediaManifest: [
        { mediaKind: "ArchiveItem", availability: "Available" },
        { ref: { portableId: "media-9" }, availability: "Available" },
      ],
    });

    const manifest = parseMediaManifest(envelope);

    expect(manifest.entries.map((entry) => entry.mediaRef)).toEqual([
      "media-9",
    ]);
  });

  it("does not mutate the envelope payload", () => {
    const envelope = makeEnvelope({
      mediaManifest: [{ ref: { portableId: "media-1" } }],
    });
    const before = envelope.payloadJson;

    parseMediaManifest(envelope);

    expect(envelope.payloadJson).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// Preflight
// ---------------------------------------------------------------------------

describe("preflightBundle", () => {
  it("proceeds for an archive within every limit", () => {
    expect(preflightBundle(makeSummary(), [makeEntry()])).toEqual({
      kind: "proceed",
    });
  });

  it("rejects when the asset count exceeds the limit", () => {
    const decision = preflightBundle(
      makeSummary({ assetCount: MAX_BUNDLE_ASSET_COUNT + 1 }),
      [],
    );
    expect(decision).toEqual({
      kind: "too-large",
      message: BUNDLE_TOO_LARGE_MESSAGE,
    });
  });

  it("rejects when the aggregate known bytes exceed the limit", () => {
    const decision = preflightBundle(
      makeSummary({ knownTotalBytes: MAX_BUNDLE_TOTAL_BYTES + 1 }),
      [],
    );
    expect(decision.kind).toBe("too-large");
  });

  it("rejects when a single known file exceeds the per-file limit", () => {
    const decision = preflightBundle(makeSummary(), [
      makeEntry({ byteSize: MAX_BUNDLE_SINGLE_FILE_BYTES + 1 }),
    ]);
    expect(decision.kind).toBe("too-large");
  });

  it("ignores unknown per-file sizes when the aggregate is within limits", () => {
    const decision = preflightBundle(makeSummary(), [
      makeEntry({ byteSize: null }),
    ]);
    expect(decision).toEqual({ kind: "proceed" });
  });

  it("uses a neutral message that exposes no internal detail", () => {
    const decision = preflightBundle(
      makeSummary({ assetCount: MAX_BUNDLE_ASSET_COUNT + 1 }),
      [],
    );
    if (decision.kind !== "too-large") throw new Error("expected too-large");
    expect(decision.message).toBe(BUNDLE_TOO_LARGE_MESSAGE);
    expect(decision.message).not.toMatch(/media-\d|principal|storage/i);
  });
});

// ---------------------------------------------------------------------------
// Portable path sanitization
// ---------------------------------------------------------------------------

describe("sanitizeMediaFilename", () => {
  it("strips ../ traversal and keeps only the final component", () => {
    expect(sanitizeMediaFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeMediaFilename("media/../secret.jpg")).toBe("secret.jpg");
  });

  it("strips absolute path markers", () => {
    expect(sanitizeMediaFilename("/etc/shadow")).toBe("shadow");
    expect(sanitizeMediaFilename("C:\\Windows\\system32\\evil.exe")).toBe(
      "evil.exe",
    );
  });

  it("normalizes Windows separators to a safe basename", () => {
    expect(sanitizeMediaFilename("folder\\sub\\photo.jpg")).toBe("photo.jpg");
  });

  it("removes unsafe path characters", () => {
    expect(sanitizeMediaFilename('a<b>c:d"e|f?g*h.jpg')).toBe("abcdefgh.jpg");
  });

  it("removes control characters", () => {
    expect(sanitizeMediaFilename("pho\u0000to\u001f.jpg")).toBe("photo.jpg");
  });

  it("strips leading dots so no hidden file is created", () => {
    expect(sanitizeMediaFilename(".hidden.jpg")).toBe("hidden.jpg");
    expect(sanitizeMediaFilename("...photo.jpg")).toBe("photo.jpg");
  });

  it("returns null when nothing safe remains", () => {
    expect(sanitizeMediaFilename(null)).toBeNull();
    expect(sanitizeMediaFilename("")).toBeNull();
    expect(sanitizeMediaFilename("..")).toBeNull();
    expect(sanitizeMediaFilename("/")).toBeNull();
  });
});

describe("fallbackMediaFilename / resolveMediaBasename", () => {
  it("derives a deterministic fallback from the media-N token and kind", () => {
    expect(
      fallbackMediaFilename(
        makeEntry({ mediaRef: "media-3", mediaKind: "ProfilePhoto" }),
      ),
    ).toBe("media-3.jpg");
    expect(
      fallbackMediaFilename(
        makeEntry({ mediaRef: "media-4", mediaKind: "ArchiveItem" }),
      ),
    ).toBe("media-4.bin");
  });

  it("prefers a safe manifest filename and falls back when unusable", () => {
    expect(resolveMediaBasename(makeEntry({ filename: "reunion.jpg" }))).toBe(
      "reunion.jpg",
    );
    expect(
      resolveMediaBasename(makeEntry({ mediaRef: "media-7", filename: "../" })),
    ).toBe("media-7.bin");
  });
});

// ---------------------------------------------------------------------------
// Deterministic collision resolution
// ---------------------------------------------------------------------------

describe("resolveUniqueBasenames / assignMediaPaths", () => {
  it("resolves duplicate basenames deterministically as photo.jpg, photo-2.jpg, photo-3.jpg", () => {
    expect(
      resolveUniqueBasenames(["photo.jpg", "photo.jpg", "photo.jpg"]),
    ).toEqual(["photo.jpg", "photo-2.jpg", "photo-3.jpg"]);
  });

  it("keeps distinct basenames untouched", () => {
    expect(resolveUniqueBasenames(["a.jpg", "b.jpg"])).toEqual([
      "a.jpg",
      "b.jpg",
    ]);
  });

  it("reserves emitted names so a generated suffix cannot collide with a later original basename", () => {
    // The second `photo.jpg` is emitted as `photo-2.jpg`; the third original
    // basename is already `photo-2.jpg`, so it must advance again rather than
    // reuse the emitted name. Every returned basename is distinct.
    const resolved = resolveUniqueBasenames([
      "photo.jpg",
      "photo.jpg",
      "photo-2.jpg",
    ]);
    expect(resolved).toEqual(["photo.jpg", "photo-2.jpg", "photo-2-2.jpg"]);
    expect(new Set(resolved).size).toBe(resolved.length);
  });

  it("never emits a duplicate path even when generated suffixes collide with originals", () => {
    const entries = [
      makeEntry({ mediaRef: "media-1", filename: "photo.jpg" }),
      makeEntry({ mediaRef: "media-2", filename: "photo.jpg" }),
      makeEntry({ mediaRef: "media-3", filename: "photo-2.jpg" }),
    ];

    const paths = assignMediaPaths(entries);

    expect(paths.get("media-1")).toBe("media/photo.jpg");
    expect(paths.get("media-2")).toBe("media/photo-2.jpg");
    expect(paths.get("media-3")).toBe("media/photo-2-2.jpg");
    expect(new Set(paths.values()).size).toBe(3);
  });

  it("assigns unique media/ paths keyed by media-N so no item overwrites another", () => {
    const entries = [
      makeEntry({ mediaRef: "media-1", filename: "photo.jpg" }),
      makeEntry({ mediaRef: "media-2", filename: "photo.jpg" }),
      makeEntry({ mediaRef: "media-3", filename: "photo.jpg" }),
    ];

    const paths = assignMediaPaths(entries);

    expect(paths.get("media-1")).toBe("media/photo.jpg");
    expect(paths.get("media-2")).toBe("media/photo-2.jpg");
    expect(paths.get("media-3")).toBe("media/photo-3.jpg");
    expect(new Set(paths.values()).size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// ZIP assembly
// ---------------------------------------------------------------------------

describe("assembleArchiveZip", () => {
  it("contains norwood-export.json byte-identical to the JSON-only serialization", () => {
    const envelope = makeEnvelope({ persons: [{ name: "Clayton Norwood" }] });

    const zipped = assembleArchiveZip({ envelope, media: [] });
    const files = unzipSync(zipped);
    const decoder = new TextDecoder();

    expect(Object.keys(files)).toContain("norwood-export.json");
    expect(decoder.decode(files["norwood-export.json"])).toBe(
      serializeExportEnvelope(envelope),
    );
  });

  it("includes media entries under media/ and an optional README.txt", () => {
    const envelope = makeEnvelope({ persons: [] });
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const zipped = assembleArchiveZip({
      envelope,
      media: [{ mediaRef: "media-1", path: "media/photo.jpg", bytes }],
      includeReadme: true,
      now: new Date("2024-05-06T00:00:00Z"),
    });
    const files = unzipSync(zipped);

    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "media/photo.jpg",
      "norwood-export.json",
    ]);
    expect(files["media/photo.jpg"]).toEqual(bytes);
  });

  it("omits README.txt when not requested", () => {
    const zipped = assembleArchiveZip({
      envelope: makeEnvelope({ persons: [] }),
      media: [],
    });
    expect(Object.keys(unzipSync(zipped))).not.toContain("README.txt");
  });

  it("builds a README with only non-sensitive info", () => {
    const envelope = makeEnvelope({ persons: [] });
    const readme = buildReadme(envelope, new Date("2024-05-06T00:00:00Z"));

    expect(readme).toContain("Norwood family archive export");
    expect(readme).toContain("Generated: 2024-05-06");
    expect(readme).toContain("Schema version: 1");
    expect(readme).not.toMatch(/principal|storage|media-\d/i);
  });

  it("builds a dated bundle filename with no private identifiers", () => {
    expect(buildBundleFilename(new Date(2024, 4, 6))).toBe(
      "norwood-family-archive-2024-05-06.zip",
    );
  });
});

// ---------------------------------------------------------------------------
// Retrieval orchestration (export-instance + media-N only)
// ---------------------------------------------------------------------------

describe("retrieveBundleMedia", () => {
  it("retrieves every available item through the export-instance + media-N flow", async () => {
    const calls: Array<[string, string]> = [];
    const actor: MediaRetrievalActor = {
      async retrieveFamilyArchiveMedia(exportInstanceRef, mediaRef) {
        calls.push([exportInstanceRef, mediaRef]);
        return { __kind__: "ok", ok: { bytes: new Uint8Array([9]) } };
      },
    };
    const entries = [
      makeEntry({ mediaRef: "media-1" }),
      makeEntry({ mediaRef: "media-2" }),
    ];
    const paths = assignMediaPaths(entries);

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths,
    });

    expect(calls).toEqual([
      ["export-1", "media-1"],
      ["export-1", "media-2"],
    ]);
    if (outcome.kind !== "success") throw new Error("expected success");
    expect(outcome.items.map((item) => item.mediaRef)).toEqual([
      "media-1",
      "media-2",
    ]);
    expect(outcome.items[0].bytes).toBeInstanceOf(Uint8Array);
    expect(outcome.skipped).toBe(0);
  });

  it("skips a per-item err without substituting another asset and continues", async () => {
    const actor: MediaRetrievalActor = {
      async retrieveFamilyArchiveMedia(_ref, mediaRef) {
        if (mediaRef === "media-2")
          return { __kind__: "err", err: "MediaUnavailable" };
        return { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } };
      },
    };
    const entries = [
      makeEntry({ mediaRef: "media-1" }),
      makeEntry({ mediaRef: "media-2" }),
      makeEntry({ mediaRef: "media-3" }),
    ];
    const paths = assignMediaPaths(entries);

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths,
    });

    if (outcome.kind !== "success") throw new Error("expected success");
    expect(outcome.items.map((item) => item.mediaRef)).toEqual([
      "media-1",
      "media-3",
    ]);
    expect(outcome.skipped).toBe(1);
  });

  it("skips manifest entries marked Unavailable without calling the backend", async () => {
    const calls: Array<[string, string]> = [];
    const actor: MediaRetrievalActor = {
      async retrieveFamilyArchiveMedia(exportInstanceRef, mediaRef) {
        calls.push([exportInstanceRef, mediaRef]);
        return { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } };
      },
    };
    const entries = [
      makeEntry({ mediaRef: "media-1", availability: "Available" }),
      makeEntry({ mediaRef: "media-2", availability: "Unavailable" }),
      makeEntry({ mediaRef: "media-3", availability: "Available" }),
    ];
    const paths = assignMediaPaths(entries);

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths,
    });

    // The known-unavailable entry is never retrieved and no substitute asset is
    // used; the remaining archive continues to build.
    expect(calls).toEqual([
      ["export-1", "media-1"],
      ["export-1", "media-3"],
    ]);
    if (outcome.kind !== "success") throw new Error("expected success");
    expect(outcome.items.map((item) => item.mediaRef)).toEqual([
      "media-1",
      "media-3",
    ]);
    expect(outcome.skipped).toBe(1);
  });

  it("stops with a fatal failure when a retrieval throws", async () => {
    const calls: Array<[string, string]> = [];
    const actor: MediaRetrievalActor = {
      async retrieveFamilyArchiveMedia(_ref, mediaRef) {
        calls.push([_ref, mediaRef]);
        if (mediaRef === "media-1") throw new Error("transport down");
        return { __kind__: "ok", ok: { bytes: new Uint8Array([2]) } };
      },
    };
    const entries = [
      makeEntry({ mediaRef: "media-1" }),
      makeEntry({ mediaRef: "media-2" }),
    ];
    const paths = assignMediaPaths(entries);

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths,
    });

    // A thrown transport error is fatal: retrieval stops immediately rather
    // than silently skipping the item and producing a partial bundle.
    expect(outcome).toEqual({ kind: "failed" });
    expect(calls).toEqual([["export-1", "media-1"]]);
  });

  it("reports progress before each retrieval", async () => {
    const onProgress = vi.fn();
    const actor: MediaRetrievalActor = {
      async retrieveFamilyArchiveMedia() {
        return { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } };
      },
    };
    const entries = [
      makeEntry({ mediaRef: "media-1" }),
      makeEntry({ mediaRef: "media-2" }),
    ];

    await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths: assignMediaPaths(entries),
      onProgress,
    });

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("never retrieves by raw storage id or rebuilt ordering", async () => {
    const calls: Array<[string, string]> = [];
    const actor: MediaRetrievalActor = {
      async retrieveFamilyArchiveMedia(exportInstanceRef, mediaRef) {
        calls.push([exportInstanceRef, mediaRef]);
        return { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } };
      },
    };
    const entries = [makeEntry({ mediaRef: "media-5" })];

    await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-42",
      entries,
      paths: assignMediaPaths(entries),
    });

    // The only arguments are the opaque export instance and the media-N token.
    expect(calls).toEqual([["export-42", "media-5"]]);
  });
});

// ---------------------------------------------------------------------------
// Error mapping and availability
// ---------------------------------------------------------------------------

describe("mapBundleError / isAvailable", () => {
  it("maps authorization rejections to a neutral denied outcome", () => {
    for (const tag of [
      "NotSignedIn",
      "NotSteward",
      "FamilyNotFound",
      "ExportInstanceNotFound",
      "ExportInstanceExpired",
    ]) {
      expect(mapBundleError(tag)).toEqual({ kind: "denied" });
    }
  });

  it("maps every other failure to a neutral failed outcome without leaking the tag", () => {
    const outcome = mapBundleError("MediaUnavailable");
    expect(outcome).toEqual({ kind: "failed" });
    expect(JSON.stringify(outcome)).not.toContain("MediaUnavailable");
  });

  it("treats only the Available availability as retrievable", () => {
    expect(isAvailable(makeEntry({ availability: "Available" }))).toBe(true);
    expect(isAvailable(makeEntry({ availability: "Unavailable" }))).toBe(false);
  });
});

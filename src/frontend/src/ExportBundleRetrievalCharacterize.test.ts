import "@testing-library/jest-dom/vitest";
import {
  type ExportEnvelope,
  ExportFormat,
  ExportMediaRetrievalError,
  type ExportMetadata,
  ExportScope,
} from "@/backend";
import {
  type ArchiveMediaManifestEntry,
  type ArchiveMediaManifestSummary,
  type MediaRetrievalActor,
  assembleArchiveZip,
  assignMediaPaths,
  buildBundleFilename,
  buildReadme,
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
} from "@/lib/archiveBundleLimits";
import { serializeExportEnvelope } from "@/lib/exportDownload";
import { unzipSync } from "fflate";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Phase 5D-H1 — Family Archive bundle retrieval: adjacent-behavior
// characterization.
//
// The change under construction reclassifies per-item retrieval errors:
// `MediaUnavailable` and `MediaNotFound` remain per-item skips, while
// authorization / export-instance rejections (`NotSignedIn`, `NotSteward`,
// `FamilyNotFound`, `ExportInstanceNotFound`, `ExportInstanceExpired`) must
// STOP the whole bundle instead of being silently swallowed.
//
// This file deliberately does NOT assert the current skip-everything behavior
// for those authorization tags: that is the behavior being changed, and pinning
// it would freeze the bug. It protects the STABLE surrounding behavior the
// change must preserve:
//
//   A. Manifest parsing stays read-only and tolerant of malformed payloads.
//   B. The preflight limits still stop an oversized archive before retrieval.
//   C. ZIP assembly still embeds the unchanged envelope and media under media/.
//   D. Filename sanitization and deterministic collision resolution are stable.
//   E. The two accepted per-item skips (`MediaUnavailable`, `MediaNotFound`)
//      still skip one asset and let the bundle continue.
//   F. `mapBundleError` still maps authorization tags to a neutral `denied`
//      outcome and never surfaces the raw tag.
//
// This is pure-helper + typed local actor-mock coverage. It does NOT exercise
// the real canister: the actor is a typed local mock, so no backend runtime
// behavior is observed here. That limit is recorded in the episode's
// coverageLimits.
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

/** A typed local actor mock that records the (ref, mediaRef) call pairs. */
function makeActor(
  handler: (
    exportInstanceRef: string,
    mediaRef: string,
  ) =>
    | { __kind__: "ok"; ok: { bytes: Uint8Array } }
    | { __kind__: "err"; err: string },
): { actor: MediaRetrievalActor; calls: Array<[string, string]> } {
  const calls: Array<[string, string]> = [];
  const actor: MediaRetrievalActor = {
    async retrieveFamilyArchiveMedia(exportInstanceRef, mediaRef) {
      calls.push([exportInstanceRef, mediaRef]);
      return handler(exportInstanceRef, mediaRef);
    },
  };
  return { actor, calls };
}

// ---------------------------------------------------------------------------
// A. Manifest parsing stays read-only and tolerant.
// ---------------------------------------------------------------------------

describe("manifest parsing (stable characterization)", () => {
  it("parses entries and the resource summary without mutating the payload", () => {
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
      ],
      mediaManifestSummary: {
        assetCount: 1,
        knownTotalBytes: 2048,
        unavailableCount: 0,
      },
    });
    const before = envelope.payloadJson;

    const manifest = parseMediaManifest(envelope);

    expect(manifest.entries).toHaveLength(1);
    expect(manifest.entries[0]).toMatchObject({
      mediaRef: "media-1",
      mediaKind: "ProfilePhoto",
      availability: "Available",
      byteSize: 2048,
      filename: "portrait.jpg",
    });
    expect(manifest.summary).toEqual({
      assetCount: 1,
      knownTotalBytes: 2048,
      unavailableCount: 0,
    });
    expect(envelope.payloadJson).toBe(before);
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
});

// ---------------------------------------------------------------------------
// B. Preflight limits stop an oversized archive before retrieval.
// ---------------------------------------------------------------------------

describe("preflight limits (stable characterization)", () => {
  it("proceeds within every limit and rejects each exceeded limit neutrally", () => {
    expect(preflightBundle(makeSummary(), [makeEntry()])).toEqual({
      kind: "proceed",
    });
    expect(
      preflightBundle(
        makeSummary({ assetCount: MAX_BUNDLE_ASSET_COUNT + 1 }),
        [],
      ).kind,
    ).toBe("too-large");
    expect(
      preflightBundle(
        makeSummary({ knownTotalBytes: MAX_BUNDLE_TOTAL_BYTES + 1 }),
        [],
      ).kind,
    ).toBe("too-large");
    expect(
      preflightBundle(makeSummary(), [
        makeEntry({ byteSize: MAX_BUNDLE_SINGLE_FILE_BYTES + 1 }),
      ]).kind,
    ).toBe("too-large");
  });

  it("uses a neutral too-large message that exposes no internal detail", () => {
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
// C. ZIP assembly embeds the unchanged envelope and media under media/.
// ---------------------------------------------------------------------------

describe("ZIP assembly (stable characterization)", () => {
  it("embeds norwood-export.json byte-identical to the JSON-only serialization", () => {
    const envelope = makeEnvelope({ persons: [{ name: "Clayton Norwood" }] });

    const files = unzipSync(assembleArchiveZip({ envelope, media: [] }));
    const decoder = new TextDecoder();

    expect(decoder.decode(files["norwood-export.json"])).toBe(
      serializeExportEnvelope(envelope),
    );
  });

  it("places retrieved media under media/ and includes a non-sensitive README", () => {
    const envelope = makeEnvelope({ persons: [] });
    const bytes = new Uint8Array([1, 2, 3, 4]);

    const files = unzipSync(
      assembleArchiveZip({
        envelope,
        media: [{ mediaRef: "media-1", path: "media/photo.jpg", bytes }],
        includeReadme: true,
        now: new Date("2024-05-06T00:00:00Z"),
      }),
    );

    expect(Object.keys(files).sort()).toEqual([
      "README.txt",
      "media/photo.jpg",
      "norwood-export.json",
    ]);
    expect(files["media/photo.jpg"]).toEqual(bytes);
    const readme = new TextDecoder().decode(files["README.txt"]);
    expect(readme).toContain("Norwood family archive export");
    expect(readme).not.toMatch(/principal|storage|media-\d/i);
  });

  it("builds a dated bundle filename with no private identifiers", () => {
    expect(buildBundleFilename(new Date(2024, 4, 6))).toBe(
      "norwood-family-archive-2024-05-06.zip",
    );
  });
});

// ---------------------------------------------------------------------------
// D. Filename sanitization and deterministic collision resolution are stable.
// ---------------------------------------------------------------------------

describe("portable path sanitization (stable characterization)", () => {
  it("strips traversal, absolute markers, unsafe characters, and leading dots", () => {
    expect(sanitizeMediaFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeMediaFilename("C:\\Windows\\system32\\evil.exe")).toBe(
      "evil.exe",
    );
    expect(sanitizeMediaFilename('a<b>c:d"e|f?g*h.jpg')).toBe("abcdefgh.jpg");
    expect(sanitizeMediaFilename(".hidden.jpg")).toBe("hidden.jpg");
    expect(sanitizeMediaFilename("..")).toBeNull();
  });

  it("resolves duplicate basenames deterministically without overwriting", () => {
    expect(
      resolveUniqueBasenames(["photo.jpg", "photo.jpg", "photo-2.jpg"]),
    ).toEqual(["photo.jpg", "photo-2.jpg", "photo-2-2.jpg"]);
  });

  it("assigns unique media/ paths keyed by media-N", () => {
    const entries = [
      makeEntry({ mediaRef: "media-1", filename: "photo.jpg" }),
      makeEntry({ mediaRef: "media-2", filename: "photo.jpg" }),
    ];

    const paths = assignMediaPaths(entries);

    expect(paths.get("media-1")).toBe("media/photo.jpg");
    expect(paths.get("media-2")).toBe("media/photo-2.jpg");
    expect(new Set(paths.values()).size).toBe(2);
  });

  it("falls back to a deterministic media-N name when the manifest filename is unusable", () => {
    expect(
      resolveMediaBasename(makeEntry({ mediaRef: "media-7", filename: "../" })),
    ).toBe("media-7.bin");
  });
});

// ---------------------------------------------------------------------------
// E. The two accepted per-item skips still skip one asset and continue.
//
// These are the ONLY per-item errors that remain skips after the change, so
// pinning them here is safe and is exactly the behavior the change must keep.
// ---------------------------------------------------------------------------

describe("accepted per-item skips (stable characterization)", () => {
  it("skips MediaUnavailable for one asset and continues the bundle", async () => {
    const { actor, calls } = makeActor((_ref, mediaRef) =>
      mediaRef === "media-2"
        ? { __kind__: "err", err: ExportMediaRetrievalError.MediaUnavailable }
        : { __kind__: "ok", ok: { bytes: new Uint8Array([1]) } },
    );
    const entries = [
      makeEntry({ mediaRef: "media-1" }),
      makeEntry({ mediaRef: "media-2" }),
      makeEntry({ mediaRef: "media-3" }),
    ];

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths: assignMediaPaths(entries),
    });

    expect(calls).toEqual([
      ["export-1", "media-1"],
      ["export-1", "media-2"],
      ["export-1", "media-3"],
    ]);
    if (outcome.kind !== "success") throw new Error("expected success");
    expect(outcome.items.map((item) => item.mediaRef)).toEqual([
      "media-1",
      "media-3",
    ]);
    expect(outcome.skipped).toBe(1);
  });

  it("skips MediaNotFound for one asset and continues the bundle", async () => {
    const { actor } = makeActor((_ref, mediaRef) =>
      mediaRef === "media-1"
        ? { __kind__: "err", err: ExportMediaRetrievalError.MediaNotFound }
        : { __kind__: "ok", ok: { bytes: new Uint8Array([2]) } },
    );
    const entries = [
      makeEntry({ mediaRef: "media-1" }),
      makeEntry({ mediaRef: "media-2" }),
    ];

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths: assignMediaPaths(entries),
    });

    if (outcome.kind !== "success") throw new Error("expected success");
    expect(outcome.items.map((item) => item.mediaRef)).toEqual(["media-2"]);
    expect(outcome.skipped).toBe(1);
  });

  it("skips a manifest entry marked Unavailable without calling the backend", async () => {
    const { actor, calls } = makeActor(() => ({
      __kind__: "ok",
      ok: { bytes: new Uint8Array([1]) },
    }));
    const entries = [
      makeEntry({ mediaRef: "media-1", availability: "Available" }),
      makeEntry({ mediaRef: "media-2", availability: "Unavailable" }),
      makeEntry({ mediaRef: "media-3", availability: "Available" }),
    ];

    const outcome = await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-1",
      entries,
      paths: assignMediaPaths(entries),
    });

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

  it("retrieves only through the export-instance + media-N flow, in manifest order", async () => {
    const { actor, calls } = makeActor(() => ({
      __kind__: "ok",
      ok: { bytes: new Uint8Array([1]) },
    }));
    const entries = [
      makeEntry({ mediaRef: "media-5" }),
      makeEntry({ mediaRef: "media-6" }),
    ];

    await retrieveBundleMedia({
      actor,
      exportInstanceRef: "export-42",
      entries,
      paths: assignMediaPaths(entries),
    });

    expect(calls).toEqual([
      ["export-42", "media-5"],
      ["export-42", "media-6"],
    ]);
  });

  it("reports progress before each retrieval", async () => {
    const onProgress = vi.fn();
    const { actor } = makeActor(() => ({
      __kind__: "ok",
      ok: { bytes: new Uint8Array([1]) },
    }));
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
});

// ---------------------------------------------------------------------------
// F. Neutral error mapping never surfaces the raw backend tag.
// ---------------------------------------------------------------------------

describe("neutral error mapping (stable characterization)", () => {
  it("maps every authorization / export-instance tag to a neutral denied outcome", () => {
    for (const tag of [
      ExportMediaRetrievalError.NotSignedIn,
      ExportMediaRetrievalError.NotSteward,
      ExportMediaRetrievalError.FamilyNotFound,
      ExportMediaRetrievalError.ExportInstanceNotFound,
      ExportMediaRetrievalError.ExportInstanceExpired,
    ]) {
      const outcome = mapBundleError(tag);
      expect(outcome).toEqual({ kind: "denied" });
      expect(JSON.stringify(outcome)).not.toContain(tag);
    }
  });

  it("maps a non-authorization failure to a neutral failed outcome without the tag", () => {
    const outcome = mapBundleError(ExportMediaRetrievalError.MediaUnavailable);
    expect(outcome).toEqual({ kind: "failed" });
    expect(JSON.stringify(outcome)).not.toContain("MediaUnavailable");
  });

  it("treats only the Available availability as retrievable", () => {
    expect(isAvailable(makeEntry({ availability: "Available" }))).toBe(true);
    expect(isAvailable(makeEntry({ availability: "Unavailable" }))).toBe(false);
  });
});

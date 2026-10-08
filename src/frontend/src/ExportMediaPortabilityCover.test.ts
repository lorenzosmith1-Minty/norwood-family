import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type ExportEnvelope,
  ExportMediaAvailability,
  ExportMediaKind,
  type ExportMediaRetrieval,
  ExportMediaRetrievalError,
  ExportScope,
} from "@/backend";

// ---------------------------------------------------------------------------
// Phase 5C — FamilyArchive media portability (frontend consumer contract +
// source-level invariants).
//
// The real-canister PocketIC lane
// (test/pocketic/export-media-portability.cover.test.ts) is the primary
// coverage for the retrieval behavior and the manifest contents. This file
// exists for the two things that lane cannot observe in this environment:
//
//   A. The generated consumer contract the frontend compiles against: the
//      wrapper exposes `retrieveFamilyArchiveMedia` with the typed `Result_6`
//      shape, and the portable media enums/types are present. A bindgen
//      regression that dropped or reshaped the retrieval method would silently
//      break every consumer; this pins the seam.
//   B. The source-level guarantees that are properties of the pure library and
//      the mixin rather than of any single canister call: the manifest carries
//      no bytes and no raw internal storage identifier, the retrieval returns
//      bytes directly and never a URL, the authorization order is
//      anonymous -> family -> Steward, and the summary is derived from the
//      manifest.
//
// This is a static-source + typed consumer-contract test. It does NOT exercise
// the real canister; the PocketIC lane is the only place backend runtime
// behavior is observed, and it is recorded in the episode's coverageLimits.
// ---------------------------------------------------------------------------

const here = path.dirname(fileURLToPath(import.meta.url));
// `here` is app/src/frontend/src; the backend sources live at app/src/backend.
const backendRoot = path.resolve(here, "..", "..", "backend");

function readBackend(relativePath: string): string {
  return readFileSync(path.join(backendRoot, relativePath), "utf8");
}

/** Strips `//` line comments and `/* ... *\/` block comments from Motoko source. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/\/\/[^\n]*/gu, "");
}

const exportTypes = stripComments(readBackend(path.join("types", "export.mo")));
const exportLib = stripComments(readBackend(path.join("lib", "export.mo")));
const exportApi = stripComments(
  readBackend(path.join("mixins", "export-api.mo")),
);

/**
 * Returns the body of a top-level `public func <name>(` declaration up to the
 * next top-level declaration (`public func` or `func`), so assertions are
 * scoped to the one function rather than the rest of the file.
 */
function functionBody(source: string, signature: string): string {
  const start = source.indexOf(signature);
  expect(start).toBeGreaterThan(-1);
  const candidates = [
    source.indexOf("\n  public func ", start + 1),
    source.indexOf("\n  func ", start + 1),
  ].filter((index) => index !== -1);
  const end = candidates.length === 0 ? -1 : Math.min(...candidates);
  return source.slice(start, end === -1 ? undefined : end);
}

// ---------------------------------------------------------------------------
// A. The generated consumer contract the frontend compiles against.
// ---------------------------------------------------------------------------

describe("media retrieval consumer contract (generated bindings)", () => {
  it("exposes retrieveFamilyArchiveMedia on the typed service wrapper", () => {
    const wrapper = readFileSync(path.join(here, "backend.ts"), "utf8");
    // Phase 5C-H1 changed the retrieval endpoint to take the opaque
    // export-instance reference plus the export-local media token; its
    // generated result type is `Result_6` (ok: ExportMediaRetrieval, err:
    // ExportMediaRetrievalError).
    expect(wrapper).toContain(
      "retrieveFamilyArchiveMedia(exportInstanceRef: ExportInstanceRef, mediaRef: string): Promise<Result_6>",
    );
  });

  it("keeps the portable media enums on the consumer surface", () => {
    expect(Object.values(ExportMediaKind).sort()).toEqual([
      "ArchiveItem",
      "ProfilePhoto",
    ]);
    expect(Object.values(ExportMediaAvailability).sort()).toEqual([
      "Available",
      "Unavailable",
    ]);
    // Phase 5C-H1 added the neutral export-instance errors alongside the
    // existing retrieval errors.
    expect(Object.values(ExportMediaRetrievalError).sort()).toEqual([
      "ExportInstanceExpired",
      "ExportInstanceNotFound",
      "FamilyNotFound",
      "MediaNotFound",
      "MediaUnavailable",
      "NotSignedIn",
      "NotSteward",
    ]);
  });

  it("types a retrieval result as bytes plus portable metadata, never a URL", () => {
    // The typed consumer contract: a successful retrieval carries the asset's
    // bytes and the same portable metadata the manifest entry exposes. There is
    // no URL field on the type.
    const retrieval: ExportMediaRetrieval = {
      ref: {
        kind: "Media" as ExportMediaRetrieval["ref"]["kind"],
        portableId: "media-1",
      },
      mediaKind: ExportMediaKind.ArchiveItem,
      title: "Family reunion photograph",
      mimeType: "image/png",
      filename: "reunion-photo.png",
      byteSize: 5n,
      relatedPersonRef: {
        kind: "Person" as ExportMediaRetrieval["ref"]["kind"],
        portableId: "person-1",
      },
      relatedArchiveRef: {
        kind: "ArchiveItem" as ExportMediaRetrieval["ref"]["kind"],
        portableId: "archive-1",
      },
      uploadedAt: 1n,
      availability: ExportMediaAvailability.Available,
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    };

    expect(retrieval.bytes).toBeInstanceOf(Uint8Array);
    expect(retrieval.ref.portableId).toBe("media-1");
    expect(retrieval.mediaKind).toBe(ExportMediaKind.ArchiveItem);
    expect(retrieval.availability).toBe(ExportMediaAvailability.Available);
    expect(retrieval).not.toHaveProperty("url");
  });

  it("keeps the export envelope result type versioned and self-describing", () => {
    // The existing export schema remains versioned: the envelope still carries
    // a schemaVersion and the FamilyArchive scope.
    const envelope: ExportEnvelope = {
      metadata: {
        generatedAt: 1n,
        scope: ExportScope.FamilyArchive,
        sourceAppName: "Norwood",
        schemaVersion: 1n,
        sourceAppVersion: "1.0.0",
        familyRef: "Norwood",
        format: "JSON" as ExportEnvelope["metadata"]["format"],
      },
      payloadJson: "{}",
    };
    expect(envelope.metadata.schemaVersion).toBe(1n);
    expect(envelope.metadata.scope).toBe(ExportScope.FamilyArchive);
  });
});

// ---------------------------------------------------------------------------
// B. The manifest carries portable metadata only (source-level).
// ---------------------------------------------------------------------------

describe("portable media manifest (source-level)", () => {
  it("declares the portable media kind and availability enums", () => {
    expect(exportTypes).toContain("public type ExportMediaKind = {");
    expect(exportTypes).toContain("#ProfilePhoto;");
    expect(exportTypes).toContain("#ArchiveItem;");
    expect(exportTypes).toContain("public type ExportMediaAvailability = {");
    expect(exportTypes).toContain("#Available;");
    expect(exportTypes).toContain("#Unavailable;");
  });

  it("carries the required portable fields on each manifest entry", () => {
    const start = exportTypes.indexOf("public type ExportMediaRef = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const body = exportTypes.slice(start, end);
    for (const field of [
      "ref : ExportRecordRef;",
      "mediaKind : ExportMediaKind;",
      "title : Text;",
      "mimeType : ?Text;",
      "filename : ?Text;",
      "byteSize : ?Nat;",
      "relatedPersonRef : ?ExportRecordRef;",
      "relatedArchiveRef : ?ExportRecordRef;",
      "uploadedAt : ?Int;",
      "availability : ExportMediaAvailability;",
      "reference : Text;",
    ]) {
      expect(body).toContain(field);
    }
  });

  it("never carries bytes or a raw internal storage identifier on a manifest entry", () => {
    const start = exportTypes.indexOf("public type ExportMediaRef = {");
    const end = exportTypes.indexOf("};", start);
    const body = exportTypes.slice(start, end).toLowerCase();
    // `byteSize` is a portable size, not the bytes themselves; the forbidden
    // tokens below are the binary payload and raw storage identifiers.
    for (const forbidden of [
      "blob",
      "storageid",
      "storagekey",
      "objectid",
      "url",
      "secret",
      "token",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("declares the manifest summary with count, known bytes, and unavailable count", () => {
    const start = exportTypes.indexOf(
      "public type ExportMediaManifestSummary = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const body = exportTypes.slice(start, end);
    expect(body).toContain("assetCount : Nat;");
    expect(body).toContain("knownTotalBytes : Nat;");
    expect(body).toContain("unavailableCount : Nat;");
  });

  it("derives the summary from the manifest rather than a separate source", () => {
    const body = functionBody(exportLib, "public func mediaManifestSummary(");
    expect(body).toContain("assetCount = manifest.size();");
    expect(body).toContain("knownTotalBytes");
    expect(body).toContain("unavailableCount");
    // A missing byte size is skipped, not counted as zero.
    expect(body).toContain("case (?size) { knownTotalBytes += size };");
    // An unavailable asset is counted neutrally.
    expect(body).toContain("case (#Unavailable) { unavailableCount += 1 };");
  });

  it("serializes the summary into the payload JSON", () => {
    expect(exportLib).toContain('"\\"mediaManifestSummary\\":"');
    expect(exportLib).toContain('"\\"assetCount\\":"');
    expect(exportLib).toContain('"\\"knownTotalBytes\\":"');
    expect(exportLib).toContain('"\\"unavailableCount\\":"');
  });
});

// ---------------------------------------------------------------------------
// C. Retrieval authorization and no-URL guarantee (source-level).
// ---------------------------------------------------------------------------

describe("media retrieval authorization (source-level)", () => {
  it("exposes the retrieval endpoint through the mixin", () => {
    expect(exportApi).toContain(
      "public shared ({ caller }) func retrieveFamilyArchiveMedia(",
    );
    expect(exportApi).toContain("ExportLib.retrieveFamilyArchiveMedia(");
  });

  it("orders authorization anonymous -> family -> Steward", () => {
    const body = functionBody(
      exportLib,
      "public func retrieveFamilyArchiveMedia(",
    );
    const anonymous = body.indexOf("caller.isAnonymous()");
    const family = body.indexOf("families.find(func f = f.id == familyId)");
    const steward = body.indexOf(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(anonymous).toBeGreaterThan(-1);
    expect(family).toBeGreaterThan(anonymous);
    expect(steward).toBeGreaterThan(family);
    // Each gate returns its own stable error.
    expect(body).toContain("return #err(#NotSignedIn);");
    expect(body).toContain("return #err(#FamilyNotFound)");
    expect(body).toContain("return #err(#NotSteward);");
  });

  it("resolves the token against the export instance's stored bindings, never a rebuilt manifest", () => {
    const body = functionBody(
      exportLib,
      "public func retrieveFamilyArchiveMedia(",
    );
    // Phase 5C-H1: the export instance is resolved first, and an unknown
    // instance is neutral rather than falling back to a rebuilt manifest.
    expect(body).toContain(
      "exportInstances.find(func i = i.ref == exportInstanceRef)",
    );
    expect(body).toContain(
      "case null { return #err(#ExportInstanceNotFound) };",
    );
    // The token is resolved ONLY against this instance's stored bindings.
    expect(body).toContain("exportMediaBindings.find(func b =");
    expect(body).toContain("b.exportInstanceRef == exportInstanceRef");
    expect(body).toContain("b.mediaRef == mediaRef");
    expect(body).toContain("b.familyId == familyId");
    // The binding's source key is looked up family-qualified, so a binding from
    // one family never resolves an asset in another.
    expect(body).toContain(
      "archiveItems.find(func a = a.id.toText() == binding.sourceKey and a.familyId == familyId)",
    );
    // A token not bound to the instance is MediaNotFound.
    expect(body).toContain("case null { return #err(#MediaNotFound) };");
    // An unavailable asset is MediaUnavailable, not a failure.
    expect(body).toContain("return #err(#MediaUnavailable);");
  });

  it("treats an expired instance as neutral and never rebuilds against current media", () => {
    const body = functionBody(
      exportLib,
      "public func retrieveFamilyArchiveMedia(",
    );
    // Expiry is checked against the instance's own bounded lifecycle and
    // returns the neutral expired error.
    expect(body).toContain("Time.now() > instance.expiresAt");
    expect(body).toContain("return #err(#ExportInstanceExpired);");
  });

  it("returns bytes directly and never a URL or storage secret", () => {
    const body = functionBody(
      exportLib,
      "public func retrieveFamilyArchiveMedia(",
    );
    // The success record carries the asset's bytes and no URL field.
    expect(body).toContain("bytes = item.blob;");
    expect(body).toContain("bytes = photo.blob;");
    expect(body).not.toContain("url");
    expect(body).not.toContain("http");
    expect(body).not.toContain("secret");
    // The retrieval type itself carries bytes, never a URL.
    const start = exportTypes.indexOf("public type ExportMediaRetrieval = {");
    const end = exportTypes.indexOf("};", start);
    const retrievalType = exportTypes.slice(start, end).toLowerCase();
    expect(retrievalType).toContain("bytes : blob;");
    expect(retrievalType).not.toContain("url");
  });

  it("declares the stable retrieval error set", () => {
    const start = exportTypes.indexOf(
      "public type ExportMediaRetrievalError = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const body = exportTypes.slice(start, end);
    for (const variant of [
      "#NotSignedIn;",
      "#NotSteward;",
      "#FamilyNotFound;",
      "#MediaNotFound;",
      "#MediaUnavailable;",
      "#ExportInstanceNotFound;",
      "#ExportInstanceExpired;",
    ]) {
      expect(body).toContain(variant);
    }
  });
});

// ---------------------------------------------------------------------------
// D. The existing export schema remains versioned (source-level).
// ---------------------------------------------------------------------------

describe("versioned export schema (source-level)", () => {
  it("keeps the current schema version pinned at 1", () => {
    expect(exportTypes).toContain(
      "public let CURRENT_EXPORT_SCHEMA_VERSION : Nat = 1;",
    );
    expect(exportLib).toContain(
      "schemaVersion = ExportTypes.CURRENT_EXPORT_SCHEMA_VERSION;",
    );
  });

  it("keeps the media manifest and summary on the versioned payload", () => {
    const start = exportTypes.indexOf("public type ExportPayload = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const body = exportTypes.slice(start, end);
    expect(body).toContain("mediaManifest : [ExportMediaRef];");
    expect(body).toContain(
      "mediaManifestSummary : ExportMediaManifestSummary;",
    );
  });
});

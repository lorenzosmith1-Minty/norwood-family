import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type ExportFamilyArchiveResult,
  ExportFormat,
  ExportMediaAvailability,
  ExportMediaKind,
  type ExportMediaRetrieval,
  ExportMediaRetrievalError,
  ExportRecordKind,
  type ExportRecordRef,
  ExportScope,
} from "@/backend";

// ---------------------------------------------------------------------------
// Expired export-instance pruning — adjacent-behavior characterization.
//
// The accepted change adds a BOUNDED LAZY CLEANUP that prunes expired
// FamilyArchive export-instance mappings (`exportInstances` and their
// `exportMediaBindings`) during an existing export/retrieval operation. It
// deliberately adds no scheduler and no background system.
//
// This file deliberately does NOT characterize the pruning itself: it asserts
// nothing about when cleanup runs, how many entries it removes per call, or
// that any entry is removed at all. Those are the change under construction,
// and freezing them now would pin a design that has not been accepted.
//
// What it protects is the ADJACENT behavior the cleanup must leave untouched,
// all of it named in the accepted "Preserve existing 5C-H1 behavior" list:
//
//   A. The bounded 7-day lifecycle and the neutral expiry semantics — the TTL
//      constant, `buildExportInstance`'s `expiresAt = createdAt + TTL`, and the
//      retrieval branch that returns `#ExportInstanceExpired` for a
//      still-present expired instance and `#ExportInstanceNotFound` for an
//      unknown/pruned one. Both are neutral: retrieval never rebuilds against
//      current media.
//   B. Active (non-expired) instances and their bindings remain resolvable —
//      the token is resolved ONLY against the instance's stored bindings, and
//      the binding's own family must match the instance's family.
//   C. Family isolation — the instance's own family is the tenant boundary, and
//      a Family A instance never resolves Family B assets.
//   D. The cleanup must not delete family data — it may only touch the
//      export-instance mapping collections, never archive items, profile
//      photos, export audit history, or actual media bytes.
//   E. Existing 5C-H1 behavior is unchanged — Steward gating, the media
//      manifest, export-local media refs, the no-public-URL rule, and the
//      generated consumer contract.
//
// This is a static-source + typed consumer-contract characterization. It does
// NOT exercise the real canister: the PocketIC lane is the only place backend
// runtime behavior is observed, and it is recorded in the episode's
// coverageLimits. The frontend suite mocks the actor, so no backend runtime
// behavior is visible here.
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

const exportLib = stripComments(readBackend(path.join("lib", "export.mo")));
const exportTypes = stripComments(readBackend(path.join("types", "export.mo")));
const exportApi = stripComments(
  readBackend(path.join("mixins", "export-api.mo")),
);

/**
 * The body of a top-level `func <name>(` declaration (public or private), up to
 * the next top-level declaration. Comments are already stripped, so a comment
 * marker cannot be used as the boundary.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const privateEnd = source.indexOf("\n  func ", start + 1);
  const publicEnd = source.indexOf("\n  public func ", start + 1);
  const boundary = [privateEnd, publicEnd]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return source.slice(start, boundary === undefined ? undefined : boundary);
}

// ---------------------------------------------------------------------------
// A. The bounded lifecycle and neutral expiry semantics are preserved.
//
// The cleanup prunes by the SAME `expiresAt` lifecycle retrieval already
// enforces. These assertions pin the lifecycle constant and the neutral
// expired/not-found branches so a cleanup that changed the window, or that
// turned an expired ref into a rebuild, fails here.
// ---------------------------------------------------------------------------

describe("bounded export-instance lifecycle (characterization)", () => {
  it("keeps the 7-day TTL constant", () => {
    // 7 days in nanoseconds. The cleanup must prune by this same window.
    expect(exportLib).toContain(
      "public let EXPORT_INSTANCE_TTL_NANOS : Int = 604_800_000_000_000;",
    );
  });

  it("derives expiresAt from createdAt plus the TTL", () => {
    const body = functionBody(exportLib, "buildExportInstance");
    expect(body).toContain(
      "expiresAt = createdAt + EXPORT_INSTANCE_TTL_NANOS;",
    );
    // The instance binds the opaque ref to its family and creation window.
    expect(body).toContain("ref = exportInstanceRef;");
    expect(body).toContain("familyId;");
    expect(body).toContain("createdAt;");
  });

  it("declares the instance record with ref, family, and the lifecycle window", () => {
    const start = exportTypes.indexOf("public type ExportInstance = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const instance = exportTypes.slice(start, end);
    for (const field of [
      "ref : ExportInstanceRef;",
      "familyId : Text;",
      "createdAt : Int;",
      "expiresAt : Int;",
    ]) {
      expect(instance).toContain(field);
    }
  });

  it("treats a still-present expired instance as neutral, never a rebuild", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    // Expiry is checked against the instance's own bounded lifecycle and
    // returns the neutral expired error.
    expect(body).toContain("Time.now() > instance.expiresAt");
    expect(body).toContain("return #err(#ExportInstanceExpired);");
  });

  it("treats an unknown (never-issued or already-pruned) instance as neutral", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    // The instance is resolved first; an unknown ref is neutral and is NEVER
    // resolved against a rebuilt current manifest.
    expect(body).toContain(
      "exportInstances.find(func i = i.ref == exportInstanceRef)",
    );
    expect(body).toContain(
      "case null { return #err(#ExportInstanceNotFound) };",
    );
  });

  it("keeps both neutral instance errors on the retrieval error set", () => {
    const start = exportTypes.indexOf(
      "public type ExportMediaRetrievalError = {",
    );
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const body = exportTypes.slice(start, end);
    expect(body).toContain("#ExportInstanceNotFound;");
    expect(body).toContain("#ExportInstanceExpired;");
  });
});

// ---------------------------------------------------------------------------
// B. Active instances and their bindings remain resolvable.
//
// The cleanup removes only expired mappings. An active instance's token must
// still resolve against its stored bindings, and the binding's own family must
// match the instance's family.
// ---------------------------------------------------------------------------

describe("active export-instance resolution (characterization)", () => {
  it("resolves the media token only against the instance's stored bindings", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    expect(body).toContain("exportMediaBindings.find(func b =");
    expect(body).toContain("b.exportInstanceRef == exportInstanceRef");
    expect(body).toContain("b.mediaRef == mediaRef");
    expect(body).toContain("b.familyId == familyId");
    // A token not bound to the instance is neutral, not a rebuild.
    expect(body).toContain("case null { return #err(#MediaNotFound) };");
  });

  it("keeps the binding record shape the cleanup must preserve", () => {
    const start = exportTypes.indexOf("public type ExportMediaBinding = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const binding = exportTypes.slice(start, end);
    for (const field of [
      "exportInstanceRef : ExportInstanceRef;",
      "familyId : Text;",
      "mediaRef : Text;",
      "mediaKind : ExportMediaKind;",
      "sourceKind : ExportMediaSourceKind;",
      "sourceKey : Text;",
    ]) {
      expect(binding).toContain(field);
    }
  });

  it("builds bindings in the same archive-item-then-profile-photo order as the manifest", () => {
    const body = functionBody(exportLib, "buildExportMediaBindings");
    // Archive items first, then profile photos, so media-N tokens align with
    // the export manifest. The cleanup must not reorder or drop active ones.
    const archiveIndex = body.indexOf("for (item in archiveItems.values())");
    const photoIndex = body.indexOf(
      "for ((personId, photo) in profilePhotos.values())",
    );
    expect(archiveIndex).toBeGreaterThan(-1);
    expect(photoIndex).toBeGreaterThan(archiveIndex);
    expect(body).toContain("sourceKind = #ArchiveItem;");
    expect(body).toContain("sourceKind = #ProfilePhoto;");
  });

  it("mints a globally unique instance ref so an active instance resolves to its own family", () => {
    const body = functionBody(exportApi, "nextExportInstanceRef");
    // A single global monotonic counter over ALL instances, so two families
    // never share a ref. The counter is derived from the maximum SURVIVING
    // suffix (max-existing-ref + 1), not the list size: the cleanup shrinks the
    // list, so a size-derived counter would re-emit a ref already held by a
    // surviving active instance. The cleanup must not renumber active instances.
    expect(body).toContain('"export-" # (maxSuffix + 1).toText()');
    // The suffix is parsed from the surviving refs, so the counter is monotonic
    // over what actually remains after pruning.
    expect(body).toContain("exportInstanceRefSuffix(instance.ref)");
  });
});

// ---------------------------------------------------------------------------
// C. Family isolation is preserved.
//
// The instance's own family is the tenant boundary. A Family A instance never
// resolves Family B assets, and the binding's family must match.
// ---------------------------------------------------------------------------

describe("export-instance family isolation (characterization)", () => {
  it("derives the tenant boundary from the instance's own family", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    expect(body).toContain("let familyId = instance.familyId;");
    // The family must still exist before any asset lookup.
    expect(body).toContain("families.find(func f = f.id == familyId) == null");
    expect(body).toContain("return #err(#FamilyNotFound)");
  });

  it("looks up the bound archive asset family-qualified", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    // A binding from one family never resolves an asset in another.
    expect(body).toContain(
      "archiveItems.find(func a = a.id.toText() == binding.sourceKey and a.familyId == familyId)",
    );
  });

  it("resolves a bound profile photo through the family-qualified gallery key", () => {
    const body = functionBody(exportLib, "findProfilePhoto");
    expect(body).toContain("galleryStorageKey(familyId, personId)");
    // The default family uses the legacy bare key; every other family is
    // family-qualified, so a binding never crosses the boundary.
    const keyBody = functionBody(exportLib, "galleryStorageKey");
    expect(keyBody).toContain("familyId == FamilyTypes.DEFAULT_FAMILY_ID");
    expect(keyBody).toContain('familyId # "::" # personId');
  });
});

// ---------------------------------------------------------------------------
// D. The cleanup must not delete family data.
//
// The pruning is scoped to the export-instance mapping collections. It must
// never remove archive items, profile photos, export audit history, or actual
// media bytes. These assertions pin the collections the cleanup may touch and
// the read-only guarantee the retrieval path already holds.
// ---------------------------------------------------------------------------

describe("cleanup scope: export-instance mappings only (characterization)", () => {
  it("keeps the export-instance mapping collections declared in main.mo", () => {
    const main = stripComments(readBackend("main.mo"));
    // The two collections the cleanup may prune.
    expect(main).toContain("exportInstances");
    expect(main).toContain("exportMediaBindings");
    // The export audit history is a separate collection and is NOT part of the
    // instance mapping; the cleanup must not prune it.
    expect(main).toContain("exportAudit");
  });

  it("keeps the retrieval path read-only with respect to family data", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    // Retrieval returns bytes directly and never mutates a family record.
    expect(body).toContain("bytes = item.blob;");
    expect(body).toContain("bytes = photo.blob;");
    // No deletion or mutation of archive items, photos, or audit entries.
    for (const forbidden of [
      "archiveItems.remove",
      "galleries.remove",
      "exportAudit.remove",
      "exportAudit.add",
    ]) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("keeps the export audit write as the only export mutation", () => {
    // Both export endpoints record an audit entry; the exported payload itself
    // is never stored, and the audit history is never pruned by the cleanup.
    expect(exportApi).toContain(
      "recordExportAudit(familyId, #MyData, caller, result);",
    );
    expect(exportApi).toContain(
      "recordExportAudit(familyId, #FamilyArchive, caller, result);",
    );
    const auditBody = functionBody(exportApi, "recordExportAudit");
    expect(auditBody).not.toContain("payloadJson");
    expect(auditBody).not.toContain("envelope");
  });

  it("never copies media bytes into the export-instance mapping", () => {
    // The binding records only where the bytes already live; no bytes are
    // stored, so pruning a binding can never delete actual media.
    const start = exportTypes.indexOf("public type ExportMediaBinding = {");
    const end = exportTypes.indexOf("};", start);
    const binding = exportTypes.slice(start, end).toLowerCase();
    for (const forbidden of ["blob", "bytes", "content"]) {
      expect(binding).not.toContain(forbidden);
    }
  });
});

// ---------------------------------------------------------------------------
// E. Existing 5C-H1 behavior is unchanged.
//
// The cleanup runs during an existing export/retrieval operation. It must not
// weaken Steward gating, reshape the media manifest, reintroduce a public URL,
// or change the generated consumer contract.
// ---------------------------------------------------------------------------

describe("existing 5C-H1 behavior (characterization)", () => {
  it("keeps Steward gating on retrieval", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("return #err(#NotSignedIn);");
    expect(body).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(body).toContain("return #err(#NotSteward);");
  });

  it("returns bytes directly and never a public URL or storage secret", () => {
    const body = functionBody(exportLib, "retrieveFamilyArchiveMedia");
    expect(body).not.toContain("url");
    expect(body).not.toContain("http");
    expect(body).not.toContain("secret");
    const start = exportTypes.indexOf("public type ExportMediaRetrieval = {");
    const end = exportTypes.indexOf("};", start);
    const retrievalType = exportTypes.slice(start, end).toLowerCase();
    expect(retrievalType).toContain("bytes : blob;");
    expect(retrievalType).not.toContain("url");
  });

  it("keeps the export-local media reference shape on the manifest", () => {
    const start = exportTypes.indexOf("public type ExportMediaRef = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const mediaRef = exportTypes.slice(start, end);
    expect(mediaRef).toContain("ref : ExportRecordRef;");
    expect(mediaRef).toContain("reference : Text;");
    expect(mediaRef).toContain("availability : ExportMediaAvailability;");
  });

  it("keeps the generated consumer contract for the retrieval endpoint", () => {
    const wrapper = readFileSync(path.join(here, "backend.ts"), "utf8");
    expect(wrapper).toContain(
      "retrieveFamilyArchiveMedia(exportInstanceRef: ExportInstanceRef, mediaRef: string): Promise<Result_6>",
    );
    expect(wrapper).toContain(
      "exportFamilyArchive(familyId: FamilyId): Promise<Result_41>",
    );
  });

  it("keeps the neutral instance errors on the typed consumer enum", () => {
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

  it("types a successful retrieval as bytes plus portable metadata, never a URL", () => {
    const ref: ExportRecordRef = {
      kind: ExportRecordKind.Media,
      portableId: "media-1",
    };
    const retrieval: ExportMediaRetrieval = {
      ref,
      mediaKind: ExportMediaKind.ArchiveItem,
      title: "Family reunion photograph",
      mimeType: "image/png",
      filename: "reunion-photo.png",
      byteSize: 5n,
      relatedPersonRef: undefined,
      relatedArchiveRef: undefined,
      uploadedAt: 1n,
      availability: ExportMediaAvailability.Available,
      bytes: new Uint8Array([1, 2, 3, 4, 5]),
    };
    expect(retrieval.bytes).toBeInstanceOf(Uint8Array);
    expect(retrieval.ref.portableId).toBe("media-1");
    expect(retrieval).not.toHaveProperty("url");
  });

  it("keeps the FamilyArchive result carrying the envelope plus the opaque instance ref", () => {
    const result: ExportFamilyArchiveResult = {
      envelope: {
        metadata: {
          generatedAt: 1n,
          scope: ExportScope.FamilyArchive,
          sourceAppName: "Norwood",
          schemaVersion: 1n,
          sourceAppVersion: "1.0.0",
          familyRef: "Norwood",
          format: ExportFormat.JSON,
        },
        payloadJson: "{}",
      },
      exportInstanceRef: "export-1",
    };
    expect(result.exportInstanceRef).toBe("export-1");
    expect(result.envelope.metadata.schemaVersion).toBe(1n);
  });
});

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  type ExportEnvelope,
  ExportFormat,
  type ExportMetadata,
  ExportScope,
} from "@/backend";

// ---------------------------------------------------------------------------
// Phase 5C — media portability: adjacent-behavior characterization.
//
// The requested Phase 5C change intentionally alters two things:
//
//   1. The export media manifest gains portable metadata fields (byte size,
//      related export-local person/archive refs, availability status, and a
//      created/uploaded timestamp).
//   2. A new authorized Steward media-retrieval endpoint is added.
//
// This file deliberately does NOT characterize either of those. It asserts
// nothing about the media manifest's field set, the availability state, or any
// retrieval endpoint — those are the change under construction, and freezing
// them now would pin a design that has not been accepted.
//
// What it protects is the SURROUNDING behavior the Phase 5C change must leave
// untouched, all of it named in the accepted "Preserve existing behavior" list:
//
//   A. The existing export envelope shape and schema version — the versioned,
//      self-describing metadata block and the `payloadJson` seam the frontend
//      consumer compiles against.
//   B. Steward gating — `exportFamilyArchive` still requires an active Family
//      Steward of the requested family; `exportMyData` still resolves the
//      caller's own profile server-side and refuses anonymous/profile-less
//      callers.
//   C. Family isolation — every export reader is family-scoped, and the
//      existing archive retrieval endpoint is family-scoped and gated on
//      approved membership or Stewardship.
//   D. No raw internal ids in portable references — the reference helpers still
//      derive export-local tokens and never embed a raw internal id.
//   E. Existing photo/archive authorization — the canonical predicates the new
//      retrieval endpoint must reuse rather than reimplement.
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
const archiveApi = stripComments(
  readBackend(path.join("mixins", "archive-api.mo")),
);
const archiveLib = stripComments(readBackend(path.join("lib", "archive.mo")));
const familyAuthorization = stripComments(
  readBackend(path.join("lib", "family-authorization.mo")),
);

/**
 * The body of a top-level `func <name>(` declaration (public or private), up to
 * the next top-level declaration. Comments are already stripped, so a comment
 * marker cannot be used as the boundary.
 */
function functionBody(source: string, name: string): string {
  const start = source.indexOf(`func ${name}(`);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);
  const end = source.indexOf("\n  func ", start + 1);
  const publicEnd = source.indexOf("\n  public func ", start + 1);
  const boundary = [end, publicEnd]
    .filter((index) => index !== -1)
    .sort((a, b) => a - b)[0];
  return source.slice(start, boundary === undefined ? undefined : boundary);
}

// ---------------------------------------------------------------------------
// A. The existing export envelope shape and schema version are preserved.
//
// Phase 5C adds fields to the media manifest and a new endpoint; it must not
// reshape the envelope or bump the schema version. The envelope is the seam the
// frontend consumer compiles against, so a bindgen regression that dropped or
// reshaped it would silently break every consumer.
// ---------------------------------------------------------------------------

describe("export envelope shape and schema version (characterization)", () => {
  it("keeps the versioned, self-describing envelope on the consumer surface", () => {
    // The typed consumer contract: an envelope carries metadata plus the
    // serialized payload, and the metadata is self-describing and versioned.
    const metadata: ExportMetadata = {
      generatedAt: 1n,
      scope: ExportScope.MyData,
      sourceAppName: "Norwood",
      schemaVersion: 1n,
      sourceAppVersion: "1.0.0",
      familyRef: "Norwood",
      format: ExportFormat.JSON,
    };
    const envelope: ExportEnvelope = { metadata, payloadJson: "{}" };

    expect(envelope.metadata.schemaVersion).toBe(1n);
    expect(envelope.metadata.scope).toBe(ExportScope.MyData);
    expect(envelope.metadata.format).toBe(ExportFormat.JSON);
    expect(envelope.metadata.familyRef).toBe("Norwood");
    expect(envelope.payloadJson).toBe("{}");
  });

  it("keeps the schema version constant and source app name", () => {
    expect(exportTypes).toContain(
      "public let CURRENT_EXPORT_SCHEMA_VERSION : Nat = 1;",
    );
    expect(exportTypes).toContain(
      'public let EXPORT_SOURCE_APP_NAME : Text = "Norwood";',
    );
  });

  it("stamps the version, source app, scope, and JSON format into every envelope", () => {
    // `buildEnvelope` is the single construction point; Phase 5C must not add a
    // second one or bypass the version stamp.
    expect(exportLib).toContain(
      "schemaVersion = ExportTypes.CURRENT_EXPORT_SCHEMA_VERSION;",
    );
    expect(exportLib).toContain(
      "sourceAppName = ExportTypes.EXPORT_SOURCE_APP_NAME;",
    );
    expect(exportLib).toContain("format = #JSON;");
    // `familyRef` is the portable display name, never the internal family id.
    expect(exportLib).toContain("familyRef = family.displayName;");
  });

  it("keeps the payload serialized separately from the metadata", () => {
    // The envelope stays stable as the schema evolves: the payload is JSON text
    // in `payloadJson`, not inlined into the metadata block.
    const start = exportTypes.indexOf("public type ExportEnvelope = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const envelope = exportTypes.slice(start, end);
    expect(envelope).toContain("metadata : ExportMetadata;");
    expect(envelope).toContain("payloadJson : Text;");
  });
});

// ---------------------------------------------------------------------------
// B. Steward gating is preserved.
//
// The new Steward media-retrieval endpoint must not weaken the existing export
// authorization. `exportFamilyArchive` still requires an active Steward of the
// requested family; `exportMyData` still resolves the caller's own profile
// server-side and refuses anonymous/profile-less callers.
// ---------------------------------------------------------------------------

describe("export Steward gating (characterization)", () => {
  it("requires an active Family Steward for the FamilyArchive export", () => {
    const body = functionBody(exportLib, "buildFamilyArchiveExport");
    expect(body).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(body).toContain("return #err(#NotSteward)");
  });

  it("refuses anonymous callers on both export endpoints", () => {
    for (const builder of ["buildMyDataExport", "buildFamilyArchiveExport"]) {
      const body = functionBody(exportLib, builder);
      expect(body, `${builder} must refuse anonymous callers`).toContain(
        "caller.isAnonymous()",
      );
      expect(body).toContain("return #err(#NotSignedIn)");
    }
  });

  it("resolves the MyData caller through the family-scoped profile seam", () => {
    const body = functionBody(exportLib, "buildMyDataExport");
    // A caller-supplied person id is never accepted: the caller's own profile
    // is resolved server-side, and a caller with no profile is refused.
    expect(body).toContain(
      "resolveCallerProfile(profiles, claims, familyId, caller)",
    );
    expect(body).toContain("return #err(#NotAuthorized)");
  });

  it("keeps both export endpoints on the generated service wrapper", () => {
    const wrapper = readFileSync(path.join(here, "backend.ts"), "utf8");
    // Phase 5C-H1 changed `exportFamilyArchive` to return the export-instance
    // result (`Result_41`, ok: ExportFamilyArchiveResult) while `exportMyData`
    // still returns the bare envelope (`Result_40`).
    expect(wrapper).toContain(
      "exportMyData(familyId: FamilyId): Promise<Result_40>",
    );
    expect(wrapper).toContain(
      "exportFamilyArchive(familyId: FamilyId): Promise<Result_41>",
    );
  });
});

// ---------------------------------------------------------------------------
// C. Family isolation is preserved.
//
// Phase 5C adds a media-retrieval path. The existing export readers and the
// existing archive retrieval endpoint are family-scoped; the new path must not
// become a way to cross the family boundary.
// ---------------------------------------------------------------------------

describe("export and archive family isolation (characterization)", () => {
  it("scopes every export collection read to the requested family", () => {
    for (const reader of [
      "profilesForFamily",
      "membershipsForFamily",
      "relationshipsForFamily",
      "archiveItemsForFamily",
      "storiesForFamily",
      "sourcesForFamily",
      "recipesForFamily",
    ]) {
      expect(exportLib).toContain(`public func ${reader}(`);
    }
    expect(exportLib).toContain("p.familyId == familyId");
    expect(exportLib).toContain("m.familyId == familyId");
    expect(exportLib).toContain("r.familyId == familyId");
    expect(exportLib).toContain("a.familyId == familyId");
    expect(exportLib).toContain("s.familyId == familyId");
  });

  it("keeps the existing archive retrieval endpoint family-scoped and gated", () => {
    const body = functionBody(archiveApi, "getArchiveItemForFamily");
    // Approved membership or Stewardship is required before any lookup.
    expect(body).toContain(
      "FamilyAuthorizationLib.requireApprovedFamilyMemberForFamily(stewards, claims, caller, familyId)",
    );
    // The lookup is family-qualified, so an archive item id alone cannot cross
    // the family boundary.
    expect(body).toContain("ArchiveLib.getForFamily(items, familyId, id)");
    expect(body).toContain(
      "ArchiveLib.isVisibleForFamily(item, familyId, caller, false, isApprovedFamilyMember)",
    );
  });

  it("keeps the archive family-boundary predicate", () => {
    expect(archiveLib).toContain("public func belongsToFamily(");
    expect(archiveLib).toContain("item.familyId == familyId");
    expect(archiveLib).toContain("public func getForFamily(");
    expect(archiveLib).toContain(
      "it.id == id and belongsToFamily(it, familyId)",
    );
  });
});

// ---------------------------------------------------------------------------
// D. Portable references still carry no raw internal id.
//
// Phase 5C adds related export-local person/archive refs to the media manifest.
// Those refs must reuse the existing export-local reference helpers, so no raw
// internal id (family, person, or archive item) can leak through the new
// fields.
// ---------------------------------------------------------------------------

describe("portable references carry no raw internal id (characterization)", () => {
  it("keeps the reference helpers export-local", () => {
    for (const helper of ["personRef", "archiveItemRef", "mediaRef"]) {
      const body = functionBody(exportLib, helper);
      // The helper routes through the export-local table rather than deriving
      // the token from the raw id.
      expect(
        body,
        `${helper} must assign from an export-local table`,
      ).toContain("assignRef(");
    }
  });

  it("keeps the media reference derived from the media ref's own portable id", () => {
    const body = functionBody(exportLib, "projectMediaRef");
    // The opaque `reference` is the media ref's own export-local portableId,
    // never a raw archive item id or a family-prefixed composite.
    expect(body).toContain("reference = ref.portableId;");
    expect(body).not.toContain("item.id.toText()");
    expect(body).not.toContain('familyId # "::media::"');
  });

  it("keeps the reference shape as a kind plus a portable id", () => {
    const start = exportTypes.indexOf("public type ExportRecordRef = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const ref = exportTypes.slice(start, end);
    expect(ref).toContain("kind : ExportRecordKind;");
    expect(ref).toContain("portableId : Text;");
  });
});

// ---------------------------------------------------------------------------
// E. Existing photo/archive authorization is preserved.
//
// The new Steward media-retrieval endpoint must reuse the canonical
// authorization predicates rather than reimplement them. These are the
// predicates every family-scoped surface already authorizes through.
// ---------------------------------------------------------------------------

describe("existing photo and archive authorization (characterization)", () => {
  it("keeps the approved-member predicate family-scoped and Steward-inclusive", () => {
    expect(familyAuthorization).toContain(
      "public func isApprovedFamilyMemberForFamily(",
    );
    // An active Steward of the family is an approved member without a claim.
    expect(familyAuthorization).toContain("isStewardForFamily(");
    // The claim arm is gated on the claim's own family.
    expect(familyAuthorization).toContain("c.familyId == familyId");
  });

  it("keeps the require* gates that trap for anonymous and unauthorized callers", () => {
    expect(familyAuthorization).toContain(
      "public func requireApprovedFamilyMemberForFamily(",
    );
    expect(familyAuthorization).toContain(
      "public func requireActiveStewardForFamily(",
    );
    // Anonymous callers are rejected before the membership/Steward predicate.
    expect(familyAuthorization).toContain("caller.isAnonymous()");
  });

  it("keeps the photo mutation authority family-scoped and owner/Steward-only", () => {
    expect(familyAuthorization).toContain(
      "public func canManagePersonPhotosForFamily(",
    );
    // The family-qualified lookup is the only safe way to resolve a profile.
    expect(familyAuthorization).toContain(
      "TenancyLib.getProfileForFamily(profiles, familyId, personId)",
    );
    // A profile claimed by another caller is never manageable.
    expect(familyAuthorization).toContain("isClaimedByOther");
  });

  it("keeps the archive visibility rules unchanged", () => {
    const body = functionBody(archiveLib, "isVisible");
    expect(body).toContain("case (#Public) true;");
    expect(body).toContain(
      "case (#FamilyOnly) isAdmin or isApprovedFamilyMember;",
    );
    expect(body).toContain(
      "case (#Private) isAdmin or item.contributor == caller;",
    );
  });

  it("keeps the export audit write as the only export mutation", () => {
    // Both export endpoints record an audit entry; the exported payload itself
    // is never stored.
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
});

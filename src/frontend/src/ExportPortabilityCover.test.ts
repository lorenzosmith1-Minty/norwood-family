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
// Phase 5A — Data Export / Portability Foundation (frontend consumer contract
// + source-level invariants).
//
// The real-canister PocketIC lane (test/pocketic/export.cover.test.ts) is the
// primary coverage for the export behavior. This file exists for the two
// things that lane cannot observe in this environment:
//
//   A. The generated consumer contract the frontend compiles against: the
//      wrapper exposes both export endpoints with the typed `Result_40` shape,
//      and the self-describing envelope types are present. A bindgen regression
//      that dropped or reshaped an export method would silently break every
//      consumer; this pins the seam.
//   B. The audit write and the read-only guarantee at the source level. The
//      export audit collection has NO public read endpoint, so no real-canister
//      test can observe the audit entry; the only place it can be asserted is
//      the mixin source. Likewise the read-only property is a source property
//      of the pure library.
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

// ---------------------------------------------------------------------------
// A. The generated consumer contract the frontend compiles against.
// ---------------------------------------------------------------------------

describe("export consumer contract (generated bindings)", () => {
  it("exposes both export endpoints on the typed service wrapper", () => {
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

  it("keeps the self-describing envelope types on the consumer surface", () => {
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
    expect(envelope.metadata.sourceAppName).toBe("Norwood");
    expect(envelope.payloadJson).toBe("{}");
  });

  it("declares exactly the two Phase 5A scopes and the JSON format", () => {
    expect(Object.values(ExportScope).sort()).toEqual([
      "FamilyArchive",
      "MyData",
    ]);
    expect(Object.values(ExportFormat)).toEqual(["JSON"]);
  });
});

// ---------------------------------------------------------------------------
// B. Versioned, self-describing schema (source-level).
// ---------------------------------------------------------------------------

describe("versioned, self-describing export schema", () => {
  it("pins the current schema version and source app name", () => {
    expect(exportTypes).toContain(
      "public let CURRENT_EXPORT_SCHEMA_VERSION : Nat = 1;",
    );
    expect(exportTypes).toContain(
      'public let EXPORT_SOURCE_APP_NAME : Text = "Norwood";',
    );
  });

  it("stamps the version and source app into every envelope", () => {
    // `buildEnvelope` is the single construction point; it must stamp the
    // version, the source app name, the scope, and the JSON format.
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
});

// ---------------------------------------------------------------------------
// C. Privacy classification before serialization.
// ---------------------------------------------------------------------------

describe("privacy classification before serialization", () => {
  it("marks only portable family-history and requester-owned private data exportable", () => {
    // The classification rule is the gate: Steward-governance and
    // platform-internal/security data are never exportable by default.
    expect(exportTypes).toContain("public func isExportable(");
    expect(exportTypes).toContain("case (#PortableFamilyHistory) { true };");
    expect(exportTypes).toContain("case (#RequesterOwnedPrivate) { true };");
    expect(exportTypes).toContain("case (#StewardGovernance) { false };");
    expect(exportTypes).toContain(
      "case (#PlatformInternalSecurity) { false };",
    );
  });

  it("filters every category through isExportable before serializing", () => {
    // `serializePayload` must filter each list through the classification rule,
    // so a non-exportable record can never reach the output.
    const serializeStart = exportLib.indexOf("public func serializePayload(");
    expect(serializeStart).toBeGreaterThan(-1);
    const serializeEnd = exportLib.indexOf("\n  func ", serializeStart + 1);
    const body = exportLib.slice(
      serializeStart,
      serializeEnd === -1 ? undefined : serializeEnd,
    );
    for (const category of [
      "persons",
      "memberships",
      "relationships",
      "archiveItems",
      "stories",
      "sources",
      "recipes",
      "recoveryStatuses",
      "mediaManifest",
    ]) {
      expect(body).toContain(`payload.${category}.filter(func`);
    }
    expect(body).toContain("ExportTypes.isExportable(");
  });
});

// ---------------------------------------------------------------------------
// D. The export audit write (source-level; no public read endpoint exists).
// ---------------------------------------------------------------------------

describe("export audit write", () => {
  it("records scope, family, requester, timestamp, and status for every attempt", () => {
    expect(exportApi).toContain("func recordExportAudit(");
    // Both endpoints record an audit entry, success or failure.
    expect(exportApi).toContain(
      "recordExportAudit(familyId, #MyData, caller, result);",
    );
    expect(exportApi).toContain(
      "recordExportAudit(familyId, #FamilyArchive, caller, result);",
    );
    // The entry carries the required fields.
    expect(exportApi).toContain("familyId;");
    expect(exportApi).toContain("scope;");
    expect(exportApi).toContain("requesterAccountId = requester;");
    expect(exportApi).toContain("timestamp = Time.now();");
    expect(exportApi).toContain("status;");
    // Success and failure are both recorded.
    expect(exportApi).toContain("case (#ok(_)) { #Succeeded };");
    expect(exportApi).toContain("case (#err(_)) { #Failed };");
  });

  it("never stores the exported payload or envelope in audit history", () => {
    // The audit entry type carries no payload/envelope field.
    const entryStart = exportTypes.indexOf("public type ExportAuditEntry = {");
    expect(entryStart).toBeGreaterThan(-1);
    const entryEnd = exportTypes.indexOf("};", entryStart);
    const entry = exportTypes.slice(entryStart, entryEnd);
    for (const forbidden of ["payload", "envelope", "payloadJson", "records"]) {
      expect(entry.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }

    // The audit writer never references the result's payload.
    const auditStart = exportApi.indexOf("func recordExportAudit(");
    const auditEnd = exportApi.indexOf("\n  func ", auditStart + 1);
    const auditBody = exportApi.slice(
      auditStart,
      auditEnd === -1 ? undefined : auditEnd,
    );
    expect(auditBody).not.toContain("payloadJson");
    expect(auditBody).not.toContain("envelope");
  });
});

// ---------------------------------------------------------------------------
// E. Read-only guarantee (source-level).
// ---------------------------------------------------------------------------

describe("read-only export operation", () => {
  it("never mutates a stable collection in the export library", () => {
    // The export-generation path is pure with respect to the stable collections
    // it reads. The only mutation there is `assignRef` adding a token to the
    // export-local in-memory `RefTables` map, which is created fresh per export
    // and never persisted. Every other collection mutation method must be
    // absent from the generation path.
    //
    // The one accepted exception is the bounded lazy cleanup
    // `pruneExpiredExportInstances`, which intentionally mutates ONLY the two
    // temporary export-retrieval mapping lists (`exportInstances` and
    // `exportMediaBindings`) it is handed. Its body is excluded from the
    // generation-path check below and asserted separately.
    const pruneStart = exportLib.indexOf(
      "public func pruneExpiredExportInstances(",
    );
    expect(pruneStart).toBeGreaterThan(-1);
    const pruneEnd = exportLib.indexOf("\n  public func ", pruneStart + 1);
    const pruneBody = exportLib.slice(
      pruneStart,
      pruneEnd === -1 ? undefined : pruneEnd,
    );
    const generationPath =
      exportLib.slice(0, pruneStart) +
      exportLib.slice(pruneEnd === -1 ? exportLib.length : pruneEnd);
    for (const mutation of [
      ".put(",
      ".remove(",
      ".clear(",
      ".append(",
      ".reverse(",
      ".sort(",
    ]) {
      expect(generationPath).not.toContain(mutation);
    }
    // Every `.add(` call on the generation path is a local, in-memory
    // accumulation that is created fresh per export and never persisted: the
    // export-local reference-table assignment (`table.add(rawId, token)`) and
    // the local photo list built by `profilePhotosForFamily`
    // (`photos.add(...)`). Neither mutates a stable collection.
    const addCalls = generationPath.match(/\.add\(/gu) ?? [];
    expect(addCalls.length).toBeGreaterThanOrEqual(1);
    expect(generationPath).toContain("table.add(rawId, token)");
    expect(generationPath).toContain("photos.add((personId, photo))");
    // The local photo list is created inside the read helper, not passed in.
    expect(generationPath).toContain(
      "let photos = List.empty<(ObjectStorageTypes.PersonId, ObjectStorageTypes.Photo)>();",
    );
    // The cleanup's mutations are confined to the two temporary mapping lists
    // it is handed; it never touches a stable family/archive/media collection.
    expect(pruneBody).toContain("exportInstances.clear();");
    expect(pruneBody).toContain("exportMediaBindings.clear();");
    expect(pruneBody).toContain("exportInstances.add(instance);");
    expect(pruneBody).toContain("exportMediaBindings.add(binding);");
    for (const forbidden of [
      "archiveItems",
      "galleries",
      "profiles",
      "exportAudit",
      "blob",
    ]) {
      expect(pruneBody).not.toContain(forbidden);
    }
  });

  it("never reseeds or migrates in the export library or API", () => {
    for (const source of [exportLib, exportApi]) {
      expect(source).not.toContain("reseed");
      expect(source).not.toContain("migration");
    }
  });
});

// ---------------------------------------------------------------------------
// F. Family scoping and Steward authorization (source-level).
// ---------------------------------------------------------------------------

describe("family scoping and Steward authorization", () => {
  it("scopes every collection read to the requested family", () => {
    // The family-scoped readers filter on the record's own familyId, so a
    // Family A export can never include a Family B record.
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

  it("requires an active Family Steward for the FamilyArchive export", () => {
    expect(exportLib).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(exportLib).toContain("return #err(#NotSteward);");
  });

  it("resolves the MyData caller through the family-scoped profile seam", () => {
    // A caller-supplied person id is never accepted: the caller's own profile
    // is resolved server-side, and a caller with no profile is refused.
    expect(exportLib).toContain("public func resolveCallerProfile(");
    expect(exportLib).toContain("return #err(#NotAuthorized)");
    expect(exportLib).toContain("caller.isAnonymous()");
  });
});

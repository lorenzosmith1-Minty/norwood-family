import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Portable export reference rewrite — adjacent-behavior characterization.
//
// The accepted change replaces the deterministic internal-id encoding of
// portable references (encodeId/encodeNat, familyId + internal-id composites)
// with export-local reference tables (person-1, membership-1, relationship-1,
// archive-1, story-1, source-1, recipe-1, media-1, recovery-1). That rewrite
// touches every reference helper and every projection that builds one.
//
// This file deliberately does NOT characterize the behavior being changed: it
// asserts nothing about how a portableId is derived, whether it is encoded, or
// what its value is. Those are the change under construction. What it protects
// is the ADJACENT behavior the rewrite must leave untouched, all of it named in
// the accepted "Preserve existing behavior" list:
//
//   A. MyData inclusion/exclusion rules — the caller's own profile only, their
//      own memberships/relationships, and archive/story/recipe/recovery records
//      selected by the existing contributor/related-person/requester predicates.
//   B. FamilyArchive inclusion rules — every record of the requested family, and
//      no recovery statuses.
//   C. Media-byte exclusion — the media manifest carries metadata/references
//      only; the archive item's `blob` never reaches the export type or the
//      serializer.
//   D. The portable reference shape and the person-reference reuse seam that
//      keeps relationship endpoints resolvable to exported Person records.
//
// This is a static-source characterization. It does NOT exercise the real
// canister: the PocketIC lane is the only place backend runtime behavior is
// observed, and it is recorded in the episode's coverageLimits. The frontend
// suite mocks the actor, so no backend runtime behavior is visible here.
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
// A. MyData inclusion/exclusion rules are preserved.
//
// The rewrite edits every projection call site inside buildMyDataExport. These
// are the selection predicates that decide what the caller's own export may
// contain; they are not part of the reference change and must survive it.
// ---------------------------------------------------------------------------

describe("MyData inclusion and exclusion rules (characterization)", () => {
  it("includes only the caller's own profile", () => {
    const body = functionBody(exportLib, "buildMyDataExport");
    // The caller's profile is resolved server-side and is the sole Person
    // record emitted; a caller-supplied person id is never accepted.
    expect(body).toContain(
      "resolveCallerProfile(profiles, claims, familyId, caller)",
    );
    expect(body).toContain(
      "persons = [projectPerson(tables, familyId, profile)]",
    );
  });

  it("selects the caller's own memberships and relationships", () => {
    const body = functionBody(exportLib, "buildMyDataExport");
    expect(body).toContain("m.personId == personId");
    expect(body).toContain(
      "r.fromPersonId == personId or r.toPersonId == personId",
    );
  });

  it("selects archive, story, and recipe records by the existing contributor/related-person predicates", () => {
    const body = functionBody(exportLib, "buildMyDataExport");
    // Archive and stories: authored by the caller or attached to their profile.
    expect(body).toContain(
      "a.contributor == caller or a.relatedMemberIds.contains(personId)",
    );
    expect(body).toContain(
      "s.contributor == caller or s.relatedMemberIds.contains(personId)",
    );
    // Recipes: authored by the caller, originating from their profile, or
    // attached to it.
    expect(body).toContain(
      "r.contributorAccountId == caller or r.originatingPersonId == personId or r.relatedPersonIds.contains(personId)",
    );
  });

  it("selects only the caller's own recovery requests", () => {
    const body = functionBody(exportLib, "buildMyDataExport");
    expect(body).toContain(
      "r.requestedByAccountId == caller or r.replacementAccountId == caller",
    );
  });

  it("refuses anonymous and profile-less callers before building anything", () => {
    const body = functionBody(exportLib, "buildMyDataExport");
    expect(body).toContain("caller.isAnonymous()");
    expect(body).toContain("return #err(#NotSignedIn)");
    expect(body).toContain("return #err(#NotAuthorized)");
  });
});

// ---------------------------------------------------------------------------
// B. FamilyArchive inclusion rules are preserved.
//
// The rewrite edits every projection call site inside buildFamilyArchiveExport.
// The family-scoped selection and the empty recovery category are not part of
// the reference change.
// ---------------------------------------------------------------------------

describe("FamilyArchive inclusion rules (characterization)", () => {
  it("includes every record of the requested family through the family-scoped readers", () => {
    const body = functionBody(exportLib, "buildFamilyArchiveExport");
    for (const reader of [
      "profilesForFamily(profiles, familyId)",
      "membershipsForFamily(memberships, familyId)",
      "relationshipsForFamily(confirmedRelationships, familyId)",
      "archiveItemsForFamily(archiveItems, familyId)",
      "storiesForFamily(stories, familyId)",
      "sourcesForFamily(sources, familyId)",
      "recipesForFamily(recipes, familyId)",
    ]) {
      expect(body, `FamilyArchive must read ${reader}`).toContain(reader);
    }
  });

  it("carries no recovery statuses in a FamilyArchive export", () => {
    const body = functionBody(exportLib, "buildFamilyArchiveExport");
    expect(body).toContain("recoveryStatuses = []");
  });

  it("requires an active Steward of the requested family", () => {
    const body = functionBody(exportLib, "buildFamilyArchiveExport");
    expect(body).toContain(
      "StewardAuthorityLib.isActiveStewardForFamily(stewards, caller, familyId)",
    );
    expect(body).toContain("return #err(#NotSteward)");
  });
});

// ---------------------------------------------------------------------------
// C. Media-byte exclusion is preserved.
//
// The media reference is rebuilt by the rewrite, so the guarantee that no
// binary bytes are carried must be pinned independently of how the reference
// token is derived.
// ---------------------------------------------------------------------------

describe("media-byte exclusion (characterization)", () => {
  it("declares no binary payload field on the portable media reference type", () => {
    const start = exportTypes.indexOf("public type ExportMediaRef = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const mediaRef = exportTypes.slice(start, end);
    // Phase 5C intentionally adds `byteSize : ?Nat` (a size, not the bytes) and
    // `availability`, so the guarantee is that no binary payload field is
    // carried — not that the substring "bytes" is absent.
    for (const forbidden of ["blob", "ExternalBlob", "content"]) {
      expect(
        mediaRef.toLowerCase(),
        `ExportMediaRef must not carry ${forbidden}`,
      ).not.toContain(forbidden.toLowerCase());
    }
    // It carries the metadata/reference fields only.
    expect(mediaRef).toContain("mimeType : ?Text;");
    expect(mediaRef).toContain("filename : ?Text;");
    expect(mediaRef).toContain("reference : Text;");
    // The size is recorded as a portable number, never as the bytes themselves.
    expect(mediaRef).toContain("byteSize : ?Nat;");
  });

  it("never copies the archive item's blob value into the media projection", () => {
    const body = functionBody(exportLib, "projectMediaRef");
    // Phase 5C reads `item.blob.size()` to record the byte size and derive the
    // availability state, but must never copy the blob value itself.
    for (const forbidden of ["ExternalBlob", "= item.blob;", "blob;"]) {
      expect(
        body.toLowerCase(),
        `projectMediaRef must not reference ${forbidden}`,
      ).not.toContain(forbidden.toLowerCase());
    }
    // The only blob access is the size probe.
    expect(body).toContain("item.blob.size()");
  });

  it("serializes the media manifest through the metadata-only media serializer", () => {
    const body = functionBody(exportLib, "serializePayload");
    expect(body).toContain("mediaManifest.map(mediaRefJson)");
    // The media serializer emits metadata fields only, never a byte payload.
    // Phase 5C adds the `byteSize` number, which is metadata, not bytes.
    const mediaJson = functionBody(exportLib, "mediaRefJson");
    for (const forbidden of ["blob", "ExternalBlob", "bytes :"]) {
      expect(mediaJson.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
    expect(mediaJson).toContain('"\\"byteSize\\":"');
  });
});

// ---------------------------------------------------------------------------
// D. The portable reference shape and the person-reference reuse seam.
//
// The rewrite changes how a portableId is derived, not the reference shape or
// the fact that every person-pointing field is built by the same person
// reference helper. That reuse is what keeps a relationship endpoint resolvable
// to the same exported Person record.
// ---------------------------------------------------------------------------

describe("portable reference shape and person-reference reuse (characterization)", () => {
  it("keeps a reference as a kind plus a portable id", () => {
    const start = exportTypes.indexOf("public type ExportRecordRef = {");
    expect(start).toBeGreaterThan(-1);
    const end = exportTypes.indexOf("};", start);
    const ref = exportTypes.slice(start, end);
    expect(ref).toContain("kind : ExportRecordKind;");
    expect(ref).toContain("portableId : Text;");
  });

  it("builds every person-pointing field through the person reference helper", () => {
    // Membership, relationship, archive, story, and recipe all point at people.
    // Each must reuse `personRef`, so the same person resolves to the same
    // export-local Person reference everywhere in one export.
    for (const helper of [
      "projectMembership",
      "projectRelationship",
      "projectArchiveItem",
      "projectStory",
      "projectRecipe",
    ]) {
      expect(
        functionBody(exportLib, helper),
        `${helper} must reuse personRef`,
      ).toContain("personRef(tables, familyId,");
    }
  });

  it("keeps the relationship endpoints on the person reference helper", () => {
    const body = functionBody(exportLib, "projectRelationship");
    expect(body).toContain(
      "fromPersonRef = personRef(tables, familyId, relationship.fromPersonId)",
    );
    expect(body).toContain(
      "toPersonRef = personRef(tables, familyId, relationship.toPersonId)",
    );
  });
});
